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

Four exceptions: `@application/services/factories` is the composition root. It imports
infrastructure to wire the services, and API routes and server-component pages call its
`getServices()`. API routes also import the realtime broadcasters
(`@infrastructure/realtime/broadcast-*`) directly (ADR-024). API routes and server-component
pages may import the current-user helper (`@infrastructure/auth/get-current-user`) to read the
signed-in user id. `src/app/providers.tsx` is the browser's composition root and may import
infrastructure.

Owed, not exceptions (ruled 2026-10-15, architecture-check `FINDINGS.md`): the other
presentation files that import infrastructure (realtime in `use-presence.tsx` and
`use-realtime-client.tsx`, storage in the three admin question/media components, auth in the
two `(admin)` layout and login pages). Don't add more; the check doesn't catch them yet.
`@/infrastructure/…` is the same import as `@infrastructure/…`.

DTO-first: a new payload starts as a zod schema in `src/application/dtos/` and a mapper in
`src/application/mappers/` (e.g. `player.dto.ts`, `player-mapper.ts`), then every route and hook
that carries it uses that type. Components import DTOs, never entities.

Path aliases (`tsconfig.json`): `@domain/*`, `@application/*`, `@infrastructure/*`,
`@components/*`, `@hooks/*`, `@lib/*` (`src/lib/*`),
`@utils/*` (`src/lib/utils/*`: configured, resolves to nothing), `@ui/*` (`src/components/ui/*`),
`@/*` (`src/*`).

## Code map

Start from this map, not from a search of the tree. Each flow runs page → component → hook →
API route → service → use case → repository or broadcaster, so a change inside one flow rarely
needs files outside its entry. Search only for what the map doesn't name; when a search finds
something the next session will need, add it here (the user-level `wrap-up` skill does this at
the end of a session). Paths below are under `src/`.

**Host: run a live game**
- Pages: `app/(host)/host/page.tsx` (quiz picker, server component),
  `app/(host)/quiz/[quizId]/page.tsx` → `components/host/host-quiz-dashboard.tsx`,
  `app/(host)/quiz/[quizId]/live/page.tsx` → `components/host/live-game-screen.tsx`, whose phase
  views (lobby, question, round results, final results) are in `components/host/live/`.
- State and actions: `hooks/use-host-quiz-state.ts` reads `api/quiz/[quizId]/state` and has one
  mutation per host action: `api/quiz/start`, then `api/quiz/[quizId]/` `advance`,
  `lock-question`, `timer/reset`, `leaderboard/snapshot`, `finish`, `reset`.
- Players panel: `components/host/player-list-with-status.tsx` (in the dashboard) →
  `hooks/use-host-quiz-players.ts` → `api/quiz/[quizId]/players/status`; kicking is DELETE
  `api/quiz/[quizId]/player/[playerId]`. Question timer: `components/host/timer-countdown.tsx`.
- Server: `application/services/quiz-service.ts` → use cases `start-quiz`, `advance-question`,
  `reset-quiz-timer`, `snapshot-leaderboard`, `end-quiz`, `reset-quiz`, `get-quiz-state`; the
  lock route calls `lock-question.use-case.ts` directly through `getServices()`. The routes then
  broadcast through `infrastructure/realtime/` `broadcast-quiz-state.ts`,
  `broadcast-round-summary.ts` and `broadcast-leaderboard.ts`.
- Domain: `domain/aggregates/quiz-session-aggregate.ts`, `domain/entities/quiz.ts` (status
  transitions), `domain/value-objects/timer.ts`.

**Player: join, answer, reconnect**
- Join: `app/(player)/join/page.tsx` → `components/player/player-join-form.tsx` → POST
  `api/session/join` (rate-limited by `lib/rate-limit.ts`) → `join-session.use-case.ts` (looks
  the code up; codes are generated at quiz creation by `lib/join-code.ts`), then
  `player-service.ts` adds the player.
- Play: `app/(player)/play/[quizId]/[playerId]/page.tsx` →
  `components/player/player-session-screen.tsx` → `hooks/use-player-session.ts` (reads
  `api/quiz/[quizId]/player/[playerId]`; answers go to POST `api/player/answer` →
  `answer-service.ts` → `submit-answer.use-case.ts`, and the route sends the answer ack through
  `broadcast-player-events.ts` and the leaderboard through `broadcast-leaderboard.ts`), plus
  `use-round-summary-listener.ts` and `use-countdown-timer.ts`.
- Reconnect: `hooks/use-reconnection.ts` → POST `api/quiz/[quizId]/player/[playerId]/sync`;
  banner `components/player/connection-status-banner.tsx`.

**Presence (connection status)**: most of these files are listed under "Capable-tier files".
- Client: `app/providers.tsx` wires `infrastructure/realtime/presence-tracker.ts` into
  `hooks/use-presence.tsx` (heartbeat timing in `lib/presence-heartbeat-controller.ts`), which
  POSTs `api/quiz/[quizId]/player/[playerId]/presence` → `playerService.updatePresence`.
- Status: `application/services/presence-monitor.ts` → `get-player-connection-status.use-case.ts`,
  `domain/value-objects/connection-status.ts`.

**Scoring**
- Rules: `domain/value-objects/scoring-strategy.ts` and `score.ts`; leaderboard type
  `domain/types/leaderboard-score.ts`; snapshots `prisma-leaderboard-snapshot.repository.ts`.
- Config UI `components/admin/scoring-settings.tsx` (inside the create and edit quiz dialogs);
  client-side previews `lib/scoring-preview.ts`, `lib/scoring-client.ts`; player badge
  `components/player/scoring-info-badge.tsx`.

**Admin**
- Quizzes: `app/(admin)/admin/quizzes/page.tsx` → `components/admin/quiz-list.tsx` and the
  `create-`, `edit-`, `delete-quiz-dialog.tsx` → `api/admin/quizzes/**` → quiz CRUD use cases.
  Ownership: each route reads the user with `infrastructure/auth/get-current-user.ts` (401 when
  none), lists through `list-quizzes-by-owner.use-case.ts` and runs
  `assert-quiz-owner.use-case.ts` (404, same as missing) before acting; list items are built by
  `application/mappers/quiz-list-item-mapper.ts`. Spec:
  `docs/progress/plans/2026-11-10-quiz-owner-design.md`.
- Questions: `app/(admin)/admin/quizzes/[quizId]/page.tsx` → `question-list.tsx` and the
  `*-question-dialog.tsx` files → `api/admin/quizzes/[quizId]/questions/**` (including
  `reorder`, which no UI calls yet) → the `create-`, `update-`, `delete-`, `reorder-` and
  `list-quiz-questions` use cases. Each handler runs the quiz owner guard first; the question use
  cases go through `loadQuizQuestion` (`get-quiz-question.use-case.ts`), so a question from
  another quiz is "not found" like a missing one. Across quizzes, `app/(admin)/admin/questions` →
  `all-questions-view.tsx` → `api/admin/questions` (only the user's quizzes, from `listByOwner`).
- Media: `app/(admin)/admin/media` → `media-library.tsx`; the question dialogs upload through
  `infrastructure/storage/supabase-storage.ts` (guide: `docs/guides/MEDIA-UPLOADS.md`). There
  is no media API route: both talk to Supabase Storage from the browser.
- Audit: `app/(admin)/admin/audit` → `audit-log-table.tsx` → `api/admin/audit` →
  `application/use-cases/audit/` → `findForOwner` in `prisma-audit-log.repository.ts`, which
  filters through the quiz relation, so logs with no quiz never show.
- Auth: `proxy.ts` guards `/admin` and `/api/admin` (admin check `isAdminUser` in
  `infrastructure/auth/supabase-auth-client.ts`); login in `app/(admin)/login/`. The proxy
  matches nothing else: `/host`, `/quiz/**` and the host actions under `api/quiz/**` have no
  login check until the quiz-owner part 3 issue (140) lands.

**Cross-cutting**
- Composition root `application/services/factories.ts` (`getServices()`); `questionService` and
  `auditService` are object literals there, with no service file of their own; env checks
  `lib/env-validation.ts`; Prisma pool size `infrastructure/database/prisma/pool-size.ts`; seeds
  `infrastructure/database/prisma/seed*.ts` (owner from `SEED_QUIZ_OWNER_ID`); migrations in
  `infrastructure/database/prisma/migrations/`; one-off owner backfill
  `assign-quiz-owner.ts` (`yarn quiz:assign-owner`).
- Keepalive: the daily Vercel cron in `vercel.json` → `api/cron/keepalive` →
  `ping-database.use-case.ts` → `prisma-database-health.repository.ts`. Production Supabase is on
  the Free plan and pauses after a quiet week without it (ADR-026); `Quiz-game-dev` has no
  keepalive and may need restoring before local work.
- Unit tests mirror `src/` under `src/tests/` (`proxy.test.ts` at its root); Playwright specs in
  `e2e/`, page objects in `e2e/pages/`, helpers in `e2e/support/`; load tests in `tests/load/`
  (repo root, not `src/`). e2e signs in once in `e2e/auth.setup.ts` as `TEST_ADMIN_EMAIL` (the
  main admin account) and every spec reuses that session; quizzes come from
  `e2e/support/quiz-fixtures.ts` and stale ones are removed by `e2e/stale-quizzes.cleanup.ts`.

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
5. CLI commands that reach a database (`migrate status`, `migrate deploy`, `db execute`) get the
   URL from `prisma.config.ts` (`DIRECT_URL`, else `DATABASE_URL`), which loads only `.env`.
   This repo keeps its dev values in `.env.local`, so export both variables in the shell first.
   `db execute` takes no `--schema` flag in Prisma 7 (it fails); `migrate` commands still need
   it (seen 2026-11-10, Prisma 7.10.1).
6. No `psql` or Docker here. For a read-only query, run a `.ts` script with
   `node --env-file=.env.local node_modules/.bin/tsx <script>`; a script outside the repo must
   import `@prisma/adapter-pg` and the generated client by absolute path, or they don't resolve
   (seen 2026-11-10).

## Testing

Every feature needs:

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
- No `.skip` left behind. CI gates on `yarn lint`, the unit tests and `yarn build`; a UI or flow
  change also runs `yarn test:e2e`.

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

Realtime subscriptions, presence, timers and provider wiring. Every fix for presence heartbeats,
the presence provider's channel reuse, the host's leaderboard subscription and the broadcast
listener leak (#58, #59, #60, #63) touched at least one of them. The list is `capableTier` in
`.claude/workflow.json`; the workflow says how those paths are routed. This repo has no agents
of its own; the user-level ones apply.

## Records

Specs and plans go to `docs/progress/plans/`, not `docs/superpowers/` (`specs` and `plans` in
`.claude/workflow.json`). The table of artifacts, plan shape and status lines are in
`docs/progress/plans/README.md`. When a PR merges, add its line to the "Work index" in
`docs/progress/PROGRESS.md`; add an ADR to `docs/DECISION-LOG.md` only for a decision that
outlives the work. Process follows the profile in `.claude/workflow.json`, injected at session
start (`# Workflow: …`); it is not repeated here.

## Common pitfalls

1. Crossing layer boundaries (entities or Prisma types in components): run `/architecture-check`.
2. Supabase signups must stay disabled in both projects. The `quiz-media` storage policies let
   any authenticated user upload and delete, and only admin accounts exist
   (`docs/progress/findings/2026-10-15-storage-policies-any-user.md`).
3. `yarn test:e2e` against a dev server with the default pool (2) or join limit (10/min) fails
   under load or on repeated runs within a minute (a pass on retry fails the run too): set
   `DATABASE_POOL_MAX=10` and `SESSION_JOIN_RATE_LIMIT=100` for local dev (`e2e/README.md`). A dev
   server in a git worktree needs its own `node_modules`, not a symlink (Turbopack rejects it).

## Debugging order

Find the layer first: API 500 (application/infrastructure), stale UI (realtime or TanStack Query),
401 or redirect loops (`src/proxy.ts`), constraint errors (schema).

1. `mcp__supabase__query_logs` for the `postgres` service: DB errors.
2. `mcp__supabase__query_logs` for `auth` or `realtime`: auth and channel errors.
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

- The default branch is `master`: branch with `git switch -c <name> --no-track origin/master`.
- Product questions: `docs/plan.md` (roadmap), `docs/ARCHITECTURE.md`, `docs/mockups/` (UX).
- Shared Claude settings live in `.claude/settings.json` and the workflow profile and facts in
  `.claude/workflow.json`; per-machine overrides go in `.claude/settings.local.json` and
  `.claude/workflow.local.json`, which are git-ignored.
