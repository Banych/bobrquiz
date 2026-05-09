# Progress Tracking Index

This document indexes all releases, completed work, and session notes. Use this to find what's been built and what's planned next.

## Release Status

| Release | Title              | Goal                                                   | Status     | Completion Date |
| ------- | ------------------ | ------------------------------------------------------ | ---------- | --------------- |
| **R0**  | Foundation         | Stable scaffolding, tooling, CI setup                  | ✅ Complete | ~2025-11-30     |
| **R1**  | Domain & Data      | DDD structure, Prisma, repositories, DTOs              | ✅ Complete | ~2025-12-05     |
| **R2**  | Host MVP           | Dashboard, question timeline, timer, optimistic stats  | ✅ Complete | ~2025-12-15     |
| **R3**  | Player MVP         | Join/answer flows, WebSocket sync, session persistence | ✅ Complete | ~2025-12-19     |
| **R4**  | Content Admin      | CRUD (quiz/question), media uploads, auth gate         | ✅ Complete | 2025-12-21      |
| **R5**  | Realtime & Scoring | Speed-based scoring, round transitions, reconnection   | ✅ Complete | 2026-02-01      |
| **R6**  | Polish & Launch    | Accessibility, responsive tweaks, audit log, analytics | � Active   | ~2026-03-31     |

---

## Session Notes (Chronological)

**Latest First** – Find detailed work notes by date:

### 2026-05-09: Maintenance — Security Upgrades & Tooling ✅
- **Focus**: Address 101 Dependabot security alerts, ESLint 10 migration, CI fixes, tooling improvements
- **Deliverables**: 101→2 vulnerabilities fixed (Next 16.2.6, Prisma 7.8, ESLint 10, Vitest 4, Playwright 1.59), `.github/dependabot.yml` for automated updates, CI env fallbacks for Dependabot PRs, GitHub MCP package corrected, LF line ending enforcement, pg pool cap (EMAXCONN fix), Supavisor URL documented
- **Status**: Complete — no regressions, lint clean, build passing
- **File**: [sessions/2026-05-09-maintenance-security-tooling.md](sessions/2026-05-09-maintenance-security-tooling.md)

### 2026-05-05: Player Kick & Auto-Remove ✅
- **Focus**: Allow host to manually kick players; auto-remove players disconnected >5 minutes
- **Deliverables**: `PlayerStatus.Removed` domain status + `removeFromGame()`, `RemovePlayerUseCase`, `DELETE /api/quiz/[quizId]/player/[playerId]`, `broadcastPlayerKicked()`, player redirect on kick with banner message, host kick button, auto-remove polling loop with `Set` dedup guard, rejoin support for removed players
- **Status**: Complete — 413 tests passing, build passing, end-to-end manual verification
- **File**: [sessions/2026-05-05-player-kick-auto-remove.md](sessions/2026-05-05-player-kick-auto-remove.md)

### 2026-05-02: R6 Phase 3.5 — Game Lifecycle & UX Fixes ✅
- **Focus**: Five post-Phase-3 bugs: quiz reset, host contextual buttons, player MC/TF UI, admin nav shortcuts, presence race condition
- **Deliverables**: `Quiz.reset()` + `ResetQuizUseCase`, finish/restart mutations in `useHostQuizState`, player answer type switching, "Open Dashboard"/"Open Live View" admin links, heartbeat 30s→10s + `lastSeenAt` on answer submission
- **Status**: Complete — 403 tests passing, build passing
- **File**: [sessions/2026-05-02-r6-phase3.5-lifecycle-ux-fixes.md](sessions/2026-05-02-r6-phase3.5-lifecycle-ux-fixes.md)

### 2026-03-07: R6 Phase 2 — UI/UX Improvements ✅
- **Focus**: Accessibility (a11y) fixes and responsive design for admin table
- **Deliverables**: `aria-label` on icon-only buttons, `aria-live`/`role="status"` on dynamic messages, `role="timer"` on countdown, responsive admin quiz table (hidden columns at 375px), `role="alert"` on join form error (bonus), updated metadata description, admin email hidden on mobile
- **Files changed**: `quiz-list.tsx`, `question-view.tsx`, `player-session-screen.tsx`, `timer-countdown.tsx`, `layout.tsx` (root + admin), `player-join-form.tsx`
- **Status**: Complete — 369 tests pass, lint clean, Playwright MCP spot-check verified all changes
- **Known issue (deferred)**: Pre-existing horizontal scrollbar on `/join` page
- **File**: [plans/2026-03-07-r6-phase2-ui-ux.md](plans/2026-03-07-r6-phase2-ui-ux.md)

### 2026-03-07: Quiz Lobby + Live Game Screen ✅
- **Focus**: Projector-friendly live game page at `/quiz/[id]/live`
- **Deliverables**: `LiveGameScreen` orchestrator, `LobbyView`, `QuestionView`, `RoundResultsView`, `FinalResultsView`, `AdvanceQuestionUseCase` bug fix (quiz transitions to `Completed` on last advance), quiz list "Open Lobby" / "Open Live View" navigation
- **Status**: Complete — 368 tests pass, yarn build succeeds, Playwright E2E verified
- **File**: [plans/2026-02-08-quiz-lobby-live-game-screen.md](plans/2026-02-08-quiz-lobby-live-game-screen.md)

### 2026-02-08: Fix Supabase Realtime Closed Errors ✅
- **Focus**: Fix CLOSED/CHANNEL_ERROR console spam during normal subscription lifecycle
- **Status**: Complete
- **File**: [sessions/2026-02-08-fix-supabase-realtime-closed-errors.md](sessions/2026-02-08-fix-supabase-realtime-closed-errors.md)

### 2026-02-07: R6 Phase 1.5.1 — Bug Fixes ✅
- **Focus**: 5 bugs from E2E audit — join code generation (P0), subscription error spam (P1), timer display (P2), `/host` 404 (P2), HTML nesting warnings (P3)
- **Status**: Complete — 352 tests passing, 6 new tests added
- **File**: [sessions/2026-02-07-r6-phase1.5.1-bug-fixes.md](sessions/2026-02-07-r6-phase1.5.1-bug-fixes.md)

### 2026-02-07: R6 Phase 1.5 — E2E Audit ✅
- **Focus**: Full manual Playwright walkthrough of complete quiz lifecycle, identified 6 bugs
- **Status**: Complete
- **File**: [sessions/2026-02-07-r6-phase1.5-e2e-audit.md](sessions/2026-02-07-r6-phase1.5-e2e-audit.md)

### 2026-02-07: R6 Phase 1 - Landing & Navigation Polish ✅
- **Focus**: Replace placeholder home page, add error/loading states, fix admin dashboard
- **Deliverables**:
  - Global `not-found.tsx` (404 page with Card/Button UI)
  - Global `error.tsx` (error boundary with reset/home CTAs)
  - Loading skeletons for root, admin, host, player route groups
  - Redesigned home page with hero, 3 CTAs (Join/Host/Admin), feature cards, footer
  - Updated Admin Dashboard Quick Start text
- **Status**: Complete - all Phase 1 tasks done, build verified

### 2026-02-01: R5 Phase 6 - Production Testing & Documentation ✅
- **Focus**: Production build validation, load testing on prod, final documentation
- **Deliverables**: Production benchmarks, architecture docs update, known limitations, R5 release notes
- **Status**: Complete - Production build validated, performance benchmarks documented
- **File**: [sessions/2026-02-01-r5-phase6-production-testing.md](sessions/2026-02-01-r5-phase6-production-testing.md)

### 2026-01-27 to 2026-01-31: R5 Phase 4 - Connection Health ✅
- **Focus**: Presence tracking, disconnect detection, player reconnection
- **Deliverables**: PresenceMonitor, connection status badges, useReconnection hook, auto-recovery
- **Status**: Complete (Phases 4.1, 4.2, 4.3)
- **File**: [sessions/2026-01-27-to-2026-01-31-r5-phase4-connection-health.md](sessions/2026-01-27-to-2026-01-31-r5-phase4-connection-health.md)

### 2026-01-31: R5 Phase 5 - Load Testing & Performance ✅
- **Focus**: k6 load testing, performance validation, dev server benchmarks
- **Deliverables**: 3 load test scenarios (joins, answers, heartbeats), infrastructure, findings
- **Status**: Complete - 0% error rate on all tests, dev server limitations documented
- **File**: [sessions/2026-01-31-r5-phase5-load-testing.md](sessions/2026-01-31-r5-phase5-load-testing.md)

### 2026-01-24: R5 Phase 3 - Round Transitions ✅
- **Focus**: Answer locking, round summaries, leaderboard snapshots
- **Deliverables**: LockQuestionUseCase, RoundSummaryDTO, question:locked event, E2E tests
- **Status**: Complete (All 11 steps, 214 tests passing)
- **File**: [sessions/2026-01-24-r5-phase3-round-transitions.md](sessions/2026-01-24-r5-phase3-round-transitions.md)

### 2026-01-11: R5 Phase 2 - UI Enhancements ✅
- **Focus**: Player scoring UX, speed indicators, leaderboard styling
- **Deliverables**: ScoringInfoBadge, scoring-client.ts formulas, host dashboard settings
- **Status**: Complete
- **File**: [sessions/2026-01-11-r5-phase2-ui-enhancements.md](sessions/2026-01-11-r5-phase2-ui-enhancements.md)

### 2025-12-20/21: R4 Content Admin - COMPLETE ✅
- **Focus**: Admin CRUD, media uploads, authentication
- **Deliverables**: Quiz/Question/Media full lifecycle, auth middleware, E2E tests (9/9 passing)
- **Deferred**: Audit log (R6)
- **Files**:
  - [sessions/2025-12-20-admin-question-crud-rewrite.md](sessions/2025-12-20-admin-question-crud-rewrite.md)
  - [sessions/2025-12-20-complete-r4-content-admin.md](sessions/2025-12-20-complete-r4-content-admin.md)
  - [sessions/2025-12-20-r4-auth-foundation.md](sessions/2025-12-20-r4-auth-foundation.md)
  - [sessions/2025-12-20-fix-e2e-auth-conflicts.md](sessions/2025-12-20-fix-e2e-auth-conflicts.md)

### 2025-12-19: Player MVP - COMPLETE ✅
- **Focus**: Player join/answer screens, WebSocket sync, session hydration
- **Deliverables**: Player join form, answer pad, realtime cache sync, session persistence
- **Status**: All player flows working end-to-end
- **File**: [sessions/2025-12-19-complete-player-mvp.md](sessions/2025-12-19-complete-player-mvp.md)

### 2025-12-08: Player MVP Kickoff
- **Focus**: Realtime adapter (Supabase), player session hook, API routes
- **Deliverables**: `usePlayerSession` hook, realtime broadcasting, player join/play screens
- **File**: [sessions/2025-12-08-player-mvp-kickoff.md](sessions/2025-12-08-player-mvp-kickoff.md)

### 2025-12-05: Prisma v7 Adapter Upgrade
- **Focus**: Migrate to `@prisma/adapter-pg` for Vercel compatibility
- **Deliverables**: Adapter setup, client generation, schema validation
- **File**: [sessions/2025-12-05-prisma-adapter-upgrade.md](sessions/2025-12-05-prisma-adapter-upgrade.md)

### 2025-11-30: MVP Kickoff & Host Session Targets
- **Focus**: Host MVP foundation, session management, schema refinement
- **Deliverables**: Quiz session aggregate, timer/scoring domain logic
- **Files**:
  - [sessions/2025-11-30-host-mvp-session-targets.md](sessions/2025-11-30-host-mvp-session-targets.md)
  - [sessions/2025-11-30-session-targets.md](sessions/2025-11-30-session-targets.md)

---

## Release Checklists

### R5: Realtime & Scoring (Complete ✅)

**Goals**:
- ✅ Phase 1: Speed-based scoring algorithm (exponential/linear/fixed) with configurable decay
- ✅ Phase 2: Player scoring UX (live preview, speed indicators, scoring info badge)
- ✅ Phase 3: Round transitions, answer locking, result summaries (2026-01-24)
- ✅ Phase 4: Connection health & reconnection flows (2026-01-27 to 2026-01-31)
- ✅ Phase 5: Load testing & performance validation (2026-01-31)
- ✅ Phase 6: Final integration & documentation (2026-02-01)

**R5 Release Summary**:
- **Speed-based scoring**: Exponential, linear, and fixed scoring strategies
- **Round transitions**: Answer locking, round summaries, leaderboard snapshots
- **Connection health**: Presence tracking, disconnect detection, auto-reconnection
- **Load testing**: k6 test suite with 3 scenarios, 0% error rate validated
- **Production benchmarks**: Answer P95=1.63s, Join P95=6.29s (optimization path documented)
- **Documentation**: Architecture patterns, performance benchmarks, known limitations

**Known Issues** (documented for R6):
- E2E selector strict mode violations (test quality, not functional bugs)
- P95 latencies exceed targets (acceptable for <100 players, optimization path documented)

**Action Files**:
- [actions/07-r5-realtime-scoring-implementation.md](actions/07-r5-realtime-scoring-implementation.md) – Detailed implementation plan

### R4: Content Admin (Complete ✅)

**Checklist** (all done):
- ✅ Auth gate (Supabase + middleware)
- ✅ Quiz CRUD (create, read, update, delete, list, reorder)
- ✅ Question CRUD (all question types, media support)
- ✅ Media uploads (client-side resize, Supabase Storage)
- ✅ DTO validation (zod throughout)
- ⏭️ Audit log (deferred to R6)

**Reference**:
- [actions/06-r4-wrap-up.md](actions/06-r4-wrap-up.md) – R4 retrospective

### R3: Player MVP (Complete ✅)

- ✅ Join session with code
- ✅ Answer submission (multiple choice, true/false, text)
- ✅ Realtime timer sync
- ✅ Session persistence
- ✅ Player status (connected/disconnected)

### R2: Host MVP (Complete ✅)

- ✅ Dashboard with quiz selection
- ✅ Question timeline view
- ✅ Timer component with manual control
- ✅ Live stats cards (players, correct answers)
- ✅ Start/end quiz flow

### R1: Domain & Data (Complete ✅)

- ✅ DDD-lite structure (domain, application, infrastructure, presentation)
- ✅ Entity definitions (Quiz, Question, Player, Answer)
- ✅ DTO catalog (all major shapes)
- ✅ Prisma schema + migrations
- ✅ Repository implementations

### R0: Foundation (Complete ✅)

- ✅ Next.js 15 + TypeScript setup
- ✅ Tailwind 4 + shadcn UI
- ✅ TanStack Query + realtime plumbing
- ✅ ESLint, Prettier, Vitest
- ✅ Prisma v7 + Supabase project

---

## Execution Log

**Quick reference of recent changes and debugging sessions.**

See [dev-notes.md](dev-notes.md) for the full execution log with timestamps.

### 2026-05-09: Maintenance — Security Upgrades & Tooling
- Security: 101→2 vulnerabilities (Next, Prisma, ESLint 10, Vitest 4, Playwright; yarn resolutions for transitive CVEs)
- ESLint 10 flat config migration — removed FlatCompat bridge, disabled 2 false-positive rules for Next.js async patterns
- `.github/dependabot.yml` added — weekly grouped updates for npm and GitHub Actions
- CI: build job now uses env fallbacks so Dependabot PRs don't fail on missing secrets
- Infrastructure: pg pool capped at `max: 2`; Supavisor port 6543 URL documented in `.env.example`
- Tooling: GitHub MCP package corrected, `.gitattributes` LF enforcement, `.mcp.json` formatting
- 10 routine Dependabot PRs merged (zod, tailwind, prettier, dotenv, tsx, tanstack, actions)
- Session: [sessions/2026-05-09-maintenance-security-tooling.md](sessions/2026-05-09-maintenance-security-tooling.md)

### 2026-05-05: Player Kick & Auto-Remove ✅
- `PlayerStatus.Removed` + `Player.removeFromGame(reason)` domain method (soft delete, data preserved)
- `RemovePlayerUseCase` — validates ownership, calls domain, saves; `AddPlayerUseCase` excludes `Removed` from name-conflict check (rejoin support)
- `DELETE /api/quiz/[quizId]/player/[playerId]` with optional `reason` body
- `broadcastPlayerKicked()` on private `player:{quizId}:{playerId}` channel
- Player UI: `player:kicked` → redirect to `/join?kicked=true` with amber banner
- Host UI: Kick button per row + auto-remove loop (5-min disconnected threshold, `Set` dedup guard)
- `GetQuizStateUseCase` filters `Removed` players from `QuizDTO` (hotfix post-merge)
- 413 tests passing, manual kick + rejoin verified
- Session: [sessions/2026-05-05-player-kick-auto-remove.md](sessions/2026-05-05-player-kick-auto-remove.md)

### 2026-05-02: R6 Phase 3.5 — Game Lifecycle & UX Fixes ✅
- **Step 1**: Quiz reset — `Quiz.reset()`, `ResetQuizUseCase`, `POST /api/admin/quizzes/[quizId]/reset` (6 new tests)
- **Step 2**: Host dashboard contextual buttons — finish/restart mutations, `POST /api/quiz/[quizId]/finish`, status-aware button set
- **Step 3**: Player answer UI — MC/TF option buttons, text input for open questions
- **Step 4**: Admin dashboard/live view buttons — "Open Dashboard" (all statuses) + "Open Live View" (Active) on detail page and quiz list
- **Step 5**: Presence fix — heartbeat interval 30s→10s (race with 30s connected threshold), answer submission refreshes `lastSeenAt`
- 403 tests passing, `yarn build` succeeds
- Session: [sessions/2026-05-02-r6-phase3.5-lifecycle-ux-fixes.md](sessions/2026-05-02-r6-phase3.5-lifecycle-ux-fixes.md)
- Plan: [plans/2026-03-14-r6-phase3.5-lifecycle-ux-fixes.md](plans/2026-03-14-r6-phase3.5-lifecycle-ux-fixes.md)

### Previous (2026-03-08):
- R6 Phase 3 Missing Features complete: `/host` quiz selection, QR codes in lobby, `/admin/questions`, `/admin/media`, `/admin/audit`
- Audit log: `AuditLog` entity + `IAuditLogRepository`, Prisma migration, fire-and-forget emissions in CreateQuiz/StartQuiz/AdvanceQuestion/LockQuestion use cases
- 388 tests passing (+14 new), yarn build succeeds, lint clean, Playwright MCP spot-check passed
- Plan: [plans/2026-03-08-r6-phase3-missing-features.md](plans/2026-03-08-r6-phase3-missing-features.md)

### Previous (2026-03-07):
- R6 Phase 2 UI/UX complete: a11y fixes (aria-label, aria-live, role="timer", role="alert"), responsive admin table, metadata description
- 7 files modified, 369 tests passing, lint clean, Playwright MCP spot-check passed
- Known deferred: horizontal scrollbar on `/join` (pre-existing)

### Previous (2026-03-07):
- Quiz Lobby + Live Game Screen complete: `/quiz/[id]/live` with lobby, question, round results, and final results views
- `AdvanceQuestionUseCase` bug fixed: quiz now transitions to `Completed` status on last question advance
- 368 tests passing, yarn build verified

### Previous (2025-12-21):
- R4 Content Admin 100% complete; all CRUD operations tested
- Media upload feature verified end-to-end (manual + E2E tests)
- Auth middleware protecting admin routes; 9/9 question CRUD tests passing

### Previous (2025-12-19):
- Player MVP complete; join/answer/timer flows all working
- Supabase Realtime integration stable; <300ms latency achieved
- Session persistence verified across page reloads

---

## Outstanding Items

### R5 (Completed ✅)
All R5 phases complete as of 2026-02-01. See [plan.md](../plan.md) for performance benchmarks.

### R6 (Planned) – Expanded Scope

**Phase 1: Landing & Navigation Polish**
- [x] Replace boilerplate home page with proper landing (hero, CTAs, responsive)
- [x] Add global `not-found.tsx` and `error.tsx` pages
- [x] Add `loading.tsx` skeletons for route transitions
- [x] Update Admin Dashboard "Coming Soon" sections

**Phase 2: UI/UX Improvements** ✅
- [x] Accessibility fixes: `aria-label` on buttons, `aria-live` on status messages, `role="timer"` on countdown, `role="alert"` on errors
- [x] Responsive admin quiz table (375px — hide Questions/Players/Time columns)
- [x] Admin header email hidden on mobile, metadata description updated
- [x] Playwright MCP spot-check verified all changes

**Phase 3: Missing Features** ✅
- [x] Standalone Questions management page (`/admin/questions`)
- [x] Media library page (`/admin/media`)
- [x] Audit log feature + API (deferred from R4)
- [x] Host quiz selection page (`/host` landing)
- [x] QR code generation for join codes

**Phase 3.5: Game Lifecycle & UX Fixes** ✅
- [x] Quiz reset: allow completed quiz → Pending for replay (`ResetQuizUseCase`)
- [x] Host dashboard: replace "Resume Quiz" with contextual buttons (Finish / Restart) per status
- [x] Player answer UI: render option buttons for MC/TF questions, text input for open questions
- [x] Admin quiz page: add "Open Dashboard" / "Open Live View" buttons
- [x] Presence fix: heartbeat interval reduced (30s→10s), answer submission refreshes `lastSeenAt`
- **Plan:** [plans/2026-03-14-r6-phase3.5-lifecycle-ux-fixes.md](plans/2026-03-14-r6-phase3.5-lifecycle-ux-fixes.md)

**Player Management (shipped 2026-05-05)** ✅
- [x] Host kick button — removes any player at any time (lobby or active game)
- [x] Auto-remove disconnected players after 5-minute threshold
- [x] Kicked player receives realtime redirect + "removed from game" banner
- [x] Removed players can rejoin using the same join code
- **Plan:** [plans/2026-05-05-player-kick-and-auto-remove.md](plans/2026-05-05-player-kick-and-auto-remove.md)

**Phase 4: Analytics & Observability**
- [ ] PostHog analytics instrumentation
- [ ] Structured logging with request IDs
- [ ] Sentry error tracking integration

**Phase 5: Production Hardening**
- [ ] Supabase Connection Pooler configuration
- [ ] Redis caching for hot paths
- [ ] Security audit (RLS, rate limiting, CORS)
- [ ] Deployment documentation + runbooks

**Phase 6: Marketing & Launch**
- [ ] Marketing landing page with product screenshots
- [ ] SEO optimization (meta tags, OG images, sitemap)
- [ ] Demo quiz with sample questions
- [ ] Custom domain configuration

See [plan.md](../plan.md#r6-polish--launch--detailed-scope) for full checklist.

### Post-Launch
- [ ] Multi-tenancy / org support
- [ ] Advanced permissions (custom roles)
- [ ] Quiz templates & sharing
- [ ] Analytics dashboard

---

## Technical Debt & Known Issues

See [file-ideas.md](file-ideas.md) for tracked follow-ups per file.

### Current Phase
- **Performance**: P95 latencies exceed targets; optimization path documented
- **Testing**: E2E selector strict mode violations in some tests
- **Security**: RLS not enabled on Prisma-managed tables (app uses server-side Prisma, not PostgREST)
- **Dependencies**: 2 remaining Dependabot alerts with no available fix (transitive, low risk); Dependabot now runs weekly
- **Infrastructure**: Supavisor (pgbouncer) URL on port 6543 is the correct production `DATABASE_URL` — see `.env.example`

---

## How to Update This File

1. **Completed a session?** Add entry to the chronological list above (most recent first)
2. **Finished a release?** Move checkbox to ✅ and update status/completion date
3. **New action items?** Add to [actions/](actions/) folder with numbered file (08-*, 09-*, etc.)
4. **Found a bug or idea?** Log in [file-ideas.md](file-ideas.md) with follow-up file + action
5. **Daily work notes?** Append to [dev-notes.md](dev-notes.md) with timestamp

---

## Related Documents

- [INDEX.md](../INDEX.md) – Documentation navigation hub
- [dev-notes.md](dev-notes.md) – Detailed execution log (timestamps, bug fixes)
- [file-ideas.md](file-ideas.md) – Technical debt and follow-ups per file
- [actions/](actions/) – Release checklists and action items
- [sessions/](sessions/) – Dated session notes (goals, approach, results)
