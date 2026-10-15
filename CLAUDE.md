# CLAUDE.md

## Project

Real-time quiz game. Next.js 16 (App Router), Prisma v7 with the pg driver adapter, Supabase
(Postgres, Auth, Realtime, Storage). DDD-lite: Domain → Application → Infrastructure → Presentation.

## Commands

```bash
yarn dev                  # Dev server (Turbopack)
yarn build                # Production build (prebuild runs prisma:generate)
yarn lint                 # ESLint (Prettier runs as an ESLint rule); yarn lint:fix to auto-fix
yarn test:run             # Unit tests once: the verdict command, use it for any reported result
yarn test:run src/tests/domain/entities/quiz.test.ts   # One file (or a name pattern)
yarn test                 # Vitest; watch mode in an interactive terminal, not for verdicts
yarn test:e2e             # Playwright (e2e/); also test:e2e:ui and test:e2e:debug
yarn prisma:generate      # Regenerate the client; required after schema changes
yarn prisma:migrate       # Create/apply migrations; prisma:seed and seed:demo seed data
```

## Architecture and layer rules

```
Next.js API route → zod DTO validation → use case/service → domain entity → Prisma repository → Postgres
```

- **Domain** (`src/domain/**`): pure logic: entities, value objects, aggregates, events, repo
  interfaces.
- **Application** (`src/application/**`): use cases orchestrate the domain, return DTOs.
- **Infrastructure** (`src/infrastructure/**`): Prisma repositories, realtime, auth, storage.
- **Presentation** (`src/app/**`, `src/components/**`, `src/hooks/**`): DTOs only.

```
Domain         → imports nothing from application/infrastructure/presentation
Application    → imports from @domain/* only
Infrastructure → imports from @domain/*, @application/* only
Presentation   → imports from @application/dtos/* only (never entities, never Prisma)
```

Two exceptions: `@application/services/factories` is the composition root. It imports
infrastructure to wire the services, and API routes and server-component pages call its
`getServices()`. API routes also import the realtime broadcasters
(`@infrastructure/realtime/broadcast-*`) directly (ADR-024).

DTO-first: a new payload starts as a zod schema in `src/application/dtos/` and a mapper in
`src/application/mappers/` (e.g. `player.dto.ts`, `player-mapper.ts`), then every route and hook
that carries it uses that type. Components import DTOs, never entities.

Path aliases (`tsconfig.json`): `@domain/*`, `@application/*`, `@infrastructure/*`,
`@components/*`, `@hooks/*`, `@lib/*` (`src/lib/*`),
`@utils/*` (`src/lib/utils/*`: configured, resolves to nothing), `@ui/*` (`src/components/ui/*`),
`@/*` (`src/*`).

## Prisma v7 setup (non-standard)

1. Schema: `src/infrastructure/database/prisma/schema.prisma`.
2. The client is generated into `./generated/client` (git-ignored); import it through
   `@infrastructure/database/prisma/generated-client`, never `@prisma/client`.
3. The client needs the driver adapter:
   ```typescript
   import { PrismaPg } from '@prisma/adapter-pg';
   import { PrismaClient } from './generated-client';
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   const prisma = new PrismaClient({ adapter });
   ```
4. Run `yarn prisma:generate` after every schema change.

## Testing

Tests are written with the code, not after. Every feature needs:

| What | Where |
|---|---|
| Entity behavior, invariants | `src/tests/domain/{entities,value-objects,aggregates,events}/` |
| Use case success, not-found and invalid-state paths | `src/tests/application/use-cases/` |
| Repository CRUD and edge cases | `src/tests/infrastructure/repositories/` |
| Services, mappers, hooks, lib, API routes, components | `src/tests/{application/services,application/mappers,hooks,lib,app/api,components}/` |
| Cross-layer flows | `src/tests/integration/` |
| User flows (Playwright) | `e2e/` |

- Domain tests: no mocks; a factory helper `makeEntity = () => new Entity(...)` at the top.
- Use case tests: mock repositories with `vi.fn()`, reset mocks in `beforeEach`; assert
  the exact not-found message, because the API layer maps it to 404.
- Repository tests mock the Prisma client: `vi.hoisted(() => ({ … vi.fn() }))` plus
  `vi.mock('@infrastructure/database/prisma/client', …)`, mocks reset in `beforeEach`
  (see `prisma-player-repository.test.ts`).
- `yarn test:run` must pass before moving to the next task. No `.skip` left behind.

## Key patterns

API routes: `await params` first, validate with zod, call a service, map errors.

```typescript
type RouteContext = { params: Promise<{ quizId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { quizId } = await params;
    const parsed = InputSchema.parse({ quizId, ...(await request.json()) });
    return NextResponse.json(await getServices().quizService.doSomething(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

Use cases are classes that throw (no Result objects); the message must contain "not found"
for a 404:

```typescript
export class DoSomethingUseCase {
  constructor(private readonly quizRepo: IQuizRepository) {}
  async execute(quizId: string): Promise<string> {
    const quiz = await this.quizRepo.findById(quizId);
    if (!quiz) throw new Error(`Quiz with ID ${quizId} not found.`);
    quiz.doSomething(); // throws on invalid state
    await this.quizRepo.save(quiz);
    return quiz.id;
  }
}
```

Entities: public properties, synchronous methods, status enums (`QuizStatus`); bad transitions
throw.

Realtime names: channel `quiz:{quizId}` (all in a quiz) and `player:{quizId}:{playerId}` (one
player). Events include `state:update` (full state), `answer:ack`, `player:update`,
`question:locked`, `leaderboard:update`. Adapters live in `src/infrastructure/realtime/`.

TanStack Query hooks: the key is a const tuple factory (`hostQuizQueryKey(quizId)`); queries use
`staleTime: 5_000` and `refetchInterval: 5_000`; fetch errors parse
`(await response.json().catch(() => ({}))) as { error?: string }` and throw
`new Error(error ?? 'Unable to load …')`.

Repositories: `save()` upserts in the player and question repositories (new repositories follow
that); the quiz aggregate uses separate `create`/`update`. Batches go through `$transaction`;
nullable columns default with `??` (`record.score ?? 0`), never `undefined`.

Types: no `any`; use domain or DTO types, or `unknown` plus a type guard when a type truly can't
be known.

Styling: build class names with `cn()` imported from `@/lib/utils` (`src/lib/utils.ts`) and
compose UI from the shadcn primitives in `src/components/ui` (`components.json`). Add one with
`npx shadcn@latest add <component>` (no yarn script covers it). No inline `style` props except for
dynamic values (e.g. a computed width); theme tokens live in `src/app/globals.css`.

Long form: `docs/guides/PATTERNS.md`.

## Capable-tier files

Route any task touching these to `implementer-capable` and `task-reviewer-capable`: realtime
subscriptions, presence, timers and provider wiring. Every fix in #58, #59, #60 and #63 touched at
least one of them.

- `src/infrastructure/realtime/**`
- `src/hooks/use-presence.tsx`
- `src/hooks/use-realtime-client.tsx`
- `src/hooks/use-reconnection.ts`
- `src/hooks/use-countdown-timer.ts`
- `src/lib/presence-heartbeat-controller.ts`
- `src/lib/debounce-broadcast.ts`
- `src/app/providers.tsx`
- `src/hooks/use-host-quiz-state.ts`
- `src/hooks/use-player-session.ts`

## Records

Specs and plans go to `docs/progress/plans/`, not `docs/superpowers/`.

| Artifact | Path | Written when |
|---|---|---|
| Spec | `docs/progress/plans/YYYY-MM-DD-<topic>-design.md` | end of brainstorming, approved before planning |
| Plan | `docs/progress/plans/YYYY-MM-DD-<topic>-plan.md` | writing-plans, checked by plan-checker before task 1 |
| Ledger | `.superpowers/sdd/<plan>/progress.md` and `*-report.md`, added with `git add -f` | during execution; diffs and briefs stay uncommitted |
| Index line | `docs/progress/PROGRESS.md` → "Work index" | when the PR merges |
| ADR | `docs/DECISION-LOG.md` | only for a decision that outlives the work |

Plan shape and status lines: `docs/progress/plans/README.md`. Process (brainstorming → spec →
plan → subagent-driven development → branch passes) follows the user-level workflow and is not
repeated here.

## Common pitfalls

1. Route `params` is a Promise: `await params` in handlers before reading it.
2. Crossing layer boundaries (entities or Prisma types in components): run `/architecture-check`.
3. `yarn test` enters watch mode in an interactive terminal (it runs once without a TTY); use
   `yarn test:run` for verdicts.

## Debugging order

Find the layer first: API 500 (application/infrastructure), stale UI (realtime or TanStack Query),
401 or redirect loops (`src/proxy.ts`), constraint errors (schema).

1. `mcp__supabase__get_logs(service: 'postgres')`: DB errors.
2. `mcp__supabase__get_logs(service: 'auth')` or `'realtime'`: auth and channel errors.
3. `mcp__supabase__execute_sql(query: 'SELECT * FROM "Quiz" ORDER BY "createdAt" DESC LIMIT 5')`;
   `mcp__supabase__get_advisors(type: 'security')` for RLS after schema changes.
4. `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:3000`, then
   `mcp__plugin_playwright_playwright__browser_snapshot`.

- API route: check the chain zod validation → `getServices()` → use case → `/not found/i` → 404.
- Realtime: the channel name must match between publisher and subscriber, and a mutation must
  invalidate its query. Channel setup is in `src/infrastructure/realtime/`.
- Schema: `yarn prisma:generate` was run; repository mappers handle new fields.
- Tests: stale mocks (reset in `beforeEach`), mock return shapes match what the code under test
  expects.
- MCP: `supabase` is in `.mcp.json` (authenticate with `/mcp`); playwright, github: user plugins.
  The user-level `plugin:supabase:supabase` is not scoped to this project; use the project entry.

## Working rules

- Use the yarn scripts in `package.json`, not raw CLI calls, when one exists.
- Assume the dev server runs at `http://localhost:3000` (3001 if 3000 is busy); ask the user to
  start it if it does not.
- Verify UI changes in the browser with the Playwright plugin before calling them done.
- Never commit to `master` (branch-protected). Branch from `origin/master`, open a PR.
- No `Co-Authored-By` or other AI attribution in commits or PRs.
- Shared Claude settings live in `.claude/settings.json`; per-machine overrides go in
  `.claude/settings.local.json`, which is git-ignored.
