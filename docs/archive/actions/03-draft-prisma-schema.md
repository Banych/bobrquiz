# Action 03 – Draft Prisma Schema ✅ (Completed 2025-12-19)

- Introduced `src/infrastructure/database/prisma/schema.prisma` with enums for quiz/player/question states plus concrete models for `Quiz`, `Question`, `Player`, and `Answer`.
- Models align with DTO catalog: quizzes track timing/settings, questions include publication/order flags, players carry status/score/rank, and answers record timing/accuracy metadata.
- Datasource configuration now expects `prisma.config.ts` to supply `DATABASE_URL`, matching Prisma 5+ configuration guidance.
- Next migrations will run once repository implementations are ready; no database applied yet.
- 2025-12-04: Added `timerStartedAt`/`timerExpiresAt` fields on `Quiz` so host timer resets persist across requests and can be rehydrated into aggregates.
