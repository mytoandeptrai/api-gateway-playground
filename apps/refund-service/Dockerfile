# syntax=docker/dockerfile:1

FROM node:20.19-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/refund-service/package.json ./apps/refund-service/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

FROM node:20.19-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter refund-service build

FROM node:20.19-alpine AS prod-deps
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY --from=deps /app ./
RUN pnpm --filter refund-service deploy --prod /deploy

FROM node:20.19-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=nestjs:nodejs /deploy/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/refund-service/dist ./dist
USER nestjs
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3011/api/v1 || exit 1
CMD ["node", "dist/main"]
