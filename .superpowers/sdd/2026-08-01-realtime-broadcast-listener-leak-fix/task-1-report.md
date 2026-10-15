# Task 1 Report: Per-event dispatcher registry in `SupabaseRealtimeClient`

**Branch:** `fix/realtime-broadcast-listener-leak`
**Commit:** `e4e123c` — "fix: bind one realtime channel.on listener per (channel, event) pair"

## What was done

1. Read the brief (`task-1-brief.md`) and the current state of both target files to confirm the bug: on a `subscribe()` call to a channel that already existed in `this.channels`, the old code called `existing.channel.on('broadcast', { event }, ...)` again — adding a brand-new Supabase listener every time, with no corresponding removal. `removeListener` only ever decremented a shared `listenerCount` and, on reaching zero, unsubscribed the whole channel — it never removed an individual `.on()` binding (impossible via the public `realtime-js` API), which is exactly the leak described.

2. Replaced `src/infrastructure/realtime/supabase-realtime-client.ts` with the brief's exact implementation (Step 3, verbatim):
   - `TrackedChannel` gained `eventHandlers: Map<string, Set<RealtimeEventHandler>>`, nested inside the existing `channels: Map<channelName, TrackedChannel>` — so the registry is effectively keyed by the `(channelName, event)` pair.
   - New private `bindHandler(tracked, event, handler)`: binds the real `channel.on('broadcast', { event }, ...)` exactly once per `(channel, event)` pair (only when the event's handler Set doesn't exist yet); the real listener fans out to whatever is currently in the Set. Subsequent `subscribe()` calls for the same pair just do `handlers.add(handler)` — no new Supabase binding.
   - `removeListener` signature changed from `(channelName)` to `(channelName, event, handler)`: it now deletes the specific handler from the per-event Set *and* decrements `listenerCount` for whole-channel teardown bookkeeping. No refcount-only removal path remains.
   - `SupabaseRealtimeClient` class changed from unexported to `export class SupabaseRealtimeClient` (no other call sites needed updating, per the brief).
   - `emit()` and `disconnect()` were left untouched (out of scope, not implicated in the leak).

3. Appended the brief's exact new test block (`describe('SupabaseRealtimeClient (real class)', ...)`, 5 tests) plus its import to the end of `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts`, after the closing brace of the existing `TestableRealtimeClient`-based `describe` block, which was left untouched.

## Verification

- `yarn test supabase-realtime-client` → **14 passed** (9 pre-existing `TestableRealtimeClient` tests + 5 new `SupabaseRealtimeClient (real class)` tests), 0 failed.
- `yarn test` (full suite) → **464 passed, 1 skipped**, 1 file initially showed a failure in `src/tests/domain/entities/question.test.ts` ("should randomize options for multiple-choice questions") — this is a pre-existing flaky test asserting a Fisher-Yates shuffle produces a *different* order than the original, which can by chance reproduce the original order. Confirmed unrelated and flaky by re-running `yarn test question.test.ts` alone (passed) and the full suite again (all 464 passed, 1 skipped, 0 failed). Not touched by this change.
- `yarn lint` → initially 1 prettier formatting error in the new test block (a line-wrapping preference on the `Map<string, ...>` type in `createMockChannel`); fixed via `yarn lint:fix`. Final `yarn lint` → **0 errors**, 5 pre-existing warnings all in unrelated files (`admin/layout.tsx`, `question-view.tsx`, three `tests/load/*.js` anonymous-export warnings) — none touched by this task.

## Self-review against the brief

- Diff matches the brief's Step 3 "full file" content exactly (structurally — `lint:fix` reformatted one long type declaration onto a single line, no logic change).
- Registry is keyed by `(channel, event)`, not just per-channel: `channels.get(channelName).eventHandlers.get(event)` is the Set of handlers for that specific pair; `channel.on()` is called once per new entry in `eventHandlers`, never again for handlers added later to the same pair.
- No trace of the old refcount-only `removeListener(channelName)` behavior remains — the new `removeListener(channelName, event, handler)` always removes the specific handler from its event's Set before touching `listenerCount`.
- Only the two files named in the brief were modified; staged and committed only those two (left an untracked `docs/progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md` file alone — pre-existing/out of scope for this task, not created by this work).

## Files changed

- `/home/banykinv/Documents/repos/bobrquiz/src/infrastructure/realtime/supabase-realtime-client.ts`
- `/home/banykinv/Documents/repos/bobrquiz/src/tests/infrastructure/realtime/supabase-realtime-client.test.ts`

## Status

DONE — all steps in the brief completed, tests green, lint clean, committed to `fix/realtime-broadcast-listener-leak`.
