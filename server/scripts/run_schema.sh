#!/usr/bin/env bash
# Helper to run server/schema_postgres.sql against configured DB in server/.env
# Usage: chmod +x server/scripts/run_schema.sh && server/scripts/run_schema.sh
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# scripts/ -> server/ -> repo root
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
ENV_FILE="$REPO_ROOT/.env"
# Prefer server/.env if exists
if [ -f "$REPO_ROOT/server/.env" ]; then
  ENV_FILE="$REPO_ROOT/server/.env"
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "No .env file found at $ENV_FILE or server/.env. Create one with DB settings." >&2
  exit 1
fi
# load env vars (simple parser for KEY=VALUE lines)
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

SQL_FILE="$REPO_ROOT/server/schema_postgres.sql"
if [ ! -f "$SQL_FILE" ]; then
  echo "Schema file not found: $SQL_FILE" >&2
  exit 1
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-postgres}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-}

# Try using local psql if available
if command -v psql >/dev/null 2>&1; then
  echo "Using local psql to apply schema to ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  export PGPASSWORD="$DB_PASSWORD"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_FILE"
  echo "Schema applied successfully (local psql)."
  exit 0
fi

# Fallback: use dockerized psql client
if command -v docker >/dev/null 2>&1; then
  echo "Local psql not found. Using docker image postgres to apply schema."
  # On macOS, to reach host from container, use host.docker.internal; otherwise keep DB_HOST
  DOCKER_HOST="$DB_HOST"
  if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    # use host.docker.internal for Docker-to-host connectivity on macOS/Windows
    # For Linux, user may need to run a container with --network=host or adjust DB_HOST
    if docker run --rm --entrypoint=sh postgres:15 -c 'uname -s' >/dev/null 2>&1; then
      DOCKER_HOST_ARG="host.docker.internal"
      # Try resolving host.docker.internal by running a short container; if it fails, fallback to localhost
      if docker run --rm busybox nslookup host.docker.internal >/dev/null 2>&1; then
        DOCKER_HOST="$DOCKER_HOST_ARG"
      else
        echo "Warning: host.docker.internal not resolvable from containers on this host. If Docker cannot reach your local Postgres, run psql locally or run Postgres in Docker." >&2
      fi
    fi
  fi

  docker run --rm -i \
    -v "$SQL_FILE":"/schema.sql":ro \
    postgres:15 \
    bash -c "export PGPASSWORD=\"$DB_PASSWORD\"; psql -h $DOCKER_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f /schema.sql"
  echo "Schema applied successfully (docker psql)."
  exit 0
fi

echo "Neither local 'psql' nor 'docker' are available to run the schema. Please install psql or docker, or run the following psql command manually:" >&2
echo
echo "PGPASSWORD='${DB_PASSWORD}' psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f ${SQL_FILE}"
exit 1
