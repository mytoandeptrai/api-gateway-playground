# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Turborepo monorepo (pnpm workspaces) with a Next.js frontend, NestJS backend services, and shared packages. Named `kafka-playground` — Kafka integration is planned but not yet implemented. The `apps/api-gateway` service and `packages/kafka-base` are intended future additions.

## Common Commands

```bash
# Development
pnpm turbo dev              # Start all apps (web:3000, api:3001)
pnpm turbo build            # Build all apps/packages
pnpm turbo lint             # Lint all workspaces
pnpm turbo check-types      # TypeScript type checking
pnpm format                 # Prettier across all workspaces

# Database (Prisma, schema at packages/database/prisma/schema.prisma)
pnpm turbo db:generate      # Generate Prisma client
pnpm turbo db:migrate       # Run migrations (dev)
pnpm turbo db:deploy        # Deploy migrations (production)

# Docker infrastructure
docker compose -f docker/docker-compose.yml up -d   # Postgres:5440, Redis:6440, Mailpit:8440

# Run a single app
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter api-gateway dev

# Testing (NestJS apps only, Jest + ts-jest)
pnpm --filter api test              # Unit tests
pnpm --filter api test:watch        # Watch mode
pnpm --filter api test:e2e          # E2E tests (supertest)
pnpm --filter api test:cov          # Coverage report
```

## Architecture

**Apps:**
- `apps/web` — Next.js 15 + React 19, App Router, Turbopack dev server. Uses `@repo/ui` for components. Env: `NEXT_PUBLIC_API_URL`.
- `apps/api` — NestJS 11, SWC compiler. Has `PrismaModule` and `UsersModule` (CRUD). Uses `@repo/database`.
- `apps/api-gateway` — NestJS 11, same structure as `apps/api`. New/untracked, intended as Kafka gateway service.

**Packages:**
- `packages/database` (`@repo/database`) — Prisma ORM client for PostgreSQL. Singleton client exported from `src/client.ts`. Built with tsup. Generated types go to `generated/prisma/`.
- `packages/ui` (`@repo/ui`) — shadcn/ui component library (Radix + Tailwind v4). No build step; exports raw TypeScript. Add components via `pnpm dlx shadcn@latest`.
- `packages/eslint-config` (`@repo/eslint-config`) — Shared ESLint 9 flat configs: `./base`, `./next-js`, `./react-internal`.
- `packages/typescript-config` (`@repo/typescript-config`) — Shared tsconfig bases: `base.json`, `nestjs.json` (CommonJS + decorators), `nextjs.json`, `react-library.json`.

## Key Conventions

- **Package manager**: pnpm 10 with workspaces. Use `pnpm --filter <package>` for scoped commands.
- **NestJS apps** use CommonJS modules (`"module": "commonjs"` in tsconfig), SWC for compilation, and decorator metadata (`emitDecoratorMetadata`).
- **Next.js app** uses Turbopack, path alias `@/*` mapping to project root.
- **Prettier**: single quotes, trailing commas (`all`) in NestJS apps.
- **ESLint**: `@typescript-eslint/no-explicit-any` is turned off in NestJS apps.
- **Docker ports are offset by +440**: Postgres 5440, Redis 6440, Mailpit SMTP 1440 / UI 8440.
- **DATABASE_URL** must point to port 5440 when using docker-compose: `postgresql://postgres:postgres@localhost:5440/mydb?schema=public`

## AI DevKit Workflow

This project uses ai-devkit for structured development. Phase docs live in `docs/ai/`:
- `requirements/` — Problem understanding and requirements
- `design/` — Architecture and design decisions (use mermaid diagrams)
- `planning/` — Task breakdown and priorities
- `implementation/` — Implementation guides
- `testing/` — Testing strategy and test cases

Review relevant phase docs before implementing features. Update docs when significant changes are made.
