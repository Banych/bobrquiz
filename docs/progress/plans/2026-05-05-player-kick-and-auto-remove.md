# Player Kick & Auto-Remove

**Date Created:** 2026-05-05
**Status:** ✅ Complete
**Estimated Time:** ~4.5 hours
**Branch:** fix/game-lifecycle-ux
**Depends on:** R6 Phase 3.5 ✅

---

## Overview

Currently, there is no way to remove a player from a quiz once they have joined. If a player disconnects and never comes back, they remain in the lobby/game indefinitely. The host also has no manual control over which players are in the session.

**What is missing:**
- A `Removed` player status in the domain (currently only `Active | Disconnected | Finished`)
- A `RemovePlayerUseCase` and corresponding API endpoint (`DELETE /api/quiz/[quizId]/player/[playerId]`)
- A `player:kicked` realtime event so removed players receive an immediate redirect
- Auto-removal logic on the host polling hook (5-minute timeout for disconnected players)
- A "Kick" button in the host player list component
- Player UI handling for the kicked event (redirect + message)
- Rejoin support — name duplicate check must skip `Removed` players

**Design decisions confirmed with user:**
| Decision              | Choice                                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| Auto-remove threshold | 5 minutes (separate from the 120s "disconnected" display threshold)              |
| Removal type          | Soft delete — new `Removed` status, data kept                                    |
| Kick scope            | Any time — lobby and during active game                                          |
| Auto-remove trigger   | Host-side — polling hook detects expired players, calls DELETE                   |
| Player notification   | Yes — `player:kicked` realtime event redirects their UI                          |
| Rejoin after kick     | Yes — same join code works; `Removed` players excluded from name duplicate check |

---

## Goals

- [ ] Add `Removed` status to Player domain entity
- [ ] Create use case and API endpoint to remove a player
- [ ] Broadcast `player:kicked` realtime event to notify the removed player
- [ ] Auto-remove players who have been disconnected for 5+ minutes (host polling)
- [ ] Allow host to manually kick any player with a "Kick" button
- [ ] Redirect kicked player's UI with an informative message
- [ ] Allow removed players to rejoin with the same join code

---

## Implementation Steps

### Step 1 — Domain: `Removed` status + `removeFromGame()` method · Small

**Files:** `src/domain/entities/player.ts`, `src/tests/domain/entities/player.test.ts`

- [ ] Add `Removed = 'Removed'` to `PlayerStatus` enum
- [ ] Add `removeFromGame(reason: 'kicked' | 'timeout'): void` method
  - Throws if `this.status === PlayerStatus.Removed` (idempotency guard)
  - Sets `this.status = PlayerStatus.Removed`
- [ ] Write domain tests:
  - `removeFromGame('kicked')` from Active → status becomes Removed
  - `removeFromGame('timeout')` from Disconnected → status becomes Removed
  - `removeFromGame()` on already-Removed player → throws
- [ ] Run `yarn test` ✅

---

### Step 2 — Infrastructure: Prisma schema migration · Small

**Files:** `src/infrastructure/database/prisma/schema.prisma`

- [ ] Add `Removed` to `enum PlayerStatus { Active Disconnected Finished Removed }`
- [ ] Run `yarn prisma:migrate` — name migration `add_removed_player_status`
- [ ] Run `yarn prisma:generate`
- [ ] Verify generated client includes `Removed` variant
- [ ] Run `yarn test` ✅ (existing tests should still pass)

---

### Step 3 — Application: `RemovePlayerUseCase` · Small

**New file:** `src/application/use-cases/remove-player.use-case.ts`

```typescript
// Input: { playerId: string; quizId: string; reason: 'kicked' | 'timeout' }
// 1. Find player by playerId — throw 'Player not found' if missing
// 2. Validate player.quizId === quizId — throw 'Player not found' if mismatch
// 3. Call player.removeFromGame(reason)
// 4. Save via playerRepository.save(player)  (or updateStatus equivalent)
// 5. Return { playerId, quizId, reason }
```

- [ ] Create `remove-player.use-case.ts` with class `RemovePlayerUseCase`
- [ ] Add `removePlayer(playerId, quizId, reason)` method to `PlayerService`
  - File: `src/application/services/player-service.ts`
  - Instantiates and calls `RemovePlayerUseCase`
- [ ] Wire `RemovePlayerUseCase` into service factory
  - File: `src/application/services/factories.ts` (check if explicit wiring is needed)
- [ ] Write tests in `src/tests/application/use-cases/remove-player.use-case.test.ts`:
  - Success: `reason: 'kicked'` — player status becomes `Removed`
  - Success: `reason: 'timeout'` — player status becomes `Removed`
  - Error: player not found — throws `'Player with ID … not found'`
  - Error: player belongs to different quiz — throws `'Player not found'`
  - Error: player already `Removed` — throws (propagated from domain)
- [ ] Run `yarn test` ✅

---

### Step 4 — Application: Fix name duplicate check for rejoin · Small

**File:** `src/application/use-cases/add-player.use-case.ts`

Currently, when a player tries to join with the same name as an existing player, it throws. A `Removed` player must not count as a name conflict so they can rejoin.

- [ ] Find the duplicate-name check (likely a `listPlayersForQuiz` + filter)
- [ ] Exclude players with `status === PlayerStatus.Removed` from the name conflict check
- [ ] Update relevant tests to cover rejoin scenario (removed player name is available again)
- [ ] Run `yarn test` ✅

---

### Step 5 — Application: Exclude `Removed` from player status list · Small

**Files:** `src/application/use-cases/get-player-connection-status.use-case.ts` (or wherever players are filtered for the host status endpoint)

- [ ] Ensure `Removed` players are **not** returned by `GET /api/quiz/[quizId]/players/status`
- [ ] Also ensure `GET /api/quiz/[quizId]/players` excludes `Removed` players (or confirm this is already filtered at the repository query level)
- [ ] Update tests to assert removed players are absent from the list
- [ ] Run `yarn test` ✅

---

### Step 6 — Realtime: `broadcastPlayerKicked` · Small

**File:** `src/infrastructure/realtime/broadcast-player-events.ts`

- [ ] Add `broadcastPlayerKicked(quizId: string, playerId: string, reason: 'kicked' | 'timeout'): Promise<void>`
  - Uses channel `player:{quizId}:{playerId}`
  - Event name: `player:kicked`
  - Payload: `{ reason: 'kicked' | 'timeout' }`
- [ ] Run `yarn test` ✅ (no new tests needed — broadcast functions are thin wrappers; covered by integration)

---

### Step 7 — API: `DELETE /api/quiz/[quizId]/player/[playerId]` · Small

**File:** `src/app/api/quiz/[quizId]/player/[playerId]/route.ts`

Add a `DELETE` export to the existing file (which currently only has `GET`):

```typescript
// Body (optional): { reason?: 'kicked' | 'timeout' }  — defaults to 'kicked'
// 1. await params; validate quizId + playerId
// 2. Parse optional body for reason
// 3. playerService.removePlayer(playerId, quizId, reason)
// 4. broadcastPlayerKicked(quizId, playerId, reason)
// 5. return NextResponse.json({ success: true })
// Errors: 404 if not found, 400 for other errors
```

- [ ] Add `DeleteBodySchema` zod schema (optional `reason` field, default `'kicked'`)
- [ ] Implement `DELETE` handler following the standard error-mapping pattern
- [ ] Run `yarn test` ✅

---

### Step 8 — Player UI: Handle `player:kicked` event · Small

**File:** `src/hooks/use-player-session.ts`

The player private channel already listens for `answer:ack`. Add a handler for the new `player:kicked` event.

- [ ] Import `useRouter` from `next/navigation` (check if already imported)
- [ ] In the `player:{quizId}:{playerId}` subscription block, add handler:
  ```typescript
  channel.on('broadcast', { event: 'player:kicked' }, () => {
    router.push(`/join/${quizId}?kicked=true`);
  });
  ```
  - Adjust the join URL to match the actual player entry route
- [ ] Run `yarn test` ✅

---

### Step 9 — Player UI: Kicked message on join page · Small

**File:** Player join/entry page (find the correct page under `src/app/(player)/`)

- [ ] Read `searchParams` for `kicked=true`
- [ ] If present, display a destructive toast or inline banner: **"You were removed from the game by the host."**
- [ ] The message should not persist after the player re-joins or navigates away (clear param on mount)
- [ ] Run `yarn test` ✅

---

### Step 10 — Host: Auto-removal in `useHostQuizPlayers` · Medium

**File:** `src/hooks/use-host-quiz-players.ts`

- [ ] Add constant: `const AUTO_REMOVE_THRESHOLD_MS = 5 * 60 * 1000` (5 minutes)
- [ ] Create a `useRef<Set<string>>` called `autoRemovedRef` to track player IDs already triggered for auto-removal (prevents duplicate calls across polling intervals)
- [ ] Add `removePlayerMutation` (`useMutation`) that calls `DELETE /api/quiz/{quizId}/player/{playerId}` with `{ reason: 'timeout' }`
- [ ] After each successful poll result, iterate players:
  ```
  for each player where connectionStatus === 'disconnected':
    if lastSeenAt is older than AUTO_REMOVE_THRESHOLD_MS AND playerId not in autoRemovedRef:
      autoRemovedRef.current.add(playerId)
      removePlayerMutation.mutate({ playerId, reason: 'timeout' })
  ```
- [ ] On successful mutation: invalidate `playerConnectionStatusQueryKey(quizId)` to refresh the list
- [ ] Run `yarn test` ✅

---

### Step 11 — Host: Kick button in player list · Small

**File:** `src/hooks/use-host-quiz-players.ts` + `src/components/host/player-list-with-status.tsx`

- [ ] In `useHostQuizPlayers`, expose a `kickPlayer(playerId: string): void` function backed by `useMutation`:
  - Calls `DELETE /api/quiz/{quizId}/player/{playerId}` with `{ reason: 'kicked' }`
  - On success: invalidates player status query
  - Expose `isKicking: boolean` (mutation pending state) for UI feedback
- [ ] In `player-list-with-status.tsx`:
  - Accept `onKick?: (playerId: string) => void` prop (or consume hook directly — decide based on existing component pattern)
  - Add a small "Kick" button (`variant="destructive"` or icon button) per player row
  - Disable button while `isKicking` is true for that player
  - Show a confirmation prompt or use a simple click (decide based on UX — simple click is fine given the player gets a notification)
- [ ] Run `yarn test` ✅

---

## Technical Decisions

### Soft delete via `Removed` status (not hard delete)
Keeps answer history and scores intact, which is important for audit and potential dispute resolution. Also simpler — no cascade-delete concerns in Prisma. A player marked `Removed` is invisible to the host list and cannot conflict with a rejoin attempt.

### Auto-remove is host-side, not server-side
Avoids background jobs/cron infrastructure. The host is already polling every 5 seconds via `useHostQuizPlayers`. The downside is auto-removal only happens while the host's browser is open, but this is acceptable since a host must be present for the game to be running.

### `player:kicked` event on private channel
Reuses the existing `player:{quizId}:{playerId}` broadcast pattern. The kicked player's browser receives the event and redirects before the server-side state is even fully propagated, giving a snappy UX. Players who are already disconnected (no active browser tab) will simply find they can't rejoin with the old playerId but can rejoin fresh via the join code.

### Auto-remove guard (`Set` ref)
Prevents the polling loop from calling DELETE on the same player multiple times before the query invalidation flushes the player out of the list. The ref persists across re-renders without triggering them.

### Rejoin via same join code
A `Removed` player is excluded from the name-duplicate check in `AddPlayerUseCase`. When they re-join, they get a new `playerId` (CUID) and start fresh with `score: 0`. Their old `Removed` record remains in the DB untouched.

---

## Success Criteria

### Functional
- [ ] Host can click "Kick" on any player in the player list at any point (lobby, active game)
- [ ] Kicked player's browser immediately navigates to the join page with a "You were removed" message
- [ ] Kicked player disappears from the host's player list within the next poll cycle (≤5s)
- [ ] A player disconnected for 5+ minutes is auto-removed while the host's browser is open
- [ ] Auto-removed player's browser receives the same redirect + message as a manually kicked player
- [ ] A removed player can re-join using the quiz join code and start fresh

### Non-functional
- [ ] `yarn test` passes after every step (no regressions)
- [ ] `yarn build` succeeds
- [ ] TypeScript `strict` mode — no `any` types introduced
- [ ] No new N+1 DB queries — removal is a single row update
- [ ] Auto-remove does not spam the API (guarded by `Set` ref)

---

## Files Changed

### New
| File                                                             | Purpose            |
| ---------------------------------------------------------------- | ------------------ |
| `src/application/use-cases/remove-player.use-case.ts`            | Core removal logic |
| `src/tests/application/use-cases/remove-player.use-case.test.ts` | Use case tests     |

### Modified
| File                                                                 | Change                                             |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `src/domain/entities/player.ts`                                      | Add `Removed` status + `removeFromGame()` method   |
| `src/infrastructure/database/prisma/schema.prisma`                   | Add `Removed` to `PlayerStatus` enum               |
| `src/application/use-cases/add-player.use-case.ts`                   | Exclude `Removed` from name duplicate check        |
| `src/application/services/player-service.ts`                         | Add `removePlayer()` method                        |
| `src/application/services/factories.ts`                              | Wire `RemovePlayerUseCase` (if needed)             |
| `src/application/use-cases/get-player-connection-status.use-case.ts` | Filter out `Removed` players                       |
| `src/infrastructure/realtime/broadcast-player-events.ts`             | Add `broadcastPlayerKicked()`                      |
| `src/app/api/quiz/[quizId]/player/[playerId]/route.ts`               | Add `DELETE` handler                               |
| `src/hooks/use-player-session.ts`                                    | Handle `player:kicked` realtime event              |
| `src/hooks/use-host-quiz-players.ts`                                 | Auto-removal logic + `kickPlayer` mutation         |
| `src/components/host/player-list-with-status.tsx`                    | "Kick" button per player row                       |
| Player join/entry page (TBD path)                                    | Show "removed from game" message on `?kicked=true` |
| Existing domain/use-case/repo tests                                  | Update for `Removed` status where affected         |

---

## Time Estimates

| Step      | Task                                     | Estimate       |
| --------- | ---------------------------------------- | -------------- |
| 1         | Domain: Removed status + method + tests  | 20 min         |
| 2         | Prisma schema migration                  | 10 min         |
| 3         | RemovePlayerUseCase + tests              | 30 min         |
| 4         | Fix name duplicate check for rejoin      | 20 min         |
| 5         | Exclude Removed from status list         | 15 min         |
| 6         | broadcastPlayerKicked                    | 10 min         |
| 7         | DELETE API route                         | 20 min         |
| 8         | Player UI: handle player:kicked          | 15 min         |
| 9         | Player UI: kicked message on join page   | 20 min         |
| 10        | Host: auto-removal in useHostQuizPlayers | 30 min         |
| 11        | Host: kick button in player list         | 30 min         |
| —         | Buffer (unexpected issues, test fixes)   | 30 min         |
| **Total** |                                          | **~4.5 hours** |

---

## Notes & Observations

*(Fill in during implementation)*

---

## Completion Checklist

- [ ] All 11 steps checked off above
- [ ] `yarn test` passes (no regressions)
- [ ] `yarn build` succeeds
- [ ] No TypeScript errors (`yarn lint`)
- [ ] Manual verify: host kick works end-to-end in browser
- [ ] Manual verify: auto-remove triggers after threshold (test with low threshold)
- [ ] Manual verify: kicked player sees "removed" message and can rejoin
- [ ] `docs/progress/dev-notes.md` updated with brief note
