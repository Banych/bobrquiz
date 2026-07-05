# Presence Heartbeat Resilience — Design Spec

**Status:** 📋 Approved, ready for implementation plan
**Related:** `fix/host-leaderboard-realtime-update` (bug #1, already fixed/committed on a separate branch)

## Background

During a production 2-player game session:
1. Supabase's Supavisor pooler hit its hard-coded max client connections (200 on the current compute tier), rejecting requests project-wide (bug #3).
2. Players' connection status flipped `connected → away → disconnected` very quickly even though their browser tab stayed open and fully connected, and were eventually auto-removed (bug #2).

**Root cause of bug #2**, found by reading the actual heartbeat code path:

- The host's player list derives connection status **purely from a DB column** (`Player.lastSeenAt`), via `ConnectionStatus.fromLastSeenAt` (`src/domain/value-objects/connection-status.ts`): connected ≤30s, away ≤120s, disconnected beyond that.
- The player's browser writes that column via a heartbeat: `usePresence` (`src/hooks/use-presence.tsx`) calls `tracker.track()` (Supabase Realtime presence, websocket-based, no Postgres involved) and `persistPresence()` (a `POST /api/quiz/[quizId]/player/[playerId]/presence` call that writes `lastSeenAt`) every 10 seconds.
- `usePresence` already has a well-built resilience mechanism: `sendHeartbeat` wraps both calls in a try/catch, retries failures with exponential backoff (1s/2s/4s/8s/8s over 5 attempts), and calls `onConnectionError` once the circuit trips. `useReconnection` (`src/hooks/use-reconnection.ts`) wires that into a `connected/disconnected/reconnecting/failed` state machine, and `player-session-screen.tsx` already renders a `ConnectionStatusBanner` off that state, with `persistToDatabase: true` passed through.
- **The one bug**: `persistPresence()` catches and swallows its own errors internally (dev-only `console.warn`, no rethrow). A DB-write failure therefore never reaches `sendHeartbeat`'s `try/catch`, so the entire retry/backoff/circuit-breaker/banner chain — which already exists and is otherwise correct — never activates for DB failures. Only Realtime presence-channel failures can trip it. The player's UI shows nothing wrong while the DB's view of them silently goes stale, ages through away → disconnected, and eventually triggers host-side auto-removal (`src/hooks/use-host-quiz-players.ts`, 5-minute threshold).

This connects to bug #3: the heartbeat fires every 10s per player as its own serverless request, each a candidate for a fresh Prisma pool on a cold Vercel lambda instance — a plausible contributor to pool pressure, not just a victim of it.

## Scope

**In scope:**
1. Fix `persistPresence()` to propagate errors into the existing retry/backoff/circuit-breaker instead of swallowing them (bug #2's actual fix).
2. Decouple the DB *persist* cadence from the Realtime *track* cadence, and add jitter, to reduce steady-state presence-related DB writes and desynchronize concurrent players' writes.
3. Slow the heartbeat cadence once the circuit breaker is open (sustained failures), so a real outage doesn't have every player hammering the DB every 10s for the duration of the outage — this is the piece most directly aimed at reducing bug #3's load contribution during an incident.
4. Add production-safe logging for heartbeat persistence failures (today it's dev-only `console.warn`), so a future incident like this leaves an immediate trace instead of requiring a multi-step investigation to even see it happened.

**Out of scope (non-goals):**
- No change to the Realtime presence-track protocol/websocket behavior.
- No server-side presence aggregator / cron-based batching (considered as "Approach 2" and deferred — would eliminate per-client heartbeat DB writes entirely, but needs new always-on infra Vercel's serverless model doesn't naturally provide, and is disproportionate to a 2-player-triggered incident).
- No change to `usePlayerSession`'s 5s quiz-state poll, even though it's a larger steady-state DB load source than the presence heartbeat — worth a future look, not this fix.
- No Supabase compute-tier / infrastructure changes.
- No changes to `useReconnection`, `ConnectionStatusBanner`, or any host-side hook — they are already correct and will simply start receiving real signals once `persistPresence` stops swallowing errors.

## Architecture

Single hook, no cross-layer changes — this is presentation-layer only (domain thresholds are read, not modified).

```
src/hooks/use-presence.tsx              — core fix: error propagation + cadence changes
src/tests/hooks/use-presence.test.ts    — + real behavioral tests (fake timers)
```

## Design

### Behavior change

**Before:** DB write fails → error is swallowed inside `persistPresence` → `sendHeartbeat` believes the heartbeat succeeded → player UI shows nothing wrong → host, reading only the stale `lastSeenAt` column, ages the player through away → disconnected → removed with zero player-side feedback and no way for the player to know or intervene.

**After:** DB write fails → propagates to `sendHeartbeat`'s catch → existing fast retries (1/2/4/8/8s, unchanged, ~23s total) → if still failing, existing `onConnectionError` fires → player sees the existing `ConnectionStatusBanner` ("Connection lost. Trying to reconnect...") → heartbeat cadence itself slows while the circuit is open (proposed: back off to a longer flat interval, e.g. 30s, instead of continuing at 10s) → first subsequent success resumes normal cadence and fires the existing `onReconnected` path.

**Steady state (no failures):** `tracker.track()` (websocket, cheap, no Postgres) continues every 10s as today. `persistPresence()` (the DB write) moves to a longer, jittered interval — proposed 20s ± ~5s random jitter per mount — comfortably under the 30s "connected" threshold with margin, cutting DB round-trips roughly in half versus today's 10s cadence, and desynchronizing multiple players' writes so they don't cluster into simultaneous bursts.

### Error handling / observability
- `persistPresence()` re-throws instead of catching-and-swallowing.
- Add a production-safe log call (not gated to `NODE_ENV === 'development'`) when a heartbeat persistence attempt fails, so this failure mode is visible in production logs going forward.
- No new error types — continues to use the `Error` thrown from the existing fetch failure / non-ok-response path.

### Testing
- Extend `src/tests/hooks/use-presence.test.ts` with fake-timer-driven behavioral tests covering: a failing `persistPresence` increments `failureCount` and eventually calls `onConnectionError`; the heartbeat cadence slows once the circuit is open; cadence and `failureCount` reset on the next success.
- No changes needed to domain (`connection-status.ts`) or use-case (`get-player-connection-status`) tests — their logic is unchanged, only the reliability of what feeds them.
- Manual verification: same Playwright approach used for bug #1 — join as a player, simulate `/presence` route failures (temporarily returning a 500, or throttling), and confirm the player sees the reconnecting banner while the host's status view behaves sensibly, then confirm recovery once the route succeeds again.

### Risk / rollout
Low risk. The resilience half only changes error propagation in one function. The cadence half only changes timing, not logic, and stays within the existing domain thresholds (30s/120s) with margin. No feature flag needed: the worst-case failure mode if something is subtly wrong is "no worse than today's silent-failure behavior."

## Decision Log

**Decision: propagate errors instead of building a new resilience system**
Considered building new failure-detection machinery for DB persistence specifically. Rejected because `usePresence`/`useReconnection` already implement a complete, correct retry/backoff/circuit-breaker/banner chain — it's just never triggered for this failure mode. Re-throwing from `persistPresence` reuses all of it for free and is the smallest possible fix.

**Decision: decouple persist cadence from track cadence rather than slowing both**
`tracker.track()` is a websocket call with no Postgres cost; only `persistPresence()` contributes to pool pressure. Slowing both would unnecessarily reduce Realtime presence responsiveness (multiplayer join/leave detection) to save DB load that only the persist call actually causes.

**Decision: defer server-side presence aggregation (Approach 2)**
Would remove per-client heartbeat DB writes entirely by having one server-side process read Realtime's own presence state and batch-write `lastSeenAt`. Rejected for this round: Vercel's serverless model has no natural home for a long-lived background process (would need a Vercel Cron function or separate worker — new infra, new failure modes), and it doesn't address bug #2 by itself since the honest-failure-surfacing work is still needed regardless. Revisit if player counts grow well beyond a handful per game.
