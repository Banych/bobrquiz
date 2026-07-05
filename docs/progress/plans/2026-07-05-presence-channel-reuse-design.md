# Presence Channel Reuse Race — Design Spec

**Status:** ✅ Complete — merged via [PR #59](https://github.com/Banych/bobrquiz/pull/59)
**Related:** `fix/presence-tracker-provider-mount` (Tasks 1-2, already committed on that branch) — mounting `PresenceTrackerProvider` made `SupabasePresenceTracker.subscribe()` actually execute for the first time in production, which immediately exposed this bug.

## Background

While running the manual verification for the `PresenceTrackerProvider` mounting fix, joining the demo quiz crashed the entire player screen 100% of the time:

```
Error: cannot add `presence` callbacks for realtime:presence:quiz:{quizId} after `subscribe()`.
    at SupabasePresenceTracker.subscribe (src/infrastructure/realtime/presence-tracker.ts)
```

**Root cause:** `SupabasePresenceTracker.subscribe()` (`src/infrastructure/realtime/presence-tracker.ts`) caches one `RealtimeChannel` per `quizId` in its own `Map`, and on any call it unconditionally calls `channel.on(...)` to (re-)register presence event listeners before calling `channel.subscribe()`. Supabase's `realtime-js` throws if `.on()` is called on a channel that has already had `.subscribe()` called on it. When a component remounts quickly enough (observed via React 19 Strict Mode's dev-only double-invoke of effects — mount → unmount → remount within one commit), the remount's `subscribe()` call finds the channel this file's own `Map` still has cached (its cleanup is async and hadn't finished yet) and crashes trying to re-register listeners on it.

**Why a naive reorder isn't sufficient:** the obvious fix — delete the entry from this file's own `Map` synchronously before doing the async `untrack()`/`unsubscribe()`, mirroring `src/infrastructure/realtime/broadcast-channel-pool.ts`'s `remove()` — does not fully solve this. Traced into the installed `@supabase/realtime-js` source (`node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js`): `RealtimeClient.channel(topic)` **itself** deduplicates by topic name (`this.getChannels().find(c => c.topic === realtimeTopic)`), independent of this file's own cache. A channel is only removed from that internal registry via a "close" event listener that fires as part of the actual async unsubscribe/leave handshake with the server — not synchronously. So even with this file's own `Map` cleared immediately, calling `client.channel(sameTopic)` again right away would still hand back the *same*, already-subscribed channel object from Supabase's own registry, and the crash would still occur.

**Test coverage gap:** `src/tests/infrastructure/realtime/presence-tracker.test.ts` exists but only tests a hand-written `MockPresenceTracker` fake — it never exercises `SupabasePresenceTracker` itself. This is the same class of gap that let the `usePresence` error-swallowing bug (fixed in PR #58) go undetected: a test file that looks like coverage but tests a parallel implementation instead of the real one.

## Scope

**In scope:**
1. Change `SupabasePresenceTracker`'s channel reuse to survive quick remounts: keep the channel alive across a short grace period after `unsubscribe()` is called, canceling the pending teardown if a new `subscribe()` for the same `quizId` arrives in time — mirroring the already-working pattern in `broadcast-channel-pool.ts`.
2. Route presence event callbacks (`onSync`/`onJoin`/`onLeave`) through a mutable handler object read at event-fire-time, so a reused channel never needs `.on()` called a second time, and always reflects the latest subscriber's callbacks.
3. Add real unit tests for `SupabasePresenceTracker` (mocking the Supabase client/channel), covering the reuse-within-grace-period and teardown-after-grace-period behaviors — closing the test-coverage gap that let this bug ship.
4. Manual re-verification: confirm joining the demo quiz no longer crashes, then complete the `PresenceTrackerProvider` plan's originally-deferred Task 3 verification (heartbeat POST requests appear, failure-simulation banner, recovery).

**Out of scope (non-goals):**
- No changes to `NoopPresenceTracker`, `getPresenceTracker()`'s caching, or Supabase client construction.
- No changes to `usePresence`'s public interface or its synchronous `subscribe()`-returns-a-synchronous-unsubscribe-function usage pattern — the fix stays entirely inside `SupabasePresenceTracker`.
- No attempt to fully close the residual race described below (grace-timer-fires-then-immediately-resubscribes-during-in-flight-teardown) — accepted as a documented, vanishingly-rare trade-off rather than making `subscribe()` async.
- No changes to `broadcast-channel-pool.ts` itself (only used as a reference pattern).

## Architecture

`SupabasePresenceTracker`'s internal storage changes from `Map<string, RealtimeChannel>` to `Map<string, ChannelEntry>`:

```ts
type ChannelEntry = {
  channel: RealtimeChannel;
  handlers: PresenceSubscribeOptions;
  teardownTimer: ReturnType<typeof setTimeout> | null;
};

const UNSUBSCRIBE_GRACE_PERIOD_MS = 3_000;
```

**`subscribe(quizId, playerId, options)`:**
- If an entry already exists for `quizId` (channel alive, possibly with a teardown scheduled): cancel any pending `teardownTimer`, merge `options` into `entry.handlers` (`Object.assign`), return the unsubscribe closure. No `.on()`/`.subscribe()` call — the channel is already live and bound.
- If no entry exists: create the channel via `this.client.channel(...)`, create a fresh `handlers` object from `options`, bind all three presence events **unconditionally** (`sync`/`join`/`leave` — each closure reads `handlers.onX?.(...)` at fire-time, not gated on whether the *first* caller happened to pass that particular callback), call `channel.subscribe(...)` once, store the new entry.
- The returned closure looks up the *current* entry for `quizId` at call time (not a captured reference), so it always operates on whichever generation of subscribe/reuse is currently live, then schedules `entry.teardownTimer = setTimeout(() => { this.channels.delete(quizId); void this.teardownChannel(quizId, entry.channel); }, UNSUBSCRIBE_GRACE_PERIOD_MS)`.

**`teardownChannel(quizId, channel)`** (new private method, replaces today's `unsubscribe(quizId)`): the actual async work — `await channel.untrack(); await channel.unsubscribe();` — run only after the map entry has already been deleted synchronously (matching `broadcast-channel-pool.ts`'s ordering), so it's fire-and-forget from the caller's perspective.

**`track()`, `getPresenceState()`, `disconnect()`**: updated to read `entry.channel` instead of a bare `RealtimeChannel`. `disconnect()` additionally clears any pending `teardownTimer`s before tearing every channel down immediately (full shutdown shouldn't wait out grace periods).

## Data flow

No change to the public `IPresenceTracker` interface or to any caller (`usePresence`, `use-presence.tsx`). The fix is entirely internal to `SupabasePresenceTracker`; a fast remount (StrictMode double-invoke, or any real quick remount) now transparently reuses the same live channel instead of racing a teardown, so `usePresence`'s mount effect proceeds normally instead of crashing.

## Testing

`src/tests/infrastructure/realtime/presence-tracker.test.ts` gets a new `describe('SupabasePresenceTracker', ...)` block (the existing `MockPresenceTracker` tests stay — they test a different, legitimate fake used elsewhere, not a stand-in for this class) exercising the real class against a mocked Supabase client (`vi.fn()` for `channel`, `on`, `subscribe`, `untrack`, `unsubscribe`, `presenceState`) with `vi.useFakeTimers()`:
- A second `subscribe()` call for the same `quizId` within the grace period does not call `.on()`/`.subscribe()` again, and reuses the same channel object.
- A second `subscribe()` call after the grace period has elapsed (and the prior `unsubscribe()` closure fired) creates a fresh channel and rebinds listeners.
- Updated `onSync`/`onJoin`/`onLeave` callbacks from a reuse-within-grace-period call are the ones actually invoked when a presence event fires afterward (proves the mutable-handlers indirection works).
- `unsubscribe()`'s grace-period timer, once it elapses uncancelled, calls `channel.untrack()` then `channel.unsubscribe()`.

## Error handling / residual risk

A small window remains: if a new `subscribe()` for the same `quizId` lands in the (typically sub-100ms) gap between "grace timer fires and deletes the map entry" and "the async `untrack()`/`unsubscribe()` network round-trip actually completes," `client.channel()` would hand back the same not-yet-fully-released channel object from Supabase's own internal registry, and the original crash could recur — just far less likely than today (requires a coincidence after a 3s idle window, vs. today's ~0ms-guaranteed collision on every mount). Closing this fully would require making `subscribe()` async, which breaks its documented synchronous-return contract and `usePresence`'s effect-based usage — disproportionate to the residual likelihood. Documented as an accepted trade-off, not engineered around.

A real tab-close/navigate-away during the grace window means the deferred client-side `untrack()`/`unsubscribe()` never runs — no worse than today (already async, just now delayed slightly longer), and this is exactly the gap the DB-persisted `lastSeenAt` heartbeat (fixed in PR #58) exists to backstop.

## Risk / rollout

Low-to-moderate risk — unlike the purely additive provider-mounting fix, this changes real subscription/timer logic, so it's backed by new, real unit tests plus a manual re-verification that joining no longer crashes and the deferred `PresenceTrackerProvider` Task 3 verification can finally complete. No feature flag needed: if the grace-period logic were subtly wrong, the worst case reproduces today's known crash rather than introducing a new failure mode.

## Decision Log

**Decision: grace-period channel reuse (Approach 1) over synchronous `teardown()` or never-cleanup**
Traced Supabase's `realtime-js` source and confirmed `RealtimeClient.channel(topic)` dedupes by topic internally, with removal tied to an async close handshake — ruling out a simple synchronous-map-delete fix. Considered calling the channel's synchronous `teardown()` before recreating (Approach 2), but couldn't fully confirm from source that it synchronously detaches from Supabase's internal registry, and Approach 1 additionally fixes real-world fast remounts (not just the specific StrictMode trigger observed), so it was preferred. Considered never tearing down at all (Approach 3) — rejected since it leaves channels alive indefinitely with no real cleanup path, which the grace-period approach avoids at similar implementation cost.

**Decision: accept the residual in-flight-teardown race rather than making `subscribe()` async**
Would require changing `IPresenceTracker.subscribe()`'s synchronous contract and `usePresence`'s effect-based consumption of it. The residual window is a coincidence of timing after a 3-second idle period, several orders of magnitude less likely than today's guaranteed collision — not worth the interface churn.

**Decision: add real `SupabasePresenceTracker` unit tests instead of only fixing the bug**
The existing test file's `MockPresenceTracker`-only coverage is precisely why this bug (and the shared-failure-counter bug found in PR #58's final review) went undetected. Adding real tests against the actual class, mocking only the Supabase client boundary, closes this specific coverage gap going forward.
