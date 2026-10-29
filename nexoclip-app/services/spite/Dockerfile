FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
ARG NEXT_PUBLIC_BASE_PATH=/spite
ARG NEXT_PUBLIC_STUDIO_URL=http://localhost:3000/studio
ARG NEXT_PUBLIC_REALTIME_URL=/spite/ws
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_STUDIO_URL=$NEXT_PUBLIC_STUDIO_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3005
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3005
CMD ["node", "server.js"]

FROM base AS realtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3007
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node realtime ./realtime
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node database-setup.sql ./database-setup.sql
USER node
EXPOSE 3007
CMD ["pnpm", "realtime"]

FROM base AS migrate-realtime
ENV NODE_ENV=production
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.mjs ./
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node database-setup.sql ./database-setup.sql
USER node
CMD ["node", "scripts/migrate-realtime.mjs"]
