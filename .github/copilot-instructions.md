# Copilot instructions for DemoPok

This file contains focused, actionable guidance for code-writing AI agents working in this repository. Keep instructions concise and concrete — reference files and examples below when making changes.

1. Repository layout & big picture
- Monorepo root: orchestrates client and server. See `dev.js` which launches both `npm run dev --prefix server` and `npm run dev --prefix client` in parallel.
- `client/`: React + Vite app (`client/package.json`). Use `npm run dev` (Vite) for development and `npm run build` for production bundles.
- `server/`: ESM Node Express API in `server/src`. Database helpers in `server/src/db.js` and SQL-backed logic in `server/src/repositories/managementRepository.js`.
- `scripts/`: automation and testing helpers. `scripts/fullLoopBot.js` is a runnable example that uses the public API to exercise admin flows and purchases.

2. Node / environment requirements
- Node 24 recommended (the bot uses global `fetch`). The server uses ES modules (`"type": "module"` in `client/package.json` and ESM imports in `server/src`).
- Important env vars:
  - Database: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `DB_SSL`, `DB_SCHEMA` (if missing the server runs in demo/fallback mode).
  - Admin seed: `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_CREDIT_LIMIT` (used by `server/src/index.js` to ensure an admin user).
  - Demo agent password: `DEMO_AGENT_PASSWORD` (never log passwords).
  - Bot: `HUAY_AUD_API` (base URL), `HUAY_SUPERADMIN_USER`, `HUAY_SUPERADMIN_PASSWORD` used by `scripts/fullLoopBot.js`.
  - Server port: `PORT` (defaults to `4001`).

3. Demo vs DB-backed behavior
- The server supports a demo (in-memory) mode when DB env vars are not provided. Fallback data lives in `server/src/data.js` and fallback code is in `server/src/index.js` (many endpoints branch on `hasDatabase()` which calls `managementRepository.hasDatabase()`).
- When adding features, keep both execution paths in mind: prefer DB path when persisting, but ensure demo fallback remains consistent for local dev.

4. Key developer workflows / commands
- Start both client and server for local dev:
  - `npm run dev` (from repo root — runs `dev.js`).
- Start client only:
  - `npm run dev --prefix client` or `cd client && npm run dev`.
- Start server only:
  - `npm run dev --prefix server` or `cd server && npm run dev`.
- Run the end-to-end demo bot (requires Node 18+):
  - `npm run bot:full` (root script runs `node scripts/fullLoopBot.js`).

5. API patterns and conventions (use these examples)
- Authentication: `POST /api/auth/login` — accepts `{ username, password }`. Send the raw password over HTTPS; the server verifies bcrypt and migrates legacy SHA-256 records. Never send a stored hash as a credential.
- Session token: API uses `x-session-token` header for authenticated calls (server stores expiring, hashed tokens in PostgreSQL; local demo mode uses memory). When writing integrations, use `x-session-token` as shown in `fullLoopBot.js`.
- Admin routes: under `/api/admin/*` (user management, chat threads, payout/lottery control). The bot uses these to create users and save results.
- Purchases: `POST /api/purchases` expects `{ lotteryId, bets, amount, meta, promotionCode }`. See `scripts/fullLoopBot.js` for a concrete `purchase(...)` payload example.

6. Database and repository conventions
- `server/src/db.js`: initializes a Postgres `Pool` only when DB env vars are present. Use `isDbEnabled()` / `hasDatabase()` to gate DB-specific behavior.
- `server/src/repositories/managementRepository.js`: central place for SQL queries and data mapping. When extending DB-backed features, add logic here and keep endpoint handlers in `server/src/index.js` thin.
- SQL schema is in `server/schema.sql` / `server/schema_postgres.sql` — use these when provisioning the DB. Some repository functions detect missing columns/tables and fall back (e.g. promotion column checks).

7. Code patterns & style specifics
- ESM modules across server and client. Prefer `import`/`export` and avoid CommonJS `require` in server code.
- Fallback/demo-first design: many APIs return demo fallback data when DB isn't configured — follow existing branching patterns in `index.js` (look for `if (hasDatabase())` everywhere).
- Date handling: draw dates and result rows sometimes use ISO-date strings. Repository mapping functions normalize to YYYY-MM-DD (see `mapLotteryResultRow`).

8. Tests / automation
- Run `npm test`, `RUN_DB_TESTS=true npm test` against an isolated PostgreSQL database ending in `_test`, and `npm run test:qa:fixtures` with `PSQL`. CI runs these and builds the client. All credits and result fixtures are for internal testing.

9. When proposing changes
- Reference the exact files you modify (e.g., `server/src/index.js`, `server/src/repositories/managementRepository.js`, `client/src/components/PurchaseForm.jsx`).
- Maintain demo fallback behavior unless you explicitly intend to make the app DB-only — call out the change in the PR description.
- If adding new env vars, update `README.md` and add sensible defaults where appropriate (e.g., default demo credentials are already seeded).

10. Quick examples to copy-paste
- Start dev (both): `npm run dev`
- Start dev server only: `npm run dev --prefix server`
- Run demo bot: `npm run bot:full`

If anything here is unclear or you'd like more detail on a particular area (DB schema, purchase flow, or client components), tell me which part to expand and I'll update this file.
