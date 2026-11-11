# Parking lot — not in the current milestone

Only the user moves an item into a milestone, and only by removing an issue of similar size.

| Date | Item | Source | Blocks first payment? |
|---|---|---|---|
| 2026-11-09 | Player answers stay locked for 10 s after a lock even when the host advances sooner: `use-round-summary-listener.ts` clears the round summary on a fixed 10 s timer, not on the next question, so options stay disabled (measured on dev: 10.0 s for all 3 players, 0.68 s when the host waited 11 s) | issue 126 verification | no |
| 2026-11-09 | Production Supabase Auth Site URL may still be `http://localhost:3000` (every auth log line's referer is localhost), so reset and sign-up confirmation links would point at localhost; check Authentication → URL Configuration | issue 126 verification | yes |
| 2026-11-09 | Move the keepalive from legacy Vercel Cron Jobs to Schedules: in `vercel.json` replace `crons` with `"schedules": { "keepalive": { "schedule": "0 9 * * *", "path": "/api/cron/keepalive", "requestMethod": "GET" } }` in one change (keeping both runs the route twice); first confirm Schedules work on the current Vercel plan | PR 135 deploy (Vercel "Legacy" banner) | no |
| 2026-11-10 | Read-only operator view of any host's quiz in `/admin` for support; the quiz-owner spec chose the Supabase dashboard and Vercel logs instead (Vlad, 2026-11-10) | issue 127 spec | no |
| 2026-11-10 | Privacy policy line saying support may look at a host's quiz data when that host asks for help | issue 127 spec | yes |
| 2026-11-10 | API routes return raw error text to the browser: during the production password reset, `GET /api/quiz/<id>/state` answered with Prisma's full "Invalid `prisma.quiz.findUnique()` invocation … Authentication failed" message; map unexpected errors to a generic message and log the detail server-side | issue 138 rollout | no |
| 2026-11-11 | The quiz repository's `findAll` has no caller since `/host` lists by owner and `ListAllQuizzesUseCase` was removed; dropping it touches `IQuizRepository`, `prisma-quiz.repository.ts`, its tests and the mock repositories that stub it | issue 140 part 2 | no |
| 2026-11-11 | Two flaky unit tests that assert on chance: `question.test.ts` "should randomize options for multiple-choice questions" expects a 4-option shuffle to change the order (fails 1 in 24), and `join-code.test.ts` "should generate unique codes" expects 100 random codes from 32⁴ to never collide (about 0.5%). Seen in 2 of 3 full runs here and 1 of 15 in the branch review; CI gates on the unit tests, so either can fail a PR at random | issue 140 PR 1 verification | no |
