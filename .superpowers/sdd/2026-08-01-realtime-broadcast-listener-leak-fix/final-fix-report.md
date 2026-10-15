# Final Cleanup Pass — Realtime Broadcast-Listener Leak Fix

Branch: `fix/realtime-broadcast-listener-leak`
Base commits reviewed: `e4e123c` (dispatcher-registry fix), `fff176c` (usePlayerSession queryKey memoization)
This pass: closes 2 Important findings from the final whole-branch review, before merge.

Commits produced by this pass:
- `56487a5` — fix: make regression test mock accumulate bindings instead of replacing them
- `6c8478b` — docs: record realtime broadcast-listener leak fix plan and session

---

## Finding 1 (Important): regression test suite didn't guard the bug it names

### Root causes (as diagnosed by the reviewer)

1. `createMockChannel`'s `on` handler stored callbacks in `Map<event, callback>` — last write wins. Real `@supabase/realtime-js` `.on()` appends to a `bindings` array. A mock that discards stacked bindings can never observe a stacked-bindings bug.
2. The original "regression" test's loop called `unsubscribe()` on the *only* subscription each iteration, dropping `listenerCount` to 0 and fully tearing down/recreating the channel every time — never reproducing the actual incident's shape (a second, still-active subscriber, e.g. `player:kicked`, keeping the channel alive while a *different* effect churned `answer:ack` subscriptions on top of it).

### Fix applied

**(a) Mock storage changed from Map<event, callback> to Map<event, callback[]>**, with `emit()` invoking every registered callback for that event:

```ts
const listeners = new Map<
  string,
  Array<(payload: { payload: unknown }) => void>
>();

on: vi.fn(
  (
    _type: string,
    filter: { event: string },
    callback: (payload: { payload: unknown }) => void
  ) => {
    const bound = listeners.get(filter.event) ?? [];
    bound.push(callback);
    listeners.set(filter.event, bound);
  }
),

emit: (event, payload) => {
  listeners.get(event)?.forEach((callback) => callback({ payload }));
},
```

**(b) Regression test rewritten** to add a stable second subscription on a *different* event (`player:kicked`) first — mirroring `use-player-session.ts`'s actual stable subscription that kept the channel's `listenerCount` above zero — then churn subscribe/unsubscribe on `answer:ack` five times with fresh closures each time (simulating non-memoized effect re-runs), then assert that only the last handler fired and every earlier (stale) handler from the churn never fired again. File: `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts`, test name: `regression: repeated subscribe/unsubscribe churn on the same (channel, event) -- as happens every second while a countdown timer re-renders a component -- never leaves stale handlers firing`.

### Verification: test fails against old code, passes against fixed code

Procedure:
1. Confirmed the updated test file passes in full against the current (fixed) `supabase-realtime-client.ts`.
2. Temporarily replaced `src/infrastructure/realtime/supabase-realtime-client.ts` with the pre-fix version from `git show 404baa1:src/infrastructure/realtime/supabase-realtime-client.ts` (adding only the `export` keyword to the class, since the old version wasn't exported and the test imports it by name — the old logic itself was untouched).
3. Ran `yarn test supabase-realtime-client` against that buggy version.
4. Restored the real fix by copying back the working-tree version of `supabase-realtime-client.ts` (confirmed `git diff` against HEAD was empty afterward — the restore was byte-identical to the pre-experiment state).
5. Re-ran `yarn test supabase-realtime-client` — full pass.

**Transcript — against old (buggy) code:**

```
$ yarn test supabase-realtime-client

 RUN  v4.1.5 /home/banykinv/Documents/repos/bobrquiz

 ❯ src/tests/infrastructure/realtime/supabase-realtime-client.test.ts (14 tests | 3 failed) 13ms
     × binds the real channel.on listener only once per (channel, event) pair 3ms
     × stops delivering to a handler after its unsubscribe is called, without affecting others 1ms
     × regression: repeated subscribe/unsubscribe churn on the same (channel, event) -- as happens every second while a countdown timer re-renders a component -- never leaves stale handlers firing 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  ... > binds the real channel.on listener only once per (channel, event) pair
AssertionError: expected "vi.fn()" to be called 1 times, but got 3 times
    expect(channel.on).toHaveBeenCalledTimes(1);

 FAIL  ... > stops delivering to a handler after its unsubscribe is called, without affecting others
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
    expect(handlerA).not.toHaveBeenCalled();

 FAIL  ... > regression: ... never leaves stale handlers firing
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
    expect(staleHandler).not.toHaveBeenCalled();

 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
```

**Transcript — after restoring the real fix:**

```
$ yarn test supabase-realtime-client

 RUN  v4.1.5 /home/banykinv/Documents/repos/bobrquiz

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

`git diff src/infrastructure/realtime/supabase-realtime-client.ts` against HEAD was empty after the restore — the working tree returned to exactly its pre-experiment state before any further changes or commits.

This confirms: the mock's `.on()` fix alone is sufficient to make the pre-existing "stops delivering to a handler after its unsubscribe is called" test a genuine guard (it now fails against buggy code, as the finding predicted, without any change to that test's own assertions), and the rewritten regression test independently fails against the same buggy code and passes against the fix.

---

## Finding 2 (Important): missing repo-mandated documentation

1. **Plan file committed**: `docs/progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md`
   - All Task 1 and Task 2 step checkboxes checked (`- [x]`).
   - All Success Criteria checked except the last one (manual Playwright browser verification), which remains `- [ ]` as instructed — it hasn't been done and is out of scope for this pass.
   - Header changed from `**Status:** 📋 Planning` to `**Status:** 🚧 In Progress (manual verification pending)`.

2. **Session file written**: `docs/progress/sessions/2026-08-01-realtime-broadcast-listener-leak-fix.md`
   - Documents both tasks in the session author's own words, key decisions (summarized from the plan's Decision Log for a session-file audience, not copied verbatim), verification results (test/lint numbers below), files changed, and an Outcomes/Next Steps section covering:
     - Manual browser verification (Success Criterion #5) still pending.
     - The three Minor findings deferred from the final review: the pre-existing teardown race (and how `presence-tracker.ts`'s `UNSUBSCRIBE_GRACE_PERIOD_MS` pattern would close it), the unconditional `listenerCount` decrement on double-unsubscribe (and how a per-subscription token would close it), and test-file hygiene (dead `TestableRealtimeClient`, unused `channelFn`).

3. **dev-notes.md**: appended one bullet dated 2026-08-01 summarizing the fix with a link to the session file, matching the existing append-only bullet-log format.

4. **PROGRESS.md**: added a new `### 2026-08-01: Realtime Broadcast-Listener Leak Fix 🚧` entry at the top of the reverse-chronological Session Notes list (ahead of the existing 2026-07-04 entries), matching the existing Focus/Deliverables/Status/Plan/File bullet structure, status marked 🚧 since manual verification is still outstanding.

---

## Final verification (after all changes)

```
$ yarn test
 Test Files  65 passed | 1 skipped (66)
      Tests  466 passed | 1 skipped (467)

$ yarn lint
✖ 5 problems (0 errors, 5 warnings)
```

The 5 warnings are pre-existing and unrelated to this change (Next.js `<a>`/`<img>` element hints in admin layout / host live view, and anonymous-default-export warnings in `tests/load/*.js` load-test scripts) — 0 errors, lint is clean for merge purposes.

## Commits

```
6c8478b docs: record realtime broadcast-listener leak fix plan and session
56487a5 fix: make regression test mock accumulate bindings instead of replacing them
fff176c refactor(hooks): memoize usePlayerSession queryKey to prevent effect teardown churn
e4e123c fix: bind one realtime channel.on listener per (channel, event) pair
```

## Staged/committed files (exact set)

- `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` (commit `56487a5`)
- `docs/progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md` (commit `6c8478b`, new)
- `docs/progress/sessions/2026-08-01-realtime-broadcast-listener-leak-fix.md` (commit `6c8478b`, new)
- `docs/progress/dev-notes.md` (commit `6c8478b`)
- `docs/progress/PROGRESS.md` (commit `6c8478b`)

`git status` after both commits: working tree clean, nothing else staged or untracked.
