# Whole-branch review — e2e isolated quizzes (e39a9e0..23140ab)

Agent: task-reviewer-capable (opus pin, no model parameter), read-only, 2026-10-18. Returned in its
handback; saved by the main session. Tamper check: HEAD ecdad04 and empty status at dispatch and
return; ledger listing unchanged apart from the other two reports. It wrote one log outside the
repo (`scratchpad/wbr-test-run.txt`, the `yarn test:run` output).

## Verdict

CHANGES_REQUESTED, minor only. No correctness bug found in production or fixture code. Every spec
item is implemented or replaced by a user-approved plan deviation. No worker's sweep can delete
another worker's quiz. Teardown runs on failure and handles Active quizzes. Both env parsers are
strict and loud, and production defaults are unchanged (pool 2, join limit 10). Requested: two stale
lines in spec and plan (W1), a wrong ledger path in the plan (W2), a reconnection test whose name
doesn't match what it asserts (W3), a ledger line that misstates what Task 1's fix round 2 achieved
(W4). W5–W7 are optional or follow-ups.

## Findings

**W1 — Minor — spec and plan contradict the branch about app code.** Verified by reading.
- Spec `2026-10-15-e2e-isolated-quizzes-design.md:184`: "`yarn lint` and `tsc` pass; `yarn test:run`
  unchanged (no app code changes)."
- Plan `2026-10-15-e2e-isolated-quizzes-plan.md:63`: "App code changes: only the one `data-testid`
  (deviation 2)."
- Sections 6–7 and Tasks 4b/5b add `pool-size.ts`, change `client.ts`, `rate-limit.ts` and the join
  route, and add unit tests (507 → 522).
- Fix: amend both lines with a dated note pointing to sections 6–7 and Tasks 4b/5b.

**W2 — Minor — plan names the wrong ledger path.** Verified by reading.
- Plan `:1203`: "Ledger `.superpowers/sdd/2026-10-15-e2e-isolated-quizzes/progress.md`"; the real
  directory is `…-plan/`.
- Fix: correct the path.

**W3 — Minor — a reconnection test's name doesn't match what it checks.** Verified by reading.
- `e2e/player-reconnection.spec.ts:117` "should show reconnecting state during sync": the body
  (118–129) goes offline, waits for the banner, goes online, checks the answer box is enabled. It
  never asserts a reconnecting or syncing state — the defect Task 3 fixed at :132.
- It is a strict subset of :80 ("auto-reconnect"); :100 is a strict subset of :56. Each redundant
  test costs one UI join and one fixture quiz (~41 statements).
- Fix before merge: rename or delete :117. Merging :100 into :56 and :117 into :80 can follow the
  simplification report.

**W4 — Minor — the ledger says the sweep's blocking was fixed; it wasn't.** Verified by reading;
the Playwright behaviour is from its docs, not a run.
- `e2e/support/quiz-fixtures.ts:169-174` still throws an AggregateError at the end.
- Ledger line 36 gives fix round 2's reason as: the sweep "fails the cleanup project and so blocks
  every chromium test". The fix tries every delete but still throws, so `cleanup` fails and
  `chromium` (depends on it, `playwright.config.ts:42-48`) does not run.
- Fix: record the actual choice (blocking on purpose, loud over silent), or warn and pass. The
  reviewer leans to keeping it blocking and correcting the ledger.

**W5 — Minor, already on master, follow-up — local retries hide failures in the exit code.**
- `playwright.config.ts:16`: `retries: process.env.CI ? 2 : 1`. Task 5 run 2 had 4 flaky tests
  (429s) and exit 0, caught only by reading the summary.
- Suggested: `failOnFlakyTests` locally (Playwright 1.64, `test.d.ts:1324`), or say in
  `e2e/README.md` that flaky ≠ pass. Record as a follow-up.

**W6 — Minor — a gotcha learned here has no durable home.**
- `e2e/admin-auth.spec.ts:50`: Next's dev overlay repeats `console.error` text, so an unscoped
  `getByText` can hit a timing-dependent strict-mode violation. Lives only in a comment and the
  ledger. Fix: one line in `e2e/README.md` "Debugging Tips".

**W7 — Minor — the pool findings record doesn't say how the fix turned out.**
- `docs/progress/findings/2026-10-18-e2e-db-pool-queueing.md` ends at "Cleanup"; the post-fix
  result (pool 10: 48 passed in 35.3 s, `--retries=0`, exit 0; two back-to-back default runs 48/48)
  is only in the ledger (lines 97, 127). The join-limit 429 measurement is only in spec §7 and the
  ledger. Fix: a dated "Outcome" paragraph. Optional.

## Checked and found correct

- **Spec coverage.** Design 1 (helper, prefix, reset-then-delete, `<METHOD> <path> failed: <status>
  <body>` at `quiz-fixtures.ts:65-82`, four presets); Design 2 (every table row; `quiz.setup.ts` and
  `fixtures.ts` deleted, `.gitignore` line gone; `git grep` for the old names finds only a dated
  session doc and the seed's own default); Design 3 (deviation 6, title timestamp instead of
  `createdAt`, which `list-all-quizzes.use-case.ts:22` fakes as `new Date()`); Design 4 (timer scoped
  to the only `role="timer"`, `exact: true`, mocks before `goto`, "Page Not Found" exists);
  sections 6–7 as written.
- **Isolation under `fullyParallel`, 6 workers.** Only two sweeps run inside `chromium`
  (`quiz-fixtures.spec.ts:137,164`), each with a random 6-character label prefix. The default sweep
  runs only in `cleanup`, before chromium. A live quiz is deleted only if a test stays paused > 30 min
  while another run starts, or clocks differ by > 30 min: accepted. Titles unique per call.
  testMatch patterns don't overlap. Module-level `let quiz` in `player-reconnection.spec.ts:43` safe.
- **`fixtureTimestamp`.** Parses every title shape the branch creates; null for no timestamp;
  admin `getByRole('cell', {name})` substring matches can't collide (13-digit stamps).
- **Teardown on failure.** Every created quiz deleted pass or fail, errors collected and thrown once
  (`quiz-fixtures.ts:197-212`); Active reset first (`delete-quiz.use-case.ts:13-15` refuses Active);
  404 = gone; `createTestQuiz` deletes before rethrowing; expired admin session → 401 JSON
  (`src/proxy.ts`), so `call()` throws; the admin list has no pagination.
- **Env parsing.** Unset/empty/whitespace → default; `' 4 '` → 4; `0`, `-1`, `2.5`, `ten`, `10abc`,
  `+5`, `1e3` throw; ASCII digits only; dotenv strips quotes; both errors name the variable;
  production defaults unchanged.
- **Module-scope reads.** Dev caches `PrismaClient` on `globalThis`, so a pool change needs a restart
  (README says so). Join route reads once per module evaluation; a bad value → every join 500 with
  the variable named. Vitest loads only `.env`; no unit test imports the join route; repository
  tests mock the client. Layer rules hold.
- **Flakiness.** No `waitForTimeout` in the branch's specs (two remain, pre-existing:
  `auth.setup.ts:49`, `admin-auth.spec.ts:159`). No timer auto-locks answers
  (`use-countdown-timer.ts`, `player-session-screen.tsx:378-383`). `ol` is the only `<ol>` in src.
- **Docs.** CLAUDE.md pitfall 5, `e2e/README.md`, `.env.example`, spec §6–7, ledger 89–131 and the
  persist-answer-lock findings update agree. No AI attribution in the range; no token, cookie or
  password pattern in added lines.

## Triage of deferred minors

| Item | Ledger ruling | Triage | Reason |
|---|---|---|---|
| T1: quiz untracked while `createTestQuiz` runs at test timeout | no change | Fine | Timestamped title; next run's sweep removes it after 30 min |
| T1: `JSON.parse(...) as T` casts | no change | Fine | Shapes pinned by `quiz-fixtures.spec.ts` |
| T1: sweep counts an already-gone quiz as deleted | no change | Fine | Count only logged; keeps `toBe(1)` stable |
| T1: AggregateError text duplicated | no change | Fine | Harmless |
| T2: unanchored heading regexes | no change | Fine | A new match fails with strict mode, not silently |
| T2: bare `ol` selector | no change | Fine | The only `<ol>` in src |
| T3: loose last-seen regexes | no change | Fine | Drift tolerance; still separates seconds from minutes |
| T3: fixed mock player ids | no change | Fine | Routes page-scoped, quiz id in URL |
| T3: overlapping reconnection tests | deferred to branch passes; premise: spec keeps five tests | Rename or delete :117 before merge (W3); merging fine to defer | Misleading name is the Task 3 defect; merging is test design |
| T4: `admin-quiz-crud` `beforeAll` context never closed | no change | Fine | On master; disposed with the worker |
| T4b: no upper bound on `DATABASE_POOL_MAX` | `.env.example` warns | Fine | Deliberate setting only; pooler fails loudly |
| T4b: no `'010'` / `'99999'` cases | no change | Fine | Harmless; regex pinned by rejections |
| T5b: no route test for default 10 | no change | Fine | Literal at one call site; fallback unit-tested |
| T5b: huge digit string disables the limit | no change | Fine | Deliberate setting; `.env.example` says never raise when deployed |

## Evidence

- Start and end: HEAD `ecdad04555a10cae7c2af54fa84dc23e58395f3d`, `git status --porcelain` empty.
- `git show --stat ecdad04`: only the ledger, 3 lines.
- `git diff e39a9e0..23140ab -- src e2e playwright.config.ts .env.example .gitignore | diff -q -
  review-branch.diff`: exit 0.
- `yarn test:run`: Test Files 69 passed | 1 skipped (70); Tests 522 passed | 1 skipped (523); exit 0.
- `yarn lint`: 0 errors, 5 warnings (all in untouched files: `question-view.tsx`, three
  `tests/load/*.js`), exit 0.
- `yarn -s tsc --noEmit -p .`: exit 0.
- Attribution grep over `git log e39a9e0..HEAD`: 0. Secret-pattern grep over added lines: 0.

## Unverified

- Playwright's handling of a failed dependency project (W4) and teardown's time slot after a test
  timeout: from docs and the ledger, not a run.
- Whether Next dev re-evaluates the join route when `.env.development.local` changes (README says
  restart).
- The worktree's `.env.development.local` values (not read, per constraints).
- E2E counts and dev-database leftover counts: from the ledger, not re-run.
- Why `admin-auth.spec.ts:145` once stayed on `/login`.
