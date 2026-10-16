# Persist the answer lock — design

**Date:** 2026-10-15
**Status:** ✅ Complete — PR #81
**Branch:** `fix/persist-answer-lock` (from `origin/master` at d839d5f)

## Why

When the host locks answers for the current question, the lock lives only in memory for the
length of the lock request. It has never been saved: `PrismaQuizRepository.save`
(`src/infrastructure/repositories/prisma-quiz.repository.ts:144-171`) writes Quiz columns and
Answer rows but no Question, and `mapPrismaQuestionToDomain`
(`src/infrastructure/repositories/mappers/prisma-question-mapper.ts:20-39`) drops the
`answersLockedAt` column on load. No commit on any branch has touched it in
`src/infrastructure/repositories` (`git log --all -S answersLockedAt`). Locking arrived on
2026-01-24 (`17239ff`, `391dd3f`); its session plan assumed `save` covered questions.

What a user sees, today:

- **Host:** Lock Question re-enables as soon as the dashboard refetches (`use-host-quiz-state.ts:128`
  invalidates the query; `host-quiz-dashboard.tsx:82-85` gates the button on `answersLockedAt`).
- **Players:** an answer sent after the lock is accepted and scored: the next request reloads the
  quiz with the question unlocked, so the check at `quiz-session-aggregate.ts:161` passes. The
  player's inputs are disabled only by the `question:locked` broadcast, which clears itself after
  10 s (`use-round-summary-listener.ts`), and not at all after a reload or for a late joiner.
- **Leaderboard:** locking the same question again succeeds and inserts a second set of
  leaderboard snapshots (`createMany`, no upsert), a second audit row and a second broadcast.
- **Reset:** clears the lock in memory only (`quiz.ts:152-154`); nothing to clear in the database
  today, but once the lock is saved, reset must clear it too.

Found by the E2E plan check on 2026-10-15 and confirmed by a read-only root-cause investigation
(report kept in the ledger). No test caught it: the use-case test mocks `save` and never reloads;
the repository test's question rows have no `answersLockedAt` and its Prisma mock has no
`question` model; the one E2E test that would catch it ("should disable Lock Question after
locking") already fails on master and E2E is not in CI.

## Decisions

- **Write the lock with targeted repository methods** (option B of the investigation), not inside
  the whole-aggregate `save`. Reason, on one example: the host locks Q1 while player P's answer
  request has loaded the quiz but not yet saved it.
  - *A, `save` writes every question's `answersLockedAt`:* P's stale aggregate saves after the
    lock and writes `null` back. The lock is undone silently, exactly when it matters (players
    answer as the host locks), and every answer submit writes N question rows.
  - *B, targeted methods:* P's `save` does not touch questions, so the lock survives. A
    conditional write (`answersLockedAt: null` in the filter) makes a double click or a second
    host tab a no-op instead of a duplicate snapshot set. Cost: reset must call the clear
    explicitly (pinned by a test).
  - *C, the question repository's upsert:* behaves like B, but couples the admin question-edit
    mapper to game state and makes reset loop per question.
  Follows the existing precedent of targeted `IQuizRepository` methods (`updateLeaderboard`,
  `updateCurrentQuestion`, `quiz-repository.ts:15-22`).
- **Map `answersLockedAt` on load** for every quiz and question load (the read mapper is shared).
  The admin question update input stays without it, so an admin edit cannot clear a live lock.
- **The in-flight answer is not closed here.** P's answer, which passed the check before the lock,
  is still saved. Closing that needs the lock check and the answer insert in one transaction; it is
  the same check-then-act race every field in `save` has. Recorded as its own item.

## Design

1. **Domain interface** (`src/domain/repositories/quiz-repository.ts`), two methods on
   `IQuizRepository`:
   - `lockQuestion(quizId: string, questionId: string, lockedAt: Date): Promise<boolean>` — sets
     the lock only if the question belongs to the quiz and is not locked yet; `true` if it set it.
   - `clearQuestionLocks(quizId: string): Promise<void>` — clears every question's lock in the quiz.
2. **Prisma repository** (`prisma-quiz.repository.ts`):
   - `lockQuestion`: `prisma.question.updateMany({ where: { id: questionId, quizId,
     answersLockedAt: null }, data: { answersLockedAt: lockedAt } })`, returns `count === 1`.
   - `clearQuestionLocks`: `prisma.question.updateMany({ where: { quizId }, data:
     { answersLockedAt: null } })`.
3. **Read mapping** (`prisma-question-mapper.ts`, `mapPrismaQuestionToDomain`):
   `answersLockedAt: record.answersLockedAt ?? undefined`.
4. **Lock use case** (`lock-question.use-case.ts`): after `quiz.lockCurrentQuestion()` and before
   the snapshots, call `quizRepository.lockQuestion(quiz.id, question.id, question.answersLockedAt)`.
   On `false`, throw the domain's existing "already locked" error, so a lost race writes no
   snapshots, no audit row and no broadcast (the route maps the error to 400 as today).
5. **Reset use case** (`reset-quiz.use-case.ts`): after `quiz.reset()` and before `save`, call
   `quizRepository.clearQuestionLocks(quiz.id)`. Covers host "Restart quiz" and admin reset, which
   both go through it. Clear first (planning, 2026-10-15): if the clear failed after the save, the
   quiz would be Pending with a stale lock on question 1, and reset refuses a Pending quiz, so it
   could not be retried (Design 6 later made the next start clear it, but the quiz would sit
   Pending with question 1 locked until then); a failed save after the clear leaves an Active or
   Completed quiz with no locks, and reset can be retried.
6. **Start use case** (`start-quiz.use-case.ts`, added after Task 1's review, 2026-10-16): after
   `quiz.startQuiz()` and before `save`, call `clearQuestionLocks(quiz.id)`. A lock request that
   loaded the Active quiz before a reset can write its lock after the reset's clear (the
   conditional filter does not see the quiz status); a quiz only starts from Pending, so clearing
   at start is always right and narrows that window to a lock request that loads before the
   reset and writes after the following start (whose own stale `save` then also writes the old
   status back: the existing `save` race).
7. **Unchanged:** the host hook, the player UI, realtime, the answer route. After the fix, a late
   answer gets the existing 400 "Answers are locked for this question." as its submission message.

## Testing

Failing first, then passing:

- **Repository** (`src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`): a loaded
  question carries `answersLockedAt`, `isQuestionLocked` is true and `submitAnswer` throws;
  `lockQuestion` calls `updateMany` with the conditional filter and returns `true`/`false` from the
  count; `clearQuestionLocks` clears by quiz.
- **Integration** (`src/tests/integration/answer-lock-persistence.test.ts`): the real
  `PrismaQuizRepository` and use cases against a stateful Prisma fake (the investigation's draft):
  lock then reload keeps Q1 locked and Q2 unlocked; a later submit is rejected; a stale aggregate
  saved after the lock does not undo it; a second lock is rejected and writes one snapshot set;
  of two concurrent locks exactly one wins; reset clears the persisted locks; start clears a lock
  written after a reset. The fake's `quiz.update` throws on nested relation writes, so a `save`
  that wrote locks that way could not pass silently.
- **Use cases** (`lock-question.use-case.test.ts`, `reset-quiz-use-case.test.ts`,
  `start-quiz-use-case.test.ts`): `lockQuestion` called with the quiz, question and time; `false`
  throws and saves no snapshots; reset and start call `clearQuestionLocks`, and start from a
  non-Pending quiz calls neither it nor `save`.
- Only the lock, reset and start tests' `IQuizRepository` mocks gain methods (lock both, reset and
  start `clearQuestionLocks`): every other mock is cast `as unknown as`, so `tsc` stays clean
  without touching them (plan check, 2026-10-15; start added with Design 6).
- **Route** (`src/tests/app/api/lock-question-route.test.ts`, end-of-branch fix, 2026-10-16): a
  failed broadcast still returns 200 with the summary (the one route test that failed first);
  "Question already locked" → 400 and is logged; an inactive quiz → 404 (regression pins).
- Verdict: `yarn test:run` with counts; `yarn lint`; `tsc`.
- **Real target:** with the dev server, lock a question on the host dashboard and check the button
  stays disabled after the refetch, and that a player's answer after the lock is refused. The E2E
  branch's two round-transitions lock tests are the automated check once both branches are in.

## Out of scope (recorded as separate items)

- A failure after the lock is persisted (snapshot read or write, player load, building the
  summary, `save`) leaves the question locked with no round summary, and a retry gets "Question
  already locked", so the host loses that round's summary and the next round's rank deltas lack
  a baseline. Players are still refused correctly. It is the price of persisting the lock first
  so a lost race writes nothing (Design 4); undoing it would need a per-question unlock on
  failure (Task 2 review, 2026-10-16). The route's realtime broadcast, the likeliest of these
  steps to fail, no longer counts: the end-of-branch passes (2026-10-16) made a failed broadcast
  a logged warning with a 200, as in the start and reset routes.

- The in-flight answer race (an answer loaded before the lock and saved after it).
- Every `save` regenerates answer ids (`prisma-quiz.repository.ts:98`), so the `answerId` sent to
  players never matches a database row.
- A quiz with `FIXED` scoring may fail to load: `save` writes `scoringDecayRate ?? 2.0` and `Quiz`
  rejects a decay rate for `FIXED` (`quiz.ts:55-58`). Unverified.
- Leaderboard snapshots are not cleared on reset.
- A custom timer duration is not saved; the reload falls back to `timePerQuestion`.
- `submitAnswer` accepts answers for any question id, not only the active one.
- The player screen ignores `answersLockedAt` and relies on the 10 s broadcast.
- The whole-aggregate `save` is a lost update: it deletes every answer of the quiz and re-creates
  the loaded aggregate's, with no transaction or version check, so two players answering at once
  can drop one answer, and any stale save writes back an old status or question index
  (`prisma-quiz.repository.ts` `save`; end-of-branch review, 2026-10-16).
- The lock and start routes map every error that is not "not found" (lock: or "not active") to
  400 and log nothing in start: a database outage reads as a bad request (silent-failure hunt,
  2026-10-16; pre-existing).
- Both reset routes map reset's refusal of a Pending quiz ("Quiz can only be reset if it is in
  Active or Completed status.") to 500 (silent-failure hunt, 2026-10-16; pre-existing).
