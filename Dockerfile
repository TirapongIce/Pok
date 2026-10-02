FROM node:24-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production SERVE_CLIENT=true PORT=4001 SEED_DEMO_DATA=false THAI_SYNC_AUTO=false
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server/ ./
COPY --from=client-build --chown=node:node /app/client/dist /app/client/dist
USER node
EXPOSE 4001
CMD ["node", "src/index.js"]
