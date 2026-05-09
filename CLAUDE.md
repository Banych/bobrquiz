# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time quiz game built with Next.js 15, Prisma v7, and Supabase. Uses DDD-lite architecture with strict layer separation: Domain → Application → Infrastructure → Presentation.

## Commands

```bash
# Development
yarn dev                    # Dev server with Turbopack
yarn build                  # Production build (auto-runs prisma:generate)

# Linting
yarn lint                   # ESLint + Prettier check
yarn lint:fix               # ESLint + Prettier auto-fix

# Unit tests (Vitest)
yarn test                                                    # Run all tests
yarn test src/tests/domain/entities/quiz.test.ts            # Run single test file
yarn test submit-answer                                      # Run tests matching pattern
yarn test:watch                                              # TDD watch mode
yarn test:coverage                                           # With coverage report

# E2E tests (Playwright)
yarn test:e2e               # Headless E2E tests
yarn test:e2e:ui            # Interactive Playwright UI
yarn test:e2e:debug         # Step-through debug mode

# Database
yarn prisma:generate        # Regenerate Prisma client (required after schema changes)
yarn prisma:migrate         # Create/apply migrations
yarn prisma:seed            # Seed database with test data
```

## Architecture

### Data Flow
```
Next.js API route → zod DTO validation → use-case/service → domain entity → Prisma repository → Supabase Postgres
```

### Layer Rules
- **Domain** (`src/domain/**`): Pure business logic, framework-agnostic. Entities, value objects, aggregates, repository interfaces.
- **Application** (`src/application/**`): Use cases orchestrate domain, return DTOs. Services group related use cases.
- **Infrastructure** (`src/infrastructure/**`): Prisma repositories implement domain interfaces. Realtime adapters, auth, storage.
- **Presentation** (`src/app/**`, `src/components/**`, `src/hooks/**`): Consumes only DTOs. Never import entities or Prisma types.

### Path Aliases
```
@domain/*        → src/domain/*
@application/*   → src/application/*
@infrastructure/* → src/infrastructure/*
@components/*    → src/components/*
@hooks/*         → src/hooks/*
@lib/*           → src/lib/*
@ui/*            → src/components/ui/*
```

## Prisma v7 Setup (Non-Standard)

Uses driver adapter pattern, NOT default Prisma:

1. **Schema location**: `src/infrastructure/database/prisma/schema.prisma`
2. **Generated client**: `./generated/client` (git-ignored)
3. **Client instantiation** requires adapter:
   ```typescript
   import { PrismaPg } from '@prisma/adapter-pg';
   import { PrismaClient } from './generated-client';
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   const prisma = new PrismaClient({ adapter });
   ```
4. **Import path**: Use `@infrastructure/database/prisma/generated-client`, NOT `@prisma/client`

Always run `yarn prisma:generate` after schema changes.

## Testing Requirements (Mandatory)

**Tests are NOT optional.** Write tests WHILE implementing, not after.

```bash
yarn test                    # Run all tests
yarn test [file-or-pattern]  # Run specific tests
yarn test:watch              # TDD watch mode
```

**Every feature requires:**
- Domain tests: `src/tests/domain/` - entity behavior, invariants
- Use case tests: `src/tests/application/use-cases/` - success + error paths
- Repository tests: `src/tests/infrastructure/repositories/` - CRUD + edge cases

**Before moving to the next task:** `yarn test` must pass.

## MCP Servers

Configured in `.mcp.json` (project root):

| Server         | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| **Supabase**   | Database queries, migrations, logs, Edge Functions, storage      |
| **Playwright** | Browser automation for E2E testing - navigate, click, screenshot |
| **Context7**   | Documentation and context retrieval                              |

### Common MCP Workflows
```bash
# After schema changes - check for RLS issues
mcp__supabase__get_advisors(type: 'security')

# Debug runtime issues
mcp__supabase__get_logs(service: 'postgres')

# E2E testing - explore UI before writing tests
mcp__playwright__navigate(url: 'http://localhost:3000')
mcp__playwright__snapshot()
```

## Custom Skills

### Scaffolding
- `/create-entity [name]` - Scaffold domain entity + tests (file + test skeleton)
- `/create-use-case [name]` - Scaffold use case class + DTO + tests
- `/create-hook [name]` - Scaffold TanStack Query hook with optional realtime subscription

### Workflow Skills
- `/add-feature` - Step-by-step DDD feature implementation with test gates
- `/test` - Testing workflow, patterns, and minimum coverage
- `/session-start` - Initialize development session with progress tracking
- `/prisma-migrate` - Safe database migration workflow
- `/debug` - Systematic debugging workflow using Supabase logs and Playwright

### Quality
- `/architecture-check` - Review code for DDD layer violations and import rule breaches

### Agent-Like Skills
- `/product-owner` - Business perspective, requirements clarification, documentation
- `/fullstack-planner` - Create detailed implementation plans, execute with tests

## Pattern Reference

For detailed patterns on **authentication**, **realtime state management**, **error handling**, and **performance optimization**, see `.github/copilot-instructions.md` sections:
- Authentication Workflows
- Realtime & State Management
- Error Handling Patterns
- Performance Optimization

This file is a condensed quick reference; the full guide has comprehensive examples and implementation guidance.

## Planning Workflow

**For non-trivial features (>5 steps or >2 hours), create a planning file BEFORE coding.**

### When Required
- Multi-phase features (R5 Phase 4.3, etc.)
- Cross-layer changes (domain → application → infrastructure → presentation)
- Features with complex technical decisions

### Process
1. **Create plan**: `docs/progress/plans/YYYY-MM-DD-feature-name.md`
   - Use template from `docs/progress/plans/README.md`
   - Include: steps with checkboxes, technical decisions, success criteria, time estimates
   - Set status: 📋 Planning → 🚧 In Progress → ✅ Complete

2. **Reference in session file**: Link to plan at top of daily session log
   ```markdown
   **Plan:** [Phase 4.3 Reconnection](../plans/2026-01-31-r5-phase4.3-player-reconnection.md)
   **Status:** 🚧 In Progress (Step 3/7)
   ```

3. **Update in real-time**: Check off steps as completed, add notes/observations

4. **Complete**: Check final checklist (tests passing, docs updated, etc.)

See `.github/copilot-instructions.md` "Planning Workflow (Scrum Board Alternative)" for full details.

## Documentation Practices

Good documentation is written at the moment of decision, not reconstructed later. These practices apply to all work in this repo.

### Decision Logging

**Record the WHY, not just the WHAT.** The commit message records what changed; the session file must record why the alternative was rejected.

Minimum decision entry format (use in plan files and session files):
```
**Decision: [short label]**
[One sentence on what was chosen.] [One sentence on the alternative considered.] [One sentence on why this was preferred.]
```

**Always document when you:**
- Choose soft delete over hard delete (data retention trade-off)
- Pick a threshold value (timeout, interval, pool size) — explain the reasoning, not just the value
- Disable a linter rule — name the false-positive pattern
- Use a workaround for a framework quirk — name the quirk
- Defer a feature — say what it's deferred *to* and why it was deprioritised now

### What Goes Where

| Artifact | When to create | What to put in it |
|----------|---------------|-------------------|
| **Plan file** (`docs/progress/plans/`) | Before starting any feature >5 steps or >2h | Steps with checkboxes, technical decisions, time estimates, success criteria |
| **Session file** (`docs/progress/sessions/`) | After completing any significant session | What was built, key decisions with rationale, verification results, files changed |
| **dev-notes.md** | Daily — append-only bullet log | One-liner per feature/fix, link to session file |
| **PROGRESS.md** | After each session | Brief session entry in chronological list + execution log |
| **Commit message** | Every commit | *What* changed and *why* (not how) |

### When a Session File Is Required

Create a session file whenever:
- A feature plan was executed (session file = companion to plan file)
- A significant bug was fixed with a non-obvious root cause
- A maintenance or upgrade session touched many files
- A decision was made that a future developer would need to understand

Skip the session file for: single-file typo fixes, trivial dependency bumps, formatting-only changes.

### The Decision Trail Habit

Before closing a plan or session, ask: *"If I came back to this in 6 months, what would confuse me?"*

Common things to capture:
- Why a threshold is the value it is (e.g. "5 min auto-remove: matches the 120s disconnected threshold × 2.5, giving a visible grace period without requiring background jobs")
- Why a pool cap is set where it is (e.g. "`max: 2` because serverless handles one request at a time; 2 allows parallel queries within a request without exhausting Supabase's per-connection limit")
- What alternatives were rejected and why (e.g. "server-side auto-remove via cron was rejected because it requires background job infrastructure we don't have; host-side is acceptable since the host must be present for the game to run")

### Maintenance Sessions

Security and dependency upgrade sessions must record:
- What drove the upgrade (CVE IDs or Dependabot alerts, not just "security")
- What broke during the upgrade and how it was fixed
- Any rules disabled or workarounds added, and why
- What remains unresolved (e.g. transitive CVEs with no available fix)

## Key Patterns

### API Routes

Typical route structure (most quiz/player routes follow this pattern):

```typescript
type RouteContext = { params: Promise<{ quizId: string }> };
type ErrorResponse = { error: string };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { quizId } = await params;          // always await params first
    const body = await request.json();
    const parsed = InputSchema.parse({ quizId, ...body }); // zod validate

    const { quizService } = getServices();
    const result = await quizService.doSomething(parsed);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] operation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message } satisfies ErrorResponse, { status });
  }
}
```

### Use Cases

Use cases are **classes** that **throw errors** (not Result objects):

```typescript
export class DoSomethingUseCase {
  constructor(private readonly quizRepo: IQuizRepository) {}

  async execute(quizId: string): Promise<string> {
    const quiz = await this.quizRepo.findById(quizId);
    if (!quiz) throw new Error(`Quiz with ID ${quizId} not found`); // regex-matched by API layer → 404
    quiz.doSomething(); // throws if invalid state
    await this.quizRepo.save(quiz);
    return quiz.id;
  }
}
```

### Domain Entities

Entities use **public properties**, **synchronous methods**, **status enums**:

```typescript
export class MyEntity {
  id: string;
  status: MyEntityStatus = MyEntityStatus.Pending;

  activate(): void {
    if (this.status !== MyEntityStatus.Pending)
      throw new Error('MyEntity can only be activated if it is in Pending status.');
    this.status = MyEntityStatus.Active;
  }
}
```

### Realtime Naming Conventions

```
Channel:  quiz:{quizId}                  — broadcast to all in a quiz
          player:{quizId}:{playerId}     — broadcast to one player

Event:    state:update    — full state payload (triggers setQueryData)
          answer:ack      — acknowledgment with result
          player:update   — player property change
          question:locked — state change notification
```

### TanStack Query Hooks

```typescript
// Query key — always a const tuple factory
export const entityQueryKey = (id: string) => ['entity', id] as const;

// All queries use the same timing defaults
useQuery({ queryKey, queryFn, initialData, staleTime: 5_000, refetchInterval: 5_000 });

// Fetch error parsing — consistent pattern across all hooks
const { error } = (await response.json().catch(() => ({}))) as { error?: string };
throw new Error(error ?? 'Unable to load entity.');
```

### Repository Pattern

```typescript
// Always upsert (never separate create/update)
await prisma.entity.upsert({ where: { id }, create: {...}, update: {...} });

// Batch operations always use $transaction
await prisma.$transaction(items.map(item => prisma.entity.update(...)));

// Nullable fields: always default with ?? not undefined
const value = record.field ?? 0;
```

### Adding Features (with tests at each step)
1. Domain: Define entity behavior → **write domain tests**
2. Application: Create use case → **write use case tests**
3. Infrastructure: Update Prisma/repository → **write repository tests**
4. Presentation: API route + hook + component
5. Verify: `yarn test` passes before committing

### Testing Patterns
- **Domain**: Pure unit tests, no mocks. Factory helper `const makeEntity = () => new Entity(...)` at top of file.
- **Use cases**: Mock repositories with `vi.fn()`, test: success + "not found" exact message + invalid state
- **Repositories**: Use `resetServices({ force: true })` between tests
- **E2E**: Playwright with manual-first discovery

## Common Pitfalls

1. **Next.js 15 params**: Must `await params` in route handlers before accessing values
2. **Wrong Prisma import**: Use `@infrastructure/database/prisma/generated-client`
3. **Leaking entities to UI**: Components must receive DTOs only
4. **Skipping prisma:generate**: Required after any schema.prisma changes
5. **Test isolation**: Call `resetServices({ force: true })` for fresh Prisma client in tests
6. **Importing across layer boundaries**: Use `run /architecture-check` to detect violations

### Layer Import Rules (quick check)
```
Domain      → imports nothing from app/infra/presentation
Application → imports from @domain/* only
Infrastructure → imports from @domain/*, @application/* only
Presentation  → imports from @application/dtos/* only (never entities, never Prisma)
```

## Debugging Quick Reference

When something breaks, check in this order:

```bash
# 1. Check Postgres logs for DB errors
mcp__supabase__get_logs(service: 'postgres')

# 2. Check auth/edge function logs
mcp__supabase__get_logs(service: 'auth')

# 3. Inspect current DB state
mcp__supabase__execute_sql(query: 'SELECT * FROM "Quiz" ORDER BY "createdAt" DESC LIMIT 5')

# 4. Check RLS policies after schema changes
mcp__supabase__get_advisors(type: 'security')

# 5. Snapshot current UI state
mcp__playwright__navigate(url: 'http://localhost:3000')
mcp__playwright__snapshot()
```

For realtime issues: check the `realtime` service logs and verify Supabase channel subscriptions in `src/infrastructure/realtime/`.

## Claude Code Preferences

### Commands
- **Always use yarn scripts from package.json** - never run raw CLI commands when a script exists (e.g., use `yarn lint` not `npx eslint`). Might be exceptions when you need to run for all files in the repo e.g. test suites included (it's avoided with `next lint`).
- Reference `package.json` scripts section before running any command

### Dev Server
- **Assume dev server is running** in a separate terminal at `http://localhost:3000` (or 3001 if 3000 is busy)
- If needed and not running, ask the user to start it rather than starting it in background

### Manual Testing
- **Use Playwright MCP for manual verification** of UI features before considering them complete
- Navigate, click, snapshot to verify flows work as expected
- Especially useful for testing realtime features and complex UI interactions

### Git Commits
- **Do NOT add Co-Authored-By** lines to commit messages
- Keep commit messages concise and descriptive
