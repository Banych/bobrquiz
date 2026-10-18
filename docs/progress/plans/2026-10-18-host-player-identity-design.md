# Host and player identity — design

**Date:** 2026-10-18
**Status:** Draft, pending the user's approval
**Branch:** `design/host-player-identity` (from `origin/master` at e39a9e0)
**Tracks:** private draft advisories GHSA-j2j8-j6g6-5f29 (host control), GHSA-j6mg-7jc4-3gvf
(player identity), GHSA-rxxj-x7x9-9fh7 (host state reaching players), GHSA-jv37-f2qr-6jg6
(public realtime channels). Found in `docs/progress/findings/2026-10-18-release-review.md`
(local branch `docs/release-review-findings`, unpushed).

## Why

The app has no idea who is calling it outside the admin area:
- `src/proxy.ts:83-91` guards only `/admin`, `/admin/:path*` and `/api/admin/:path*`.
- Every host control under `/api/quiz/**` acts on a bare quiz id from the URL.
- Every player route acts on a bare player id from the URL or body.
- `/host` lists every quiz with its id and join code to anyone. Production served it to an
  anonymous request on 2026-10-18.

So anyone can reset or finish a running game, kick players, or answer as someone else.

Two leaks sit on top of that. The full host state goes to anyone through `GET /api/quiz/[quizId]/state`.
It is also broadcast as `state:update` on the same public `quiz:{quizId}` channel the players join,
and that state holds everyone's answers with `isCorrect`. All channels are public, so any browser
holding the public key can listen in and, per Supabase's documentation, send.

## What the user decided

- **Who hosts.** Only admins host for now. Hosting means being signed in with the existing admin
  login (Supabase Auth plus the `ADMIN_EMAILS` allowlist); there is no new password or code. Later,
  any signed-in user should be able to create and host their own quizzes.
- **Live screen.** The live screen (`/quiz/[quizId]/live`) opens on a device that is not signed in:
  a TV, laptop or tablet. It shows the join code in the lobby, then each question as the host
  advances. It is for the room to look at, not for control.
- **Switching phones.** A player whose phone dies continues on another device as the same player,
  with their score. They do it by entering the join code and the same name, and the host approves
  the switch on the dashboard. Without that click, nobody can take over a player.
- **Technical choices.** The user handed them to the designer, to be listed in this document for
  checking (the "Designer's calls" section).

## Goals

1. **Host controls and data.** Every host action and every piece of host-only data requires a
   signed-in admin, checked on the server in each route. Host actions are start, advance, lock,
   finish, reset, timer reset, leaderboard snapshot, kick and switch approvals. Host-only data is
   the full quiz state, the player list with connection status, `/host` and the dashboard.
2. **Player actions.** Every player action needs that player's own credential, issued by the
   server at join and held only by that player's browser. The actions are answering, the player's
   session view, reconnect sync and the presence heartbeat. A credential for one player never works
   for another.
3. **Device switch.** It works as the user described: same join code, same name, host approves.
   The old device then loses access.
4. **Live screen.** It works signed out and receives only what the room may see.
5. **Realtime.** No browser can send on any app channel. Only the host's browser and the server
   ever hold host-only or one-player-only data.

## Non-goals

- Quiz ownership and non-admin hosts. Nothing here adds an owner to a quiz.
- One answer per question, answers after the timer, join status checks, and rate limits keyed by
  player. These are GHSA-rq7w-52rf-mq34, #94, the status half of GHSA-g2xx-cr9j-4q77, and #95.
  They are separate work, though a player credential makes per-player limits possible.
- Accounts for players. Players stay anonymous: a name and a server-issued credential, no Supabase
  user.

## Anti-goals (a failure even if it works)

- **No hijack by name.** A rival typing someone's name must not take over their seat without a
  host click.
- **No rejected joins.** A room on one network must not be refused joins because of how players
  are identified. Supabase's per-IP limit on anonymous sign-ins is one reason players do not get
  Supabase users.
- **No signing in on the live screen.** The TV or tablet showing the live view must not need one.
- **No gaps between proxy and route.** A proxy rule that misses a path must not leave a host route
  open, so the check lives in the route as well as in the proxy.

## Design

### Route classes

Every route and page belongs to exactly one class. A new route has to pick one.

| Class | Credential | Routes and pages |
|---|---|---|
| Admin (unchanged) | admin session | `/admin/**`, `/api/admin/**` |
| Host | admin session | `POST /api/quiz/start`; under `/api/quiz/[quizId]/`: `POST advance`, `POST lock-question`, `POST finish`, `POST reset`, `POST timer/reset`, `POST leaderboard/snapshot`, `GET state`, `GET players`, `GET players/status`, `DELETE player/[playerId]` (kick), the new transfer approve/deny routes; pages `/host`, `/quiz/[quizId]` |
| Player | that player's credential | `POST /api/player/answer`; under `/api/quiz/[quizId]/player/[playerId]`: `GET`, `POST sync`, `POST presence`; page `/play/[quizId]/[playerId]` |
| Public | none | `POST /api/session/join`, the new transfer-status route, the new display route; pages `/join`, `/quiz/[quizId]/live`, `/` |
| Removed | — | `POST /api/player/add`: joins by raw quiz id with no join code, and nothing in `src/` or `e2e/` calls it |

A host-class request without an admin session gets 401, and one with a non-admin session gets 403.
A player-class request without the credential gets 401. With another player's credential, or as a
kicked player, it gets 403. A player removed for inactivity is not refused (see "Inactive players"
below).

### Host check

One rule answers "may this user host this quiz", and every host route and page goes through it.
Today it answers "is this an admin", using the same `getUser()` and `isAdminUser` check the proxy
uses. Later work changes only this rule to "is this the quiz's owner".

Routes call the rule before doing anything else, then follow the existing pattern. The proxy
matcher also covers the host pages so a signed-out visitor is redirected to `/login` instead of
seeing an error.

### Player credential

- **At join.** `POST /api/session/join` creates the player and a random secret of at least 128
  bits. It stores only a hash of the secret on the player row and sets the secret in an HttpOnly,
  `SameSite=Lax`, `Secure` (outside development) cookie scoped to that quiz. The response no longer
  needs to carry a credential for the page to read.
- **On each request.** Every player-class route reads the cookie, finds the player by its hash,
  and requires that player to match the route's quiz and player ids. It also requires the player
  not to have been kicked.
- **Rejoin on the same device.** A player who closes the tab and comes back on the same device
  still has the cookie. The existing "rejoin" on `/join` (local storage) keeps working without the
  host.
- **Kick.** Kicking a player makes their credential useless at once, through the status check. A
  kicked player can no longer answer.

### Inactive players

The host dashboard removes a player it hasn't seen for 5 minutes (`AUTO_REMOVE_THRESHOLD_MS` in
`src/hooks/use-host-quiz-players.ts`, a `DELETE` with reason `timeout`). Today that stores the same
`Removed` status as a kick, and `Player.removeFromGame` discards the reason (`void reason`). A
phone that sleeps past 5 minutes is exactly the "phone died" case the user wants to keep working,
so the removal reason is stored:
- **Kicked.** Locked out, as above.
- **Timed out.** The seat, score and answers are kept. The player's own valid credential brings
  them back to Active on their next player request. A device switch for them works the same as
  for any other player.

### Device switch

1. **Join with a taken name.** The new device submits the join code and a name that belongs to a
   player in the quiz who is not Removed. If that player's valid cookie is on this device, it
   simply resumes. Otherwise the server records a switch request for that player, with its own
   fresh secret: only the hash is stored, and the secret goes into a pending cookie. The response
   says the request is waiting for the host.
2. **Waiting.** The new device shows "Waiting for the host to let you continue as {name}". It
   checks the request's status through the public transfer-status route, authorised by the
   pending cookie.
3. **Host prompt.** The host's dashboard shows the pending request ("{name} wants to continue on
   another device") with Allow and Deny. It appears through the host realtime channel and the
   dashboard's poll.
4. **Allow.** The player row's credential hash is replaced with the request's hash. The
   new device's next status check turns its pending cookie into the player cookie and sends it to
   `/play/...`. The old device's next request gets 403, and it shows "You continued on another
   device". Score and answers stay on the player row, untouched.
5. **Deny or no answer.** The request ends; the new device says so and can join under another
   name. A request no one answers expires (default 5 minutes, my call).

### Live screen

- **Data.** `/quiz/[quizId]/live` is public. It loads from a new public display route and
  listens on the room channel (next section). It gets:
  - the title, status, join code and QR, and player names and count;
  - the active question (text, media, options, timer) and how many have answered;
  - the round summary after a lock, the leaderboard and the final results.

  It never gets answer values, `isCorrect` before a lock, or upcoming questions. Player ids are no
  longer secrets once the cookie is the credential, so room payloads may keep them; the live screen
  just doesn't show them.
- **No controls.** The live view has no buttons. Every control stays on the signed-in dashboard.
- **Who can watch.** Anyone holding the live URL can watch, including a player on their phone or
  someone outside the room. They see only what the room's screen shows (my call; listed below).

### Realtime

- **Private channels.** Every channel the app uses is private (`private: true`), and "Allow
  public access" is turned off in the Realtime settings of both Supabase projects.
- **Only the server sends.** `realtime.messages` policies let browsers receive broadcasts but not
  send them. The server sends with the service-role key, which bypasses those policies.
- **No browser presence.** Browser presence tracking (`presence:quiz:{quizId}`, `usePresence`) is
  removed. Its only caller is the player's own `useReconnection`, and nothing reads the presence
  state. The host's connection status comes from `lastSeenAt` through the credentialed
  `POST presence` heartbeat, which stays.
- **Three kinds of topic:**
  - **Room** (`quiz:{quizId}`). Only what the room may see: the redacted state players and the
    live screen use, the round summary after a lock, the leaderboard. Anyone holding the quiz id
    may receive it, and nobody but the server can send on it.
  - **Host** (`host:{quizId}:{key}`). The full state, connection changes and switch requests. The
    key is unguessable and handed out only by a host-class route.
  - **Player** (`player:{quizId}:{key}`). That player's answer acknowledgement, the kick, and
    "you continued on another device". The key is unguessable, handed out only by a player-class
    route, and replaced when the credential changes at a device switch.
- **Why topic keys.** Supabase checks a client's permissions once, when it joins a channel, and
  policies decide by role and topic. Unguessable topic names keep host and player data away from
  other browsers without giving players Supabase users.

## Designer's calls (for the user to check)

1. **Hosting check.** It is "signed-in admin", reusing `ADMIN_EMAILS`. It sits behind one rule so
   owner-based hosting later only changes the rule. *Revisitable; cheap.*
2. **Credential in a cookie.** It is an HttpOnly cookie, not local storage. Page scripts can't
   read it, and the browser sends it by itself. *Cost:* one player per quiz per browser. A second
   tab in the same browser is the same player, which is how the join page's local storage already
   behaves.
3. **Credential storage.** Only a hash is stored. *Data shape:* a new nullable column on `Player`
   with a unique index. Players created before the change have none and cannot act after
   deployment: deploy between games, with no fallback for old sessions.
4. **Switch requests.** They get their own small table (player, secret hash, status, created and
   expiry times). *Data shape.*
5. **Request expiry.** 5 minutes. *Revisitable; cheap.*
6. **Live screen access.** It is public by quiz id, with no display code. *Cost:* anyone holding
   the link watches what the room sees. *Revisitable:* a per-quiz display link can replace it
   without changing anything else.
7. **No Supabase users for players.** Anonymous sign-ins would make private channels simpler. But
   anonymous users get the `authenticated` role, which today's storage policies let upload and
   delete media. Supabase also limits anonymous sign-ins per IP, which hits a room on one network.
8. **Private channels with keyed topics.** No signed payloads, and no "something changed, now
   refetch" pings. Refetch pings would make every player hit the database at once on each
   transition. The e2e branch measured the database pool ceiling at about 43 statements a second on
   dev (`docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md` on
   `test/e2e-isolated-quizzes`).
9. **Remove `POST /api/player/add`.** It is the only join that skips the join code, and it has no
   caller.
10. **Removal reason stored** (from the builder check). A kick locks the player out; a timeout
    keeps the seat. *Data shape:* the reason becomes a stored field next to the status.
11. **Ids on the room topic** (from the builder check). Player ids stay in room payloads, since
    they stop being credentials. *Revisitable:* hiding them later needs a new key in the leaderboard
    and round summary.
12. **Drop browser presence** (from the builder check). Nothing reads it, and keeping it would be
    the one place browsers may send on a channel. *Revisitable:* nothing in the UI changes.
13. **Built after the e2e branch merges** (from the builder check). `test/e2e-isolated-quizzes` is
    in its last task and rewrites the e2e suite this work extends, and it changes the join route.
    The plan starts from `master` after that merge.
14. **Where the code lives.** The fix is developed on local branches and pushed to the temporary
    private fork of GHSA-j2j8-j6g6-5f29, not to a public branch. A public push would disclose the
    holes before they are closed. Whether CI runs in that fork is unverified; if it doesn't, the
    verdict is the local `yarn test:run`, `yarn build` and the e2e suite. *Revisitable.*

## Assumptions to verify before the plan (attack these first)

- **The public key on a private channel.** A browser holding only the public key, with no
  signed-in user, is checked as the `anon` role. A `select`-only policy then lets it receive, and
  its sends fail. A service-role send reaches it. The Supabase docs show policies for
  `authenticated` only. Check on dev with a two-client spike, after agreeing a time with the e2e
  session, because turning off public access breaks the current dev app until the code changes
  land.
- **Admin realtime.** The host dashboard's realtime client gets host data through the topic key,
  not through the admin's Supabase session. Check that receiving host topics needs no JWT beyond
  the public key.

## Testing

- **Route tests, one per route in the table.** No credential, then the wrong credential (another
  player's cookie, a non-admin session), then the right one. A Removed player gets 403.
- **Use-case tests.** Every switch-request path: request, allow, deny, expire, and a second
  request while one is pending. The not-found messages are exact.
- **Repository tests.** Looking a player up by credential hash, the unique index, and expiry.
- **E2E.**
  - Every flow that exists today.
  - The device switch, with two browser contexts and the host approving.
  - The live view in a context that isn't signed in.
  - A host-class route called without the admin session.
  - The e2e branch's fixtures (`e2e/support/quiz-fixtures.ts` on `test/e2e-isolated-quizzes`)
    already set up through the admin API, and call `POST /api/quiz/start`, which becomes
    host-class. The player specs join through the UI, which sets the cookie.
  - An inactive (timed-out) player returns on the same device and keeps their score; a kicked
    player can't.
- **On the real target** (dev, then production after deployment):
  - A WebSocket capture on `/play/...` shows no full-state frame.
  - A client's send on `quiz:{quizId}` is refused.
  - `/host` and `GET /api/quiz/[quizId]/state` refuse an anonymous request.
  - Results go into a findings record, after which the four advisories can be published.

## Records

- **A new ADR, written when the work merges:** host means an admin session behind one hosting
  rule; players get server-issued credentials; channels are private, the server alone sends, and
  host and player topics are keyed.
- **ADR-005 needs a note.** Its planned move of admin checks to row-level security doesn't apply
  to Prisma, which bypasses it.
- **CLAUDE.md:**
  - The "API routes" pattern gains the class check as its first step.
  - The realtime names line changes to the three topic kinds.
- **The e2e session** (`bobrquiz-72`) gets this spec. Its fixtures and specs call routes that
  change class.

## Out of scope (recorded elsewhere)

- **One answer per question:** GHSA-rq7w-52rf-mq34.
- **Join status checks:** GHSA-g2xx-cr9j-4q77.
- **Answers after the timer:** #94.
- **Rate limits:** #95.
- **Error statuses:** #89.
- **Quiz ownership and non-admin hosts.**
  - *Premise:* admins host for the MVP.
  - *Reopen when* signups open.
  - *Needs first:* fixing the `quiz-media` storage policies
    (`docs/progress/findings/2026-10-15-storage-policies-any-user.md`), since any signed-in user can
    upload and delete there today.
- **Usage plans and limits.** Players per game, quizzes per account and similar would hang off the
  hosting rule. Not designed here.
