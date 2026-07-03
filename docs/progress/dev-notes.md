# Dev Progress Log

## 2026-07-03 (Security fix: RLS disabled on all tables ✅)
- **Found while investigating Vercel production deployment**: Supabase's own advisor flagged `rls_disabled_in_public` (ERROR level) on all 7 public tables — contradicts the Phase 5 session's claim that RLS was "verified clean, zero lints." Since the anon key is public (shipped client-side) and Supabase auto-exposes every public table via PostgREST/GraphQL regardless of app code, this meant anyone could read/write `Quiz`, `Question`, `Player`, `Answer`, etc. directly, bypassing the Phase 5 redaction and rate-limiting work entirely.
- **Verified safe to fix**: grepped for `@supabase/supabase-js` usage — only 4 files, all in `infrastructure/realtime/`, all server-side with the service-role key (which bypasses RLS) for realtime channels only. No table queries anywhere use the Supabase client; all real data access goes through Prisma via a direct Postgres connection (table owner, bypasses RLS by Postgres default). So enabling RLS with zero policies (default-deny for anon/authenticated) has no legitimate access to break.
- **Fix**: Prisma migration `20260703183721_enable_rls_all_tables` — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 6 app tables; `_prisma_migrations` handled separately via direct SQL (can't be part of a tracked migration — Prisma's shadow-DB validation fails since that table doesn't exist there yet during replay).
- **Verified**: Supabase advisor no longer shows the ERROR-level finding (now INFO "enabled, no policy" as intended); 439/439 tests pass against the real shared DB; live curl against the running dev server confirms the app still works end-to-end.
- **Not fixed (separate, lower priority)**: `public_bucket_allows_listing` (quiz-media bucket allows listing all files) and `auth_leaked_password_protection` (HaveIBeenPwned check disabled) — both WARN level, deferred.

## 2026-07-03 (docs/plan.md reconciliation ✅)
- R6 Phase 2/3 checkboxes were stale (fully unchecked despite being shipped in the 2026-02-07 and 2026-03-07 sessions). Verified against actual code and corrected: Phase 2 was a trimmed targeted-fixes pass (not the full a11y/responsive audit), Phase 3 is built but narrower than scoped (audit log = quiz lifecycle events only, no bulk ops on questions, no media usage tracking). "Pause quiz mid-game" confirmed still open. Left Phase 1.6's E2E spec status explicitly unverified (would've required installing separate Playwright CLI browser binaries for no real benefit).

## 2026-07-03 (Bug fix: inflated player count for players ✅)
- **Root cause**: `JoinSessionUseCase`, `GetPlayerSessionUseCase`, and `ListQuizPlayersUseCase` never filtered out `PlayerStatus.Removed` players, unlike the host-only `GetQuizStateUseCase` which already did. Kicked/auto-removed players kept showing up in every player-facing roster (join response, polled session, `GET /api/quiz/[quizId]/players`) — directly observed live: a test quiz with 5 `Removed` + 1 `Active` player showed "Connected players: 6" in the player UI.
- **Fix**: filtered `PlayerStatus.Removed` out of the roster in all three use cases, matching the existing host-side pattern. `GetPlayerSessionUseCase` keeps an unfiltered lookup for the requesting player's own record (so a removed player's last poll before their kick-redirect still resolves), and only filters the DTO's `players` list.
- **Verified**: reproduced with a failing test per use case first (TDD), then fixed; 436 tests passing (+3), live curl against the real test quiz confirmed the roster endpoint now returns 1 player instead of 6.
- **Investigated, confirmed as intended behavior (no code change)**:
  - "Timer doesn't reset when a player disconnects mid-answer" — traced every timer-mutating call site (`resetTimer` only called from quiz start, host's manual "Reset timer" button, and `AdvanceQuestionUseCase`) and every presence/disconnect code path (`UpdatePlayerPresenceUseCase`, `PresenceMonitor`, the `/sync` reconnection endpoint, `RemovePlayerUseCase`) — none of them touch the timer. Confirmed with the user this is correct as-is: the per-question timer stays a single shared value for the whole room, intentionally decoupled from individual player connection state (pausing on any disconnect was considered and rejected — too easy to abuse to buy time).
  - "Timer ends → should auto-advance to next question / end quiz" — confirmed no auto-advance-on-expiry mechanism exists anywhere (`TimerCountdown`/`useCountdownTimer` are purely visual and clamp at 0 with no callback; no server-side cron/interval). Confirmed with the user this stays host-manual by design (Lock Question → Next question → ... → Finish quiz) — no auto-advance to be built.
- **Follow-up (same root cause, host-facing this time)**: `/admin/quizzes` and `/host` also showed inflated `playerCount` badges — `ListAllQuizzesUseCase` reads `quiz.players.size`, a `Set<string>` of ids on the `Quiz` domain entity populated by `PrismaQuizRepository.findAll()`/`findEntityById()` via an **unfiltered** `players: { select: { id: true } }` relation query; `RemovePlayerUseCase` only flips the `Player` entity's own status, it never prunes the `Quiz` aggregate's id membership, so removed players stayed counted forever. Fixed via `players: { where: { status: { not: PlayerStatus.Removed } }, select: { id: true } }` in both repository methods. Built with subagent-driven development (implementer + task reviewer, task Approved with only Minor style nits, applied directly). Verified live: 439 tests passing, and confirmed against the DB that a quiz with 6 total players (all now legitimately `Removed`, including one auto-removed by the 5-min disconnect timeout mid-session) now correctly shows `0 players` instead of `6`.

## 2026-07-03 (R6 Phase 5: Security Hardening, Trimmed ✅)
- **Correction (same day, later session)**: the "RLS clean, zero lints" claim below did not hold — a later check the same day found `rls_disabled_in_public` (ERROR) on all 7 tables via the same `get_advisors` call. Cause unconfirmed (unclear whether advisors returned a stale/incomplete result earlier, or something between sessions altered table state), but the gap is now closed — see "Security fix: RLS disabled on all tables" entry above. Lesson: re-run advisors immediately before relying on a "clean" verdict, don't treat an earlier same-day check as still valid.
- **Evidence first**: checked Supabase advisors before planning — RLS and performance both clean (zero lints), so speculative DB indexing/RLS rework was dropped; CORS also verified clean (no custom headers, Next.js same-origin default)
- **Real finding**: `GetQuizStateUseCase`/`JoinSessionUseCase`/`GetPlayerSessionUseCase` all sent the *full* quiz DTO (every question's text/media/options, every player's raw answers) to players via join response, polled session endpoint, and the public `quiz:{quizId}` realtime broadcast — a genuine cheating vector, not hypothetical
- **Fix**: new `mapQuizToPlayerFacingDTO` (`src/application/mappers/player-quiz-mapper.ts`) redacts non-active questions' content and strips `answers` entirely before the DTO reaches a player; applied in `JoinSessionUseCase` + `GetPlayerSessionUseCase`, and via a new `state:update:player` broadcast event (same `quiz:{quizId}` channel as the existing host-only `state:update`) — host (`useHostQuizState`) untouched, `usePlayerSession` repointed to the new event
- **Rate limiting**: new in-memory fixed-window limiter (`src/lib/rate-limit.ts`) on `POST /api/session/join`, `/api/player/add` (10/60s), `/api/player/answer` (30/60s) — known limitation: per-instance only, revisit with Upstash if a real multi-instance prod deployment shows abuse
- **Deferred** (no evidence of need yet): Redis caching, Edge Function heartbeat, DB indexing, deployment runbook/incident docs — revisit at actual launch (Phase 6) or if real load data surfaces a bottleneck
- **Verified**: 432 tests passing (+18 new), build ✅, lint clean, manual Playwright MCP verification against `QR Code Test Quiz` confirmed redacted payloads on the player side and full fidelity on the host side
- Plan: [plans/2026-07-03-r6-phase5-security-hardening.md](plans/2026-07-03-r6-phase5-security-hardening.md)

## 2026-05-09 (Maintenance: Security, Tooling, CI ✅)
- **Security**: 101 Dependabot vulnerabilities → 2; bumped Next 16.2.6, Prisma 7.8, ESLint 10, Vitest 4, Playwright 1.59; added `resolutions` in `package.json` for transitive CVEs (minimatch, brace-expansion, flatted, picomatch, vite, postcss, @hono/node-server, js-yaml)
- **ESLint 10**: Removed `FlatCompat` bridge (circular JSON error); native `eslint-config-next` flat export; disabled `react-hooks/error-boundaries` (false positive on Next.js async server components) and `react-hooks/set-state-in-effect` (legitimate derived-state patterns); fixed `use-presence.tsx` to add `sendHeartbeatRef` to deps
- **Dependabot**: Added `.github/dependabot.yml` — weekly grouped npm updates + weekly GitHub Actions updates
- **CI**: Added env fallbacks (`|| ''`) in build job so Dependabot PRs don't fail on missing secrets; bumped `setup-node` v4→v5
- **GitHub MCP**: Corrected package name in `.mcp.json`/`.vscode/mcp.json`/`.claude/settings.local.json` (was non-existent `@anthropic-ai/claude-code`, now `@modelcontextprotocol/server-github`)
- **LF endings**: `.gitattributes` `* text=auto eol=lf` + VS Code `files.eol: \n`
- **pg pool cap**: `max: 2` on `PrismaPg` adapter; `.env.example` documents Supavisor URL (port 6543) as the primary EMAXCONN fix
- **Prettier 3.8.3**: Reformatted affected files after bump
- **10 routine Dependabot PRs merged**: zod, tailwind-merge, @tailwindcss/postcss, dotenv, tsx, vite-tsconfig-paths, tanstack group, actions/checkout v6, actions/setup-node v6
- Session: [sessions/2026-05-09-maintenance-security-tooling.md](sessions/2026-05-09-maintenance-security-tooling.md)

## 2026-05-05 (Player Kick & Auto-Remove ✅)
- **Soft removal via `Removed` status**: New `PlayerStatus.Removed` in domain + Prisma schema; `removeFromGame(reason)` method on Player entity
- **RemovePlayerUseCase**: Application use case validates player + quiz ownership, calls domain method, saves. Rejoin support — `Removed` excluded from name-duplicate check in `AddPlayerUseCase`
- **DELETE API**: `DELETE /api/quiz/[quizId]/player/[playerId]` with optional `reason` body field (defaults to `'kicked'`)
- **Realtime**: `broadcastPlayerKicked()` sends `player:kicked` event on private `player:{quizId}:{playerId}` channel
- **Player UI**: `usePlayerSession` listens for `player:kicked` → redirects to `/join?kicked=true`; join page shows amber "You were removed from the game by the host." banner
- **Host UI**: `useHostQuizPlayers` exposes `kickPlayer(playerId)` + `isKicking`; auto-removes players disconnected >5min via polling loop with `Set` deduplication ref; `PlayerListWithStatus` shows Kick button per row
- **Verified**: build ✅, lint ✅ (0 errors), 413 tests ✅, manual kick flow ✅


- **Connection status monitoring complete**: Hosts can now see player connection health in real-time
- Created `PresenceMonitor` service with connection thresholds (connected <30s, away 30-120s, disconnected >120s)
- Built `GetPlayerConnectionStatusUseCase` orchestrating presence detection
- Added `/api/quiz/[quizId]/players/status` endpoint for host polling
- Created `useHostQuizPlayers` hook with 5s polling interval
- Built `PlayerListWithStatus` component with color-coded badges (green/yellow/red) and "last seen" timestamps
- Integrated into host dashboard - replaced old static player list
- **Test Coverage**: 31 unit tests passing (PresenceMonitor, UseCase, Hook)
- **E2E Tests**: 4 scenarios created (`e2e/player-connection-status.spec.ts`)
- Session: [2026-01-27-to-2026-01-31-r5-phase4-connection-health.md](sessions/2026-01-27-to-2026-01-31-r5-phase4-connection-health.md)

## 2026-01-11 (R5 Phase 2 UI Enhancements ✅)
- **Player scoring UX complete**: Live point preview, speed indicators, scoring info badges
- Created `ScoringInfoBadge` component (Radix tooltip showing algorithm descriptions)
- Built `scoring-client.ts` with formulas matching domain layer (exponential/linear/fixed)
- Player sees real-time point calculations updating each second during countdown
- Speed bonus indicator on submission: ⚡ Lightning / 🚀 Fast / ✓ Good / 🐢 Steady / ⏱️ Last second
- Host dashboard shows scoring config in new 3-column settings card
- **Deferred**: Animated leaderboard (rank arrows, smooth transitions) to later phase
- Session: [2026-01-11-r5-phase2-ui-enhancements.md](sessions/2026-01-11-r5-phase2-ui-enhancements.md)

## 2025-12-21 (R4 COMPLETE ✅)
- **R4 Content Admin is COMPLETE**! All deliverables finished:
  - ✅ Auth gate (Supabase + middleware)
  - ✅ Quiz CRUD UI (list, create, edit, delete, reorder)
  - ✅ Question CRUD UI (all question types, media support)
  - ✅ Media uploads (client-side resize, Supabase Storage)
  - ✅ DTO validation (Zod schemas throughout)
  - ⏭️ Audit log (deferred to R6 - implementation plan documented)
- **Final bugs fixed**: GET endpoint entity property mismatch, ImageUpload preview sync
- **Documentation**: Created `docs/progress/actions/06-r4-wrap-up.md` with complete retrospective
- **Next**: R5 (Realtime & Scoring) - WebSocket implementation, game loop, leaderboard

## 2025-12-21 (Media Flow E2E Test - ALL BUGS FIXED ✅)
- **Manually tested complete media flow via Playwright MCP**:
  - Upload: Client-side resize (26.6KB → 13.7KB = 48% reduction) ✅
  - Create: Question saved with media, thumbnail displays in list ✅
  - Edit: Fixed critical bug - GET endpoint was accessing `question.mediaUrl` but entity property is `question.media`
  - Preview: Added useEffect to sync ImageUpload preview with value prop changes ✅
- **Bugs Fixed**:
  1. GET endpoint `/api/admin/quizzes/[quizId]/questions/[questionId]` - Changed `question.mediaUrl` to `question.media`
  2. ImageUpload component - Added useEffect to sync preview when value prop changes (for edit dialog)
- **Result**: Complete media upload flow VERIFIED working end-to-end!
- **Screenshot**: `.playwright-mcp/media-flow-success.png` (edit dialog showing loaded image)

## 2025-12-21 (Media Bug Fixes - NOW COMPLETE)
- **Fixed critical media bugs**: Edit question with media and preview in question list
  1. GET endpoint missing media fields - couldn't load existing media in edit dialog
  2. PATCH endpoint missing mediaUrl in response - list didn't update after edit
  3. Use cases not handling media updates - create/update ignored media fields
- **Files Modified**:
  - API route: Added mediaUrl/mediaType to GET/PATCH responses
  - CreateQuestionUseCase: Pass DTO media fields to entity constructor
  - UpdateQuestionUseCase: Update entity media fields when provided
- **Result**: Media for questions NOW COMPLETE ✅ (create, edit, preview all working)
- **Next**: Implement audit log (final R4 item)

## 2025-12-20/21 (Continued - Media Uploads COMPLETE)
- **Fixed critical Next.js config issue**: Added Supabase Storage hostname to remotePatterns in next.config.ts
- **Manual tested complete upload flow via Playwright MCP**:
  - Created test image (800x600 PNG, 26.6 KB)
  - Uploaded via ImageUpload component
  - Verified client-side resize (26.6 KB → 13.7 KB)
  - Confirmed upload to Supabase Storage bucket
  - Verified image preview displays correctly in dialog
  - Screenshot saved: `.playwright-mcp/media-upload-success.png`
- **Result**: Media upload feature COMPLETE and production-ready!
- **Next**: Implement audit log (remaining R4 item)

## 2025-12-20 (Continued - Media Uploads)
- Implemented complete media upload feature for R4 Content Admin
- Activated media fields in admin question DTOs (CreateQuestionDTO, UpdateQuestionDTO, QuestionAdminDTO)
- Created storage service abstraction (IStorageService) and Supabase implementation
- Built client-side image resizing utilities (max 1920x1080, 85% quality, ~70-90% size reduction)
- Created ImageUpload component with drag-and-drop, preview, validation (JPEG/PNG/WebP/GIF, max 10MB)
- Integrated upload into CreateQuestionDialog and EditQuestionDialog
- Updated QuestionList to display 40x40px thumbnails with placeholder for non-image questions
- Updated ListQuizQuestionsUseCase to include mediaUrl in DTOs
- Created comprehensive docs at `docs/06-media-uploads.md` with Supabase Storage setup guide
- **Next**: Set up Supabase Storage bucket (quiz-media) and test manually via Playwright MCP

## 2025-12-20 (Continued - E2E Test Suite Verification)
- Verified E2E test stability after Session 3/4 auth conflict fixes
- Ran full suite 3 times: 24/24 passing all runs (21.2-21.9s)
- No flaky failures detected
- Serial mode + shared context pattern in admin-quiz-crud.spec.ts resolved all auth conflicts
- Created `docs/progress/actions/05-testing-improvements.md` for R6 deferred items
- **Next**: Complete remaining R4 items (media uploads, audit log)

## 2025-12-20 (Continued - Question CRUD)
- **Completed Question CRUD Implementation!** All CRUD dialogs working perfectly:
  - Fixed critical `factories.ts` corruption from previous session (ServiceContainer type had code fragments, missing closing parens)
  - Enhanced Answer entity with `id` field to support answer acknowledgment broadcasts
  - Fixed QuizSessionAggregate to return Answer from submitAnswer (was void)
  - Implemented CreateQuestionDialog with type-specific fields (MC: 2-6 options, T/F: correct answer, Text: none)
  - Implemented EditQuestionDialog with pre-filled data and type change warning (warns about data loss when switching types)
  - Implemented DeleteConfirmDialog with question preview
  - **Manual validation via Playwright MCP**: Created MC question → edited to T/F (warning appeared) → deleted (confirmation worked) → verified empty state
  - Created comprehensive E2E test suite (e2e/admin-question-crud.spec.ts, 9 scenarios)
  - **E2E tests blocked by authentication** - admin routes require Supabase auth, need global Playwright setup with test user credentials
- All Question CRUD operations verified working in UI, ready for drag-to-reorder enhancement or move to R5 media upload

## 2025-12-20 (Continued - Quiz CRUD)
- **Completed Quiz CRUD Implementation!** All R4 foundation goals achieved:
  - Implemented complete backend stack: DTOs (CreateQuizDTO, UpdateQuizDTO, QuizListItemDTO), use cases (create/update/delete/list), extended repositories with admin methods
  - Added `findEntityById()` to `IQuizRepository` to distinguish Quiz entity (admin ops) from QuizSessionAggregate (session ops) - fixed update/delete use cases
  - Created API routes: POST/GET `/api/admin/quizzes`, GET/PATCH/DELETE `/api/admin/quizzes/[quizId]`
  - Built UI components: QuizList (table with React Query), CreateQuizDialog, EditQuizDialog (pre-filled form), DeleteQuizDialog (confirmation)
  - Added shadcn components: table, badge, dialog, checkbox
  - Business rules enforced: only update Pending quizzes, cannot delete Active quizzes
  - **E2E tests (4/4 passing)**: create quiz, update quiz, delete quiz, verify Active quiz restrictions
  - Manual testing via Playwright MCP: created quiz → edited (title + timer) → deleted → verified in Supabase DB
- **Testing methodology refined**: Use Playwright MCP for interactive exploration first, then write simplified E2E tests based on observed behavior
- **Total E2E coverage**: 10/10 tests passing (6 admin auth + 4 quiz CRUD)
- Ready for next session: Question CRUD implementation

## 2025-12-20
- **Completed Admin Auth Foundation!** All R4 initial goals achieved:
  - Initialized database with Prisma 7 migrations and seed data
  - Fixed join form maxLength bug (8→16 chars) that was truncating join codes
  - Set up Playwright E2E tests with 5 passing scenarios (player join, host dashboard)
  - Implemented realtime channel auth and player-specific event broadcasting
  - **Polished host dashboard UI** with two new components:
    - `timer-countdown.tsx`: Circular progress ring with color-coded warning states (green >30%, yellow ≤30%, red ≤10%)
    - `question-timeline.tsx`: Progress bar + visual status indicators (active/completed/upcoming questions)
  - Tested all UI polish changes via Playwright MCP - verified timer countdown, question progress transitions
- Updated copilot instructions with MCP testing workflow: test interactively first, then write simplified tests
- All E2E tests passing (5/5), database operational, ready for next release
- **Timer UX enhancements (post-session):**
  - Created `useCountdownTimer` hook with smooth client-side countdown (1s interval)
  - Calculates accurate time from server's `startTime` + `duration`, syncs on refetches
  - Enhanced `TimerCountdown` with `showElapsed` prop for elapsed/remaining time modes
  - Added size variants (small/medium/large) and rich timer info display
  - Supports countdown (quiz timer) and elapsed (session duration) use cases

## 2025-12-08
- Shipped Supabase Realtime integration: `AppProviders` now instantiates `createSupabaseRealtimeClient` (with a noop fallback) and API routes broadcast `quiz:${quizId}` `state:update` payloads via the new server helper after every host action.
- Added host control API endpoints (`advance`, `timer/reset`, `leaderboard/snapshot`) plus expanded `POST /api/quiz/start` to return/broadcast the updated `QuizDTO`.
- `useHostQuizState` now exposes TanStack Query mutations for start/advance/reset/snapshot, runs optimistic cache updates, and emits realtime payloads so other tabs stay in sync; `HostQuizDashboard` surfaces the new control panel with loading/error states.
- Launched the player join funnel (`/join`): new `PlayerJoinForm` calls `POST /api/session/join`, persists the returned IDs to `localStorage`, and exposes a resume CTA for recently connected players.
- Added the first player experience at `/play/[quizId]/[playerId]` powered by `usePlayerSession`, a Supabase-backed realtime hook that streams `QuizDTO` updates, polls `GET /api/quiz/[quizId]/player/[playerId]`, and confirms answers via `POST /api/player/answer` before clearing the input.
- Next steps: document channel auth + player consumption path once we add the real transport to player hooks, then backfill Playwright smoke tests around the host control surface.

## 2025-12-05
- Adopted Prisma v7 driver adapters end-to-end: generator now targets `prisma-client` with output in `src/infrastructure/database/prisma/generated/client`, and the runtime client instantiates `PrismaPg` with `DATABASE_URL`.
- Introduced `generated-client.ts` as the canonical barrel so repositories/seed helpers import Prisma types from one path after regeneration.
- Added `@prisma/adapter-pg` dependency, regenerated the client, and updated ESLint ignores to skip generated sources (Next.js build now passes without formatter noise).

## 2025-11-30
- MCP servers trimmed to Supabase HTTP endpoint + Playwright MCP; Playwright runs via `nvm use` so telemetry works.
- Ready to start Release R1 (Domain & Data) tasks:
  1. Define DTO catalog under `src/application/dtos/**` and align hooks/services to those types.
  2. Audit domain repository interfaces (`src/domain/repositories/**`) to ensure they cover upcoming host/player flows.
  3. Draft Prisma schema + migrations inside `src/infrastructure/database/prisma/` that map cleanly to entities/DTOs.
  4. Fill any missing use cases/services so application layer exposes the workflows host/player UIs will need.
- Repository audit (2025-11-30):
  - `IQuizRepository` (`src/domain/repositories/quiz-repository.ts`) only supports `findById/save/delete` on `QuizSessionAggregate`. Host/player flows need lookup by share code, filtering by status (pending/active), and partial persistence hooks (e.g., updating leaderboard or current question) so Prisma can avoid rewriting the entire aggregate.
  - `IPlayerRepository` (`src/domain/repositories/player-repository.ts`) lacks quiz scoping. We need `listByQuizId`, `findByQuizIdAndName`, and status/score update helpers to hydrate `PlayerDTO` (which includes `status`, `score`, `rank`). Players currently have no persisted link back to a quiz session.
  - `IQuestionRepository` (`src/domain/repositories/question-repository.ts`) is unused and only exposes CRUD by id. R1 requires batch fetch by quiz, publishing toggles, and ordering helpers to map into the `QuizDTO.questions` array.
- Prisma parity (2025-11-30): `PrismaQuizRepository` now handles join-code lookups and partial updates while normalizing timer metrics (seconds in domain ↔ milliseconds in Postgres); companion tests live in `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`.
- Prisma schema draft (2025-11-30): `src/infrastructure/database/prisma/schema.prisma` defines enums for quiz/player/question states plus `Quiz`, `Question`, `Player`, and `Answer` models aligned with the DTO catalog. Relationships include quiz-scoped players/answers, ordered questions with publication flags, and scoreboard-friendly score/rank fields on players.
- Action notes now live under `docs/progress/actions/**` to mirror each Release R1 checklist item without bloating this log.
- Use case/service fill (2025-11-30): Added player + quiz mappers and DTO-focused use cases (`get-quiz-state`, `get-player-session`, `list-quiz-players`, `advance-question`) plus service facades (`QuizService`, `PlayerService`). `IPlayerRepository` now exposes `findByQuizId` so Prisma can hydrate lobby views. Tests run: `yarn test get-player-session-use-case`, `yarn test list-quiz-players-use-case`.
- Current status: DTO mappers + quiz state/advance use cases are in place; next step is wiring Prisma-backed repositories so these workflows hit Supabase data.
- Prisma wiring (2025-11-30): Created `prisma.config.ts` pointing at `src/infrastructure/database/prisma/schema.prisma`, regenerated the Prisma client, and implemented `PrismaPlayerRepository` with DTO-friendly mapping plus safe deletes. Added `src/tests/infrastructure/repositories/prisma-player-repository.test.ts` to cover find/list/save/delete paths using hoisted mocks (`vi.hoisted`) so Vitest can run without top-level await.
- Application/API progress (2025-11-30 later session):
  - Extended `Quiz` + `QuizSessionAggregate` to persist/share `joinCode`, plus added a new `JoinSessionUseCase` with Vitest coverage for joining by code while hydrating players.
  - Introduced `src/application/services/factories.ts` so API routes can lazy-load Prisma repositories + service facades without duplicating wiring.
  - Stubbed the first Next.js API routes: `POST /api/session/join`, `POST /api/player/add`, `POST /api/quiz/start`, and `POST /api/player/answer`—each validates zod payloads, invokes the relevant service/use case, and maps domain errors to HTTP codes.
  - Added seed helpers + shared Prisma workflow docs earlier in the day; latest endpoints now reuse `PlayerService`, `QuizService`, and `AnswerService` directly via the factory to stay aligned with DTO contracts.
- Host data APIs (2025-11-30 evening): Added `GET /api/quiz/[quizId]/state` and `GET /api/quiz/[quizId]/players` so the upcoming host dashboard can hydrate quiz state + lobby rosters via `QuizService`/`PlayerService`; route handlers ship with Vitest coverage that mocks Prisma at the factory layer.
- 2025-12-04: Installed TanStack Query (+ devtools), introduced `AppProviders` to wrap the Next.js layout, and shipped the first host dashboard route (`/quiz/[quizId]`) that hydrates `QuizDTO` via `getServices` then hands control to the client-side `useHostQuizState` hook for periodic refetches.

## 2025-11-30
- MCP servers trimmed to Supabase HTTP endpoint + Playwright MCP; Playwright runs via `nvm use` so telemetry works.
- Ready to start Release R1 (Domain & Data) tasks:
  1. Define DTO catalog under `src/application/dtos/**` and align hooks/services to those types.
  2. Audit domain repository interfaces (`src/domain/repositories/**`) to ensure they cover upcoming host/player flows.
  3. Draft Prisma schema + migrations inside `src/infrastructure/database/prisma/` that map cleanly to entities/DTOs.
  4. Fill any missing use cases/services so application layer exposes the workflows host/player UIs will need.
- Repository audit (2025-11-30):
  - `IQuizRepository` (`src/domain/repositories/quiz-repository.ts`) only supports `findById/save/delete` on `QuizSessionAggregate`. Host/player flows need lookup by share code, filtering by status (pending/active), and partial persistence hooks (e.g., updating leaderboard or current question) so Prisma can avoid rewriting the entire aggregate.
  - `IPlayerRepository` (`src/domain/repositories/player-repository.ts`) lacks quiz scoping. We need `listByQuizId`, `findByQuizIdAndName`, and status/score update helpers to hydrate `PlayerDTO` (which includes `status`, `score`, `rank`). Players currently have no persisted link back to a quiz session.
  - `IQuestionRepository` (`src/domain/repositories/question-repository.ts`) is unused and only exposes CRUD by id. R1 requires batch fetch by quiz, publishing toggles, and ordering helpers to map into the `QuizDTO.questions` array.
- Prisma parity (2025-11-30): `PrismaQuizRepository` now handles join-code lookups and partial updates while normalizing timer metrics (seconds in domain ↔ milliseconds in Postgres); companion tests live in `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`.
- Prisma schema draft (2025-11-30): `src/infrastructure/database/prisma/schema.prisma` defines enums for quiz/player/question states plus `Quiz`, `Question`, `Player`, and `Answer` models aligned with the DTO catalog. Relationships include quiz-scoped players/answers, ordered questions with publication flags, and scoreboard-friendly score/rank fields on players.
- Action notes now live under `docs/progress/actions/**` to mirror each Release R1 checklist item without bloating this log.
- Use case/service fill (2025-11-30): Added player + quiz mappers and DTO-focused use cases (`get-quiz-state`, `get-player-session`, `list-quiz-players`, `advance-question`) plus service facades (`QuizService`, `PlayerService`). `IPlayerRepository` now exposes `findByQuizId` so Prisma can hydrate lobby views. Tests run: `yarn test get-player-session-use-case`, `yarn test list-quiz-players-use-case`.
- Current status: DTO mappers + quiz state/advance use cases are in place; next step is wiring Prisma-backed repositories so these workflows hit Supabase data.
- Prisma wiring (2025-11-30): Created `prisma.config.ts` pointing at `src/infrastructure/database/prisma/schema.prisma`, regenerated the Prisma client, and implemented `PrismaPlayerRepository` with DTO-friendly mapping plus safe deletes. Added `src/tests/infrastructure/repositories/prisma-player-repository.test.ts` to cover find/list/save/delete paths using hoisted mocks (`vi.hoisted`) so Vitest can run without top-level await.
- Application/API progress (2025-11-30 later session):
  - Extended `Quiz` + `QuizSessionAggregate` to persist/share `joinCode`, plus added a new `JoinSessionUseCase` with Vitest coverage for joining by code while hydrating players.
  - Introduced `src/application/services/factories.ts` so API routes can lazy-load Prisma repositories + service facades without duplicating wiring.
  - Stubbed the first Next.js API routes: `POST /api/session/join`, `POST /api/player/add`, `POST /api/quiz/start`, and `POST /api/player/answer`—each validates zod payloads, invokes the relevant service/use case, and maps domain errors to HTTP codes.
  - Added seed helpers + shared Prisma workflow docs earlier in the day; latest endpoints now reuse `PlayerService`, `QuizService`, and `AnswerService` directly via the factory to stay aligned with DTO contracts.
- Integration coverage (2025-11-30 evening): Added `src/tests/integration/add-player.integration.test.ts` to exercise `AddPlayerUseCase` end-to-end against the Prisma repositories plus seed helpers; the suite lazily loads Prisma modules and skips itself when `DATABASE_URL` is not pointed at a disposable test database.
- 2025-12-04: Stubbed the realtime layer with `src/infrastructure/realtime/realtime-client.ts`, a `createNoopRealtimeClient` default, and `RealtimeClientProvider`/`useRealtimeClient`. `AppProviders` now instantiates the client once per render tree and `useHostQuizState` subscribes to `quiz:${quizId}` `state:update` events so TanStack Query caches can react as soon as transports go live.
- 2025-12-04: Stubbed the realtime layer with `src/infrastructure/realtime/realtime-client.ts`, a `createNoopRealtimeClient` default, and `RealtimeClientProvider`/`useRealtimeClient`. `AppProviders` now instantiates the client once per render tree and `useHostQuizState` subscribes to `quiz:${quizId}` `state:update` events so TanStack Query caches can react as soon as transports go live.
- 2025-12-04: Fixed Vercel build failure by updating `/api/quiz/[quizId]/state` and `/api/quiz/[quizId]/players` route handlers to destructure `params` directly (typed via their Zod schemas) so Next.js accepts the GET signatures during lint/type checks.