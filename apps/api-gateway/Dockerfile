# syntax=docker/dockerfile:1

# ─── Stage 1: Install all workspace dependencies ─────────────────────────────
FROM node:20.19-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20.19-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter api-gateway build

# ─── Stage 3: Prune to production dependencies only ──────────────────────────
FROM node:20.19-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY --from=deps /app ./
RUN pnpm --filter api-gateway deploy --prod /deploy

# ─── Stage 4: Runner ─────────────────────────────────────────────────────────
FROM node:20.19-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=nestjs:nodejs /deploy/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api-gateway/dist ./dist
USER nestjs
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3002/api/v1 || exit 1
CMD ["node", "dist/main"]
