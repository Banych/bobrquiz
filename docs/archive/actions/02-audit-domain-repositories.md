# Action 02 – Audit Domain Repositories ✅ (Completed 2025-12-19)

- `src/domain/repositories/quiz-repository.ts` currently supports CRUD only; documented need for lookup by join code, status filtering, and partial persistence to avoid rewriting whole aggregates.
- `src/domain/repositories/player-repository.ts` lacks quiz scoping helpers such as `listByQuizId` or `findByQuizIdAndName`; upcoming Prisma layer must expose these so DTOs can include names/status.
- `src/domain/repositories/question-repository.ts` is unused beyond basic CRUD; R1 requires batch fetch by quiz and publication/order helpers to maintain question timelines.
- Notes are mirrored in `docs/progress/dev-notes.md` for quick reference before repository implementations land.
- 2025-11-30: Prisma quiz repository now maps timer metrics correctly (seconds in domain <-> milliseconds in Postgres) and exposes join-code lookups plus partial updates, satisfying the audit checklist.
- 2025-12-04: Prisma quiz repository rehydrates timer metadata (start/end) so `QuizSessionAggregate` can compute remaining time immediately after loading from Supabase.