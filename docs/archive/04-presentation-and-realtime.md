# Step 4: Presentation, Hooks & Realtime

With domain + infrastructure ready, this step connects application services to Next.js routes, TanStack Query hooks, and realtime transports so the host/player UIs mirror the mockups.

## Objectives
- Implement feature-specific hooks that call application services via TanStack Query and manage optimistic updates.
- Build host, player, and admin routes that follow the UX in `docs/mockups/*.png`.
- Introduce a realtime transport (Socket.IO or Supabase Realtime) wrapped behind an abstraction so we can swap providers later.
- Ensure server components fetch initial DTOs, while client components subscribe to live updates.
- Add UI tests/Playwright smoke flows for critical paths.

## Tasks
1. **Hook scaffolding (`src/hooks/**`)**
   - Create modules such as `useHostSession`, `usePlayerSession`, `useQuestionTimeline`.
   - Each hook should:
     - Define its query key (`['session', sessionId]`).
     - Call the corresponding application service via an API route or direct server action.
     - Handle loading/error states consistently (return `{ data, isPending, error }`).
     - Provide mutation helpers for host actions (start round, end quiz) with optimistic cache updates.
   - 2025-12-08 update: `usePlayerSession` now hydrates `PlayerSessionDTO` via `GET /api/quiz/[quizId]/player/[playerId]`, pushes host broadcasts from Supabase Realtime into the TanStack cache, and confirms answers through `POST /api/player/answer` before clearing the local input.
2. **Query client provider**
   - Add `src/app/providers.tsx` (client component) that wraps children with `QueryClientProvider`, `HydrationBoundary`, and realtime context.
   - Configure sensible defaults (retry = 1, refetchOnWindowFocus = false for player devices).
3. **Realtime adapter**
   - Create `src/infrastructure/realtime` with a transport-agnostic interface (`RealtimeClient` with `subscribe`, `emit`, `disconnect`).
   - Implement `socket-io.client.ts` (default) plus stubs for Supabase Realtime if we need to switch.
   - Hooks should interact with the adapter, not Socket.IO directly.
   - 2025-12-08 update: Supabase Realtime is now the default client (`createSupabaseRealtimeClient`) using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, with a noop fallback when env vars are absent. Server routes broadcast quiz updates via the Supabase service key.
4. **Next.js routes**
   - Host dashboard (`src/app/(host)/dashboard/page.tsx`): server component fetches `QuizDTO`, client child subscribes to updates.
   - Player join + play screens: `/join` renders `PlayerJoinForm` while `/play/[quizId]/[playerId]` hydrates the session server-side, then hands off to `PlayerSessionScreen` + `usePlayerSession` for timers, latency hints, and server-confirmed submissions.
   - Admin content manager: gated route with forms powered by shadcn components.
5. **shadcn + Tailwind usage**
   - Use the established `src/components/ui/**` primitives; add new ones via `yarn shadcn add <component>` and document them in `components.json`.
   - Keep styling token-driven; rely on CSS variables defined in `src/app/globals.css`.
6. **Testing**
   - Extend Vitest tests for hooks (use `@testing-library/react` + `QueryClientProvider` test utils).
   - Add Playwright smoke tests covering host start → player answer → host results.
   - Mock realtime layer in tests to avoid flakiness.

### Current API route stubs (2025-12-08)
- `POST /api/session/join` → validates `{ joinCode, playerName }`, fetches the quiz via `JoinSessionUseCase`, registers a player through `PlayerService`, and returns the hydrated lobby DTOs.
- `POST /api/player/add` → allows hosts/admin tools to add a player by `{ quizId, playerName }`, reusing `PlayerService` to produce the `PlayerDTO` response.
- `POST /api/quiz/start` → calls `QuizService.startQuiz` for the given `quizId` and responds with `{ status: "started" }` once the aggregate transitions to Active.
- `POST /api/player/answer` → proxies `{ quizId, playerId, questionId, answer }` to `AnswerService.submitAnswer`, mapping domain errors (inactive quiz, unknown player) to HTTP 4xx codes.
- `GET /api/quiz/[quizId]/state` → returns the full `QuizDTO` via `QuizService.getQuizState`, which host dashboard pages can hydrate from before subscribing to realtime events.
- `GET /api/quiz/[quizId]/players` → lists the lobby roster by calling `PlayerService.listPlayersForQuiz`, allowing host/admin UIs to render player chips or leaderboards on demand.
 - `POST /api/quiz/[quizId]/advance` (2025-12-08) → triggers `QuizService.advanceToNextQuestion`, rebroadcasting the new question/timer snapshot.
 - `POST /api/quiz/[quizId]/timer/reset` (2025-12-08) → invokes `QuizService.resetTimer` with an optional `durationSeconds` override and broadcasts the refreshed timer DTO.
 - `POST /api/quiz/[quizId]/leaderboard/snapshot` (2025-12-08) → calls `QuizService.snapshotLeaderboard` to persist and broadcast the latest standings.
 - `GET /api/quiz/[quizId]/player/[playerId]` (2025-12-08) → hydrates `PlayerSessionDTO` via `PlayerService.getPlayerSession`, enabling the `/play` route + `usePlayerSession` hook to stay in sync with Supabase broadcasts.

## Acceptance Criteria
- Hooks expose typed DTO data and are consumed by the relevant pages/components.
- Realtime adapter can be swapped via env/config; no direct Socket.IO imports in React components.
- Host/player/admin UIs render per mockups and share a consistent design system (shadcn + Tailwind tokens).
- Playwright + Vitest suites pass via Yarn scripts.
- Documentation updated if new env vars or workflows are introduced (e.g., realtime service URLs).

## Next Steps
Move to deployment hardening: CI workflows, observability, load tests, and final polish per the release plan.