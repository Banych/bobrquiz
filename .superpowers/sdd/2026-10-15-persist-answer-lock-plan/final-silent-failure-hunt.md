# Silent-failure hunt: persisting the answer lock (d839d5f..b9fc943)

Read-only hunt over the src diff, plus the routes and the host hook that call the changed use cases.
Seven findings: one High, one Medium, five Low. Two of them (S6, S7) are already on master and sit on
the paths this branch changed. Rulings already in the ledger (clear before save on reset, the
in-flight answer race, `updatedAt` bumps, a failure after the persisted lock) are not raised again.
S1 is the exception: it shows the last of these is worse than the spec says.

## S1 (High): a failed broadcast after a persisted lock loses the round, and a retry cannot recover it

**Where:** `src/app/api/quiz/[quizId]/lock-question/route.ts:25-39` (route unchanged by the branch;
what happens when it fails is changed by `lock-question.use-case.ts:38-45`).

**Scenario:** `lockQuestionUseCase.execute` succeeds: the lock, the snapshot set and `save` are all
written. Then `await broadcastRoundSummary(quizId, roundSummary)` (line 28) rejects. The broadcast
pool rejects with `Broadcast channel quiz:… failed with status TIMED_OUT|CHANNEL_ERROR|CLOSED`
(`broadcast-channel-pool.ts:55-70`). The same `catch` handles that error and returns **400** with
the realtime message. Nothing is logged: the catch block has no `console.error`. The host hook's
`onSuccess` (`use-host-quiz-state.ts:122-129`) never runs, so `setRoundSummary` never gets the
summary the server built. The host sees "Broadcast channel … failed" and clicks Lock again. The
retry is refused with "Question already locked": the reloaded aggregate is locked, so the domain
check at `quiz-session-aggregate.ts:236` throws.

**Why the spec's ruling doesn't cover it:** the out-of-scope item lists "snapshot read or write,
player load, building the summary, `save`", which are all database steps that rarely fail. The
realtime send fails more often (a channel subscribe timeout on a cold pool), and it fails *after*
the use case returned. Before this branch, a retry after a broadcast failure worked (a duplicate
snapshot set, but the host and players got the summary). After it, the round summary is lost for
good, and players never get `question:locked`, so their inputs stay enabled until they submit and
get a 400. The 400 status also tells the host the lock failed, when it succeeded.

**Fix:** treat the broadcast as best-effort, as the reset and start routes already do
(`reset/route.ts:26-33`, `start/route.ts:22-29`):

```ts
    const roundSummary = await lockQuestionUseCase.execute(quizId);

    // Broadcast to all quiz participants; the lock is already persisted, so a
    // failed broadcast must not turn a successful lock into an error
    try {
      await broadcastRoundSummary(quizId, roundSummary);
    } catch (broadcastError) {
      console.warn('Failed to broadcast round summary after lock', {
        quizId,
        questionId: roundSummary.questionId,
        error: broadcastError,
      });
    }

    return NextResponse.json(roundSummary);
```

Add a route test: `broadcastRoundSummary` rejects → 200 with the summary body. On master the
pre-existing silent skip in `broadcast-round-summary.ts:15-17` (`if (!client) return;`, with no log
when the Supabase server client is missing) has the same effect: players get no lock event. Worth a
`console.warn` there too, but it is not caused by this branch.

## S2 (Medium): database failures in the new writes come back as 400 with raw Prisma text, unlogged

**Where:** `src/app/api/quiz/[quizId]/lock-question/route.ts:31-40` and
`src/app/api/quiz/start/route.ts:32-40`.

**Scenario:** the branch adds a database write before anything else is persisted:
`lockQuestion` on the lock path and `clearQuestionLocks` on the start path. If it throws (pool
exhausted, connection reset, `P1001`, `P2024`), both routes fall into a catch that does not log and
maps every message without "not found" or "not active" to **400**. The host sees a Prisma
diagnostic as if they had made a bad request. Nothing reaches the server log (the reset routes do
log, at `reset/route.ts:37` and `admin/.../reset/route.ts:14`). The lock path is the one where it
matters: a 400 sends the host looking for something wrong with the quiz, not for a database
outage.

**Fix (lock route; start route the same shape):**

```ts
  } catch (error) {
    console.error('[API] lock question error:', { error });
    const message =
      error instanceof Error ? error.message : 'Unable to lock question.';

    const status = /not found|not active/i.test(message)
      ? 404
      : /already locked|no active question/i.test(message)
        ? 400
        : 500;
```

(`quizId` is not in scope in the catch block. Hoist `const { quizId } = …` above the `try`, or log
`await params`.)

## S3 (Low): `lockQuestion === false` is always reported as "already locked"

**Where:** `src/application/use-cases/lock-question.use-case.ts:43-45`;
`src/infrastructure/repositories/prisma-quiz.repository.ts:216-226`.

**Scenario:** `count === 0` has three causes: the question is already locked (the intended one),
the question row was deleted between `findById` and the `UPDATE` (an admin deletes or re-saves the
quiz's questions during a live game), or the quiz itself was deleted (the questions cascade). The
last two also produce "Question already locked" and a **400**, so the host is told someone else
locked it when the question or quiz is gone. The `quizId` filter cannot cause this on its own,
because the question was loaded through the quiz's relation. All three causes are rare, but the
message points the host the wrong way.

**Fix:** tell them apart on the false path only (it is already rare, so the extra read costs
nothing on the happy path):

```ts
    if (!locked) {
      const fresh = await this.quizRepository.findById(quizId);
      if (!fresh) {
        throw new Error(`Quiz with ID ${quizId} not found.`);
      }
      if (!fresh.quizQuestions.some((q) => q.id === currentQuestion.id)) {
        throw new Error(`Question ${currentQuestion.id} not found in quiz ${quizId}.`);
      }
      throw new Error('Question already locked');
    }
```

The "not found" messages map to 404 through the route's existing regex. Pin each branch with a
use-case test.

## S4 (Low): the `!` on `answersLockedAt` is the only guard between a missing value and a false "locked"

**Where:** `src/application/use-cases/lock-question.use-case.ts:41`.

**Scenario:** today `lockCurrentQuestion()` either sets a `Date` or throws
(`quiz-session-aggregate.ts:230-241`), so the assertion holds. If that method ever stops setting
the field (for example, it starts returning the timestamp instead), `undefined` reaches
`updateMany({ data: { answersLockedAt: undefined } })`. Prisma drops `undefined` keys, so the data
is empty and the filter still matches one unlocked row. I have not checked whether Prisma returns
`count: 1` for an empty-data `updateMany` (unverified). If it does, the use case reports success and
writes snapshots and a summary, but nothing is locked: the exact bug this branch fixes, now hidden
by a green path. The unit test would catch the undefined
(`expect(question.answersLockedAt).toBeInstanceOf(Date)`), but the type system would not.

**Fix:**

```ts
    quiz.lockCurrentQuestion();
    const lockedAt = currentQuestion.answersLockedAt;
    if (!lockedAt) {
      throw new Error('Locking the current question did not set a lock time.');
    }

    const locked = await this.quizRepository.lockQuestion(
      quizId,
      currentQuestion.id,
      lockedAt
    );
```

## S5 (Low): the "stale save does not undo the lock" pin would pass if `save` regressed through a nested write

**Where:** `src/tests/integration/answer-lock-persistence.test.ts:36-37` (fake `quiz.update`), and
the test at `:166`.

**Scenario:** the test exists to keep option A (writing every question's lock in `save`) out. The
fake's `quiz.update` is `Object.assign(state.quiz, data)`, and `quiz.findUnique` overrides
`questions` from `state.questions` (`:27-33`). If `save` gained the most natural Prisma form of
option A, `prisma.quiz.update({ data: { …, questions: { updateMany: … } } })`, the fake would store
the nested object on `state.quiz.questions` and ignore it on reload, and the test would stay green.
Only a regression through `prisma.question.*` is caught. A `tx.question.update` call is caught too,
because it raises a TypeError in the fake.

**Fix:** make the fake refuse writes it does not model:

```ts
      update: vi.fn(async ({ data }: { data: Row }) => {
        const nested = ['questions', 'answers', 'players'].filter(
          (key) => key in data
        );
        if (nested.length > 0) {
          throw new Error(`Fake quiz.update does not model nested writes: ${nested.join(', ')}`);
        }
        return Object.assign(state.quiz, data);
      }),
```

## S6 (Low): no route test pins the lock route's status mapping

**Where:** `src/tests/app/api/quiz-routes.test.ts` (the lock route is stubbed as `{}` at `:44` and
never exercised).

**Scenario:** the spec relies on "the route maps the error to 400 as today" for the lost race, and
on 404 for "not active". Only the live check (findings 2026-10-16) has seen the 400. A regex edit
in the route (for example, adding `/locked/` to the 404 branch) would ship without a failing test.
S1 and S2 change this route, so they need tests anyway.

**Fix:** add route tests for the lock route covering: `execute` rejects with "Question already
locked" → 400; it rejects with "Quiz is not active or does not exist." → 404; `execute` resolves but
`broadcastRoundSummary` rejects → 200 with the summary (after S1); `execute` rejects with a
non-domain `Error` → 500 (after S2).

## S7 (Low, on master already, on the reset path the spec reasons about): the reset refusal maps to 500

**Where:** `src/app/api/quiz/[quizId]/reset/route.ts:40-44` and
`src/app/api/admin/quizzes/[quizId]/reset/route.ts:17-21`.

**Scenario:** spec Design 5 argues "reset refuses a Pending quiz, so it could not be retried". The
refusal's message is "Quiz can only be reset if it is in Active or Completed status."
(`quiz.ts:143-144`). It matches neither `/not found/` nor `/cannot reset|invalid state/`, so the
host gets **500** and the server log records an error for a normal state refusal. That is not
silent, but it labels an expected domain refusal as a server fault and hides it among real 500s.
The branch did not introduce it.

**Fix (both routes):**

```ts
      : /cannot reset|invalid state|can only be reset/i.test(message)
```

## Checked and cleared

- **`record.answersLockedAt ?? undefined`** (`prisma-question-mapper.ts:35`): the column is
  `DateTime?`, so Prisma yields only a `Date` or `null`. No invalid value can hide behind `??`. The
  host DTO converts it with `?.toISOString() ?? null` (`quiz-mapper.ts:23`), and the player mapper
  passes the DTO string through (`player-quiz-mapper.ts:13`). No question-repository write path
  sends `answersLockedAt`, so loading it cannot let an admin edit clear a live lock.
- **`clearQuestionLocks` affecting 0 rows:** this happens only for a quiz with no questions (correct)
  or a quiz deleted since `findById`. In that case the following `save` (`prisma.quiz.update`)
  throws `P2025` and the reset routes report it. No silent path.
- **Reset and start partial writes:** clear-then-save on reset is ruled. On start, a failed `save`
  after the clear leaves a Pending quiz with no locks, which is harmless and retryable.
- **Use-case and repository tests:** the lost-race unit test asserts no snapshots, no `save` and no
  audit row. The parallel-lock integration test asserts both `lockQuestion` outcomes
  (`[false, true]`), so the false branch is really exercised. The reset and start tests assert call
  order. Apart from S5, none is vacuous.
- **Audit log** (`void … .catch(console.error)`): fire-and-forget with logging. This is
  pre-existing and logged, not silent.

## Evidence

```
git status --porcelain && git rev-parse HEAD
  →  M .superpowers/sdd/2026-10-15-persist-answer-lock-plan/progress.md   (present before this hunt)
     b9fc943f8662cc6f420d272d519c906c90f1f52f   (same before and after)
git diff --stat d839d5f..b9fc943
Read: design spec, ledger progress.md, review-d839d5f..b9fc943.diff
cat -n src/application/use-cases/{lock-question,reset-quiz,start-quiz}.use-case.ts
command grep -rnE "lockQuestion|LockQuestionUseCase|ResetQuizUseCase|StartQuizUseCase|resetQuiz\b|startQuiz\b|clearQuestionLocks" src --include='*.ts' --include='*.tsx' | grep -v src/tests
cat -n src/app/api/quiz/[quizId]/lock-question/route.ts src/app/api/quiz/[quizId]/reset/route.ts \
       src/app/api/admin/quizzes/[quizId]/reset/route.ts src/app/api/quiz/start/route.ts
sed -n 40,115p src/application/services/quiz-service.ts
command grep -rn "answersLockedAt" src (non-test): only the mapper reads it; no repository write besides lockQuestion/clearQuestionLocks
cat src/infrastructure/realtime/broadcast-round-summary.ts; sed -n 20,100p src/infrastructure/realtime/broadcast-channel-pool.ts
sed -n 60,170p src/hooks/use-host-quiz-state.ts; sed -n 50,80p src/components/host/host-quiz-dashboard.tsx
git show d839d5f:'src/app/api/quiz/[quizId]/lock-question/route.ts' | diff - <current>   → route-unchanged
sed -n 150,170p,225,252p src/domain/aggregates/quiz-session-aggregate.ts; sed -n 140,160p src/domain/entities/quiz.ts
sed -n 20,215p src/infrastructure/repositories/prisma-quiz.repository.ts
command grep -n ... src/tests/app/api/quiz-routes.test.ts   → no lock-question route test (stub at :44 only)
yarn test:run <integration, lock, reset, start, prisma-quiz-repository test files>
  → Test Files 5 passed (5), Tests 41 passed (41)   (the `exit=0` printed was tail's, not vitest's)
```
