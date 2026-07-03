# R6 Phase 5 — Security Hardening (Trimmed)

**Date Created:** 2026-07-03
**Status:** ✅ Complete
**Estimated Time:** ~3.5 hours
**Depends on:** R6 Phase 3.5 ✅, Player Kick & Auto-Remove ✅

---

## Overview

`docs/plan.md`'s original Phase 5 scope (Redis caching, Edge Function heartbeat, speculative DB indexes, full deployment runbook/incident playbook) was written before there was any production traffic or deployment. Before planning that work, we checked it against actual evidence:

- `mcp__supabase__get_advisors(type: 'security')` → **zero lints** (RLS is clean)
- `mcp__supabase__get_advisors(type: 'performance')` → **zero lints** (no index recommendation to act on)
- CORS → no custom headers anywhere; Next.js API routes default to same-origin, which is correct as-is

That ruled out most of the original scope as speculative. But digging into the actual data flow surfaced a **real, concrete issue** the advisors don't catch (it's an application-layer design issue, not a Postgres/RLS issue):

**`GetQuizStateUseCase`, `JoinSessionUseCase`, and `GetPlayerSessionUseCase` all call `mapQuizToDTO()`, which builds one `QuizDTO` containing every question (including ones not yet asked — full `text`/`media`/`options`) and every player's raw answers (`value` + `isCorrect`), keyed by playerId.** This same full-fidelity DTO is:
- Returned directly from `POST /api/session/join` and `GET /api/quiz/[quizId]/player/[playerId]` (polled every 5s by `usePlayerSession`)
- Broadcast unfiltered on the public `quiz:{quizId}` realtime channel via `broadcastQuizState()`, and consumed directly by `usePlayerSession` (`src/hooks/use-player-session.ts:73-90`)

Any player's browser can inspect the network/WS tab and see upcoming question content before it's revealed, and see every other player's answer + correctness while the round is still open. For a quiz game whose entire value proposition is fair, simultaneous play, that's a genuine cheating vector — not a hypothetical.

Also genuinely missing: **no rate limiting anywhere** on `/api/session/join`, `/api/player/add`, or `/api/player/answer` — all public, unauthenticated, and reachable by anyone with a join code (or a guessed one).

**What's out of scope (deferred, no evidence they're needed):**
- Redis caching layer — no load-test data shows a bottleneck at current scale
- Heartbeat → Edge Function migration — no latency complaint to fix
- DB indexes — performance advisor is clean; nothing to act on
- Deployment runbook / incident playbook / rollback docs — no production environment exists yet (Phase 6 hasn't started); writing these now means they describe a topology that doesn't exist and will likely be stale by the time of actual launch

---

## Goals

- [x] Redact player-facing quiz state so unrevealed questions and other players' answers are never sent to a player's browser
- [x] Add rate limiting to the three public, unauthenticated player-facing endpoints
- [x] Document RLS + CORS as verified clean (no code change needed)

---

## Implementation Steps

### Step 1 — Application: player-facing quiz state redaction · Medium

**New file:** `src/application/mappers/player-quiz-mapper.ts`

```typescript
// mapQuizToPlayerFacingDTO(quiz: QuizDTO): QuizDTO
// - questions: for every question whose id !== quiz.activeQuestionId, strip
//   text/media/mediaType/options (keep id, type, points, orderIndex, answersLockedAt)
//   so `questions.length` and `.find(id)` still behave identically for the active question
// - answers: omitted entirely (confirmed unused by any player-facing component —
//   only src/components/host/live/question-view.tsx reads quiz.answers)
// - everything else (players, leaderboard, timer, settings, status, joinCode,
//   activeQuestionId, currentQuestionIndex, startTime, endTime) passes through unchanged
```

- [x] Implement `mapQuizToPlayerFacingDTO`
- [x] Write `src/tests/application/mappers/player-quiz-mapper.test.ts`:
  - Active question keeps full fields; other questions have text/media/options stripped
  - `answers` is always `undefined` on output regardless of input
  - `questions.length` unchanged (redaction, not filtering)
  - Players/leaderboard/timer/settings pass through untouched
- [x] Run `yarn test` ✅

---

### Step 2 — Application: apply redaction in player-facing use cases · Small

**Files:** `src/application/use-cases/join-session.use-case.ts`, `src/application/use-cases/get-player-session.use-case.ts`

- [x] `JoinSessionUseCase.execute()` — wrap the returned `quizDto` in `mapQuizToPlayerFacingDTO()` before returning
- [x] `GetPlayerSessionUseCase.execute()` — wrap `quizDto` the same way before assembling `PlayerSessionDTO`
- [x] Update existing tests in `src/tests/application/use-cases/join-session-use-case.test.ts` and `get-player-session-use-case.test.ts` to assert the returned quiz has no `answers` and non-active questions are redacted
- [x] Confirm `GetQuizStateUseCase` (host-only, feeds `useHostQuizState`) is **not** touched — host needs full fidelity
- [x] Run `yarn test` ✅

---

### Step 3 — Infrastructure: redacted realtime broadcast for players · Medium

**Files:** `src/infrastructure/realtime/broadcast-quiz-state.ts`, `src/hooks/use-player-session.ts`

Both the host dashboard (`useHostQuizState`) and every player session (`usePlayerSession`) currently subscribe to the same `state:update` event on the same `quiz:{quizId}` channel. Rather than adding a new channel (deviates from the documented channel-naming convention), add a second **event** on the same channel:

- [x] In `broadcastQuizState(quizId, quizState)`, after the existing full `state:update` send, also send `state:update:player` with `mapQuizToPlayerFacingDTO(quizState)` on the same channel
  - Keeps all 6 existing call sites (`advance`, `start`, `timer/reset`, `leaderboard/snapshot`, `reset`, `finish` routes) unchanged — the redaction is centralized in the one broadcast helper
- [x] In `src/hooks/use-player-session.ts`, change the subscription from `'state:update'` to `'state:update:player'`
- [x] Confirm `useHostQuizState` is unchanged (still subscribes to `'state:update'`)
- [x] Update/add tests in `src/tests/infrastructure/realtime/` covering the new event is sent with redacted payload
- [x] Run `yarn test` ✅
- [x] Manual Playwright MCP verification: open host dashboard + a player tab side by side, advance a question, confirm player's network/WS payload no longer contains future question text or other players' answers, while host view still functions identically
  - Verified against `QR Code Test Quiz` (JOIN-7NEV): join response and polled `GET /api/quiz/[quizId]/player/[playerId]` both showed the active question with full `text`/`options`, the next question redacted (`text: ""`, no `options`), and no `answers` field anywhere. Host's `GET /api/quiz/[quizId]/state` in the same session showed full `text`/`media`/`options` for both questions, confirming host fidelity is untouched.

---

### Step 4 — Rate limiting on public player-facing endpoints · Medium

**New file:** `src/lib/rate-limit.ts`

- [x] Implement a small in-memory fixed-window limiter: `checkRateLimit(key: string, { limit, windowMs }): { allowed: boolean; retryAfterMs?: number }` (implemented as fixed-window rather than sliding-window — simpler, and sufficient for the abuse patterns being guarded against; see Notes)
  - Keyed by client IP (`x-forwarded-for` header, falling back to `x-real-ip` then `'unknown'`) + route name
  - Uses a `Map` with probabilistic sweep of expired windows on each call (no external dependency, no new infra, no background timer)
- [x] Apply to `POST /api/session/join` (10 req / 60s per IP) — guards against join-code brute-forcing
- [x] Apply to `POST /api/player/add` (same limits as join — same abuse surface)
- [x] Apply to `POST /api/player/answer` (30 req / 60s per IP — generous enough for legitimate rapid-fire quiz play, tight enough to block scripted spam)
- [x] On limit exceeded, return `429` with `{ error: 'Too many requests, please slow down.' }`
- [x] Write `src/tests/lib/rate-limit.test.ts`: allows under limit, blocks over limit, resets after window, independent keys, IP extraction
- [x] Run `yarn test` ✅

---

### Step 5 — Documentation · Small

**File:** `docs/progress/dev-notes.md`, `docs/plan.md`

- [ ] Update `docs/plan.md` Phase 5 section to reflect trimmed scope + link to this plan
- [ ] Add dev-notes entry noting RLS/CORS verified clean via advisors (no code change), and the quiz-state leak fix + rate limiting as the actual deliverables
- [ ] Write session file once complete (per CLAUDE.md — cross-layer change with a non-obvious decision trail)

---

## Technical Decisions

### Redaction via a second broadcast event, not a second channel
The documented realtime convention is `quiz:{quizId}` for all-players broadcasts and `player:{quizId}:{playerId}` for per-player messages. Adding a third channel name for "public-but-redacted" would fragment that convention further. Instead, the existing channel carries two events — `state:update` (full, host) and `state:update:player` (redacted, players) — keeping the channel model unchanged and centralizing the redaction in the one existing broadcast helper so none of the 6 call sites need to change.

### Redact, don't filter, the `questions` array
`player-session-screen.tsx` relies on `quiz.questions.length` (for "Question X of Y") and `quiz.questions.find(q => q.id === activeQuestionId)`. Truncating the array to just the active question would break the count; stripping content fields while preserving array length and ids keeps both call sites working with no UI changes required.

### Drop `answers` entirely from the player-facing DTO, not per-question gating
Checked every player component — none read `quiz.answers` (a player's own "was I right" feedback already comes from the separate `answer:ack` private-channel event, which was already correctly scoped per-player). Only one host component (`host/live/question-view.tsx`) reads it. Full removal for players is simpler than partial gating and has no UI cost.

### In-memory rate limiting, not Redis/Upstash
No production deployment exists yet (Phase 6 not started), so there's no multi-instance serverless concern to design around today. An in-memory limiter is a real mitigation against casual abuse right now with zero new infrastructure. **Known limitation:** it's per-instance, so it won't hold under multi-instance serverless deployment. Revisit with Upstash Redis (or similar) if/when Phase 6 ships to a real multi-instance Vercel production environment and abuse is observed.

### DB indexing and deeper deployment docs deferred, not done
Performance advisor came back clean against the current schema and query patterns — adding indexes now would be speculative, not evidence-based. Deployment runbooks/incident playbooks are deferred to Phase 6, when the actual production topology will be known and the docs won't go stale before first use.

---

## Success Criteria

### Functional
- [x] A player's browser (network tab + WS frames) never contains text/media/options for questions other than the currently active one
- [x] A player's browser never receives other players' answer values or correctness
- [x] Host dashboard behavior is completely unchanged (still receives full state)
- [x] Repeated rapid requests to `join`, `player/add`, or `player/answer` from the same IP get a `429` past the configured threshold; normal play is unaffected — verified live: 10 requests to `/api/session/join` returned `404` (normal business logic), requests 11-12 returned `429`

### Non-functional
- [x] `yarn test` passes after every step
- [x] `yarn build` succeeds
- [x] No TypeScript errors (`yarn lint`)
- [x] No new external infrastructure/dependencies added

---

## Files Changed

### New
| File | Purpose |
|------|---------|
| `src/application/mappers/player-quiz-mapper.ts` | Redaction logic for player-facing quiz state |
| `src/tests/application/mappers/player-quiz-mapper.test.ts` | Redaction tests |
| `src/tests/infrastructure/realtime/broadcast-quiz-state.test.ts` | Tests for the dual full/redacted broadcast |
| `src/lib/rate-limit.ts` | In-memory fixed-window rate limiter |
| `src/tests/lib/rate-limit.test.ts` | Rate limiter tests |

### Modified
| File | Change |
|------|--------|
| `src/application/use-cases/join-session.use-case.ts` | Apply redaction before returning quiz DTO |
| `src/application/use-cases/get-player-session.use-case.ts` | Apply redaction before returning quiz DTO |
| `src/infrastructure/realtime/broadcast-quiz-state.ts` | Send additional redacted `state:update:player` event |
| `src/hooks/use-player-session.ts` | Subscribe to `state:update:player` instead of `state:update` |
| `src/app/api/session/join/route.ts` | Apply rate limit check |
| `src/app/api/player/add/route.ts` | Apply rate limit check |
| `src/app/api/player/answer/route.ts` | Apply rate limit check |
| `docs/plan.md` | Trim Phase 5 scope, link to this plan |
| `docs/progress/dev-notes.md` | Session summary entry |

---

## Time Estimates

| Step | Task | Estimate |
|------|------|----------|
| 1 | Player-facing redaction mapper + tests | 45 min |
| 2 | Apply redaction in join/get-player-session use cases | 30 min |
| 3 | Redacted realtime broadcast event + hook update | 45 min |
| 4 | Rate limiting utility + wire into 3 routes + tests | 60 min |
| 5 | Documentation | 20 min |
| — | Buffer | 20 min |
| **Total** | | **~3.5 hours** |

---

## Notes & Observations

- Implemented the rate limiter as fixed-window rather than sliding-window (as originally worded in Step 4) — simpler, and the abuse patterns being guarded against (brute-force join-code guessing, scripted spam) don't need sliding-window precision at this scale.
- Worked on branch `feat/r6-phase5-security-hardening` (created before Step 1).
- Test suite grew from 414 → 432 tests (+18: 7 mapper, 2 use-case redaction assertions, 2 broadcast, 7 rate-limit).

---

## Completion Checklist

- [x] All 5 steps checked off above
- [x] `yarn test` passes (no regressions)
- [x] `yarn build` succeeds
- [x] `yarn lint` clean
- [x] Manual Playwright MCP verify: player never receives future question content or other players' answers, host view unaffected
- [x] Manual verify: rate limit triggers a 429 after threshold, normal play unaffected
- [x] `docs/progress/dev-notes.md` updated
