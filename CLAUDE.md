# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Run all apps in development mode
pnpm turbo dev

# Build all apps
pnpm turbo build

# Lint all apps
pnpm turbo lint

# Type check all apps
pnpm turbo check-types

# Format code
pnpm format
```

### Database Commands

```bash
# Generate Prisma client (after schema changes)
pnpm turbo db:generate

# Run database migrations (development)
pnpm turbo db:migrate

# Deploy migrations (production)
pnpm turbo db:deploy
```

### API-specific Commands (run from apps/api)

```bash
# Run unit tests
pnpm test

# Run single test file
pnpm test <filename>

# Run tests in watch mode
pnpm test:watch

# Run e2e tests
pnpm test:e2e

# Run tests with coverage
pnpm test:cov
```

## Architecture Overview

This is a Turborepo monorepo with a Next.js frontend and NestJS backend.

### Apps

- **apps/web**: Next.js 15 frontend (App Router, port 3000)
- **apps/api**: NestJS backend (port 3001)

### Shared Packages

- **@repo/database**: Prisma client and schema - exports the generated Prisma client from `packages/database/prisma/schema.prisma`
- **@repo/ui**: Shared React components using shadcn/ui - import as `@repo/ui/components/*`, `@repo/ui/hooks/*`, `@repo/ui/lib/*`
- **@repo/eslint-config**: Shared ESLint configuration
- **@repo/typescript-config**: Shared TypeScript configurations

### Backend Structure (apps/api)

NestJS modular architecture with:
- `src/prisma/`: PrismaModule and PrismaService for database access
- Feature modules (e.g., `src/users/`) follow NestJS conventions with controller/service/module pattern

### Database

PostgreSQL with Prisma ORM. Schema located at `packages/database/prisma/schema.prisma`. The Prisma client is generated to `packages/database/generated/prisma`.

### Environment Variables

- `packages/database/.env`: `DATABASE_URL`
- `apps/api/.env`: `PORT`, `DATABASE_URL`
- `apps/web/.env.local`: `NEXT_PUBLIC_API_URL`
