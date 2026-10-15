# Skills records report

Commit: ac83c9f234d7200f8974847c287e6a4e378d0b19

```
commit ac83c9f234d7200f8974847c287e6a4e378d0b19
Author: Vladislav Banykin <banykinv@gmail.com>
Date:   Thu Oct 15 19:25:31 2026 +0100

    docs(claude): add observed-vs-assumed records to skills

 .claude/skills/architecture-check/FINDINGS.md | 17 +++++++++++++++++
 .claude/skills/architecture-check/SKILL.md    | 22 ++++++++++++++++++++++
 .claude/skills/create-entity/FINDINGS.md      | 17 +++++++++++++++++
 .claude/skills/create-entity/SKILL.md         | 18 ++++++++++++++++++
 .claude/skills/create-hook/FINDINGS.md        | 17 +++++++++++++++++
 .claude/skills/create-hook/SKILL.md           | 18 ++++++++++++++++++
 .claude/skills/create-use-case/FINDINGS.md    | 17 +++++++++++++++++
 .claude/skills/create-use-case/SKILL.md       | 20 ++++++++++++++++++++
 .claude/skills/prisma-migrate/FINDINGS.md     | 17 +++++++++++++++++
 .claude/skills/prisma-migrate/SKILL.md        | 22 ++++++++++++++++++++++
 .claude/skills/product-owner/FINDINGS.md      | 17 +++++++++++++++++
 .claude/skills/product-owner/SKILL.md         | 14 ++++++++++++++
 12 files changed, 216 insertions(+)
```

Assumed bullets per skill (the SKILL.md line numbers each comes from are in parentheses on the bullet; lines refer to the pre-edit file).

## create-entity

- `src/domain/entities/quiz.ts` and `player.ts` exist and use public properties, enum status and
  synchronous methods (lines 26-30).
- Domain repository interfaces live in `src/domain/repositories/[entity-name]-repository.ts` and
  are named `I[EntityName]Repository` (lines 102-107).
- Entities are mapped from Prisma records with `record.status as [EntityName]Status` in the
  repository mapper (line 97).
- State-transition errors follow the format `'[Entity] can only X if it is in Y status.'` (line
  94).
- `yarn test:run src/tests/domain/entities/[entity-name].test.ts` runs a single file (line 170).

## create-use-case

- `start-quiz.use-case.ts` and `submit-answer.use-case.ts` exist in `src/application/use-cases/`
  and match the class-with-`execute()` style (lines 26-27).
- Repository interfaces are imported from `@domain/repositories/I[Entity]Repository` (lines 37
  and 170).
- The not-found message `[Entity] with ID ${id} not found` is what the API route's `/not found/i`
  regex maps to 404 (lines 55 and 71).
- All services are assembled in `getServices()` and `getRepositories()` in
  `src/application/services/factories.ts`, and service files are named `[entity]-service.ts`
  (lines 100-131).
- The route is created at `src/app/api/[entity]/[action]/route.ts` and `getServices()` exposes
  `[entity]Service` (lines 135-151).

## create-hook

- `use-player-session.ts` and `use-host-quiz-state.ts` exist in `src/hooks/` and hold the
  patterns described (lines 25-26).
- `useRealtimeClient` is exported from `@hooks/use-realtime-client` and its `subscribe<T>(channel,
  event, handler)` returns an unsubscribe function (lines 120 and 140-147).
- Every existing hook uses `staleTime: 5_000` and `refetchInterval: 5_000` (lines 94-95).
- The channel and event names listed (including `player:kicked`) match those in
  `src/infrastructure/realtime/` (lines 156-170).
- `fetch` with `cache: 'no-store'` and the `.catch(() => ({}))` error parse is the pattern the
  existing hooks use (lines 47-57).

## architecture-check

- Each `grep -r` in Checks 1-5 prints a line for every import breach under the named directory,
  so empty output means no breach; a planted `from '@application/x'` in `src/domain/` is caught
  by Check 1 (lines 27-36).
- The Quick Full Sweep prints `CLEAN` only when the code is clean; a mistyped or missing path
  also prints `CLEAN` because of `2>/dev/null ... || echo "CLEAN"` (lines 110-121).
- Check 2 finds every entity or aggregate import in `src/components/`, `src/hooks/` and
  `src/app/api/`; the Quick Full Sweep also scans all of `src/app/` (lines 42-50 and 113-114).
- Check 5 catches every cross-layer relative import; its patterns are `../../domain/`,
  `../../application/` and `../../..` only (lines 78-80).
- Check 7 finds a route handler that reads `params` without awaiting it; a handler with
  `const { id } = params;` has no `params.` text for the grep to match (lines 99-103).
- Plain `grep -r` over `src/` visits every source file, with no ignore-file filtering (lines
  27-34).

## prisma-migrate

- `yarn prisma:migrate -- --name describe_your_change` creates and applies a migration in
  `src/infrastructure/database/prisma/migrations/` (lines 51-54).
- The generated client lives at `./generated/client` and is imported through
  `@infrastructure/database/prisma/generated-client` (lines 18-19).
- `yarn prisma:generate` is required after every schema change and its absence breaks imports
  (lines 58-61).
- Repository implementations are in `src/infrastructure/repositories/` and DTO mappers in
  `src/application/mappers/` (lines 71 and 77).
- `npx prisma migrate status` and `migrate reset` with `--schema
  src/infrastructure/database/prisma/schema.prisma` work against this repo's configuration
  (lines 90-93).
- `resetServices({ force: true })` exists and resets the service container in tests (line 101).
- `yarn prisma:seed` runs `src/infrastructure/database/prisma/seed.ts` (lines 105-107).

## product-owner

- `docs/plan.md`, `docs/ARCHITECTURE.md`, `docs/progress/PROGRESS.md` and `docs/mockups/` exist
  (lines 36-39).
- Specs and plans live in `docs/progress/plans/` (line 44).
- `docs/plan.md` is the roadmap the skill is meant to maintain (lines 26 and 36).
- The Playwright and Supabase MCP servers are configured for this repo (lines 89-90).
