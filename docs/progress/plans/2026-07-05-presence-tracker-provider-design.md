# Presence Tracker Provider Mounting — Design Spec

**Status:** ✅ Complete — merged via [PR #59](https://github.com/Banych/bobrquiz/pull/59)
**Related:** `fix/presence-heartbeat-resilience` (PR #58, merged) — that fix corrected the heartbeat's retry/backoff/circuit-breaker logic, but discovered during manual verification that the heartbeat never runs at all in production, independent of that fix.

## Background

During PR #58's manual (Playwright) verification, joining the demo quiz as a live player produced **zero requests** to `/api/quiz/[quizId]/player/[playerId]/presence` — not even during normal operation, before any failure was simulated. Tracing why:

- `usePresence` (`src/hooks/use-presence.tsx`) gets its `IPresenceTracker` via `usePresenceTracker()`, a React context hook fed by `<PresenceTrackerProvider tracker={...}>`.
- **`PresenceTrackerProvider` is never rendered anywhere in `src/app`.** `usePresenceTracker()` therefore always returns `null`.
- The hook's mount effect does `if (!tracker) return;` **before** starting the heartbeat controller (the thing PR #58 fixed) — so in production today, neither `track()` (Realtime presence) nor `persist()` (the DB write) ever runs, for any player, ever.

This is confirmed to be a genuine oversight, not a deliberate deferral: `PresenceTrackerProvider` and its backing factory `getPresenceTracker()` (`src/infrastructure/realtime/presence-tracker.ts`) were built in Phase 4.1 (commit `e81f631`, Jan 2026) alongside the rest of the presence-tracking foundation. The *other* realtime mechanism in this codebase (broadcast channels for `state:update`/`leaderboard:update`) has its own `RealtimeClientProvider`, correctly mounted app-wide in `src/app/providers.tsx` → `AppProviders` (used by `RootLayout`). `PresenceTrackerProvider` was simply never added alongside it — no session or plan doc ever lists "mount the provider" as a step, and nothing in the codebase or docs indicates it was intentionally left out.

This single missing mount is sufficient, by itself, to fully explain the originally-reported production symptom (players marked away/disconnected quickly despite an open tab): with no heartbeat ever sent, `Player.lastSeenAt` is set once at join and then only ages via wall-clock time, with no refresh, regardless of tab state.

## Scope

**In scope:**
1. Mount `PresenceTrackerProvider` app-wide in `AppProviders`, using the existing `getPresenceTracker()` factory — mirroring exactly how `RealtimeClientProvider` is already mounted there.
2. Harden `usePresenceTracker()` to throw when the provider is missing, matching the sibling `useRealtimeClient()`'s existing fail-loud behavior, so this exact class of bug (a hook silently no-op'ing because its provider was never mounted) can't recur undetected. Extract the throw into a small, pure `assertPresenceTracker` helper so it's unit-testable without rendering (this repo has no jsdom/renderHook infra).
3. Remove the two now-dead `if (!tracker) return` guards in `use-presence.tsx` (lines 128 and 183) that become unreachable once `usePresenceTracker()` can no longer return `null`, and tighten the corresponding type from `IPresenceTracker | null` to `IPresenceTracker`.
4. Run PR #58's deferred Task 4 manual verification for real now that the heartbeat path is reachable, plus a preliminary check that `/presence` requests actually appear at all (the thing that was silently broken).

**Out of scope (non-goals):**
- No changes to `getPresenceTracker()`'s caching, `NoopPresenceTracker` fallback, or Supabase client construction — already correct.
- No changes to the heartbeat controller, retry/backoff/circuit-breaker logic, or cadence — already fixed and verified in PR #58.
- No changes to `useReconnection`, `ConnectionStatusBanner`, or `connection-status.ts`.
- No scoping the provider to only the player route group instead of globally — mounting it in `AppProviders` matches the existing `RealtimeClientProvider` pattern exactly and keeps both realtime mechanisms wired consistently, even though (like `RealtimeClientProvider`) only some routes actually consume it.

## Architecture

Two small, mechanical changes, both following existing patterns exactly:

```
src/app/providers.tsx        — mount PresenceTrackerProvider alongside RealtimeClientProvider
src/hooks/use-presence.tsx   — usePresenceTracker() fails loud; remove now-dead null guards
src/tests/hooks/...          — unit test for the extracted assertPresenceTracker helper
```

### 1. Mount the provider

`AppProviders` (`src/app/providers.tsx`) already does, for the other realtime client:

```tsx
const realtimeClient = useMemo(() => {
  return createSupabaseRealtimeClient() ?? createNoopRealtimeClient();
}, []);

return (
  <RealtimeClientProvider client={realtimeClient}>
    ...
```

The fix adds the same pattern for presence, using the existing `getPresenceTracker()` factory (which already handles the Supabase-env-vars-missing case internally via its own `NoopPresenceTracker` fallback, so no `??` is needed here — unlike the realtime client, there's exactly one factory call):

```tsx
const presenceTracker = useState(getPresenceTracker)[0];

return (
  <PresenceTrackerProvider tracker={presenceTracker}>
    <RealtimeClientProvider client={realtimeClient}>
      ...
```

Since `getPresenceTracker()` itself caches a module-level singleton, `useState(getPresenceTracker)` (lazy initializer form) guarantees the factory runs once per component instance without needing a `useMemo` dependency array — consistent with how `AppProviders` already does `useState(createQueryClient)` for the query client just above it.

### 2. Fail loud, not silent

`usePresenceTracker()` currently:

```ts
export const usePresenceTracker = (): IPresenceTracker | null => {
  return useContext(PresenceTrackerContext);
};
```

Becomes:

```ts
export const assertPresenceTracker = (
  tracker: IPresenceTracker | null
): IPresenceTracker => {
  if (!tracker) {
    throw new Error(
      'PresenceTrackerProvider is missing from the component tree.'
    );
  }
  return tracker;
};

export const usePresenceTracker = (): IPresenceTracker => {
  return assertPresenceTracker(useContext(PresenceTrackerContext));
};
```

This mirrors `useRealtimeClient()`'s existing pattern (`src/hooks/use-realtime-client.tsx:22-32`) almost exactly, and — same as PR #58's `presence-heartbeat-controller.ts` extraction — pulls the actual logic-with-a-decision (the throw) into a plain function that can be unit tested directly, without rendering a component.

### 3. Remove dead guards

With `usePresenceTracker()` no longer nullable, `usePresence`'s `tracker` is always a real `IPresenceTracker`. The two guards that existed only to handle a `null` tracker become unreachable:

- `src/hooks/use-presence.tsx:128` — `if (!current.tracker) return;` inside `track()`.
- `src/hooks/use-presence.tsx:183` — `if (!tracker) return;` inside the mount effect.

Both are removed; `latestRef`'s inferred type for `tracker` tightens from `IPresenceTracker | null` to `IPresenceTracker` automatically.

## Error handling

Fail loud at the DI boundary rather than fail silent. If a future refactor ever removes `PresenceTrackerProvider` from `AppProviders` again, any component calling `usePresence` will throw immediately in development/testing, surfacing the regression right away — instead of manifesting as a subtle, hard-to-diagnose production symptom (players aging through connection states for no visible reason), which is exactly what happened here.

This is safe in every environment: `getPresenceTracker()`'s existing fallback to `NoopPresenceTracker` (when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing — local dev without `.env`, CI, etc.) means the provider always has *some* non-null tracker to hand out, real or no-op. The throw path only fires if the provider itself is missing from the tree, not if Supabase is unconfigured.

## Testing

- Unit test the extracted `assertPresenceTracker` helper directly: throws with the expected message when passed `null`; returns the tracker unchanged when passed a valid `IPresenceTracker` (a simple mock object satisfying the interface). Pure function, no rendering needed.
- No changes needed to the existing heartbeat controller tests or `use-presence.test.ts`'s type-contract tests — removing the two dead guards doesn't change any tested behavior.
- No unit test exists (or can reasonably exist without jsdom) for "`AppProviders` actually renders `PresenceTrackerProvider` with a working tracker" — that is an integration/rendering fact, covered by manual verification instead.
- **Manual verification (Playwright, dev server):** join the demo quiz as a player and confirm real `POST /api/quiz/[quizId]/player/[playerId]/presence` requests now appear in the network log within the first ~25s (proving the heartbeat runs at all — the thing that was silently broken). Then run PR #58's originally-planned Task 4 script: simulate a `/presence` 500, confirm `ConnectionStatusBanner` shows "Connection lost. Trying to reconnect...", revert, confirm recovery and the "✓ Reconnected!" toast.

## Risk / rollout

Very low risk. Mounting a provider that was never mounted before is purely additive — it cannot regress any existing behavior, since nothing was depending on the tracker being `null`. The fail-loud change only activates on a code path (missing provider) that, after this fix, should never occur in the running app; it exists purely as a regression guard for the future. No feature flag needed.

## Decision Log

**Decision: mount globally in `AppProviders`, not scoped to the player route group**
Considered adding the provider only within a layout for `(player)/play/[quizId]/[playerId]`, since presence tracking is only consumed by player-facing components. Rejected in favor of matching `RealtimeClientProvider`'s existing global-mount pattern exactly — consistency with the established DI convention in this codebase outweighs the marginal benefit of narrower scoping, and it keeps both realtime mechanisms wired the same way.

**Decision: fail loud (throw) instead of leaving `usePresenceTracker()` nullable**
Considered leaving the hook's nullable return type as-is and only fixing the missing mount. Rejected because the nullable-and-silently-ignored return type is *why* this bug went undetected for as long as it did — the sibling `useRealtimeClient()` already throws in the equivalent situation, and no test or code in this repo relies on `usePresenceTracker()` returning `null`, so hardening it costs nothing and closes off this entire bug class going forward.
