# Player Kick & Auto-Remove

**Date:** 2026-05-05
**Status:** ✅ Complete
**Branch:** `feat/kick-player`
**Plan:** [plans/2026-05-05-player-kick-and-auto-remove.md](../plans/2026-05-05-player-kick-and-auto-remove.md)

---

## Summary

Implemented the full player removal system: a host can manually kick any player at any time, and the system auto-removes players who have been disconnected for 5+ minutes while the host's browser is open. Kicked/removed players receive an immediate realtime notification and are redirected to the join page.

Final state: 413 tests passing, lint clean, build passing, manual kick flow verified.

---

## What Was Built

### Domain — `PlayerStatus.Removed` + `removeFromGame()`

Added `Removed = 'Removed'` to the `PlayerStatus` enum on the `Player` entity. Added `removeFromGame(reason: 'kicked' | 'timeout'): void` which:
- Throws if the player is already `Removed` (idempotency guard)
- Sets `this.status = PlayerStatus.Removed` and stores the reason

**Decision: Soft delete via `Removed` status, not hard delete.** Keeps answer history and scores intact for audit purposes. Simpler than cascade-deleting in Prisma. A `Removed` player is invisible to the game but the DB row remains.

### Infrastructure — Prisma schema

Added `Removed` to the `PlayerStatus` enum in `schema.prisma`. Migration: `add_removed_player_status`. Required `yarn prisma:generate` to regenerate the client.

### Application — `RemovePlayerUseCase`

New use case at `src/application/use-cases/remove-player.use-case.ts`:
1. Find player by `playerId` — throw if missing
2. Validate `player.quizId === quizId` — throw `'Player not found'` if mismatch (prevents cross-quiz removals)
3. Call `player.removeFromGame(reason)`
4. Save via `playerRepository.save(player)`

Also patched `AddPlayerUseCase` name-duplicate check to exclude `Removed` players, so a removed player can rejoin with the same name under the same join code and get a fresh `playerId`.

`GetQuizStateUseCase` updated to filter out `Removed` players before mapping to `QuizDTO` — they no longer appear in the lobby, question view, or results.

### Realtime — `broadcastPlayerKicked()`

Added to `src/infrastructure/realtime/broadcast-player-events.ts`. Sends a `player:kicked` event on the private `player:{quizId}:{playerId}` channel with payload `{ reason: 'kicked' | 'timeout' }`.

**Decision: Private per-player channel** (not the quiz-wide channel). Only the affected player receives the event. Reuses the existing `player:{quizId}:{playerId}` pattern established for `answer:ack` in R5.

### API — `DELETE /api/quiz/[quizId]/player/[playerId]`

Added `DELETE` export to the existing player route file. Accepts optional `{ reason?: 'kicked' | 'timeout' }` body (defaults to `'kicked'`). Calls `playerService.removePlayer()` then `broadcastPlayerKicked()`.

### Player UI — `player:kicked` handling

`usePlayerSession` now listens on the private channel for `player:kicked`. On receipt: redirects to `/join?kicked=true`.

The join page reads `?kicked=true` from `searchParams` and shows an amber banner: "You were removed from the game by the host." The banner is display-only — no state stored; navigating away clears it naturally.

### Host UI — Kick button + auto-remove

`useHostQuizPlayers` exposes:
- `kickPlayer(playerId)` — mutation calling `DELETE /api/quiz/{quizId}/player/{playerId}` with `reason: 'kicked'`; invalidates the player status query on success
- `isKicking: boolean` — pending state for button feedback

Auto-removal loop added to the polling `onSuccess` callback:
- Threshold: 5 minutes of `connectionStatus === 'disconnected'`
- Guarded by a `Set` ref (`autoRemovedRef`) to prevent duplicate DELETE calls across poll cycles
- On trigger: calls the same removal mutation with `reason: 'timeout'`

`PlayerListWithStatus` component gained a "Kick" button per player row (destructive variant, disabled while `isKicking`).

**Decision: Auto-remove is host-side (polling loop), not server-side (cron/background job).** Avoids background job infrastructure. Acceptable trade-off: auto-removal only runs while the host's browser tab is open — but a host must be present for the game to run anyway.

**Decision: `Set` ref for auto-remove dedup.** A plain `useRef<Set<string>>` persists across re-renders without triggering them. Prevents the 5s polling loop from calling DELETE multiple times on the same player before the query invalidation removes them from the list.

---

## Key Commits

| Hash | Message |
|------|---------|
| `cccd885` | feat: implement player kick and auto-remove functionality |
| `2eff320` | feat: add Removed player status and removeFromGame domain method |
| `39e46d7` | feat: application layer - RemovePlayerUseCase, rejoin fix, Removed filter |
| `bb6961f` | feat: realtime broadcast and DELETE API for player removal |
| `ddf74f0` | feat: player UI - handle player:kicked event and show removal message |
| `2b2fdf4` | feat: host UI - auto-remove disconnected players and kick button |
| `c197f8c` | fix: add Removed to PlayerStatusDTO and fix next-env.d.ts quotes |
| `76c0314` | fix: exclude Removed players from quiz state DTO |

---

## Files Changed

### New
| File | Purpose |
|------|---------|
| `src/application/use-cases/remove-player.use-case.ts` | Core removal logic |
| `src/tests/application/use-cases/remove-player.use-case.test.ts` | Use case tests |

### Modified (key files)
| File | Change |
|------|--------|
| `src/domain/entities/player.ts` | `Removed` status + `removeFromGame()` |
| `src/infrastructure/database/prisma/schema.prisma` | `Removed` added to `PlayerStatus` enum |
| `src/application/use-cases/add-player.use-case.ts` | Exclude `Removed` from name conflict check |
| `src/application/use-cases/get-quiz-state.use-case.ts` | Filter `Removed` players from QuizDTO |
| `src/infrastructure/realtime/broadcast-player-events.ts` | `broadcastPlayerKicked()` |
| `src/app/api/quiz/[quizId]/player/[playerId]/route.ts` | `DELETE` handler |
| `src/hooks/use-player-session.ts` | `player:kicked` event handler + redirect |
| `src/hooks/use-host-quiz-players.ts` | Auto-remove loop + `kickPlayer` mutation |
| `src/components/host/player-list-with-status.tsx` | Kick button per row |

---

## Verification

| Check | Result |
|-------|--------|
| `yarn test` | ✅ 413 tests passing |
| `yarn build` | ✅ Passes |
| `yarn lint` | ✅ 0 errors |
| Manual kick flow | ✅ Verified end-to-end in browser |
| Rejoin after kick | ✅ Verified — removed player can rejoin with same join code |

---

## Post-merge Hotfix

After the initial PR merge, `GetQuizStateUseCase` still exposed `Removed` players in the quiz state DTO because the filter was missing. Fixed in `76c0314` with a new test covering the filter behaviour.

Similarly, `PlayerStatusDTO` was missing the `Removed` variant — fixed in `c197f8c`.
