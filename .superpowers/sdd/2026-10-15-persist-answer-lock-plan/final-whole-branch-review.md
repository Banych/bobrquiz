# Whole-branch review — persist the answer lock (d839d5f..b9fc943)

Agent: task-reviewer-capable (opus pin, no model parameter), read-only, 2026-10-16. Returned in its
handback; saved by the main session.

## Verdict

CHANGES_REQUESTED. The fix is correct for what it sets out to do. Every Design item is implemented as
the spec says, every Testing item is present and can fail for the right reason, and the suite, lint
and tsc pass. One Important finding (W1) is new on this branch: a realtime broadcast failure in the
lock route now leaves a lock the host cannot retry. It is a one-line fix in a file the branch does
not touch yet. W2–W5 are Minor.

## Findings

**W1. Important.** `src/app/api/quiz/[quizId]/lock-question/route.ts:28`. Verified by reading, not run.
- `await broadcastRoundSummary(quizId, roundSummary);` sits inside the route's only `try`, so any
  error from it returns `400 { error }`. The start and reset routes wrap their broadcast in their own
  try/catch with `console.warn` (`start/route.ts:22-29`, `[quizId]/reset/route.ts:25-32`).
  `broadcastPool.send` rejects on `CHANNEL_ERROR`, `TIMED_OUT` or `CLOSED`
  (`broadcast-channel-pool.ts:55-69`).
- Scenario: the use case persists the lock, writes snapshots, saves and returns the summary; the
  broadcast's subscribe times out. The host gets 400 and no summary dialog; players get no
  `question:locked` (the server still refuses their answers). A retry gets 400 "Question already
  locked", so the round's summary cannot be recovered. Before this branch a retry re-ran the lock and
  the broadcast.
- The spec's out-of-scope item on "a failure after the lock is persisted" names snapshot I/O, player
  load, summary building and `save`, not the route's broadcast, which is the likeliest to fail.
  Frequency of subscribe failure: unverified.
- Fix: wrap the broadcast like start/reset (`console.warn` with quizId and error), return 200 with the
  summary; add a route test where the broadcast rejects and the route still returns 200.

**W2. Minor.** `e2e/round-transitions.spec.ts:54-55` (master's version, unchanged here). Suspected; E2E
not run. `await expect(lockButton).toBeEnabled()` runs against the shared `JOIN-KYTX` quiz, not
re-seeded per run, with `fullyParallel: true` and one retry in dev. Before the fix every page load
showed the question unlocked; with the lock persisted it fails whenever the shared quiz's current
question is already locked (an earlier run, the parallel "should disable Lock Question after locking"
test, or the test's own first attempt before a retry). The E2E isolation branch's Task 2 rewrites
this spec on per-test quizzes and waits for this merge, so it is transient. Fix: one line in the
ledger and the findings record.

**W3. Minor.** Docs disagree with each other and the code.
- Spec lines 108-109: "Only the lock and reset tests' `IQuizRepository` mocks gain the two methods" —
  since Design 6 the start mock also gains `clearQuestionLocks`, and the reset mock gains only
  `clearQuestionLocks`. Line 105 omits `start-quiz-use-case.test.ts`.
- Plan line 266 says the start clear "closes that window" (the ledger reworded only the spec to
  "narrows"); line 66 (file structure) omits `start-quiz-use-case.test.ts`; line 637 names the
  findings file `2026-10-15-…`, the real one is `2026-10-16-…`.
- Spec Design 5's "could not be retried" is partly overtaken by Design 6 (a later start clears a stale
  lock on a Pending quiz); add a clause.

**W4. Minor.** `docs/progress/findings/2026-10-16-persist-answer-lock.md:32-34` claims the run "shows
Postgres re-checks … so exactly one request wins". Two `Promise.all` runs show the outcome, not the
mechanism (the UPDATEs may not have overlapped). Reword: the outcome held in two parallel runs; the
guarantee rests on Postgres re-checking the WHERE clause under READ COMMITTED.

**W5. Minor (pre-existing, unrecorded).** `prisma-quiz.repository.ts:165-170` with
`submit-answer.use-case.ts:22-38`: `save` is `quiz.update`, `answer.deleteMany({ quizId })`,
`createMany(<this aggregate's answers>)`, no transaction, no version check. Two players submitting at
once: the second save deletes the first's answer and re-creates only its own — one answer silently
lost. The same mechanism lets a stale save write back an old status or index. The spec's out-of-scope
list has only the narrower "in-flight answer race". Not caused by this branch; record it as its own
out-of-scope item.

## Checked and found correct

- Design 1–7 match the diff: `lockQuestion` `updateMany` with `{ id, quizId, answersLockedAt: null }`
  returning `count === 1` (`id` is the primary key); `clearQuestionLocks` by `{ quizId }`; mapper
  `?? undefined`; lock persisted after `lockCurrentQuestion()` and before snapshots, throwing
  `'Question already locked'` (route maps it to 400); reset and start clear after the domain
  transition and before `save`, only after the domain guard passes.
- The `!` at `lock-question.use-case.ts:41`: `getCurrentQuestion()` returns the object
  `lockCurrentQuestion()` sets synchronously, or throws first. Safe.
- Only `PrismaQuizRepository` implements `IQuizRepository`; other mocks are cast `as unknown as`;
  tsc exit 0.
- Callers: `ResetQuizUseCase` via `quizService.resetQuiz` (host and admin reset routes);
  `StartQuizUseCase` via `quizService.startQuiz` (`/api/quiz/start`); `LockQuestionUseCase` via the
  lock route and `quizService.lockQuestion`. Wiring unchanged. Reset and start routes reload through
  `getQuizState` before broadcasting.
- No other write path clears or overwrites a persisted lock (question repository upsert has no
  `answersLockedAt`; `updatePublishState`, `updateOrder`, `UpdateQuizUseCase`, seeds, quiz `save`,
  `updateCurrentQuestion`, `updateLeaderboard` don't touch it).
- DTO path: `quiz-mapper.ts:23` emits ISO or null.
- Interleavings walked by reading: lock vs lock (one wins); lock vs stale answer save (lock survives;
  in-flight answer still accepted, out of scope); lock vs advance and lock vs finish (pre-existing
  write-back); lock vs reset vs start (narrowed by Design 6); reset or start with a failing save after
  the clear (ruled / harmless); reset vs reset (idempotent); reset-timer after lock (stays locked).

## Triage of deferred and ruled minors

| Item | Ledger ruling | Triage | Reason |
|---|---|---|---|
| T1 minor 1: lock survives a reset | Fixed: Design 6 + integration test | Fine as ruled | Verified at `start-quiz.use-case.ts:19` and the test |
| T1 minor 2: `updatedAt` bump on reset/start | No change | Fine as ruled | Only reader is the admin question GET; nothing compares it |
| T1: "one wins" unverified | Task 3 live check | Fine, discharged | Two parallel runs, one snapshot row; wording → W4 |
| T1: mapper mutation | Controller's mutation check | Fine | Restore test can't pass without the line |
| T2 minor 1: failure after persisted lock | Out of scope in spec | Fix before merge, broadcast part only (W1) | Broadcast likelier to fail; one try/catch matching siblings |
| T2 minors 2–5: tests | Fixed in round 1 | Fine | All present |
| T2 minor 6: "closes" overstates | Spec reworded | Fix before merge (docs) | Plan line 266 still says "closes" (W3) |
| T2 round 1: spy restore | try/finally in round 2 | Fine | Verified `answer-lock-persistence.test.ts:184-202` |
| Ledger: lint/tsc from the implementer only | — | Fine, discharged | Re-ran both: exit 0 |
| Out-of-scope items await a place | Open | Fine to merge open | Add W5's item when recorded |

## Evidence

- HEAD `b9fc943f8662cc6f420d272d519c906c90f1f52f` and status ` M …/progress.md` identical at start
  and end (the reviewer noted the ledger's baseline line said "empty"; the main session's own append
  made that modification before dispatch).
- `git log --oneline d839d5f..b9fc943`: 15 commits; `git diff --stat`: 17 files, 1458 insertions.
- `yarn test:run`: Test Files 67 passed | 1 skipped (68); Tests 503 passed | 1 skipped (504); exit 0.
- `yarn lint`: exit 0, 0 errors, 5 warnings, all in files the branch doesn't touch.
- `yarn -s tsc --noEmit -p .`: exit 0.
- `git diff --stat d839d5f..b9fc943 -- src/app e2e`: empty.

## Unverified

- W1 frequency; W2 (E2E not run); whether any production Question row already holds a non-null
  `answersLockedAt`; no mutation runs.
