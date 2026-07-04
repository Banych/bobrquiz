# Bobr Quiz Delivery Plan

## Vision Snapshot
- **Host/Admin desktop**: Runs the quiz, controls rounds, views live stats. Mirrors the layouts from the mockups (`docs/mockups/*.png`).
- **Player mobile**: Joins with a name/code, sees timers and answer inputs only (no questions) to keep the experience fair.
- **Round insights**: End-of-round summaries with correctness, speed, and leaderboard deltas.

## Personas & Primary Journeys
- **Host**: create session → load playlist of questions → run round → review stats → optionally restart.
- **Player**: join session → answer via mobile UI → watch timers/results.
- **Admin**: curate reusable quizzes, manage media, configure timings.

## Non‑Functional Goals
- Snappy realtime updates (<300 ms round trip) for answer/timer sync.
- Fault tolerance: reconnecting players rehydrate state.
- Observability: structured logs + basic telemetry hooks before public launch.
- Continuous testing (unit + Vitest integration) wired into CI and `yarn` scripts.

## Technology Choices
- **Frontend**: Next.js App Router + React Server/Client Components, Tailwind, shared UI primitives, TanStack Query for data fetching and cache invalidation, custom hooks for presentation logic.
- **State & realtime**: TanStack Query + lightweight signal stores for UI; WebSocket (likely `ws`/Socket.IO) channel per session for timers/answers.
- **Backend/data**: Prisma ORM targeting Supabase Postgres. DTOs map to Prisma models; repositories isolate persistence.
- **Hosting**: Vercel for host/admin UI + serverless routes. Consider Supabase Realtime or Pusher if Socket.IO on Vercel is limiting; alternative is Fly.io for a thin realtime worker if needed.
- **Media**: store structured metadata in Supabase, assets in Supabase Storage or Vercel Blob (TBD when we wire uploads).
- **Tooling**: Yarn as package manager, ESLint/Prettier/Vitest, Playwright (later) for flows.

## Release Roadmap
| Release                     | Goal                             | Scope / Acceptance                                                                                                                              | Status              |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **R0 – Foundation**         | Stable scaffolding               | Upgrade lint/test config, Tailwind, TanStack Query, Yarn scripts, CI smoke test, health page.                                                   | ✅ Complete          |
| **R1 – Domain & Data**      | DDD-lite core established        | DTO catalog, Prisma schema + migrations, repositories for Quiz/Player/Question, seed data, Supabase project wiring, SDK wrappers.               | ✅ Complete          |
| **R2 – Host MVP**           | Run a scripted quiz from desktop | Host dashboard per mockups, question timeline view, timer component, TanStack hooks calling stubbed services, optimistic stats cards.           | ✅ Complete          |
| **R3 – Player MVP**         | Join + submit answers            | Join screen, answer pad, timer sync via WebSocket, player session persistence, latency budget instrumentation.                                  | ✅ Complete          |
| **R4 – Content Admin**      | Manage quizzes and media         | Auth gate, CRUD UI for quizzes/questions, uploads to Supabase storage, DTO validation, audit log (deferred to R6).                              | ✅ Complete (Dec 21) |
| **R5 – Realtime & Scoring** | Production-ready game loop       | Speed-based scoring, round transitions, reconnection flows, load testing. See `docs/progress/actions/07-r5-realtime-scoring-implementation.md`. | ✅ Complete (Feb 1)  |
| **R6 – Polish & Launch**    | Fit/finish                       | Accessibility pass, responsive tweaks, audit log, PostHog analytics, marketing landing, incident docs, Vercel prod deployment.                  | 🚧 In Progress (Phases 1–3, 5 done; 4, 6 not started) |

## Cross-Cutting Workstreams
- **Authentication & Sessions**: Supabase Auth or Vercel middleware; host/admin vs player roles defined in R1 but activated before R4.
- **Testing**: Unit coverage in every release, domain service integration tests, WebSocket contract tests post-R3.
- **Observability**: Structured logging adapters + feature flags, user journey analytics piped via Segment/PostHog (decide in R5).
- **Documentation**: Update plan + structure docs each release; ADRs for WebSocket hosting, media storage, auth provider.

## Dependencies & Open Questions
- Confirm whether Vercel Edge functions satisfy WebSocket needs; fallback is a small Node worker elsewhere.
- Decide on CDN/storage for heavy media (Supabase Storage vs Cloudinary) before R4.
- Determine branding assets for final polish; mockups currently guide spacing/layout only.

---

## Performance Benchmarks (R5)

**Test Environment**: Production build (`yarn build && yarn start`), local Supabase, Prisma v7 driver adapter

**Load Testing Tool**: k6 (Grafana) with custom scenarios

### Production Benchmarks (2026-02-01)

| Test Scenario           | Iterations | Error Rate | P50 Latency | P95 Latency | Target | Status       |
| ----------------------- | ---------- | ---------- | ----------- | ----------- | ------ | ------------ |
| Answer Submission Storm | 428        | 0.00%      | 945ms       | 1.63s       | <300ms | ⚠️ 5.4x over  |
| Concurrent Player Joins | 761        | 0.00%      | 1.84s       | 6.29s       | <500ms | ⚠️ 12.6x over |
| Presence Heartbeats     | 2,318      | 0.00%      | 173ms       | 206ms       | <100ms | ⚠️ 2x over    |

**Key Findings**:
- **Zero error rate** across all tests validates functional correctness
- **Production vs Dev**: Join latency improved 50% (12.5s → 6.29s P95)
- **Root cause of latency**: Database connection pooling + single-threaded Prisma operations
- **Bundle sizes**: All routes under target (largest: 228KB admin page, player routes: 131-144KB)

### Optimization Opportunities (R6)

1. **Connection Pooling**: Configure PgBouncer or Supabase Connection Pooler
2. **Caching Layer**: Redis for session/quiz state (reduces DB round-trips)
3. **Edge Functions**: Move hot paths (heartbeat, answer) to Supabase Edge Functions
4. **CDN**: Static assets on Vercel Edge, dynamic on origin
5. **Query Optimization**: Add database indexes for common access patterns

### Load Test Methodology

**Scenarios** (in `load-tests/k6/`):
- `concurrent-players.js`: Simulates 20 concurrent users joining quiz over 2 minutes
- `answer-submission-storm.js`: 25 players submitting 10 answers each with realistic delays
- `presence-heartbeat-load.js`: 50 players sending heartbeats every 5 seconds for 5 minutes

**Running Tests**:
```bash
# Install k6 (macOS)
brew install k6

# Run individual test
k6 run load-tests/k6/concurrent-players.js

# Run against production server
yarn build && yarn start  # In terminal 1
k6 run load-tests/k6/answer-submission-storm.js  # In terminal 2
```

---

## Known Limitations

### Development Server Limitations
- Dev server (`yarn dev`) is 50% slower than production for API routes
- Turbopack hot-reload adds latency during rapid iteration
- Always benchmark against production build (`yarn build && yarn start`)

### E2E Test Selector Issues
Some Playwright tests have strict mode violations where selectors match multiple elements:
- `getByText('Connected')` may match both status badge and summary text
- Time-based regex `/\d{2}:\d{2}/` may match multiple timestamps
- **Workaround**: Scope selectors to specific containers or add `data-testid` attributes

### Realtime Latency
- Current P95 latencies exceed targets due to single-threaded Prisma operations
- Acceptable for MVP (<100 concurrent players)
- Optimization path documented in Performance Benchmarks section

### Browser Compatibility
- Tested on Chrome, Firefox, Safari (latest versions)
- Mobile Safari may have WebSocket reconnection delays
- Progressive enhancement recommended for older browsers

---

## R6 Polish & Launch – Detailed Scope

This section expands on the R6 release with specific tasks discovered during R5 completion and codebase review.

### Phase 1: Landing & Navigation Polish ✅ (2026-02-07)

**Home Page (`src/app/page.tsx`):**
- [x] Replace boilerplate "Initial page of Quiz Game" with proper landing page
- [x] Add hero section explaining the quiz game concept
- [x] Include quick-start CTAs: "Join a Game" (→ /join), "Host a Game" (→ /host), "Admin" (→ /admin)
- [ ] Show featured quizzes or recent activity (optional) — deferred to Phase 6
- [x] Mobile-responsive design matching mockup style

**Navigation & Routing:**
- [x] Add global `not-found.tsx` page at `src/app/not-found.tsx` for 404 errors
- [x] Add global `error.tsx` page at `src/app/error.tsx` for error boundaries
- [x] Add `loading.tsx` skeletons for slow route transitions (admin, host, player sections)
- [x] Basic footer added to home page (full footer deferred to Phase 6)

**Admin Dashboard Polish:**
- [x] Questions/Media cards kept as "Coming Soon" (accurate status, Phase 3 scope)
- [x] Updated Quick Start copy to reflect completed features (quiz CRUD is available)
- [x] Wired up Start Quiz button to call `/api/quiz/start` and redirect to host dashboard

### Phase 1.5: End-to-End Flow Audit ✅ (2026-02-07)

**Goal:** Walk through the complete user journey using Playwright MCP to identify UX gaps, broken flows, and missing features.

**Quiz Creation → Start → Player Join Flow:**
- [x] Admin creates a new quiz with questions
- [x] Admin views quiz detail and verifies questions saved correctly
- [x] Admin starts quiz from quiz list (Start button)
- [x] Host dashboard loads with correct quiz state
- [x] Join code is displayed prominently for host to share (works for seeded quizzes)
- [x] Player navigates to `/join` and enters join code
- [x] Player enters name and joins successfully
- [x] Player appears in host dashboard player list
- [x] Host can advance through questions
- [x] Player can submit answers
- [x] End-of-round summaries display correctly
- [x] Quiz completion flow works (verified through 2 rounds)

**Known Gaps Investigated:**
- [x] Is join code visible/copyable on host dashboard? → **Yes, visible but no copy button (Phase 2)**
- [x] Does `/host` landing page exist or is it 404? → **404 confirmed (Phase 3 fix)**
- [x] Can host see player count updating in real-time? → **Yes, with Connected/Disconnected/Away states**
- [x] Are error states handled (e.g., invalid join code)? → **Not tested, deferred**
- [x] Is there feedback when quiz starts successfully? → **Yes, redirects to host dashboard**

**Bugs Found:**
- **P0:** Newly created quizzes don't get join codes (only seeded quizzes have codes)
- **P1:** Supabase subscription errors flooding console
- **P2:** Timer value missing on quiz detail page
- **P2:** `/host` landing page 404 (known, Phase 3 scope)

**Session file:** [`docs/progress/sessions/2026-02-07-r6-phase1.5-e2e-audit.md`](progress/sessions/2026-02-07-r6-phase1.5-e2e-audit.md)

### Phase 1.5.1: Critical Bug Fixes (Blockers from Phase 1.5) ✅ (2026-02-07)

**Goal:** Fix P0/P1 bugs discovered during the E2E audit that block core functionality.

**P0 — Join Code Generation:**
- [x] Investigate why newly created quizzes don't receive join codes
- [x] Review `startQuiz` use case and `Quiz.start()` domain method
- [x] Ensure join code is generated or assigned when quiz transitions to Active
- [x] Verify join code appears immediately in host dashboard after start
- [x] Add test coverage for join code generation flow

**P1 — Supabase Realtime Stability:**
- [x] Identify root cause of "Supabase subscription error" console spam
- [x] Review channel subscription setup in `useQuizRealtime` / presence hooks
- [x] Add error handling and retry logic for failed subscriptions
- [ ] Consider connection state indicator for users (connected/reconnecting) — deferred, not needed once spam was fixed
- [ ] Reduce subscription frequency or batch updates if needed — deferred, no evidence of need

**P2 — Timer Display Bug:**
- [x] Fix missing timer value on admin quiz detail page
- [x] Ensure `timePerQuestionSeconds` is passed correctly from API to component
- [x] Verify timer displays correctly after fix

**Status:** Complete — 352 tests passing (+6 new). See [`sessions/2026-02-07-r6-phase1.5.1-bug-fixes.md`](progress/sessions/2026-02-07-r6-phase1.5.1-bug-fixes.md).

### Phase 1.6: E2E Test Stabilization (folded into Phase 1.5.1 — P0/P1 items are duplicates)

**Goal:** Fix failing E2E tests and address P0/P1 bugs from Phase 1.5 audit.

This phase was never tracked as a separate session — its P0/P1 items were the same bugs fixed in Phase 1.5.1 above (marked done there). The E2E spec status below is **unverified as of 2026-07-03** — the `@playwright/test` CLI runner needs its own local browser binary cache (separate from the MCP Playwright tool used for manual verification, which uses a different browser and was working fine) and it wasn't installed. Installing several hundred MB of browser binaries just to check documentation accuracy wasn't worth it; if these specs matter, run `yarn playwright install` and `yarn test:e2e` for real next time this phase is touched.

- [ ] `host-dashboard.spec.ts`: "should start quiz and update status" — unverified
- [ ] `player-connection-status.spec.ts` — unverified
- [ ] `round-transitions.spec.ts`: "should disable Lock Question after locking" — unverified
- [ ] Selectors avoid strict-mode violations — unverified

### Phase 2: UI/UX Improvements ✅ (Trimmed, 2026-03-07)

Shipped as **targeted fixes**, not the full audit described below — see [`plans/2026-03-07-r6-phase2-ui-ux.md`](progress/plans/2026-03-07-r6-phase2-ui-ux.md) "Out of Scope" section for the explicit trim decision (no axe-core/Lighthouse tooling added, no formal WCAG AA audit, no skip links, no VoiceOver/NVDA testing session).

**Shipped:**
- [x] `aria-label` added to icon-only buttons (admin quiz list)
- [x] `aria-live`/`role="status"` on dynamic status messages (player session, reconnect toast)
- [x] `role="alert"` on form error messages (join form)
- [x] `role="timer"` + `aria-label` on countdown component
- [x] Admin quiz table responsive at 375px (3 low-priority columns hidden below `sm`)
- [x] Admin header email hidden below `md` breakpoint
- [x] Metadata description updated from placeholder

**Deliberately not done (deferred, no evidence of need yet):**
- [ ] axe-core/Lighthouse automated audit — out of scope by design, no new dependency
- [ ] Formal WCAG AA color-contrast pass
- [ ] Skip links
- [ ] VoiceOver/NVDA manual testing session
- [ ] Systematic viewport testing (320/375/414/768/1024) across every page — only admin table + join form spot-checked
- [ ] Touch target ≥44px audit
- [ ] Visual consistency pass (spacing, loading/empty states, error message polish) — never started

### Phase 3: Missing Features ✅ (built, undocumented — verified 2026-07-03)

All three sub-areas exist in the codebase and are wired up (not stubs), but the checklist below was never checked off when they shipped. Verified by reading the actual files; each item's real scope is noted where it's narrower than originally planned.

**Admin Content Management:**
- [x] Standalone Questions management page (`/admin/questions`, `AllQuestionsView` component)
  - [x] Browse all questions across quizzes
  - [x] Filter by quiz
  - [ ] Filter by type or status — not implemented
  - [ ] Bulk operations (delete, move to quiz) — not implemented; edit/delete are per-row only
- [x] Media library page (`/admin/media`, `MediaLibrary` component)
  - [x] Browse uploaded images (grid view with thumbnails, file size)
  - [ ] View usage (which questions reference each image) — not implemented
  - [x] Delete media (manual per-file; no orphan detection, just direct delete)

**Audit Log Feature (Deferred from R4):**
- [x] `AuditLog` Prisma model exists
- [x] Quiz lifecycle events logged: `quiz_created`, `quiz_started`, `question_advanced`, `question_locked` — narrower than "all CRUD operations in admin routes"; quiz/question create-edit-delete are **not** logged
- [x] `/admin/audit` page with `AuditLogTable` component
- [x] Filtering by quiz
- [ ] Filtering by action type, user, or date range — not implemented

**Host Enhancements:**
- [x] Quiz selection page for hosts (`/host` landing) — lists quizzes with status, Dashboard/Live View buttons
- [x] "Share Join Code" with QR code generation (`qrcode.react` in `LobbyView`)
- [ ] Host session controls: pause quiz — **not implemented** (end-early exists via `EndQuizUseCase`/finish route, pause does not; still open)

### Phase 4: Analytics & Observability

**PostHog Integration:**
- [ ] Install `posthog-js` and configure in `providers.tsx`
- [ ] Track key events: quiz_started, player_joined, answer_submitted, quiz_completed
- [ ] Add user identification for admin users
- [ ] Create PostHog dashboards for key metrics

**Structured Logging:**
- [ ] Add structured logger wrapper (`src/lib/logger.ts`)
- [ ] Replace `console.log` with structured logging in API routes
- [ ] Include request ID, user ID, operation name in all logs
- [ ] Configure log levels per environment (dev: debug, prod: info)

**Error Tracking:**
- [ ] Integrate Sentry or similar for error tracking
- [ ] Add source maps for production debugging
- [ ] Set up alerts for error rate spikes

### Phase 5: Production Hardening — Trimmed to Evidence (2026-07-03) ✅

Original scope below was written before any production traffic/deployment existed. Checked against `mcp__supabase__get_advisors` before starting: security and performance advisors both came back **clean** (zero lints), so RLS review, CORS review, and DB indexing had nothing to act on — ruled out as speculative. Digging into the data flow instead surfaced a real, concrete issue the advisors don't catch: player-facing quiz state (join response, polled session endpoint, and realtime broadcast) carried every question's full content and every player's raw answers, regardless of round state — a genuine cheating vector for a quiz game. That became the actual deliverable, alongside rate limiting (confirmed genuinely absent). Redis caching, Edge Function heartbeat, and deployment runbook/incident docs deferred — no evidence they're needed yet; revisit at actual launch (Phase 6) or if real load data shows a bottleneck.

See [`plans/2026-07-03-r6-phase5-security-hardening.md`](progress/plans/2026-07-03-r6-phase5-security-hardening.md) for full detail.

**Performance Optimization:** *(deferred — no evidence of need)*
- [ ] ~~Configure Supabase Connection Pooler (PgBouncer)~~ — already done May 9 maintenance session (`.env.example` documents Supavisor URL; just needs to be the active `DATABASE_URL` at actual deploy time)
- [ ] Add Redis caching layer for hot paths (quiz state, leaderboard) — deferred, no load-test evidence of a bottleneck
- [ ] Move heartbeat endpoint to Supabase Edge Function — deferred, no latency complaint to fix
- [ ] Add database indexes for slow queries — deferred, performance advisor is clean

**Security Audit:**
- [x] Review all RLS policies in Supabase — verified clean via `get_advisors(type: 'security')`, zero lints
- [x] Ensure no sensitive data leaks in API responses — found and fixed: player-facing quiz state redaction (`mapQuizToPlayerFacingDTO`)
- [x] Add rate limiting to public endpoints (join, add player, answer submission)
- [x] Review CORS configuration — verified clean, no custom headers, Next.js same-origin default

**Deployment Documentation:**
- [ ] Write production deployment runbook
- [ ] Document environment variables and secrets management
- [ ] Create incident response playbook
- [ ] Document rollback procedures

### Phase 6: Marketing & Launch

**Marketing Landing Page:**
- [ ] Design hero section with product screenshots
- [ ] Add feature highlights with icons
- [ ] Include testimonials/social proof section (placeholder)
- [ ] Add pricing section (if applicable) or "Free to use"
- [ ] SEO optimization (meta tags, OG images, sitemap)

**Launch Preparation:**
- [ ] Create demo quiz with sample questions
- [ ] Record product demo video (optional)
- [ ] Prepare launch announcement content
- [ ] Set up custom domain if not already configured
- [x] Configure Vercel production environment — done 2026-07-04, but not in the way this checklist assumed. The app had *already* been auto-deploying to production since April 2025 via Vercel's GitHub integration, silently sharing one Supabase project ("Quiz-game-dev") across Production/Preview/Development the whole time — a test admin account had live access to what was presented as "production." Fixed by provisioning a standalone `quiz-game-prod` Supabase project and repointing Vercel's Production environment at it exclusively (schema/RLS/storage/admin auth all recreated to match); Preview and Development still intentionally share the dev project. Verified live end-to-end (real admin login + quiz creation on the production URL, confirmed absent from the old project), not just by inspecting config. See [plans/2026-07-03-r6-supabase-prod-isolation.md](progress/plans/2026-07-03-r6-supabase-prod-isolation.md). Custom domain still not configured — separate, unblocked item above.

### Acceptance Criteria for R6

**Landing Page:**
- [ ] Home page clearly explains product value proposition
- [ ] CTAs lead to appropriate flows (join vs host vs admin)
- [ ] Mobile-responsive and accessible

**Error Handling:**
- [ ] Custom 404 page with helpful navigation
- [ ] Error boundary catches and displays friendly errors
- [ ] Loading states prevent layout shifts

**Admin Dashboard:**
- [ ] No "Coming Soon" buttons for shipped features
- [ ] Quick Start guide reflects actual capabilities
- [ ] Audit log available for admin activity

**Performance:**
- [ ] P95 latency <500ms for answer submission (improved from R5 baseline)
- [ ] P95 latency <1s for player joins (improved from R5 baseline)
- [ ] Zero errors under 100 concurrent player load

**Launch Ready:**
- [ ] All pages pass Lighthouse accessibility audit (score ≥90)
- [ ] Production deployment documented and tested
- [ ] Monitoring and alerting configured
