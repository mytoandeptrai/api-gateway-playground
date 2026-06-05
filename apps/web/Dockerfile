# syntax=docker/dockerfile:1

# ─── Stage 1: Install all workspace dependencies ─────────────────────────────
FROM node:20.19-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/ui/package.json ./packages/ui/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20.19-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app
COPY --from=deps /app ./
COPY . .
# API_GATEWAY_URL is server-side (Next.js rewrites, container-to-container)
# NEXT_PUBLIC_WS_URL is client-side (browser connects to host), baked at build time
ARG API_GATEWAY_URL=http://localhost:3002
ARG NEXT_PUBLIC_WS_URL=http://localhost:3010
ENV API_GATEWAY_URL=${API_GATEWAY_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ─── Stage 3: Runner ─────────────────────────────────────────────────────────
FROM node:20.19-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# standalone output includes a minimal server + bundled node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
