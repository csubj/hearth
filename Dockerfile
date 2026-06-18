# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml drizzle.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src/db ./src/db
COPY src/lib/auth ./src/lib/auth
COPY scripts/smoke-verify.ts ./scripts/smoke-verify.ts
COPY scripts/auth-bootstrap.ts ./scripts/auth-bootstrap.ts
COPY scripts/purge-events.ts ./scripts/purge-events.ts
COPY scripts/purge-stream.ts ./scripts/purge-stream.ts
COPY src/lib/attachments ./src/lib/attachments
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/data/uploads \
    && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
