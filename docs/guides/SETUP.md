# Guide: Initial Project Setup

This guide walks through bootstrapping the Bobr Quiz project from scratch. Follow this if you're setting up the development environment for the first time.

## Quick Start (15 minutes)

```bash
# 1. Install dependencies
yarn

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Generate Prisma client
yarn prisma:generate

# 4. Run dev server
yarn dev

# 5. Verify it works
# Open http://localhost:3000 in your browser
```

---

## Detailed Steps

### Prerequisites

- **Node.js**: v22+ (use `nvm install 22` if needed)
- **Git**: Cloned this repository
- **Supabase account**: Free tier at https://supabase.com
- **Yarn**: v3+ (installed globally or via `corepack enable`)

### Step 1: Bootstrap via Yarn

```bash
# Install project dependencies
yarn install

# Verify tools are working
yarn lint
yarn test
yarn build
```

**What this does**:
- Installs all packages from `yarn.lock` (deterministic)
- ESLint checks code style
- Vitest runs unit tests
- Next.js builds the project (dry run)

### Step 2: Configure Tailwind & shadcn

Tailwind 4 is already configured in `src/app/globals.css`. Add UI components as needed:

```bash
# Add a specific shadcn component (e.g., Button, Dialog, Table)
yarn shadcn add button
yarn shadcn add dialog
```

This auto-registers components in `components.json` and you can import them:

```typescript
import { Button } from '@ui/button';
```

### Step 3: Set Up Database & Environment Variables

#### 3.1: Create Supabase Project

1. Sign up at https://supabase.com
2. Create a new project (free tier)
3. Copy connection string from **Project Settings → Database → Connection String**
4. Create a **Shadow Database** for migrations (Supabase → Settings → Databases → Create new DB, suffix `_shadow`)

#### 3.2: Create `.env.local`

Copy `.env.example` → `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```bash
# Postgres connection (primary dev database)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/quiz_game?schema=public"

# Shadow database (Prisma uses this for safe migrations)
SHADOW_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/quiz_game_shadow?schema=public"

# Test database (disposable DB for integration tests)
DATABASE_URL_TEST="postgresql://USER:PASSWORD@HOST:5432/quiz_game_test?schema=public"

# Enable integration tests (set to true only if DATABASE_URL_TEST is ready)
ENABLE_PRISMA_INTEGRATION_TESTS="false"

# Supabase public keys (safe to commit, only anon access)
NEXT_PUBLIC_SUPABASE_URL="https://xyz.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."

# Supabase service role (SECRET - never commit)
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Admin email allowlist (comma-separated)
ADMIN_EMAILS="admin@example.com,host@example.com"
```

**Never commit `.env.local`** – it's git-ignored and contains secrets.

### Step 4: Generate Prisma Client

After updating the schema or environment variables:

```bash
yarn prisma:generate
```

This generates `src/infrastructure/database/prisma/generated/client/` (git-ignored).

### Step 5: Apply Prisma Migrations

```bash
# Create migration + apply to local DB
yarn prisma:migrate -- --name initial

# Seed demo data
yarn prisma:seed
```

**What this does**:
- Applies all migrations in `src/infrastructure/database/prisma/migrations/`
- Populates sample quiz/questions via `seed.ts`
- Resets database and runs seed (safe for dev, never on production!)

### Step 6: Verify Development Server

```bash
# Start Next.js dev server with Turbopack
yarn dev

# Open http://localhost:3000
```

You should see:
- Landing page (public)
- `/admin` redirects to `/login` (no session)
- Admin login works if `ADMIN_EMAILS` includes your test email

### Step 7: Verify Commands

```bash
# Type checking
yarn lint

# Unit + integration tests
yarn test

# Test with watch mode
yarn test:watch

# Coverage report
yarn test:coverage

# Production build
yarn build && yarn start
```

---

## Environment Variables Reference

### Required (Always)

| Variable                        | Example                   | Purpose                           |
| ------------------------------- | ------------------------- | --------------------------------- |
| `DATABASE_URL`                  | `postgresql://...`        | Primary Postgres connection (dev) |
| `SHADOW_DATABASE_URL`           | `postgresql://...`        | Prisma migration shadow DB        |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://xyz.supabase.co` | Supabase project URL              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...`                  | Supabase anon key (public)        |

### Required (For Admin Features)

| Variable                    | Example             | Purpose                             |
| --------------------------- | ------------------- | ----------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...`            | Supabase admin key (SECRET)         |
| `ADMIN_EMAILS`              | `admin@example.com` | Email allowlist for `/admin` access |

### Optional (For Integration Tests)

| Variable                          | Example            | Purpose                       |
| --------------------------------- | ------------------ | ----------------------------- |
| `DATABASE_URL_TEST`               | `postgresql://...` | Disposable test database      |
| `ENABLE_PRISMA_INTEGRATION_TESTS` | `true`             | Enable integration test suite |

### Supabase-Specific

To find your values, go to **Supabase Dashboard → Project Settings**:
- **URL**: Under "API"
- **Anon Key**: Under "API" → "Project API keys"
- **Service Role Key**: Under "API" → "Project API keys" (SECRET!)
- **Connection String**: Under "Databases" → "Connection string"

---

## Authentication & Authorization (R4+)

### Admin Login Flow

1. **Middleware** (`middleware.ts`) protects `/admin/*` routes
2. **Check 1**: Must be authenticated (Supabase session cookie exists)
3. **Check 2**: Email must be in `ADMIN_EMAILS` allowlist
4. **Redirect**: Unauthenticated users → `/login`, non-admin → 403 Forbidden

### Creating a Test Admin User

1. Go to **Supabase Dashboard → Authentication → Users**
2. Click **Add user** (or use email/password signup on `/login`)
3. Create user with email in `ADMIN_EMAILS` (e.g., `admin@example.com`)
4. Set password in Supabase (or send invite link)
5. Sign in at `http://localhost:3000/login`
6. Access `/admin/quizzes` for quiz management

### Architecture

- **Auth client**: `src/infrastructure/auth/supabase-auth-client.ts`
  - `createBrowserClient()` – Client-side login/logout
  - `createServerClient(cookies)` – Server-side session checks
  - `isAdminUser(email)` – Email allowlist validation

- **Routes**:
  - `src/app/(admin)/login/page.tsx` – Sign in form
  - `src/app/(admin)/admin/page.tsx` – Dashboard (protected)
  - `src/app/(admin)/admin/quizzes/page.tsx` – Quiz CRUD (protected)

### Testing Auth Flow

1. Set `ADMIN_EMAILS=test@example.com` in `.env.local`
2. Create user `test@example.com` in Supabase
3. Visit `http://localhost:3000/login`
4. Sign in with test credentials
5. Verify redirect to `/admin` dashboard
6. Test logout (redirects to `/login`)

### Security Considerations (R4 MVP)

- **Email allowlist in `.env`**: Simple MVP approach, not scalable
- **Planned for R5+**: Migrate to Supabase RLS policies with custom JWT claims
- **Never leak secrets**: `SUPABASE_SERVICE_ROLE_KEY` stays in `.env` (not committed)

---

## Prisma Workflow

### Generate Prisma Client

After schema changes in `src/infrastructure/database/prisma/schema.prisma`:

```bash
yarn prisma:generate
```

This regenerates `src/infrastructure/database/prisma/generated/client/` (git-ignored).

**Why?** Prisma v7 uses a driver adapter that requires fresh client generation after schema edits.

### Create & Apply Migrations

```bash
# Create migration (interactive prompt)
yarn prisma:migrate -- --name add_scoring_config

# Apply without prompting
yarn prisma:migrate -- --name <change> --skip-generate
```

This:
1. Detects schema changes
2. Creates SQL migration in `src/infrastructure/database/prisma/migrations/`
3. Applies to `DATABASE_URL`
4. Updates shadow DB safely

**Troubleshooting**:
- "Shadow database not configured?" → Add `SHADOW_DATABASE_URL` to `.env.local`
- "Prisma client out of sync?" → Run `yarn prisma:generate`

### Seed Database

```bash
# Reset database + seed demo data
yarn prisma:seed
```

This runs `src/infrastructure/database/prisma/seed.ts`, which:
1. Calls `resetDatabase()` (drops all tables, recreates schema)
2. Creates demo quiz/questions using `seed-helpers.ts`
3. Ready for manual testing

**⚠️ WARNING**: Destructive! Only use in dev/test databases.

### Inspect Data

```bash
# Open Prisma Studio (visual DB browser)
npx prisma studio
```

Opens http://localhost:5555 where you can browse tables, add/edit/delete records, and run queries.

---

## Troubleshooting

### "Module not found: @infrastructure/database/prisma/generated-client"

**Fix**: Run `yarn prisma:generate` after schema changes.

### "Cannot find module '@prisma/client'"

**Fix**: Update imports to use `@infrastructure/database/prisma/generated-client`:
```typescript
// ❌ Wrong
import { PrismaClient } from '@prisma/client';

// ✅ Correct
import type { Quiz } from '@infrastructure/database/prisma/generated-client';
```

### "Connection refused to Postgres"

**Check**:
1. Is Supabase project running? (Supabase Dashboard → Status)
2. Is `DATABASE_URL` correct? (copy from Supabase → Settings → Database)
3. Firewall blocking? (Supabase auto-allows all IPs on free tier)

### "Shadow database doesn't match"

**Fix**: Run migrations manually:
```bash
yarn prisma:migrate deploy
```

### Tests fail with "Cannot find test database"

**Setup**:
1. Create disposable Postgres DB
2. Add connection string to `DATABASE_URL_TEST` in `.env.local`
3. Set `ENABLE_PRISMA_INTEGRATION_TESTS=true`
4. Run `yarn test` (integration suite runs against test DB)

---

## Next Steps

1. **Explore the codebase**: Read [ARCHITECTURE.md](../ARCHITECTURE.md) for layer overview
2. **Build a feature**: Follow [guides/DDD-STRUCTURE.md](DDD-STRUCTURE.md) to add a new domain entity
3. **Add an API route**: See [guides/PRESENTATION-LAYER.md](PRESENTATION-LAYER.md) for endpoint patterns
4. **Write tests**: Check `src/tests/domain/**` for examples
5. **Check progress**: See [PROGRESS.md](../progress/PROGRESS.md) for what's been built

---

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) – Architecture overview
- [guides/DDD-STRUCTURE.md](DDD-STRUCTURE.md) – Building domain entities
- [guides/DATA-LAYER.md](DATA-LAYER.md) – Prisma & repositories
- [guides/PRESENTATION-LAYER.md](PRESENTATION-LAYER.md) – Routes, hooks, components
- [plan.md](../plan.md) – Product roadmap
