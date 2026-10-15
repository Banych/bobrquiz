# Realtime Broadcast Listener Leak Fix

**Date:** 2026-08-01
**Status:** ✅ Complete
**Plan:** [plans/2026-08-01-realtime-broadcast-listener-leak-fix.md](../plans/2026-08-01-realtime-broadcast-listener-leak-fix.md)

---

## Summary

Fixed a broadcast-listener leak in `SupabaseRealtimeClient` found while live-testing the "too many connections (~200)" production incident: a single player tab left open during a live question accumulated ~180 stacked `answer:ack` handlers on one channel over ~5 minutes, each firing a real `invalidateQueries()` DB round-trip per broadcast. Also memoized `usePlayerSession`'s query key as a defense-in-depth cleanup, and — in this closing pass — fixed a test mock that let the original regression test pass even when reverted to the buggy pre-fix code.

## What Was Built

**Task 1 — Dispatcher-registry fix in `SupabaseRealtimeClient`.**
Changed the class's internal per-channel tracking from "one real `channel.on()` binding per `subscribe()` call, decremented by a raw refcount" to "exactly one real `channel.on()` binding per unique `(channelName, event)` pair, fanning out to a `Set<handler>`." Individual `subscribe()`/`unsubscribe()` calls now just add to/delete from that Set instead of creating a fresh Supabase binding every time. The class is now exported so it can be constructed directly in tests. Per-channel `listenerCount` (used to decide when to actually call `channel.unsubscribe()`) is unchanged — only the per-listener dispatch mechanism changed.

**Task 2 — Memoized `usePlayerSession`'s query key.**
`playerSessionQueryKey(quizId, playerId)` was being called inline and returning a new array literal every render, which meant its two realtime effects (`state:update:player`, `answer:ack`) tore down and rebuilt every second during an active countdown (`useCountdownTimer` re-renders once/second). Wrapped it in `useMemo([quizId, playerId])`. No longer required for correctness once Task 1 landed, but removes needless per-second churn (a fresh closure + Set add/delete for the whole lifetime of every question).

**This closing pass — fixed a test mock that couldn't detect the bug it was written to guard.**
The final whole-branch review found that reverting `supabase-realtime-client.ts` to the pre-fix implementation and running the new "real class" test suite still passed 4 of 5 tests — meaning the regression test gave false confidence. Two problems, both in the test file, not the production code:
- `createMockChannel`'s `.on()` handler stored callbacks in a `Map<event, callback>`, so a second `.on()` call for the same event silently replaced the first. Real `@supabase/realtime-js` appends to a `bindings` array instead — a mock that discards stacked bindings can never observe a stacked-bindings bug. Changed to `Map<event, callback[]>`, with `emit()` invoking every callback for that event.
- The regression test's scenario didn't match the real incident's shape: each `unsubscribe()` in its loop dropped `listenerCount` to 0, so the channel was fully torn down and recreated each iteration — never reproducing the "second, still-active subscriber holding the channel open while a different effect churns" shape of the actual incident (`player:kicked` staying subscribed while `answer:ack` churned in `use-player-session.ts`). Rewrote the test to add a stable second subscription on a different event first, then churn `answer:ack` on top of it, then assert that every stale (pre-churn) handler was never called again — stacking manifests as stale handlers firing, not as the latest handler firing multiple times.

## Key Decisions

- **Dispatcher registry over reaching into `channel.bindings`.** Filtering `RealtimeChannel.bindings` directly (undocumented Phoenix-shaped internal field) was considered and rejected — it isn't part of realtime-js's public contract and could silently break on a dependency bump. The registry only touches the three documented public methods (`on`, `subscribe`, `unsubscribe`).
- **Drive the real class in tests, not just extend the old shadow-copy suite.** The pre-existing `TestableRealtimeClient` in the test file reimplemented the same "push a handler, never remove it" bug as a parallel copy of production code — exactly why the leak shipped without a failing test. Kept the old tests (harmless) and added a new `describe` block against the real, now-exported class, mocking only the Supabase client boundary (same pattern as `SupabasePresenceTracker`).
- **Memoize `usePlayerSession`'s query key even though it's now correctness-neutral.** The per-second effect churn was the proximate trigger of the incident and the fix is one line; leaving it in place would mean any future hook copying this pattern (inline array literal used as an effect dependency) keeps paying an avoidable render-churn cost even after it stops being unsafe.
- **Fix the mock, don't just add more assertions.** Once a reviewer proved the old regression test passed against buggy code, patching only the assertion would have left the same root cause (a mock that discards stacked bindings) able to mask the next stacking bug. Fixing the mock's storage semantics to match real `bindings`-array behavior makes every test in the "real class" block a genuine guard, not just the rewritten one.

## Verification

| Check | Result |
|---|---|
| `yarn test` (full suite) | ✅ All passing |
| `yarn lint` | ✅ 0 errors |
| Regression test against pre-fix (buggy) `supabase-realtime-client.ts` (via `git show 404baa1:...`, temporarily re-exported) | ❌ 3 of 14 tests in the file failed as expected: "binds the real channel.on listener only once...", "stops delivering to a handler after its unsubscribe...", and the rewritten regression test — confirming the mock and test now have teeth |
| Same test file against the restored fixed implementation | ✅ 14/14 passing |

## Files Changed

- `src/infrastructure/realtime/supabase-realtime-client.ts` — dispatcher-registry rewrite (Task 1), class now exported.
- `src/hooks/use-player-session.ts` — `queryKey` memoized with `useMemo` (Task 2).
- `src/tests/hooks/use-player-session.test.ts` — new, `queryKey` shape tests (Task 2).
- `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` — new `describe('SupabaseRealtimeClient (real class)', ...)` block driving the real class against a mocked Supabase client boundary (Task 1); this closing pass fixed `createMockChannel`'s listener storage (Map-of-array instead of Map-of-single-callback) and rewrote the regression test to reproduce the actual incident shape (stable second subscriber + churn on a different event + assert stale handlers never fire again).
- `docs/progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md` — plan file, steps checked off.

## Outcomes / Next Steps

- **Done:** Success Criterion #5 — manual multi-tab Playwright verification against the live "Bobr Quiz Demo" (join code `TRYBOBR`). Host tab + two concurrent player tabs, live question with the countdown actively ticking (~6-8s of per-second re-renders before each submission, exercising the churn path). Each player submitted an answer independently; each tab's console showed exactly one `Answer acknowledged` log (11 total console messages per tab, vs. ~180 duplicate logs from a single event pre-fix). Host tab stayed clean throughout (0 errors, 22 total messages, no flood from the two concurrent leaderboard/state broadcasts). Plan and this session file both updated to ✅ Complete.
- **Deferred as follow-ups (Minor findings from the final whole-branch review, not fixed now):**
  1. **Pre-existing teardown race.** An unsubscribe followed immediately by a resubscribe during the async `channel.unsubscribe()` window can hand a `subscribe()` call a dying channel, whose `channel.subscribe()` call is then silently inert. This is pre-existing behavior, unchanged by this branch — but now triggered less often, since Task 2 cut the effect-churn rate on the player page from once/second to once/remount. `presence-tracker.ts` already solves this exact realtime-js quirk with a grace-period deferred teardown (`UNSUBSCRIBE_GRACE_PERIOD_MS`); the same pattern would close this gap in `SupabaseRealtimeClient` if it's ever prioritized.
  2. **Unconditional listenerCount decrement.** `removeListener` decrements `listenerCount` unconditionally, so a double-unsubscribe call while other listeners remain would tear down a channel still in use. Pre-existing, and no live call site actually does this (React never double-invokes a cleanup function). A per-subscription token — wrap each handler in a unique closure, store/delete the wrapper instead of the raw handler — would close this and the identical-handler-reference edge case (calling `subscribe()` twice with the literal same function reference) together, if ever prioritized.
  3. **Test file hygiene.** The retained `TestableRealtimeClient` class (kept for backward test compatibility) now describes an implementation that no longer exists anywhere in the actual codebase — worth deleting in a future cleanup, but its `disconnect()` test coverage should be ported to the new real-class block first (no equivalent exists there yet). Separately, `createMockClient`'s returned `channelFn` is currently unused by any test.
