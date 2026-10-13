# Action 01 – Define DTO Catalog ✅ (Completed 2025-12-19)

- Added core schemas in `src/application/dtos/` for questions, players, answers, and quizzes using zod.
- Captured status enums plus leaderboard and quiz settings contracts so services/hooks can rely on a single shape.
- These DTOs now back future Prisma mappings and TanStack hooks; update this file whenever DTO shapes shift.
- 2025-11-30: `QuizDTO` now exposes `joinCode` plus a `timer` object and `QuestionDTO` carries `orderIndex` so the host dashboard can render the share code, countdown, and question timeline described in `docs/plan.md`.