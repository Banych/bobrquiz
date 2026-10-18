# Host and player identity — implementation plan

**Status:** In progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Stop after each task for the user's go-ahead.

**Goal:** Every host action needs a signed-in admin, every player action needs that player's own
server-issued credential, a player can move to another device with the host's approval, the live
screen works signed out, and no browser can send on, or read host or one-player data from, any
realtime channel.

**Architecture:** Two authorization use cases in the container (`authorizeHostUseCase`,
`authorizePlayerUseCase`) are the first call in every host-class and player-class route and
page. They throw an `AccessDeniedError` that a `src/lib` helper turns into 401/403. The player
credential is a random secret in an HttpOnly cookie per quiz, stored as a SHA-256 hash on
`Player`. Device switches are rows in a new `PlayerSwitchRequest` table. Realtime channels become
private: browsers may only receive (a `realtime.messages` select policy), the server sends with
the service role, and host and player topics carry an unguessable key stored on `Quiz` and
`Player`.

**Tech Stack:** Next.js 16 route handlers and server components, Prisma v7 (pg adapter), Supabase
Auth (`@supabase/ssr`) and Realtime (`@supabase/supabase-js`), TanStack Query, zod, Vitest
(node environment), Playwright.

**Spec:** `docs/progress/plans/2026-10-18-host-player-identity-design.md` (approved 2026-10-18).
Realtime evidence: `docs/progress/findings/2026-10-18-realtime-private-channels.md`.

## Global Constraints

- Branch: `fix/host-player-identity`, cut from `design/host-player-identity` (it carries the spec
  and this plan). **Never push it to `origin`.** It goes only to the temporary private fork of
  the host-control advisory, once the user has created it (designer's call 14). Public commit
  messages and PR text must not describe the holes beyond what the public issues already say.
- No AI attribution in commits (no `Co-Authored-By`), Conventional Commits subjects.
- Layer rules from `CLAUDE.md` hold. Routes import `@application/services/factories`,
  `@application/dtos/*`, `@infrastructure/realtime/broadcast-*` and `@lib/*` only.
- Status codes: host-class without an admin session → **401**; with a non-admin session → **403**.
  Player-class without the credential → **401**; another player's credential, a kicked player or a
  switched-away device → **403**. A player removed for inactivity is let back in.
- Error body for 401/403: `{ error: <message>, code: <AccessDeniedCode> }`. Other errors keep the
  existing `{ error }` with `/not found/i` → 404.
- Player secret: `randomBytes(32)` as base64url (256 bits; spec minimum 128). Only
  `sha256(secret)` as hex is stored.
- Player cookie: name `bq_player_{quizId}`, HttpOnly, `SameSite=Lax`, `Secure` unless
  `NODE_ENV === 'development'`, `path=/`, `maxAge` 86 400 s.
  Switch cookie: name `bq_switch_{quizId}`, same flags, `maxAge` 300 s.
- Switch request expiry: **5 minutes** (`SWITCH_REQUEST_TTL_MS = 5 * 60 * 1000`).
- Topics: room `quiz:{quizId}`; host `host:{quizId}:{hostChannelKey}`; player
  `player:{quizId}:{playerChannelKey}`. Every channel, browser and server, is `private: true`.
- Players created before the migration have no credential and cannot act after deployment; no
  fallback (designer's call 3). Deploy between games.
- No new dependencies. Hooks are tested through extracted pure helpers (Vitest runs in `node`
  with no jsdom); hook wiring is covered by e2e.
- Verdicts: `yarn test:run` run by the main session, counts in the ledger. `yarn lint` and
  `yarn build` on every task that touches `src/`.

## Plan-time calls (for the user to check)

The spec left these to the plan. Each is cheap to change before its task starts.

1. **Topic keys are stored, not derived.** `Quiz.hostChannelKey` (filled by the database for
   existing quizzes) and `Player.channelKey` (set at join, replaced at a switch). Deriving them
   with an HMAC would need a new server secret in both deployments. *Data shape.*
2. **A switched-away device gets 403, not 401.** The approve step writes the replaced hash onto
   the switch request (`replacedCredentialHash`), so the old cookie is recognised and answered
   with "You continued on another device." *Data shape:* one nullable column.
3. **A second switch request for the same player is refused** while one is pending, unless it
   comes from the device that made the first (it holds the switch cookie and resumes waiting).
   *Cost:* someone who spams requests blocks the real player for up to 5 minutes, unless the host
   denies the request. *Revisitable.*
4. **Expiry is computed on read.** No job marks rows expired; `Pending` past `expiresAt` reads as
   expired everywhere. *Revisitable.*
5. **Kicked players' names are free again** (today's behaviour). A name lookup ignores kicked
   players, so a new player can take the name; a timed-out player's name still points at their
   seat.
6. **Join outcomes.** `POST /api/session/join` answers `joined`, `resumed` or `switch-pending`.
   The old `{ quiz, player, players }` body stays under the first two.
7. **Host connection changes are not broadcast.** The spec lists them for the host topic, but
   nothing broadcasts them today; the dashboard keeps polling `players/status`. The host topic
   carries the full state and switch requests. *Revisitable.*
8. **`POST /api/quiz/start` reads its body before the host check**, because the quiz id is in
   the body. A malformed body gets 400 before 401.
9. **Room state event renamed** `state:update:player` → `state:update:room`. Players and the live
   screen both use it, and it carries `answeredCount` for the live screen.
10. **`RealtimeClient.emit` is removed.** Nothing outside tests calls it, and browsers may not
    send.

## Review Focus

1. **One browser, two quizzes.** Cookies are per quiz, so joining quiz B does not log the browser
   out of quiz A. Pinned in Task 3 (`playerCookieName` differs per quiz) and Task 5 (join for B
   leaves A's cookie alone).
2. **Quiz A's credential on quiz B's routes.** A valid cookie used with another quiz id, or
   another player id, gets 403 `forbidden`. Pinned in Task 3.
3. **A timed-out player rejoins by name on the same device.** They resume and become Active, with
   no host prompt. Pinned in Task 5.
4. **Two approvals racing, or an approval after expiry or after a kick.** Exactly one approval
   wins; the others get "no longer pending", "expired" or "removed". Pinned in Task 7.
5. **The old phone after a switch.** Its next request gets 403 `switched`, and the client sends it
   to `/join?reason=switched` with the message. Pinned in Task 3 (server) and Task 10 (client
   helper).

---

### Task 1: Domain — removal reason and switch request

**Agent:** `implementer`

**Files:**
- Modify: `src/domain/entities/player.ts`
- Create: `src/domain/entities/player-switch-request.ts`
- Test: `src/tests/domain/entities/player.test.ts` (extend or create),
  `src/tests/domain/entities/player-switch-request.test.ts`

**Interfaces:**
- Produces:
  - `export type PlayerRemovalReason = 'kicked' | 'timeout'` in `player.ts`.
  - `Player.removalReason: PlayerRemovalReason | null` (constructor sets `null`).
  - `Player.removeFromGame(reason)` stores the reason (drop `void reason` and update the JSDoc).
  - `Player.isKicked(): boolean` — `status === Removed && removalReason === 'kicked'`.
  - `Player.reactivate(): void` — Removed + `timeout` → Active, reason `null`; throws
    `'Player has been removed from the game.'` when kicked; no-op when not Removed.
  - `Player.credentialHash: string | null`, `Player.channelKey: string | null` (constructor sets
    `null`).
  - In `player-switch-request.ts`: `export enum SwitchRequestStatus { Pending = 'Pending',
    Approved = 'Approved', Denied = 'Denied' }`, `export const SWITCH_REQUEST_TTL_MS = 5 * 60 * 1000`,
    `export type SwitchRequestState = 'pending' | 'approved' | 'denied' | 'expired'`, and
    `class PlayerSwitchRequest` with public `id, quizId, playerId, secretHash, status, createdAt,
    expiresAt, resolvedAt: Date | null, replacedCredentialHash: string | null`;
    `static open(id, quizId, playerId, secretHash, now: Date)` (sets `expiresAt = now + TTL`);
    `stateAt(now: Date): SwitchRequestState`; `approve(now, replacedCredentialHash: string | null)`;
    `deny(now)`. `approve`/`deny` throw `'Switch request is no longer pending.'` unless Pending,
    and `'Switch request has expired.'` when `stateAt(now) === 'expired'`.

- [ ] **Step 1: Write the failing tests**

```ts
// player.test.ts (additions)
const makePlayer = () => new Player('p1', 'Alex', 'quiz-1');

it('stores the removal reason', () => {
  const player = makePlayer();
  player.removeFromGame('timeout');
  expect(player.status).toBe(PlayerStatus.Removed);
  expect(player.removalReason).toBe('timeout');
  expect(player.isKicked()).toBe(false);
});

it('reactivates a timed-out player', () => {
  const player = makePlayer();
  player.removeFromGame('timeout');
  player.reactivate();
  expect(player.status).toBe(PlayerStatus.Active);
  expect(player.removalReason).toBeNull();
});

it('refuses to reactivate a kicked player', () => {
  const player = makePlayer();
  player.removeFromGame('kicked');
  expect(player.isKicked()).toBe(true);
  expect(() => player.reactivate()).toThrow('Player has been removed from the game.');
});

it('leaves an active player alone on reactivate', () => {
  const player = makePlayer();
  player.reactivate();
  expect(player.status).toBe(PlayerStatus.Active);
});
```

```ts
// player-switch-request.test.ts
const now = new Date('2026-10-18T12:00:00.000Z');
const makeRequest = () => PlayerSwitchRequest.open('req-1', 'quiz-1', 'p1', 'hash-new', now);

it('opens pending with a five-minute expiry', () => {
  const request = makeRequest();
  expect(request.status).toBe(SwitchRequestStatus.Pending);
  expect(request.expiresAt.toISOString()).toBe('2026-10-18T12:05:00.000Z');
  expect(request.stateAt(now)).toBe('pending');
});

it('reads as expired after the expiry time', () => {
  expect(makeRequest().stateAt(new Date('2026-10-18T12:05:00.001Z'))).toBe('expired');
});

it('approves and records the replaced hash', () => {
  const request = makeRequest();
  request.approve(now, 'hash-old');
  expect(request.stateAt(now)).toBe('approved');
  expect(request.replacedCredentialHash).toBe('hash-old');
  expect(request.resolvedAt).toEqual(now);
});

it('refuses a second decision', () => {
  const request = makeRequest();
  request.deny(now);
  expect(request.stateAt(now)).toBe('denied');
  expect(() => request.approve(now, null)).toThrow('Switch request is no longer pending.');
});

it('refuses to approve an expired request', () => {
  expect(() => makeRequest().approve(new Date('2026-10-18T12:06:00.000Z'), null)).toThrow(
    'Switch request has expired.'
  );
});
```

- [ ] **Step 2: Run them to see them fail**
  Run: `yarn test:run src/tests/domain/entities/player.test.ts src/tests/domain/entities/player-switch-request.test.ts`
  Expected: FAIL (`removalReason` undefined, module not found).
- [ ] **Step 3: Implement the Interfaces above.**
- [ ] **Step 4: Run the two files, then `yarn test:run`.** Expected: all pass; the counts go
  in the ledger.
- [ ] **Step 5: Commit** `feat(player): store the removal reason and add switch requests`

---

### Task 2: Schema, migration and repositories

**Agent:** `implementer`

**Files:**
- Modify: `src/infrastructure/database/prisma/schema.prisma`
- Create: `src/infrastructure/database/prisma/migrations/<timestamp>_player_identity/migration.sql`
  (generated by `yarn prisma:migrate --create-only --name player_identity`, then read and applied
  with `yarn prisma:migrate`)
- Modify: `src/domain/repositories/player-repository.ts`,
  `src/domain/repositories/quiz-repository.ts`,
  `src/infrastructure/repositories/prisma-player.repository.ts`,
  `src/infrastructure/repositories/prisma-quiz.repository.ts`
- Create: `src/domain/repositories/player-switch-request-repository.ts`,
  `src/infrastructure/repositories/prisma-player-switch-request.repository.ts`
- Test: `src/tests/infrastructure/repositories/prisma-player-repository.test.ts`,
  `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`,
  `src/tests/infrastructure/repositories/prisma-player-switch-request-repository.test.ts`

**Interfaces:**
- Consumes: Task 1's `Player` fields and `PlayerSwitchRequest`.
- Schema:
  - `enum PlayerRemovalReason { kicked timeout }`; `Player.removalReason PlayerRemovalReason?`.
  - `Player.credentialHash String? @unique`; `Player.channelKey String?`.
  - `Quiz.hostChannelKey String @default(dbgenerated("gen_random_uuid()::text"))`, so existing
    rows get a key from the migration and new rows from the database.
  - `enum SwitchRequestStatus { Pending Approved Denied }`.
  - `model PlayerSwitchRequest { id String @id @default(cuid()); quizId String; playerId String;
    secretHash String @unique; status SwitchRequestStatus @default(Pending); createdAt DateTime
    @default(now()); expiresAt DateTime; resolvedAt DateTime?; replacedCredentialHash String?
    @unique; }`, with relations to `Quiz` and `Player` (`onDelete: Cascade`) and
    `@@index([quizId, status])`, `@@index([playerId, status])`.
  - The migration also enables row-level security on `PlayerSwitchRequest`, in the same style as
    `20260703183721_enable_rls_all_tables` (default deny, comment says why).
- `IPlayerRepository` additions:
  - `findByCredentialHash(hash: string): Promise<Player | null>`
  - `setCredential(playerId: string, credential: { credentialHash: string; channelKey: string }): Promise<void>`
  - `findByQuizIdAndName` now ignores kicked players (Prisma
    `NOT: { status: 'Removed', removalReason: 'kicked' }`).
  - `save` writes `removalReason` (create and update) and never writes `credentialHash` or
    `channelKey`. `mapToDomain` reads all three fields with `?? null`.
- `IQuizRepository` addition: `findHostChannelKey(quizId: string): Promise<string | null>`
  (select only that column).
- `IPlayerSwitchRequestRepository`:
  - `create(request: PlayerSwitchRequest): Promise<void>`
  - `findById(id: string): Promise<PlayerSwitchRequest | null>`
  - `findBySecretHash(hash: string): Promise<PlayerSwitchRequest | null>`
  - `findByReplacedCredentialHash(hash: string): Promise<PlayerSwitchRequest | null>`
  - `findPendingForPlayer(playerId: string, now: Date): Promise<PlayerSwitchRequest | null>`
    (status Pending and `expiresAt > now`)
  - `listPendingForQuiz(quizId: string, now: Date): Promise<PlayerSwitchRequest[]>`, oldest
    first
  - `deny(request: PlayerSwitchRequest): Promise<boolean>`: conditional update `where { id,
    status: 'Pending' }` → `count === 1`
  - `approve(request: PlayerSwitchRequest, credential: { credentialHash: string; channelKey: string }): Promise<boolean>`:
    one `$transaction`. Conditional `updateMany` of the request `where { id, status: 'Pending' }`
    (status, resolvedAt, replacedCredentialHash). If the count is 0, it returns `false` and
    writes nothing else. Otherwise it updates the player's `credentialHash` and `channelKey`.

- [ ] **Step 1: Write the failing repository tests** with the `vi.hoisted` plus
  `vi.mock('@infrastructure/database/prisma/client', …)` pattern from
  `prisma-player-repository.test.ts`, mocks reset in `beforeEach`. Required cases, with
  assertions on the exact Prisma arguments:
  - player: `findByCredentialHash` calls `findUnique({ where: { credentialHash: 'h' } })` and
    maps `removalReason`, `credentialHash`, `channelKey`; `setCredential` calls `update` with
    exactly those two fields; `save` sends `removalReason: 'timeout'` and no credential keys
    (`expect(Object.keys(args.update)).not.toContain('credentialHash')`);
    `findByQuizIdAndName` includes the `NOT` clause.
  - quiz: `findHostChannelKey` returns the column and returns `null` for a missing quiz.
  - switch requests: `approve` returns `false` and makes no `player.update` call when
    `updateMany` reports `{ count: 0 }`; it returns `true` and updates the player inside the
    transaction when the count is 1. `deny` follows the same count rule. `findPendingForPlayer`
    filters on `expiresAt: { gt: now }`.
- [ ] **Step 2: Run them to see them fail** (`yarn test:run src/tests/infrastructure/repositories`).
- [ ] **Step 3: Edit the schema and run `yarn prisma:migrate --create-only --name player_identity`.**
  Read the SQL. It must add nullable columns and the defaulted `hostChannelKey` without dropping
  anything. Then run `yarn prisma:migrate` (applies to the dev database) and `yarn prisma:generate`.
  If the shadow database refuses `gen_random_uuid()`, record it in the ledger and stop for the
  user.
- [ ] **Step 4: Implement the repositories.** Wire the new repository in `getRepositories()` in
  `factories.ts` (no container key yet).
- [ ] **Step 5: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 6: Commit** `feat(db): add player credentials and switch requests`

---

### Task 3: Authorization use cases and helpers

**Agent:** `implementer`

**Files:**
- Create: `src/application/errors/access-denied-error.ts`
- Create: `src/application/ports/session-user-reader.ts`
- Create: `src/application/services/player-credential.ts`
- Create: `src/application/dtos/access.dto.ts`
- Create: `src/application/use-cases/authorize-host.use-case.ts`,
  `src/application/use-cases/authorize-player.use-case.ts`
- Create: `src/infrastructure/auth/supabase-session-user-reader.ts`
- Create: `src/lib/api/access-error-response.ts`, `src/lib/player-cookie.ts`
- Modify: `src/application/services/factories.ts` (container keys `authorizeHostUseCase`,
  `authorizePlayerUseCase`)
- Modify: `src/tests/app/api/quiz-routes.test.ts`, `src/tests/app/api/lock-question-route.test.ts`
  (add the new keys to their mocked containers)
- Test: `src/tests/application/use-cases/authorize-host.use-case.test.ts`,
  `src/tests/application/use-cases/authorize-player.use-case.test.ts`,
  `src/tests/application/services/player-credential.test.ts`,
  `src/tests/infrastructure/auth/supabase-session-user-reader.test.ts`,
  `src/tests/lib/access-error-response.test.ts`, `src/tests/lib/player-cookie.test.ts`

**Interfaces:**
- Consumes: Task 2 repositories.
- `AccessDeniedError extends Error`: `name = 'AccessDeniedError'`; `readonly code:
  AccessDeniedCode` (`'unauthenticated' | 'forbidden' | 'kicked' | 'switched'`); `readonly status:
  401 | 403` (401 only for `unauthenticated`); `constructor(code, message)`.
- `SessionUser = { id: string; email: string | null; isAdmin: boolean }`;
  `interface ISessionUserReader { getCurrentUser(): Promise<SessionUser | null> }`.
- `player-credential.ts`: `generatePlayerSecret(): string` (32 random bytes, base64url);
  `hashPlayerSecret(secret: string): string` (sha256 hex); `generateChannelKey(): string`
  (16 random bytes, hex).
- `access.dto.ts` (zod schemas plus inferred types): `HostAccessDTO = { userId: string;
  hostChannelKey: string }`, `PlayerAccessDTO = { quizId: string; playerId: string;
  playerChannelKey: string }`.
- `AuthorizeHostUseCase(sessionUserReader, quizRepository)`:
  - `execute(quizId: string): Promise<HostAccessDTO>`. Checks the user first (no user → 401
    `'Sign in to host this quiz.'`; the rule says no → 403 `'Only admins can host quizzes.'`),
    then reads the key. A missing quiz throws `` `Quiz with ID ${quizId} not found.` ``.
  - `ensureHostUser(): Promise<{ userId: string }>`, for `/host`, with the same two errors.
  - One private `mayHost(user: SessionUser, quizId: string | null): boolean` returning
    `user.isAdmin`. This is the single hosting rule; owner checks replace its body later.
- `AuthorizePlayerUseCase(playerRepository, switchRequestRepository)`:
  `execute({ quizId, playerId, secret }: { quizId: string; playerId: string; secret: string | undefined }): Promise<PlayerAccessDTO>`.
  Order, with exact messages:
  1. No secret → 401 `'Join the quiz to continue.'`
  2. No player with `hashPlayerSecret(secret)`: if a switch request has that hash as
     `replacedCredentialHash` → 403 `switched` `'You continued on another device.'`; otherwise
     401 `'Join the quiz to continue.'`
  3. `player.id !== playerId || player.quizId !== quizId` → 403 `forbidden`
     `'This session belongs to another player.'`
  4. `player.isKicked()` → 403 `kicked` `'You were removed from this quiz.'`
  5. Removed for `timeout` → `player.reactivate()` and `playerRepository.save(player)`.
  6. Returns `{ quizId, playerId, playerChannelKey: player.channelKey }`. A player without a key
     is treated as step 2's 401.
- `SupabaseSessionUserReader implements ISessionUserReader`: `await cookies()` from
  `next/headers`, then the existing `createServerClient(cookieStore)` and `auth.getUser()`. An
  error or a missing user gives `null`. `isAdmin` comes from `isAdminUser(user.email)`.
- `src/lib/api/access-error-response.ts`: `accessErrorResponse(error: unknown): NextResponse | null`.
  It returns `NextResponse.json({ error: message, code }, { status })` for an error whose `name`
  is `'AccessDeniedError'` and whose `status` is 401 or 403, otherwise `null`. It duck-types the
  error, so `src/lib` imports nothing from `src/application`.
- `src/lib/player-cookie.ts`: `playerCookieName(quizId)`, `switchCookieName(quizId)`,
  `playerCookieOptions(): ResponseCookie options` (Global Constraints values),
  `switchCookieOptions()`, `readRequestCookie(request: Request, name: string): string | undefined`
  (parses the `cookie` header; works on a plain `Request`).

- [ ] **Step 1: Write the failing tests.** The use-case tests mock repositories with `vi.fn()`
  and a fake `ISessionUserReader`, reset in `beforeEach`:

```ts
// authorize-player.use-case.test.ts (core cases)
const secret = 'secret-a';
const makePlayer = () => {
  const player = new Player('p1', 'Alex', 'quiz-1');
  player.credentialHash = hashPlayerSecret(secret);
  player.channelKey = 'key-1';
  return player;
};

it('returns the player access for the right cookie', async () => {
  playerRepo.findByCredentialHash.mockResolvedValue(makePlayer());
  await expect(useCase.execute({ quizId: 'quiz-1', playerId: 'p1', secret })).resolves.toEqual({
    quizId: 'quiz-1', playerId: 'p1', playerChannelKey: 'key-1',
  });
  expect(playerRepo.findByCredentialHash).toHaveBeenCalledWith(hashPlayerSecret(secret));
});

it.each([
  ['another player id', { quizId: 'quiz-1', playerId: 'p2' }],
  ['another quiz id', { quizId: 'quiz-2', playerId: 'p1' }],
])('refuses %s with 403 forbidden', async (_label, ids) => {
  playerRepo.findByCredentialHash.mockResolvedValue(makePlayer());
  await expect(useCase.execute({ ...ids, secret })).rejects.toMatchObject({
    status: 403, code: 'forbidden', message: 'This session belongs to another player.',
  });
});

it('refuses a missing cookie with 401', async () => {
  await expect(useCase.execute({ quizId: 'quiz-1', playerId: 'p1', secret: undefined }))
    .rejects.toMatchObject({ status: 401, code: 'unauthenticated', message: 'Join the quiz to continue.' });
});

it('answers a switched-away cookie with 403 switched', async () => {
  playerRepo.findByCredentialHash.mockResolvedValue(null);
  switchRepo.findByReplacedCredentialHash.mockResolvedValue({ id: 'req-1' });
  await expect(useCase.execute({ quizId: 'quiz-1', playerId: 'p1', secret }))
    .rejects.toMatchObject({ status: 403, code: 'switched', message: 'You continued on another device.' });
});

it('refuses a kicked player with 403 kicked', async () => {
  const player = makePlayer();
  player.removeFromGame('kicked');
  playerRepo.findByCredentialHash.mockResolvedValue(player);
  await expect(useCase.execute({ quizId: 'quiz-1', playerId: 'p1', secret }))
    .rejects.toMatchObject({ status: 403, code: 'kicked', message: 'You were removed from this quiz.' });
});

it('brings a timed-out player back to Active', async () => {
  const player = makePlayer();
  player.removeFromGame('timeout');
  playerRepo.findByCredentialHash.mockResolvedValue(player);
  await useCase.execute({ quizId: 'quiz-1', playerId: 'p1', secret });
  expect(playerRepo.save).toHaveBeenCalledWith(expect.objectContaining({
    status: PlayerStatus.Active, removalReason: null,
  }));
});
```

  `authorize-host.use-case.test.ts`: no user → 401 with the exact message and
  `quizRepo.findHostChannelKey` not called; `isAdmin: false` → 403; admin with a missing quiz →
  `'Quiz with ID quiz-9 not found.'`; admin → `{ userId, hostChannelKey }`; `ensureHostUser`
  gives the same two refusals.
  `player-credential.test.ts`: the secret decodes to 32 bytes; two secrets differ; the hash is
  64 hex characters and is stable for one input.
  `supabase-session-user-reader.test.ts`: mock `next/headers` and `@supabase/ssr` (the pattern in
  `src/tests/proxy.test.ts`). Cover: a `getUser` error → `null`; an admin email → `isAdmin: true`;
  a non-admin email → `isAdmin: false`.
  `access-error-response.test.ts`: an `AccessDeniedError('kicked', 'x')` gives status 403 and the
  body `{ error: 'x', code: 'kicked' }`; a plain `Error` gives `null`.
  `player-cookie.test.ts`: `playerCookieName('a') !== playerCookieName('b')`;
  `readRequestCookie` finds `bq_player_quiz-1` among several cookies and returns `undefined`
  when the header is missing; `playerCookieOptions()` has `httpOnly: true`, `sameSite: 'lax'`,
  `path: '/'`, `maxAge: 86400`, and `secure` false only when `NODE_ENV` is `'development'`
  (stub with `vi.stubEnv`).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement the Interfaces.** Wire both use cases into the container. Add the two
  keys to the mocked containers in the two existing route test files.
- [ ] **Step 4: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 5: Commit** `feat(auth): add host and player authorization`

---

### Task 4: Host-class routes and pages

**Agent:** `implementer`

**Files:**
- Modify (each calls the host check first, then maps `accessErrorResponse(error)` before its
  existing mapping): `src/app/api/quiz/start/route.ts`, and under `src/app/api/quiz/[quizId]/`:
  `advance`, `lock-question`, `finish`, `reset`, `timer/reset`, `leaderboard/snapshot`, `state`,
  `players`, `players/status` route files, plus `DELETE` in `player/[playerId]/route.ts`
- Modify: `src/app/(host)/host/page.tsx`, `src/app/(host)/quiz/[quizId]/page.tsx`
- Modify: `src/proxy.ts`, `src/tests/proxy.test.ts`
- Delete: `src/app/api/player/add/route.ts`
- Test: `src/tests/app/api/host-routes-access.test.ts`

**Interfaces:**
- Consumes: `getServices().authorizeHostUseCase.execute(quizId)` and `.ensureHostUser()`,
  `accessErrorResponse`.
- Route shape: `await params`, then `await authorizeHostUseCase.execute(quizId)`, then the
  existing body. `start` parses its body first (plan-time call 8). Keep the call as a bare
  `await` here: Task 6 uses its result.
- Pages:
  - `/host` calls `ensureHostUser()`.
  - `/quiz/[quizId]` calls `execute(quizId)`.
  - On an `AccessDeniedError` (check `error.name`), 401 redirects to
    `` `/login?redirect=${encodeURIComponent(path)}` `` and 403 calls `forbidden()` from
    `next/navigation` if this Next version exports it; otherwise it renders the text
    `Forbidden: Admin access required`.
- Proxy:
  - `isHostPage = pathname === '/host' || /^\/quiz\/[^/]+$/.test(pathname)`.
  - Host pages get the same treatment as admin pages: redirect to login when signed out, 403
    when not an admin.
  - The matcher adds `'/host'` and `'/quiz/:quizId'`; `/quiz/:quizId/live` stays unmatched.

- [ ] **Step 1: Write the failing table test.** Mock `@application/services/factories` with
  `vi.mock` returning a container whose `authorizeHostUseCase.execute` is `mocks.authorizeHost`.
  Every service method these routes call is a `vi.fn()`. Mock every `@infrastructure/realtime/broadcast-*`
  module. Cover all eleven host routes:

```ts
const ctx = { params: Promise.resolve({ quizId: 'quiz-1' }) };
const playerCtx = { params: Promise.resolve({ quizId: 'quiz-1', playerId: 'p1' }) };
const post = (body?: unknown) =>
  new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const hostRoutes: Array<[string, () => Promise<Response>]> = [
  ['POST /api/quiz/start', () => startQuiz(post({ quizId: 'quiz-1' }))],
  ['POST advance', () => advance(post(), ctx)],
  ['POST lock-question', () => lockQuestion(post(), ctx)],
  ['POST finish', () => finish(post(), ctx)],
  ['POST reset', () => reset(post(), ctx)],
  ['POST timer/reset', () => timerReset(post({ durationSeconds: 30 }), ctx)],
  ['POST leaderboard/snapshot', () => snapshot(post(), ctx)],
  ['GET state', () => getState(new Request('http://localhost'), ctx)],
  ['GET players', () => getPlayers(new Request('http://localhost'), ctx)],
  ['GET players/status', () => getPlayersStatus(new Request('http://localhost'), ctx)],
  ['DELETE player (kick)', () => kick(new Request('http://localhost', { method: 'DELETE' }), playerCtx)],
];

it.each(hostRoutes)('%s refuses a request without an admin session', async (_name, call) => {
  mocks.authorizeHost.mockRejectedValue(
    new AccessDeniedError('unauthenticated', 'Sign in to host this quiz.')
  );
  const response = await call();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Sign in to host this quiz.', code: 'unauthenticated' });
  expect(allServiceMocks().every((fn) => fn.mock.calls.length === 0)).toBe(true);
});

it.each(hostRoutes)('%s refuses a non-admin session', async (_name, call) => {
  mocks.authorizeHost.mockRejectedValue(new AccessDeniedError('forbidden', 'Only admins can host quizzes.'));
  expect((await call()).status).toBe(403);
});

it.each(hostRoutes)('%s checks quiz-1 and then runs for an admin', async (_name, call) => {
  mocks.authorizeHost.mockResolvedValue({ userId: 'u1', hostChannelKey: 'hk' });
  const response = await call();
  expect(mocks.authorizeHost).toHaveBeenCalledWith('quiz-1');
  expect(response.status).toBeLessThan(400);
});
```

  `allServiceMocks()` returns every `vi.fn()` in the mocked container except `authorizeHost`.
  Set default resolved values in `beforeEach`, so the admin case gets a 2xx from each route.
  In `proxy.test.ts`, add `/host` and `/quiz/quiz-1` without a user (redirect to
  `/login?redirect=…`) and with a non-admin user (403). Add `/quiz/quiz-1/live`: not intercepted.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** Delete `api/player/add`. Check with
  `command grep -rn "api/player/add" src e2e docs/guides` that nothing references it.
- [ ] **Step 4: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 5: Commit** `feat(host): require an admin session for host routes`

---

### Task 5: Join with a credential, player-class routes and page

**Agent:** `implementer`

**Files:**
- Create: `src/application/use-cases/join-quiz.use-case.ts`, `src/application/dtos/join.dto.ts`
- Delete: `src/application/use-cases/join-session.use-case.ts`,
  `src/application/use-cases/add-player.use-case.ts`, `PlayerService.addPlayer`, and their tests
  (`join-session-use-case.test.ts`, `add-player-use-case.test.ts`). Port
  `src/tests/integration/add-player.integration.test.ts` to
  `src/tests/integration/join-quiz.integration.test.ts`, keeping its gating flag.
- Modify: `src/application/services/factories.ts` (`joinQuizUseCase` replaces
  `joinSessionUseCase`; update both mocked containers in the route tests)
- Modify: `src/app/api/session/join/route.ts`, `src/app/api/player/answer/route.ts`, and under
  `src/app/api/quiz/[quizId]/player/[playerId]/`: `GET` in `route.ts`, `sync/route.ts`,
  `presence/route.ts`
- Modify: `src/app/(player)/play/[quizId]/[playerId]/page.tsx`
- Test: `src/tests/application/use-cases/join-quiz.use-case.test.ts`,
  `src/tests/app/api/player-routes-access.test.ts`, `src/tests/app/api/session-join-route.test.ts`

**Interfaces:**
- Consumes: Task 3 credential helpers and `authorizePlayerUseCase`, Task 2 repositories.
- `JoinQuizUseCase(quizRepository, playerRepository, switchRequestRepository)`:
  `execute({ joinCode, playerName, playerSecret, switchSecret, now }: { joinCode: string; playerName: string; playerSecret: string | undefined; switchSecret: string | undefined; now: Date }): Promise<JoinQuizResult>`.
  ```ts
  type JoinQuizResult =
    | { outcome: 'joined'; quiz: QuizDTO; player: PlayerDTO; players: PlayerDTO[]; playerSecret: string }
    | { outcome: 'resumed'; quiz: QuizDTO; player: PlayerDTO; players: PlayerDTO[] }
    | { outcome: 'switch-pending'; quizId: string; playerId: string; playerName: string;
        requestId: string; switchSecret: string | null; hostChannelKey: string };
  ```
  Logic:
  1. An empty join code → `'Join code is required.'`. An unknown code → `'Quiz with the provided join code was not found.'`
  2. `findByQuizIdAndName`, which already ignores kicked players.
  3. Name free: create a `Player` with `randomUUID()`, `channelKey = generateChannelKey()`,
     `credentialHash = hashPlayerSecret(secret)` (new secret), add it to the quiz aggregate,
     `save` both, `setCredential`, then `joined`.
  4. The name's player has `credentialHash === hashPlayerSecret(playerSecret)`: `reactivate()` if
     timed out and save, then `resumed`.
  5. Otherwise, if `findPendingForPlayer` returns a request whose `secretHash ===
     hashPlayerSecret(switchSecret)`: `switch-pending` with `switchSecret: null` (the cookie stays).
     Any other pending request → `` `A request to continue as ${name} is already waiting for the host.` ``
  6. Otherwise open a `PlayerSwitchRequest` with a new secret, `create` it, and return
     `switch-pending` with that secret and `findHostChannelKey(quizId)`.
  `quiz` is player-facing (`mapQuizToPlayerFacingDTO`), and `players` excludes Removed, as today.
- `join.dto.ts`: `JoinResponseDTO` zod discriminated union on `outcome`. `joined` and `resumed`
  carry `{ quiz, player, players }`; `switch-pending` carries `{ quizId, playerName }`. No secrets,
  keys or request ids.
- Join route:
  - Reads both cookies with `readRequestCookie`.
  - Sets the player cookie on `joined`, and the switch cookie when `switchSecret` is not null.
  - Responds with the DTO only.
  - The `switch:requested` broadcast is added in Task 7.
- Player routes:
  - `await params` and parse.
  - `await authorizePlayerUseCase.execute({ quizId, playerId, secret: readRequestCookie(request, playerCookieName(quizId)) })`.
  - Then the existing body; `accessErrorResponse` comes first in the catch.
  - `answer` takes `quizId` and `playerId` from its body and authorizes before the service call.
  - Keep the access result in a variable in `answer`; Task 6 passes its `playerChannelKey` to the ack.
- Play page: `(await cookies()).get(playerCookieName(quizId))?.value` → authorize. On
  `AccessDeniedError` it calls `redirect('/join?reason=' + code)`. Codes: `unauthenticated`,
  `forbidden`, `kicked`, `switched`.

- [ ] **Step 1: Write the failing tests.** `join-quiz.use-case.test.ts` (repositories mocked, a
  fixed `now`):
  - joined: `setCredential` gets a 64-hex hash and a key, and `playerSecret` hashes to that hash;
  - resumed with the right `playerSecret`, and resumed plus reactivated for a timed-out player;
  - switch-pending for a taken name without the cookie: `create` receives a Pending request with
    `expiresAt` 5 minutes after `now`;
  - the same device again (matching `switchSecret`) → the same request id and `switchSecret: null`;
  - another device while one is pending → the exact "already waiting" message;
  - a kicked player's name → joined as a new player (the repository returns `null`);
  - the two error messages for the join code.
  `session-join-route.test.ts`:
  - joined sets `bq_player_quiz-1` with `HttpOnly`, `SameSite=lax` and `Path=/`, read from the
    `set-cookie` header;
  - switch-pending sets `bq_switch_quiz-1` and the body is exactly `{ outcome: 'switch-pending',
    quizId: 'quiz-1', playerName: 'Alex' }`;
  - joining quiz-2 from a browser holding `bq_player_quiz-1` sets only `bq_player_quiz-2`;
  - 429 still comes first.
  `player-routes-access.test.ts`: the table pattern from Task 4 over `POST /api/player/answer`,
  `GET` player, `POST sync` and `POST presence`. It sends `cookie: bq_player_quiz-1=secret-a`.
  It asserts `authorizePlayer` is called with `{ quizId: 'quiz-1', playerId: 'p1', secret: 'secret-a' }`.
  It runs 401, 403 `forbidden`, 403 `kicked` and 403 `switched`, each with no service call, and
  the success case. One more case: the request has no cookie and the route still calls the use
  case with `secret: undefined`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 5: Commit** `feat(player): issue a credential at join and require it`

---

### Task 6: Private channels and keyed topics on the server

**Agent:** `implementer-capable` (`src/infrastructure/realtime/**`)

**Files:**
- Create: `src/lib/realtime-topics.ts`
- Create: `src/application/dtos/room-state.dto.ts`, `src/application/mappers/room-state-mapper.ts`,
  `src/application/dtos/switch-request.dto.ts`
- Modify: `src/infrastructure/realtime/broadcast-channel-pool.ts`, `broadcast-quiz-state.ts`,
  `broadcast-player-events.ts`, `broadcast-round-summary.ts`, `broadcast-leaderboard.ts`
- Delete: `src/infrastructure/realtime/channel-auth.ts` (unused)
- Modify: every route that broadcasts (start, advance, timer/reset, leaderboard/snapshot,
  lock-question, finish, reset, kick, answer)
- Modify: `src/application/use-cases/remove-player.use-case.ts` (returns `playerChannelKey`)
- Create: `src/infrastructure/database/supabase/realtime-messages-policies.sql`
- Test: `src/tests/infrastructure/realtime/broadcast-topics.test.ts`,
  `src/tests/application/mappers/room-state-mapper.test.ts`, `src/tests/lib/realtime-topics.test.ts`,
  `src/tests/application/use-cases/remove-player.use-case.test.ts`

**Interfaces:**
- `realtime-topics.ts`: `roomTopic(quizId: string): string`, `hostTopic(quizId: string, key: string): string`,
  `playerTopic(quizId: string, key: string): string`. These are the only places the formats live.
- `RoomStateDTO`: `QuizDTO.omit({ answers: true }).extend({ answeredCount: z.number().int().nonnegative() })`.
  `mapQuizToRoomStateDTO(quiz: QuizDTO): RoomStateDTO` = `mapQuizToPlayerFacingDTO(quiz)` plus
  `answeredCount` = the number of answers for `activeQuestionId` (0 when there is none).
- Broadcasters (all sends private; `DEFAULT_CHANNEL_CONFIG = { config: { private: true, broadcast: { ack: true } } }`):
  - `broadcastQuizState(quizId, quizState: QuizDTO, hostChannelKey: string)`:
    `'state:update'` (full) on the host topic, `'state:update:room'` (`RoomStateDTO`) on the room
    topic. Nothing full goes on the room topic.
  - `broadcastRoundSummary(quizId, summary)` and `broadcastLeaderboard(quizId, leaderboard)`:
    room topic, unchanged events.
  - `broadcastAnswerAck(quizId, playerChannelKey, answerId, isCorrect)`,
    `broadcastPlayerKicked(quizId, playerChannelKey, reason)`,
    `broadcastPlayerSwitched(quizId, playerChannelKey)` (event `'player:switched'`, payload `{}`):
    player topic. Delete `broadcastPlayerUpdate` if nothing calls it.
  - `broadcastSwitchRequested(quizId, hostChannelKey, request: SwitchRequestDTO)` (event
    `'switch:requested'`). `SwitchRequestDTO` is a zod schema: `{ id: string; playerId: string;
    playerName: string; createdAt: string; expiresAt: string }` (ISO datetimes). Task 7 uses it.
- `RemovePlayerUseCase.execute` returns `{ playerId, quizId, reason, playerChannelKey: string | null }`.
  The kick route skips the broadcast when it is `null`.
- Policy SQL:
  - Header comment: why, and that it is applied outside Prisma because the shadow database has no
    `realtime` schema.
  - `create policy "bobrquiz_receive_broadcasts" on realtime.messages for select to anon, authenticated using (realtime.messages.extension = 'broadcast' and (realtime.topic() like 'quiz:%' or realtime.topic() like 'host:%' or realtime.topic() like 'player:%'));`
  - No insert policy.

- [ ] **Step 1: Write the failing tests.**
  - `broadcast-topics.test.ts`: mock `getSupabaseServerClient` and `broadcastPool.send`. Assert
    the exact `(topic, event)` pairs: `broadcastQuizState('quiz-1', state, 'hk')` sends
    `['host:quiz-1:hk', 'state:update']` with `state` and `['quiz:quiz-1', 'state:update:room']`
    with a payload that has no `answers` key and has `answeredCount`. The player broadcasters use
    `player:quiz-1:pk`.
  - A channel-config test in the pool's existing test file: the config passed to
    `client.channel` contains `private: true`.
  - `room-state-mapper.test.ts`: two answers on the active question → `answeredCount: 2`; upcoming
    questions have empty text and no options; no `answers` key; no active question → 0.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the broadcasters and routes. Host routes pass
  `(await authorizeHostUseCase.execute(quizId)).hostChannelKey`; answer passes the access
  result's `playerChannelKey`. Update the Task 4 and Task 5 table tests' broadcaster assertions.
- [ ] **Step 4: Apply the policy to dev** (main session, Supabase MCP `apply_migration` on the
  project entry in `.mcp.json`). Read back
  `select policyname, cmd, roles from pg_policies where schemaname = 'realtime'`; the ledger
  gets the output. Production is the deployment section's job, not this task's.
- [ ] **Step 5: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 6: Commit** `feat(realtime): keep host and player data on keyed private topics`

---

### Task 7: Device switch requests

**Agent:** `implementer-capable` (approval races, broadcasters in `src/infrastructure/realtime/`)

**Files:**
- Create: `src/application/use-cases/get-switch-request-status.use-case.ts`,
  `list-switch-requests.use-case.ts`, `resolve-switch-request.use-case.ts`
- Create routes:
  - `src/app/api/quiz/[quizId]/switch-request/route.ts` (`GET`, public, uses the switch cookie);
  - `src/app/api/quiz/[quizId]/switch-requests/route.ts` (`GET`, host);
  - `src/app/api/quiz/[quizId]/switch-requests/[requestId]/approve/route.ts` (`POST`, host);
  - `src/app/api/quiz/[quizId]/switch-requests/[requestId]/deny/route.ts` (`POST`, host).
- Modify: `src/application/services/factories.ts` (container keys
  `getSwitchRequestStatusUseCase`, `listSwitchRequestsUseCase`, `resolveSwitchRequestUseCase`),
  the join route (broadcast `switch:requested` on a new request), and the Task 4 host-routes
  table (add the three host routes)
- Test: one use-case test file per use case, `src/tests/app/api/switch-request-routes.test.ts`

**Interfaces:**
- Consumes: `SwitchRequestDTO` and `broadcastSwitchRequested` / `broadcastPlayerSwitched` from
  Task 6; Task 2's switch request repository.
- `GetSwitchRequestStatusUseCase.execute({ quizId, switchSecret, now }): Promise<{ state: SwitchRequestState; playerId: string }>`.
  A missing secret, an unknown hash or another quiz → `'Switch request not found.'`
- `ListSwitchRequestsUseCase.execute(quizId, now): Promise<SwitchRequestDTO[]>`: pending,
  unexpired, oldest first, with the player's name.
- `ResolveSwitchRequestUseCase.execute({ quizId, requestId, decision: 'approve' | 'deny', now }): Promise<{ playerId: string; previousChannelKey: string | null }>`.
  Messages, checked in this order:
  1. `` `Switch request with ID ${requestId} not found.` `` (unknown, or another quiz);
  2. `'Switch request has expired.'`;
  3. `'Switch request is no longer pending.'` (already decided, or the repository's conditional
     write returned `false`);
  4. `'Player has been removed from the game.'` (the player was kicked meanwhile).

  Approve calls `repository.approve(request, { credentialHash: request.secretHash, channelKey: generateChannelKey() })`
  with `replacedCredentialHash` = the player's current hash. Deny calls `repository.deny`.
- Routes:
  - Status:
    - `approved`: sets the player cookie to the switch cookie's value, deletes the switch cookie
      and returns `{ state: 'approved', playerId }`.
    - `pending`, `denied`, `expired`: `{ state }`. A denied or expired answer also deletes the
      switch cookie.
  - Approve:
    - On success, sends `broadcastPlayerSwitched(quizId, previousChannelKey)` when the key is
      not null, and returns `{ success: true }`.
    - Its errors map to 404 for not found and 409 for the other three. The 409s are new, the
      first in the app; the two failure tests pin them.
  - Deny: the same mapping, with no broadcast.
  - Join: after a new request (`switchSecret !== null`), sends `broadcastSwitchRequested`; a
    failed broadcast logs a warning and still returns 200 (the route shape after the answer lock
    work).

- [ ] **Step 1: Write the failing tests.**
  - Resolve:
    - approve passes the request's own `secretHash` as the new credential and the old hash as
      `replacedCredentialHash`;
    - a lost race (`approve` resolves `false`) → "no longer pending";
    - two approvals in a row, the second seeing a decided request → "no longer pending";
    - expired → "expired";
    - a kicked player → "removed";
    - another quiz's request → not found;
    - deny → `deny` called and `previousChannelKey` irrelevant.
  - Status: pending, approved (returns `playerId`), denied, expired at `now = expiresAt + 1ms`,
    and the not-found message.
  - List: expired rows excluded (the repository filter is asserted through its `now` argument);
    the player name is filled in.
  - Routes:
    - status with `approved` sets `bq_player_quiz-1` to the switch cookie's value, and the
      `set-cookie` header expires `bq_switch_quiz-1`;
    - status without the switch cookie → 404;
    - approve without an admin → 401 with no use-case call;
    - approve → `broadcastPlayerSwitched('quiz-1', 'old-key')`;
    - approve "no longer pending" → 409.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 5: Commit** `feat(player): continue on another device with host approval`

---

### Task 8: Remove browser presence

**Agent:** `implementer-capable` (`use-presence.tsx`, `use-reconnection.ts`,
`presence-heartbeat-controller.ts`, `providers.tsx`)

**Files:**
- Delete: `src/infrastructure/realtime/presence-tracker.ts`,
  `src/tests/infrastructure/realtime/presence-tracker.test.ts`
- Modify: `src/hooks/use-presence.tsx` (drop `PresenceTrackerProvider`, `assertPresenceTracker`,
  `usePresenceTracker` and the tracker subscription; keep the credentialed `POST presence`
  heartbeat), `src/lib/presence-heartbeat-controller.ts` (drop the track loop, keep the persist
  loop), `src/hooks/use-reconnection.ts`, `src/app/providers.tsx`
- Modify: `src/tests/hooks/use-presence.test.ts`, `src/tests/lib/presence-heartbeat-controller.test.ts`,
  `src/tests/hooks/use-reconnection.test.ts`,
  `src/tests/infrastructure/realtime/supabase-realtime-client.test.ts` (its presence references),
  and the comment in `e2e/supabase-clients.spec.ts`

**Interfaces:**
- `usePresence` keeps its name and its persist-related options and return fields. The
  tracker-only fields go. `UseReconnectionReturn` is unchanged except for fields that only
  reported tracker state; list any removed field in the ledger.
- After the task, `command grep -rn "presence:quiz\|PresenceTracker\|bobrquiz-presence-anon" src e2e`
  prints nothing.

- [ ] **Step 1: Change the controller test first.** No track callback is scheduled. The persist
  loop's existing cases keep passing unchanged.
- [ ] **Step 2: Run it to see it fail, then implement.**
- [ ] **Step 3: `yarn test:run`, `yarn lint`, `yarn build`.** Then the grep above.
- [ ] **Step 4: Commit** `refactor(presence): drop browser presence tracking`

---

### Task 9: Browser realtime, live screen and display route

**Agent:** `implementer-capable` (`use-realtime-client.tsx`, `use-host-quiz-state.ts`,
`use-player-session.ts`, `src/infrastructure/realtime/**`)

**Files:**
- Modify: `src/infrastructure/realtime/realtime-client.ts` (remove `emit`),
  `supabase-realtime-client.ts` (`private: true` in its channel config), `noop-realtime-client.ts`
- Modify: `src/hooks/use-host-quiz-state.ts` (option `hostTopic: string`; full state from the
  host topic, leaderboard from the room topic), `src/hooks/use-player-session.ts` (option
  `playerTopic: string`; `state:update:room`; `player:kicked` and `player:switched`; 401/403
  handling), `src/hooks/use-round-summary-listener.ts` (uses `roomTopic`)
- Create: `src/hooks/use-room-state.ts` (live screen), `src/lib/access-redirect.ts`
- Create: `src/app/api/quiz/[quizId]/display/route.ts` (`GET`, public)
- Modify: `src/application/services/quiz-service.ts` (`getRoomState(quizId): Promise<RoomStateDTO>`
  = `mapQuizToRoomStateDTO(await getQuizState(quizId))`)
- Modify:
  - `src/app/(host)/quiz/[quizId]/page.tsx`: passes `hostTopic` to `HostQuizDashboard` and
    on to the hook.
  - `src/app/(player)/play/[quizId]/[playerId]/page.tsx`: passes `playerTopic` through
    `PlayerSessionScreen`.
  - `src/app/(host)/quiz/[quizId]/live/page.tsx`: `getRoomState`.
  - `src/components/host/live-game-screen.tsx` and `src/components/host/live/*.tsx`: take
    `RoomStateDTO`, use `useRoomState` and `useRoundSummaryListener`, have no host hooks, and
    read `answeredCount`.
- Test: `src/tests/lib/access-redirect.test.ts`, `src/tests/hooks/use-room-state.test.ts`,
  `src/tests/app/api/display-route.test.ts`, updates to the existing hook and realtime client
  tests

**Interfaces:**
- `accessRedirectPath(status: number, body: { code?: string }): string | null` in
  `src/lib/access-redirect.ts`. It returns `/join?reason=<code>` for 401 and for 403 with a
  known code, and `null` otherwise. The player hooks call it on every failed fetch and push the
  router there. It is the one place player pages decide where a refused request goes.
- `roomStateQueryKey(quizId) = ['room', quizId, 'state'] as const`. `useRoomState({ quizId, initialData })`:
  - fetches `GET /api/quiz/${quizId}/display` with `staleTime: 5_000` and `refetchInterval: 5_000`;
  - subscribes the room topic's `state:update:room` and `leaderboard:update`;
  - applies updates through an exported pure helper, `applyRoomLeaderboard(current, leaderboard)`.
- Display route: `GET` → `quizService.getRoomState(quizId)`. No authorization call; unknown →
  404.
- `/join` reads `?reason=` (`kicked`, `switched`, `unauthenticated`, `forbidden`) instead of
  `?kicked=true`, with messages:
  - kicked: "You were removed from this quiz."
  - switched: "You continued on another device."
  - the other two: "Join the quiz to continue."

  These live in `src/components/player/player-join-form.tsx` in Task 10. Here the hook only
  routes to them.

- [ ] **Step 1: Write the failing tests.**
  - `access-redirect.test.ts`: `(401, {})` → `/join?reason=unauthenticated`;
    `(403, { code: 'switched' })` → `/join?reason=switched`; `(403, { code: 'other' })` → `null`;
    `(404, {})` → `null`.
  - `display-route.test.ts`: 200 with `answeredCount` and no `answers`, no authorization mock
    called (the container's `authorizeHostUseCase` is a spy that must stay uncalled), 404 for an
    unknown quiz.
  - `use-room-state.test.ts`: `applyRoomLeaderboard(undefined, …)` → `undefined`; it replaces only
    `leaderboard`.
  - The realtime client test asserts `private: true` in the channel config, and that the client
    has no `emit`.
- [ ] **Step 2: Run them to see them fail, then implement.**
- [ ] **Step 3: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 4: Browser check** with the Playwright plugin against `yarn dev`:
  - signed out, `/quiz/<id>/live` shows the lobby with the join code, and the WebSocket frames
    on it carry `state:update:room` only;
  - `/host` while signed out redirects to `/login`.

  The ledger gets the observed frames.
- [ ] **Step 5: Commit** `feat(realtime): subscribe to keyed private topics in the browser`

---

### Task 10: Switch and refusal UI

**Agent:** `implementer-capable` (a new hook subscribing to the host topic)

**Files:**
- Modify: `src/components/player/player-join-form.tsx`:
  - handles the three outcomes;
  - waiting state: "Waiting for the host to let you continue as {name}";
  - polls `GET /api/quiz/{quizId}/switch-request` every 2 s;
  - on `approved`, stores `{ quizId, playerId, playerName }` under the existing `STORAGE_KEY`
    and pushes `/play/...`;
  - denied: "The host didn't let you continue as {name}. Join under another name.";
  - expired: "Nobody answered in time. Try again or join under another name.";
  - `?reason=` messages from Task 9.
- Create: `src/hooks/use-host-switch-requests.ts`:
  - query key `hostSwitchRequestsQueryKey(quizId)`;
  - `GET /api/quiz/{quizId}/switch-requests`, `staleTime` and `refetchInterval` 5 000;
  - subscribes `switch:requested` on the host topic and invalidates the query;
  - mutations for approve and deny, each invalidating it.
- Create: `src/components/host/switch-request-panel.tsx`, rendered in `HostQuizDashboard` above
  the player list:
  - "{name} wants to continue on another device", with Allow and Deny buttons;
  - built from `src/components/ui` primitives with `cn()`.
- Create: `src/lib/join-outcome.ts`
- Test: `src/tests/lib/join-outcome.test.ts`, `src/tests/hooks/use-host-switch-requests.test.ts`

**Interfaces:**
- `joinViewFor(response: JoinResponseDTO): { kind: 'play'; path: string } | { kind: 'waiting'; quizId: string; playerName: string }`
  in `src/lib/join-outcome.ts`.
- `switchStatusView(state: SwitchRequestState, playerName: string): { kind: 'waiting' | 'play' | 'message'; message?: string }`,
  carrying the copy above.
- `hostSwitchRequestsQueryKey(quizId) = ['quiz', quizId, 'switch-requests'] as const`.

- [ ] **Step 1: Write the failing tests** for `joinViewFor` (each outcome) and `switchStatusView`
  (the four states, exact copy). The hook test covers the query key and its pure helpers only.
- [ ] **Step 2: Run them to see them fail, then implement.**
- [ ] **Step 3: `yarn test:run`, `yarn lint`, `yarn build`.**
- [ ] **Step 4: Browser check** with the Playwright plugin:
  - two contexts: one joins as Alex; the second joins as Alex and waits;
  - the dashboard shows the prompt, and Allow sends the second context to `/play`;
  - the first context's next action lands on `/join?reason=switched` with the message.

  Screenshots or snapshot text go in the ledger.
- [ ] **Step 5: Commit** `feat(ui): ask the host before a player switches device`

---

### Task 11: End-to-end coverage

**Agent:** `implementer`

**Files:**
- Create: `e2e/identity-access.spec.ts`, `e2e/device-switch.spec.ts`
- Modify: whichever existing specs and `e2e/support/*` break, because they relied on the
  old `kicked=true`, on `state:update:player` or on ids in URLs being enough. Every flow that
  exists today must still pass.

**Interfaces:**
- Consumes: `createAdminApi()` and `joinAsPlayer` / `submitJoinForm` from `e2e/support/`.
  Signed-out contexts use `test.use({ storageState: { cookies: [], origins: [] } })`.

- [ ] **Step 1: Write the specs.**
  - `identity-access.spec.ts` (signed out):
    - `request.post('/api/quiz/<id>/advance')` → 401 with `code: 'unauthenticated'`, and the
      same for `GET state`;
    - `/host` → redirected to `/login`;
    - `/quiz/<id>/live` shows the join code;
    - a player context calling `/api/quiz/<id>/player/<otherPlayerId>` with its own cookie → 403;
    - a kicked player's `/play` page lands on `/join?reason=kicked`;
    - a timed-out player (removed with reason `timeout` through the admin API's `DELETE`)
      reloads `/play` and keeps their score.
  - `device-switch.spec.ts`: the Task 10 browser check as a test, plus deny, and a second device
    while one is pending, which shows the "already waiting" message.
- [ ] **Step 2: Run** `yarn test:e2e e2e/identity-access.spec.ts e2e/device-switch.spec.ts`
  (main session), then the whole suite with the e2e env from the e2e plan
  (`DATABASE_POOL_MAX=10 SESSION_JOIN_RATE_LIMIT=100 yarn test:e2e`). Expected: all pass, with no
  flaky retries (`failOnFlakyTests` is on). The ledger gets the counts.
- [ ] **Step 3: Commit** `test(e2e): cover host and player access and device switch`

---

### Task 12: Records and the check on the real target

**Agent:** `implementer` for the docs; the main session runs the dev check.

**Files:**
- Modify: `docs/DECISION-LOG.md`:
  - a new ADR for host = admin session behind one rule, player credentials, and private channels
    with server-only sends and keyed topics;
  - a dated note on ADR-005, saying Prisma bypasses row-level security, so its planned move does
    not apply.
- Modify: `CLAUDE.md`:
  - the API route pattern starts with the class check, through `authorizeHostUseCase` /
    `authorizePlayerUseCase` and `accessErrorResponse`;
  - the realtime names line lists the three topic kinds and `realtime-topics.ts`;
  - the capable-tier list gains `src/hooks/use-room-state.ts` and
    `src/hooks/use-host-switch-requests.ts`;
  - common pitfalls: a new route must pick a class.
- Modify: `docs/guides/PATTERNS.md` (the route class table and the cookie helpers),
  `.claude/skills/architecture-check/SKILL.md` (an `src/application/ports/` and
  `src/application/errors/` note if a check flags them)
- Create: `docs/progress/findings/2026-10-1x-identity-dev-check.md` (dated when run)

- [ ] **Step 1: Dev check** (main session, Playwright plugin and Supabase MCP), each result
  recorded raw:
  - a WebSocket capture on `/play/...` shows no `state:update` (full) frame;
  - a browser-side `channel.send` on `quiz:{id}` with the public key is refused (the spike's
    T4 method);
  - anonymous `GET /host` and `GET /api/quiz/{id}/state` are refused;
  - `get_advisors(type: 'security')` has no new finding for `PlayerSwitchRequest`.
- [ ] **Step 2: Write the records.** Run `/architecture-check` and record its sweep output in the
  ledger.
- [ ] **Step 3: Commit** `docs: record the identity design decisions`

---

## Deployment (user, after the branch passes and approval)

Hand all of these over at once:

1. `prisma migrate deploy` against production (the new columns and table).
2. The policy SQL from `src/infrastructure/database/supabase/realtime-messages-policies.sql`,
   applied to the production project. It must land **before** the code: private channels with no
   policy refuse every browser.
3. Deploy the code between games. Players from before have no credential (Global Constraints).
4. Turn off "Allow public access" in Realtime settings in both projects (spec: extra protection,
   no ordering constraint).
5. The production half of the real-target check (Task 12 Step 1 again on production). Its
   results go in the findings record. The four advisories can then be published.
