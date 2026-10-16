# Final simplification report: persist answer lock (d839d5f..b9fc943)

Report only. No edit applied. Production code in the range is small and matches its neighbours; the proposals are mostly in tests.

## Proposals

### P1. Race test builds its own audit-log fake and use case (lock-question.use-case.test.ts, "throws and writes nothing when another request locked the question first", about lines 108-131)
Why: the file already has a `describe('audit log emission')` with a `Mocked<IAuditLogRepository>` fake in `beforeEach` and a `useCaseWithAudit` construction. The new test repeats both inline, with an untyped fake.
Edit: move the test into that describe and reuse its `auditLogRepository`.
Before:
```ts
const auditLogRepository = { save: vi.fn().mockResolvedValue(undefined), findByQuizId: vi.fn(), findRecent: vi.fn() };
...
await expect(new LockQuestionUseCase(quizRepository, playerRepository, snapshotRepository, auditLogRepository).execute('quiz-1')).rejects.toThrow(...)
```
After (inside `describe('audit log emission')`):
```ts
const useCaseWithAudit = new LockQuestionUseCase(quizRepository, playerRepository, snapshotRepository, auditLogRepository);
await expect(useCaseWithAudit.execute('quiz-1')).rejects.toThrow('Question already locked');
```
Risk: low. `makeActiveQuiz` is declared in the outer describe, so it is in scope. Test order changes only.

### P2. Repeated stubbing in the two new lock tests (lock-question.use-case.test.ts ~lines 83-90 and 114-117)
Both set `findById`, `listByQuizId` and `findByQuizAndQuestion([])`. The second sets `listByQuizId([])`, which the failing path never reaches, because the use case throws before step 6. Drop `playerRepository.listByQuizId.mockResolvedValue([])` and `snapshotRepository.findByQuizAndQuestion.mockResolvedValue([])` from the race test: `lockQuestion` rejects first, and the `not.toHaveBeenCalled` assertions stay meaningful. Risk: none for behaviour. The tests would then show that nothing past the lock is reached.

### P3. Non-null assertion `currentQuestion.answersLockedAt!` (lock-question.use-case.ts, new block)
Why: `!` hides the contract that `lockCurrentQuestion()` sets the date. `quiz.lockCurrentQuestion()` (aggregate, line 231) could return the `Date` it sets (`const lockedAt = new Date(); question.answersLockedAt = lockedAt; return lockedAt;`) and the use case would use `const lockedAt = quiz.lockCurrentQuestion();`. Existing callers ignore the return, so it is additive.
Risk: medium. It touches a domain method and its tests. Optional; leaving the `!` is acceptable, since the line above guarantees the value.

### P4. Duplicated 25-line Prisma fixture (prisma-quiz-repository.test.ts, new "restores a persisted answer lock..." test vs "maps a quiz record into an aggregate")
Why: both inline the full quiz record and the question record. A local factory in that file would remove about 30 lines (no shared helper exists: `src/tests/helpers`, `utils` and `factories` do not exist).
Edit:
```ts
const now = new Date('2025-01-01T00:00:00Z');
const makeQuestionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1', quizId: 'quiz-1', text: 'What is 2 + 2?', mediaUrl: null, mediaType: null,
  options: [], correctAnswers: ['4'], type: 'text', points: 10, orderIndex: 0,
  isPublished: true, answersLockedAt: null, createdAt: now, updatedAt: now, ...overrides,
});
const makeQuizRecord = (questions: unknown[]) => ({ id: 'quiz-1', ..., questions, players: [{ id: 'player-1' }], answers: [] });
```
then `quizMocks.findUnique.mockResolvedValue(makeQuizRecord([makeQuestionRecord({ answersLockedAt: lockedAt })]))`.
Risk: low-medium. The new test uses `scoringAlgorithm: 'EXPONENTIAL_DECAY'` and the old one `'FIXED'`, so the factory needs those as overrides. Refactoring the existing test is outside the range; applying the factory to the new test only gains little. Reasonable to skip unless the old test is touched too.

### P5. Integration test fakes list unused methods (answer-lock-persistence.test.ts, `playerRepository` and `snapshotRepository` in `beforeEach`)
Used: player `findById`, `listByQuizId`, `save` (SubmitAnswer, after the throw point, so unreached); snapshot `saveSnapshots`, `findByQuizAndQuestion`. The rest (`findByQuizIdAndName`, `updateStatus`, `updateScore`, `delete`, `findByQuizAndPlayer`, `findByQuiz`, `deleteByQuiz`) are dead weight.
Edit: keep only the used members (`as unknown as Mocked<...>` already allows it).
Risk: low. This departs from the full-surface style of the neighbouring unit tests (they list every method), so it is a style call. Keeping them matches the neighbours.

### P6. `lock()` helper placement and `stale!` (answer-lock-persistence.test.ts)
`const lock = () => new LockQuestionUseCase(...)` is declared after `beforeEach`; it could be declared right after the fakes or inside `beforeEach` with the repositories. Purely cosmetic. `await quizRepository.save(stale!)` could narrow with `if (!stale) throw new Error('quiz not found');` to drop the `!`; the repo convention in tests uses `?.` after `findById`, so `!` here is the only one. Risk: none. Minor.

### P7. Comments (low value)
- lock-question.use-case.ts: "// Persist the lock first; losing the race means another request locked it" explains why and is fine. The numbered step comments around it now skip a number (the new block sits between 2 and 3 unnumbered); either fold it into step 2 or leave it. No edit needed.
- answer-lock-persistence.test.ts: "// Both requests reached the repository, so the false branch decided it" is a useful why. Keep.
- quiz-repository.ts JSDoc on `lockQuestion` and `clearQuestionLocks`: the neighbouring methods have none, but these carry semantics (conditional set, return meaning). Keep.

### P8. Concurrent test outcome check (answer-lock-persistence.test.ts "lets exactly one of two concurrent locks win")
`Promise.all(lockQuestionSpy.mock.results.map((r) => r.value as Promise<boolean>))` plus `outcomes.sort()` is the clumsiest block in the file. Alternative: `const outcomes = await Promise.all(lockQuestionSpy.mock.results.map(({ value }) => value))` (the cast is unneeded if the spy is typed; vitest types `results[].value` as `any` for async, so the cast can be dropped) and `expect(outcomes).toContain(true)` plus `toContain(false)` is not clearer. Recommend leaving as is. Risk of change: low, gain: low.

## Not a simplification (observations)
- Start and reset use cases call `clearQuestionLocks` before `save`, so a failing `save` leaves locks cleared with the quiz state unchanged (Reset: `reset()` already mutated the in-memory aggregate only). The same applies in `StartQuizUseCase`. Order is asserted by the tests, so it is deliberate; flagging only the non-atomicity.
- `lockQuestion` stores `currentQuestion.answersLockedAt`, a client-process `new Date()`, not a DB clock. Fine for one server; mention only.
- Race error text `'Question already locked'` equals the domain message in `lockCurrentQuestion`, so the API layer treats both the same; not a bug.

## Evidence
Commands run (all read-only, from the worktree):
- `git diff d839d5f..b9fc943 --stat -- src` and `git diff d839d5f..b9fc943 -- src`
- `sed -n 1,70p src/application/use-cases/lock-question.use-case.ts`
- `sed -n 1,62p`, `sed -n 100,132p`, `sed -n 352,400p src/tests/application/use-cases/lock-question.use-case.test.ts`
- `sed -n 58,135p src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts`
- `grep -n "lockCurrentQuestion" -A12 src/domain/aggregates/quiz-session-aggregate.ts`
- `grep -n "answersLockedAt" src/domain/entities/question.ts`
- `grep -n "playerRepository\.\|snapshotRepository\.\|quizRepository\." src/application/use-cases/submit-answer.use-case.ts`
- `ls src/tests/helpers src/tests/utils src/tests/factories` (none exist)
No tests, formatters or linters were run.
