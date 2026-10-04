FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY nexoclip-app/package.json nexoclip-app/package-lock.json ./
COPY nexoclip-app/packages/Vibe-Workflow/packages/workflow-builder/package*.json ./packages/Vibe-Workflow/packages/workflow-builder/
COPY nexoclip-app/packages/Open-Poe-AI/packages/agents/package*.json ./packages/Open-Poe-AI/packages/agents/
COPY nexoclip-app/packages/Open-AI-Design-Agent/packages/design-agent/package*.json ./packages/Open-AI-Design-Agent/packages/design-agent/
COPY nexoclip-app/packages/studio/package*.json ./packages/studio/
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci

FROM deps AS builder
# Studio price estimates run in the browser, so their markup is fixed at build
# time. Keep it equal to the runtime CREDIT_MARKUP_PERCENT that is charged.
ARG NEXT_PUBLIC_CREDIT_MARKUP_PERCENT=30
ENV NEXT_PUBLIC_CREDIT_MARKUP_PERCENT=$NEXT_PUBLIC_CREDIT_MARKUP_PERCENT
COPY nexoclip-app/ .
# Next imports database-backed route modules while collecting build metadata.
# This non-routable URL satisfies configuration checks without exposing a secret.
RUN npm run build:packages \
 && DATABASE_URL=postgresql://build:build@127.0.0.1:1/build npm run build

FROM node:20-bookworm-slim AS node-runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=deps --chown=1001:1001 /app/node_modules ./node_modules
COPY --chown=1001:1001 nexoclip-app/package.json ./package.json
COPY --chown=1001:1001 nexoclip-app/src ./src
COPY --chown=1001:1001 nexoclip-app/scripts ./scripts
USER 1001:1001

FROM node-runtime AS worker
CMD ["node", "src/queue/storyboardWorker.mjs"]

FROM node-runtime AS migrate
CMD ["node", "src/db/migrate.js"]

FROM node:20-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/src/db ./src/db
USER 1001:1001
EXPOSE 3000
CMD ["node", "server.js"]
