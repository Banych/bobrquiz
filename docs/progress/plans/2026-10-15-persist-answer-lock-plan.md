# Persist the answer lock — implementation plan

**Status:** In progress

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a locked question stays locked across requests: the host's Lock button stays disabled,
later answers are refused, a second lock is a no-op, and reset clears the lock.

**Architecture:** two targeted methods on `IQuizRepository` (`lockQuestion`, a conditional
`updateMany`; `clearQuestionLocks`), the read mapper restores `answersLockedAt` on every load, and
the lock and reset use cases call the new methods. The whole-aggregate `save` stays unchanged.

**Tech stack:** Prisma 7 (pg adapter, client generated into
`src/infrastructure/database/prisma/generated/client`), Vitest.

**Spec:** `docs/progress/plans/2026-10-15-persist-answer-lock-design.md`

## Global constraints

- `save` in `prisma-quiz.repository.ts` does not change; the lock is never written through it.
- `mapQuestionToPrismaUpdateInput` (the admin question edit) does not gain `answersLockedAt`.
- `lockQuestion` filters on `{ id: questionId, quizId, answersLockedAt: null }` and returns
  `count === 1`; `clearQuestionLocks` filters on `{ quizId }` and sets `answersLockedAt: null`.
- A lost lock race throws the domain's message `Question already locked` and writes no snapshots,
  no quiz save, no audit row.
- Reset clears the locks before `save` (spec, Design 5).
- Layers: the interface in `@domain/repositories`, the implementation in infrastructure; use cases
  import from `@domain/*` only.
- Tests: `yarn test:run` is the verdict; no `.skip`; mocks reset in `beforeEach`. Before the lint
  step, `yarn eslint --fix` on the touched files.
- The worktree's `node_modules` is a symlink to the main checkout (fine for tests, lint, tsc). If
  `src/infrastructure/database/prisma/generated/client` is missing, run `yarn prisma:generate`
  first (it writes only git-ignored files).

## Review focus

1. **An answer request saving a stale aggregate after the lock** must not undo it. Pinned by the
   global constraint "`save` does not change" and Task 2's integration test "a stale aggregate
   saved after the lock does not undo it" (it saves a copy loaded before the lock through the
   real `save`).
2. **Two lock requests at once** (double click, two host tabs): one wins, the other throws and
   writes no snapshots. Pinned by Task 2 test "throws and writes nothing when another request
   locked the question first" and the repository test "reports a lost race".
3. **A restart after a locked round** must start with every question unlocked, including after a
   reload. Pinned by Task 2 integration test "clears persisted locks when the quiz is reset".
4. **An unlocked question** must load as unlocked (`undefined`, not `null`, since the domain
   checks truthiness and the DTO maps `?.toISOString() ?? null`). Pinned by Task 1's existing
   mapping test once its question records carry `answersLockedAt: null` (as a real Prisma row
   does), plus the new assertion on it; strict `tsc` also rejects `Date | null` there.
5. **A lock request for a question of another quiz** must change nothing. Pinned by the `quizId`
   in the filter (Task 1 test asserts the exact `where`).

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/domain/repositories/quiz-repository.ts` | modify | `lockQuestion`, `clearQuestionLocks` on `IQuizRepository` |
| `src/infrastructure/repositories/prisma-quiz.repository.ts` | modify | Prisma implementations |
| `src/infrastructure/repositories/mappers/prisma-question-mapper.ts` | modify | map `answersLockedAt` on load |
| `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts` | modify | repository tests |
| `src/application/use-cases/lock-question.use-case.ts` | modify | persist the lock before snapshots |
| `src/application/use-cases/reset-quiz.use-case.ts` | modify | clear locks before save |
| `src/application/use-cases/start-quiz.use-case.ts` | modify | clear locks before save (a lock written after a reset) |
| `src/tests/application/use-cases/lock-question.use-case.test.ts`, `reset-quiz-use-case.test.ts` | modify | use case tests |
| `src/tests/integration/answer-lock-persistence.test.ts` | create | lock → reload → submit → reset across the real repository |

---

### Task 1: Repository methods and read mapping

**Agent:** `implementer` (review: `task-reviewer-capable`, the conditional write is the concurrency
guarantee)

**Files:**
- Modify: `src/domain/repositories/quiz-repository.ts`,
  `src/infrastructure/repositories/prisma-quiz.repository.ts`,
  `src/infrastructure/repositories/mappers/prisma-question-mapper.ts:20-39`
- Test: `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`

**Interfaces (produces):**

```ts
// IQuizRepository, after updateLeaderboard
  /** Sets the lock if the question belongs to the quiz and is not locked yet; true if it set it. */
  lockQuestion(quizId: string, questionId: string, lockedAt: Date): Promise<boolean>;
  /** Clears the lock on every question of the quiz. */
  clearQuestionLocks(quizId: string): Promise<void>;
```

`mapPrismaQuestionToDomain` sets `question.answersLockedAt = record.answersLockedAt ?? undefined`.

- [ ] **Step 1: Write the failing tests** in `prisma-quiz-repository.test.ts`:
  - add a hoisted mock and wire it into the existing `vi.mock` factory and `beforeEach`:

```ts
const questionMocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));
// in the vi.mock factory's prisma object:   question: questionMocks,
// in beforeEach:
//   Object.values(questionMocks).forEach((mockFn) => mockFn.mockReset());
```

  - in the existing test "maps a quiz record into an aggregate", add `answersLockedAt: null,` to
    both question records (a real Prisma row always has the key), and assert for the first
    question after sorting:
    `expect(aggregate?.quizQuestions[0].answersLockedAt).toBeUndefined();`
    (adapt the variable names to the test). With the key present, this fails if the mapper
    passes `null` through;
  - add inside the `describe`:

```ts
  it('restores a persisted answer lock when loading the aggregate', async () => {
    const now = new Date('2025-01-01T00:00:00Z');
    const lockedAt = new Date('2025-01-01T00:00:20Z');
    quizMocks.findUnique.mockResolvedValue({
      id: 'quiz-1',
      title: 'Math',
      status: 'Active',
      currentQuestionIndex: 0,
      activeQuestionId: 'q1',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
      scoringDecayRate: 2.0,
      joinCode: 'JOIN',
      startTime: now,
      endTime: null,
      timerStartedAt: now,
      timerExpiresAt: new Date(now.getTime() + 30_000),
      createdAt: now,
      updatedAt: now,
      questions: [
        {
          id: 'q1',
          quizId: 'quiz-1',
          text: 'What is 2 + 2?',
          mediaUrl: null,
          mediaType: null,
          options: [],
          correctAnswers: ['4'],
          type: 'text',
          points: 10,
          orderIndex: 0,
          isPublished: true,
          answersLockedAt: lockedAt,
          createdAt: now,
          updatedAt: now,
        },
      ],
      players: [{ id: 'player-1' }],
      answers: [],
    });

    const aggregate = await repository.findById('quiz-1');

    expect(aggregate?.quizQuestions[0].answersLockedAt).toEqual(lockedAt);
    expect(aggregate?.isQuestionLocked('q1')).toBe(true);
    expect(() => aggregate?.submitAnswer('player-1', 'q1', '4')).toThrow(
      'Answers are locked for this question.'
    );
  });

  it('locks a question only if it belongs to the quiz and is not locked yet', async () => {
    const lockedAt = new Date('2025-01-01T00:00:20Z');
    questionMocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.lockQuestion('quiz-1', 'q1', lockedAt)
    ).resolves.toBe(true);

    expect(questionMocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', quizId: 'quiz-1', answersLockedAt: null },
      data: { answersLockedAt: lockedAt },
    });
  });

  it('reports a lost race when the question is already locked', async () => {
    questionMocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.lockQuestion('quiz-1', 'q1', new Date())
    ).resolves.toBe(false);
  });

  it('clears every question lock in the quiz', async () => {
    questionMocks.updateMany.mockResolvedValue({ count: 3 });

    await repository.clearQuestionLocks('quiz-1');

    expect(questionMocks.updateMany).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1' },
      data: { answersLockedAt: null },
    });
  });
```

  If the record shape the repository's loader expects differs from the one above (field names,
  the `players`/`answers` include), match the existing mapping test's record, keeping
  `answersLockedAt: lockedAt` on the question; report the change.

- [ ] **Step 2: Run them to see them fail**

Run: `yarn test:run src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`
Expected: the restore test fails on its first `expect` (received `undefined`); the three method
tests fail with `repository.lockQuestion is not a function` / `clearQuestionLocks is not a
function` (or the matching TypeScript error).

- [ ] **Step 3: Implement** the interface methods, the two Prisma methods, and the mapper line.

- [ ] **Step 4: Run them to see them pass**

Run: `yarn test:run src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`
Expected: all tests in the file pass; report the count.

Run: `yarn test:run`
Expected: exit 0, 0 failed; report the counts. (The use case mocks are cast with
`as unknown as Mocked<IQuizRepository>`, so the new methods break no other test.)

Run: `yarn eslint --fix <touched files>`, `yarn lint`, `yarn -s tsc --noEmit -p .`
Expected: exit 0 each.

- [ ] **Step 5: Commit**

```bash
git add src/domain/repositories/quiz-repository.ts src/infrastructure/repositories/prisma-quiz.repository.ts src/infrastructure/repositories/mappers/prisma-question-mapper.ts src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts
git commit -m "fix(quiz): persist and load the answer lock"
```

---

### Task 2: Lock and reset use cases, integration test

**Agent:** `implementer` (review: `task-reviewer-capable`)

**Files:**
- Modify: `src/application/use-cases/lock-question.use-case.ts`,
  `src/application/use-cases/reset-quiz.use-case.ts`,
  `src/application/use-cases/start-quiz.use-case.ts`
- Modify: `src/tests/application/use-cases/lock-question.use-case.test.ts`,
  `src/tests/application/use-cases/reset-quiz-use-case.test.ts`,
  `src/tests/application/use-cases/start-quiz-use-case.test.ts`
- Create: `src/tests/integration/answer-lock-persistence.test.ts`

**Interfaces:**
- Consumes: `IQuizRepository.lockQuestion`, `IQuizRepository.clearQuestionLocks` (Task 1).
- Produces: no new names.

**Behaviour:**
- `LockQuestionUseCase.execute`: right after `quiz.lockCurrentQuestion()` (step 2), call
  `quizRepository.lockQuestion(quizId, currentQuestion.id, <the Date the domain just set on
  currentQuestion.answersLockedAt>)` (the field is typed `Date | undefined`; the file already uses
  `currentQuestion.answersLockedAt!` at :180, follow that). On `false`, throw
  `new Error('Question already locked')`
  before reading previous snapshots or saving new ones. The later steps are unchanged.
- `ResetQuizUseCase.execute`: after `quiz.reset()`, call `quizRepository.clearQuestionLocks(quizId)`,
  then `save`. A failing `quiz.reset()` (invalid state) calls neither.
- `StartQuizUseCase.execute` (`src/application/use-cases/start-quiz.use-case.ts`, added after
  Task 1's review, 2026-10-16): after `quiz.startQuiz()`, call
  `quizRepository.clearQuestionLocks(quizId)`, then `save`. A failing `startQuiz()` (not Pending)
  calls neither. Why: a lock request that loaded the Active quiz before a reset can write its lock
  after the reset's clear (the conditional filter cannot see the quiz status), leaving a lock that
  would refuse answers in the next run; a quiz only starts from Pending, so clearing at start is
  always right and closes that window.

- [ ] **Step 1: Write the failing tests**

  In `lock-question.use-case.test.ts`:
  - the `quizRepository` mock in `beforeEach` gains
    `lockQuestion: vi.fn().mockResolvedValue(true),` and `clearQuestionLocks: vi.fn(),`;
  - add a factory at the top of the `describe`, and the two tests:

```ts
  const makeActiveQuiz = () => {
    const question = new Question(
      'q1',
      'What is 2+2?',
      ['4'],
      'multiple-choice',
      100,
      undefined,
      undefined,
      ['2', '3', '4', '5']
    );
    const quiz = new QuizSessionAggregate(
      new Quiz('quiz-1', 'Math Quiz', [question], {
        timePerQuestion: 30,
        allowSkipping: false,
      }),
      30
    );
    quiz.addPlayer('p1');
    quiz.startQuiz();
    return { quiz, question };
  };

  it('persists the lock before writing snapshots', async () => {
    const { quiz, question } = makeActiveQuiz();
    quizRepository.findById.mockResolvedValue(quiz);
    playerRepository.listByQuizId.mockResolvedValue([
      new Player('p1', 'Alice', 'quiz-1'),
    ]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    await useCase.execute('quiz-1');

    expect(quizRepository.lockQuestion).toHaveBeenCalledWith(
      'quiz-1',
      'q1',
      question.answersLockedAt
    );
    expect(question.answersLockedAt).toBeInstanceOf(Date);
    expect(
      quizRepository.lockQuestion.mock.invocationCallOrder[0]
    ).toBeLessThan(
      snapshotRepository.saveSnapshots.mock.invocationCallOrder[0]
    );
  });

  it('throws and writes nothing when another request locked the question first', async () => {
    const { quiz } = makeActiveQuiz();
    const auditLogRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      findByQuizId: vi.fn(),
      findRecent: vi.fn(),
    };
    quizRepository.findById.mockResolvedValue(quiz);
    quizRepository.lockQuestion.mockResolvedValue(false);
    playerRepository.listByQuizId.mockResolvedValue([]);
    snapshotRepository.findByQuizAndQuestion.mockResolvedValue([]);

    await expect(
      new LockQuestionUseCase(
        quizRepository,
        playerRepository,
        snapshotRepository,
        auditLogRepository
      ).execute('quiz-1')
    ).rejects.toThrow('Question already locked');
    expect(snapshotRepository.saveSnapshots).not.toHaveBeenCalled();
    expect(quizRepository.save).not.toHaveBeenCalled();
    expect(auditLogRepository.save).not.toHaveBeenCalled();
  });
```

  In `reset-quiz-use-case.test.ts`:
  - the mock gains `clearQuestionLocks: vi.fn(),`;
  - in "resets a completed quiz and saves it", add:

```ts
    expect(quizRepository.clearQuestionLocks).toHaveBeenCalledWith('quiz1');
    expect(
      quizRepository.clearQuestionLocks.mock.invocationCallOrder[0]
    ).toBeLessThan(quizRepository.save.mock.invocationCallOrder[0]);
```

  - in "throws "Quiz not found." when quiz does not exist" and "propagates entity error for
    invalid state (already Pending)", add
    `expect(quizRepository.clearQuestionLocks).not.toHaveBeenCalled();`.

  In `start-quiz-use-case.test.ts`:
  - the mock gains `clearQuestionLocks: vi.fn(),`;
  - in "should start a quiz and update its status to Active", add:

```ts
    expect(quizRepository.clearQuestionLocks).toHaveBeenCalledWith('quiz1');
    expect(
      quizRepository.clearQuestionLocks.mock.invocationCallOrder[0]
    ).toBeLessThan(quizRepository.save.mock.invocationCallOrder[0]);
```

  - in "should throw an error if the quiz is not found", add
    `expect(quizRepository.clearQuestionLocks).not.toHaveBeenCalled();`.

  Create `src/tests/integration/answer-lock-persistence.test.ts` (the real `PrismaQuizRepository`
  and use cases over a stateful Prisma fake):

```ts
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { PrismaQuizRepository } from '@infrastructure/repositories/prisma-quiz.repository';
import { LockQuestionUseCase } from '@application/use-cases/lock-question.use-case';
import { SubmitAnswerUseCase } from '@application/use-cases/submit-answer.use-case';
import { ResetQuizUseCase } from '@application/use-cases/reset-quiz.use-case';
import { StartQuizUseCase } from '@application/use-cases/start-quiz.use-case';
import { Player } from '@domain/entities/player';
import type { IPlayerRepository } from '@domain/repositories/player-repository';
import type { ILeaderboardSnapshotRepository } from '@domain/repositories/leaderboard-snapshot-repository';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    quiz: {} as Row,
    questions: [] as Row[],
    answers: [] as Row[],
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(
      ([key, value]) => (row[key] ?? null) === (value ?? null)
    );
  const client = {
    state,
    quiz: {
      findUnique: vi.fn(async ({ where }: { where: Row }) =>
        matches(state.quiz, where)
          ? {
              ...state.quiz,
              questions: state.questions.map((question) => ({ ...question })),
              players: [{ id: 'player-1' }],
              answers: state.answers.map((answer) => ({ ...answer })),
            }
          : null
      ),
      update: vi.fn(async ({ data }: { data: Row }) =>
        Object.assign(state.quiz, data)
      ),
    },
    question: {
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const rows = state.questions.filter((question) =>
          matches(question, where)
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    answer: {
      deleteMany: vi.fn(async () => {
        const count = state.answers.length;
        state.answers = [];
        return { count };
      }),
      createMany: vi.fn(async ({ data }: { data: Row[] }) => {
        state.answers.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(
      async (operations: unknown): Promise<unknown> =>
        typeof operations === 'function'
          ? (operations as (tx: unknown) => Promise<unknown>)(client)
          : Promise.all(operations as Promise<unknown>[])
    ),
  };
  return client;
});

vi.mock('@infrastructure/database/prisma/client', () => ({ prisma: db }));

const makeQuestionRow = (id: string, orderIndex: number): Row => ({
  id,
  quizId: 'quiz-1',
  text: `Question ${id}`,
  mediaUrl: null,
  mediaType: null,
  options: [],
  correctAnswers: ['4'],
  type: 'text',
  points: 10,
  orderIndex,
  isPublished: true,
  answersLockedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
});

describe('answer lock persistence', () => {
  const quizRepository = new PrismaQuizRepository();
  let playerRepository: Mocked<IPlayerRepository>;
  let snapshotRepository: Mocked<ILeaderboardSnapshotRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    const now = new Date();
    db.state.quiz = {
      id: 'quiz-1',
      title: 'Math',
      status: 'Active',
      currentQuestionIndex: 0,
      activeQuestionId: 'q1',
      timePerQuestion: 30,
      allowSkipping: false,
      scoringAlgorithm: 'EXPONENTIAL_DECAY',
      scoringDecayRate: 2.0,
      joinCode: 'JOIN',
      startTime: now,
      endTime: null,
      timerStartedAt: now,
      timerExpiresAt: new Date(now.getTime() + 30_000),
    };
    db.state.questions = [makeQuestionRow('q1', 0), makeQuestionRow('q2', 1)];
    db.state.answers = [];

    playerRepository = {
      findById: vi
        .fn()
        .mockResolvedValue(new Player('player-1', 'Alice', 'quiz-1')),
      listByQuizId: vi.fn().mockResolvedValue([]),
      findByQuizIdAndName: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      delete: vi.fn(),
    } as unknown as Mocked<IPlayerRepository>;

    snapshotRepository = {
      saveSnapshots: vi.fn(),
      findByQuizAndQuestion: vi.fn().mockResolvedValue([]),
      findByQuizAndPlayer: vi.fn(),
      findByQuiz: vi.fn(),
      deleteByQuiz: vi.fn(),
    } as unknown as Mocked<ILeaderboardSnapshotRepository>;
  });

  const lock = () =>
    new LockQuestionUseCase(
      quizRepository,
      playerRepository,
      snapshotRepository
    ).execute('quiz-1');

  it('keeps the current question locked after the quiz is reloaded', async () => {
    await lock();

    const reloaded = await quizRepository.findById('quiz-1');

    expect(reloaded?.isQuestionLocked('q1')).toBe(true);
    expect(reloaded?.isQuestionLocked('q2')).toBe(false);
  });

  it('rejects an answer submitted after the lock in a later request', async () => {
    await lock();

    await expect(
      new SubmitAnswerUseCase(quizRepository, playerRepository).execute(
        'quiz-1',
        'player-1',
        'q1',
        '4'
      )
    ).rejects.toThrow('Answers are locked for this question.');
  });

  it('a stale aggregate saved after the lock does not undo it', async () => {
    const stale = await quizRepository.findById('quiz-1');
    await lock();

    await quizRepository.save(stale!);

    const reloaded = await quizRepository.findById('quiz-1');
    expect(reloaded?.isQuestionLocked('q1')).toBe(true);
  });

  it('rejects a second lock and writes one snapshot set', async () => {
    await lock();

    await expect(lock()).rejects.toThrow('Question already locked');
    expect(snapshotRepository.saveSnapshots).toHaveBeenCalledTimes(1);
  });

  it('clears a lock written after a reset when the quiz starts again', async () => {
    await new ResetQuizUseCase(quizRepository).execute('quiz-1');
    // A lock request that loaded the Active quiz before the reset writes late
    await quizRepository.lockQuestion('quiz-1', 'q2', new Date());

    await new StartQuizUseCase(quizRepository).execute('quiz-1');

    const reloaded = await quizRepository.findById('quiz-1');
    expect(reloaded?.isQuestionLocked('q2')).toBe(false);
  });

  it('clears persisted locks when the quiz is reset', async () => {
    await lock();
    await new ResetQuizUseCase(quizRepository).execute('quiz-1');

    const reloaded = await quizRepository.findById('quiz-1');

    expect(
      reloaded?.quizQuestions.every((question) => !question.answersLockedAt)
    ).toBe(true);
  });
});
```

  The fake was drafted from reading the code, never run. If the repository calls a Prisma method
  the fake lacks, or the use cases' constructors or `execute` signatures differ, extend or adapt
  the fake and the calls, and report each change; never weaken an assertion.

- [ ] **Step 2: Run them to see them fail**

Run: `yarn test:run src/tests/application/use-cases/lock-question.use-case.test.ts src/tests/application/use-cases/reset-quiz-use-case.test.ts src/tests/application/use-cases/start-quiz-use-case.test.ts src/tests/integration/answer-lock-persistence.test.ts`
Expected: the two new lock tests fail (`lockQuestion` never called; the lost race resolves
instead of rejecting); the reset test "resets a completed quiz and saves it" fails
(`clearQuestionLocks` never called), while the two `not.toHaveBeenCalled` additions pass before
and after (regression guards); in the integration file
four tests fail because nothing persists the lock yet ("keeps … locked", "rejects an answer",
"a stale aggregate …", "rejects a second lock"). "clears persisted locks" passes before the fix
(nothing is locked to clear); it becomes a real guard once the lock persists, and must still pass
after Step 3. "clears a lock written after a reset when the quiz starts again" fails (the start
does not clear); the start test's `clearQuestionLocks` assertions fail likewise, its
`not.toHaveBeenCalled` addition passes before and after.

- [ ] **Step 3: Implement** the two use case changes.

- [ ] **Step 4: Run them to see them pass**

Run: the same four files. Expected: all pass; report the count.
Run: `yarn test:run`. Expected: exit 0, 0 failed; report the counts.
Run: `yarn eslint --fix <touched files>`, `yarn lint`, `yarn -s tsc --noEmit -p .`. Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/application/use-cases/lock-question.use-case.ts src/application/use-cases/reset-quiz.use-case.ts src/application/use-cases/start-quiz.use-case.ts src/tests/application/use-cases/lock-question.use-case.test.ts src/tests/application/use-cases/reset-quiz-use-case.test.ts src/tests/application/use-cases/start-quiz-use-case.test.ts src/tests/integration/answer-lock-persistence.test.ts
git commit -m "fix(quiz): keep the answer lock across requests"
```

---

### Task 3: Verify on the real target, records (main session)

**Agent:** none — the controller runs this.

- [ ] `yarn test:run`, `yarn lint`, `tsc`: exit 0, counts in the ledger.
- [ ] With a dev server from this worktree (needs its own `node_modules`: see
  `docs/progress/findings/2026-10-15-worktree-dev-server-node-modules.md` on the E2E branch):
  create a quiz with two questions through the admin API, start it, join a player, lock question
  1 on the host dashboard; check Lock stays disabled after the 5 s refetch and a page reload, and
  `POST /api/player/answer` for question 1 is refused with "Answers are locked for this question.";
  lock again via the API → 400 "Question already locked"; restart → question 1 unlocked. On a
  fresh question, send two lock requests at once (two parallel `curl`s): exactly one 200 and one
  400, and one snapshot set for that question index (the "one wins" guarantee rests on Postgres
  re-checking `answersLockedAt IS NULL` in a single UPDATE, which no unit test can show). Delete
  the quiz afterwards.
- [ ] Findings record `docs/progress/findings/2026-10-15-persist-answer-lock.md` with the
  real-target run (steps, what the button and the answer route did, quiz ids deleted).
- [ ] Note in the ledger and the findings record that the E2E branch's round-transitions tests
  "should disable Lock Question after locking" and "should re-enable Lock Question after
  advancing" are the automated check once `test/e2e-isolated-quizzes` has this fix.
- [ ] Spec and plan status lines to `In progress` now, `✅ Complete — PR #NN` at merge.
- [ ] Ledger `.superpowers/sdd/2026-10-15-persist-answer-lock-plan/progress.md` (`git add -f`);
  the out-of-scope items from the spec recorded where the user chooses.
