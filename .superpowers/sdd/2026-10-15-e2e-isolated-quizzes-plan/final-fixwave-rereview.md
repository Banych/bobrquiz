# Fix-wave re-review — e2e isolated quizzes (ecdad04..6ce5372)

Agent: task-reviewer-capable (opus pin, no model parameter), read-only, 2026-10-18. Returned in its
handback; saved by the main session. Tamper check: HEAD 6ce5372 and empty status at dispatch and
return; ledger listing unchanged.

## Verdict

CHANGES_REQUESTED, minor only. Every ruling's fix is present and covers every place the finding
applies; no assertion lost in the reconnection merge; unit, lint and tsc green; `playwright test
--list` shows 45 tests. Close R1 and R2 before merge (one line each); R3–R6 optional.

## Per-ruling table

| Finding ids | Fix commit | Addressed? | Note |
|---|---|---|---|
| S1 part 1, P6 | eaf8fbb | Yes | `submitJoinForm` waits for the POST in `Promise.all` with the click; `joinAsPlayer` expects 200 with the body. Both UI join paths use it (player-join :19, :42; reconnection :20, :49); no other join path in `e2e/` |
| S2 | eaf8fbb | Yes | 404 + `/was not found/i`; `'INVALID'` passes zod `min(4)`, use case throws not-found (`join-session.use-case.ts:21`), route maps to 404 |
| P2 | eaf8fbb, 368e543 | Yes | Both clears gone; resume test sets its own key. Auth-file grep not re-run (file off-limits) |
| W3, P1, S7, T3 deferred | 368e543 | Yes | 5 → 2. Kept the old :132 (renamed) and added :80's "send answer" check; the ledger describes it the other way round, same result. Every deleted assertion is in a kept test |
| W5, S1 part 2 | 368e543 | Yes | `failOnFlakyTests: true`, retries unchanged; no CI workflow runs E2E |
| S1 part 3 | 368e543 | Yes | Pitfall 5 and README tip agree with the config |
| S4 | 8ed0f17, 746cc4e | Yes, gap R1 | Every written title shape matches; four new null cases |
| S5 | none | Agree, see R1 | Premise holds today; a fixture title-shape change would land in the silent skip |
| S3 | none | Agree | Missing join limit now fails with the 429 body |
| S6 | 2c445e3 | Yes | Nit R6 |
| W1 | 2c445e3 | Yes | 507 → 522 matches the ledger |
| W2 | 2c445e3 | Yes | |
| W4 | 2c445e3 | Yes | Code still throws AggregateError |
| W6 | 2c445e3 | Yes | New invalid-code test doesn't follow it (R4) |
| W7 | 2c445e3 | Yes | Figures match the ledger |
| P3 | 2d17e20 | Yes | Spec still lists the true/false preset (R2) |
| P4 | 2d17e20 | Yes | Literal only in `paths.ts:3` and `.gitignore:18`; `playwright test --list` loads the config |
| P5 | 2d17e20 | Yes | All three sites |
| R1–R3 (simplification) | none | Agree | |
| Deferred-minors triage | n/a | Agree | |

Interleavings in `player-join.ts`: the waiter registers before the click; a rejected click is
handled by `Promise.all`; the predicate (POST + path suffix) can't match prefetch/RSC GETs; worst
case 30 s + 30 s fits the 60 s test timeout.

## New findings

**R1 — Minor — the sweep's parse of the fixture's own title is untested.** Verified by reading.
`quiz-fixtures.spec.ts` only parses literal strings; "keeps fresh ones" passes whether
`fixtureTimestamp` returns null or a fresh stamp. Widening `randomSuffix` would silently stop the
sweep ("deleted 0", exit 0). The S4 fix introduced the coupling. Fix: in the create test,
`expect(fixtureTimestamp(quiz.title)).not.toBeNull();`.

**R2 — Minor — spec lists the deleted true/false preset** (`design.md:98-99`). Fix: dated note.

**R3 — Minor, suspicion — the join helper reads the body even on success**
(`player-join.ts:35-37`). If Chromium dropped the body after the client navigation, `text()` would
throw on a good join. Not observed (~11 successful joins passed). Fix: read the body only when the
status isn't 200.

**R4 — Minor, optional — the invalid-code test's error text is unscoped** (`player-join.spec.ts:46`),
against README tip 5. Low risk: the join form's error path calls no `console.error`. Fix: scope to
`page.locator('form')`.

**R5 — Nit — two edited doc lines are wide**: `CLAUDE.md:195` (117 chars), plan `:1205` (~103).

**R6 — Nit — spec §6 "first request that reaches the database"** is really the first request to any
route or page that imports the services factory (`factories.ts:1` imports the client), including a
join that gets a 429.

## Evidence

- Start and end: HEAD `6ce5372d1cfdf9322e4057c0c88e9bb52f390199`, `git status --porcelain` empty.
- `git log --oneline ecdad04..6ce5372`: 8 commits; `git diff --stat`: 18 files, +629/−134.
- `yarn test:run`: Test Files 69 passed | 1 skipped (70); Tests 522 passed | 1 skipped (523); exit 0.
- `yarn lint`: 0 errors, 5 warnings (outside the diff), exit 0. `tsc`: exit 0.
- `yarn -s playwright test --list`: Total: 45 tests in 12 files (listing only).
- Per-commit test counts match the ledger's E2E counts (fixture spec 8 + setup/cleanup = 10;
  at eaf8fbb 5 + 3 + 2 = 10; at 368e543 2 + 2 = 4).
- Reconnection assertion comparison against `ecdad04`: every deleted test's assertions present in
  a kept test.
- Attribution grep over the range: 0.

## Unverified

- E2E outcomes and the flaky probe: from the ledger.
- The auth file's player-session key count: from the ledger.
- R3's failure mode.
- That a module-load throw in the join route is an HTML 500 in Next dev.
- Whether `next build` loads `client.ts`.
