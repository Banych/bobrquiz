# Action 04 – Fill Use Cases & Services ✅ (Completed 2025-12-19)

- Added DTO mappers (`src/application/mappers/player-mapper.ts`, updated `quiz-mapper.ts`) so player/quiz shapes line up with the shared zod contracts TanStack hooks expect.
- Extended domain aggregate getters (player IDs, timers, active question metadata) to hydrate DTOs without leaking entity internals.
- Introduced host/player orchestration use cases: `get-quiz-state`, `get-player-session`, `list-quiz-players`, and `advance-question` provide DTO-ready outputs for live lobby + host flows.
- Expanded `PlayerService` and `QuizService` to expose the new workflows (`getQuizState`, `advanceToNextQuestion`, `listPlayersForQuiz`, `getPlayerSession`) instead of returning aggregates directly.
- Updated Vitest coverage (~6 specs) so the new use cases/services are defended, including DTO snapshots and leaderboard-aware mapping logic.
- `IPlayerRepository` now declares `findByQuizId`, matching the repository audit outcome and paving the way for Prisma-backed lobby queries.
- 2025-12-04: Implemented host MVP flows—`ResetQuizTimerUseCase`, `SnapshotLeaderboardUseCase`, and the enhanced `AdvanceQuestionUseCase`—plus new `QuizService` facades (`resetTimer`, `snapshotLeaderboard`) with corresponding Vitest coverage.
