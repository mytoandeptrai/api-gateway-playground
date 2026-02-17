# Turbo App Template

Full-stack monorepo with Next.js, NestJS, and Prisma.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** NestJS
- **Database:** PostgreSQL + Prisma ORM
- **Monorepo:** Turborepo + pnpm

## Project Structure

```
apps/
  ├── web/          # Next.js frontend (port 3000)
  └── api/          # NestJS backend (port 3001)
packages/
  ├── database/     # Prisma schema and client
  ├── ui/           # Shared React components (shadcn/ui)
  ├── eslint-config/
  └── typescript-config/
```

## Quick Start

### 1. Prerequisites

- Node.js >= 18
- pnpm
- Docker (for PostgreSQL)

### 2. Installation

```bash
# Clone the repo
git clone <repo-url>
cd turbo-app-template

# Install dependencies
pnpm install
```

### 3. Environment Setup

Create the following `.env` files:

```bash
# packages/database/.env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb?schema=public"

# apps/api/.env
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb?schema=public"

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Start Database

```bash
# Run PostgreSQL with Docker
docker compose up -d
```

If you don't have a `docker-compose.yml`, create one:

```yaml
version: "3.8"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: mydb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 5. Database Setup

```bash
# Generate Prisma client
pnpm turbo db:generate

# Run migrations
pnpm turbo db:migrate
```

### 6. Run Development

```bash
pnpm turbo dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Commands

| Command | Description |
|---------|-------------|
| `pnpm turbo dev` | Run development mode |
| `pnpm turbo build` | Build all apps |
| `pnpm turbo lint` | Run linting |
| `pnpm turbo check-types` | Run TypeScript type checking |
| `pnpm format` | Format code with Prettier |
| `pnpm turbo db:generate` | Generate Prisma client |
| `pnpm turbo db:migrate` | Run database migrations |
| `pnpm turbo db:deploy` | Deploy migrations (production) |

### API Testing (run from apps/api)

```bash
pnpm test          # Unit tests
pnpm test:watch    # Watch mode
pnpm test:e2e      # E2E tests
pnpm test:cov      # Coverage report
```
