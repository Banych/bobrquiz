# Task 3 report

## Status
DONE_WITH_CONCERNS (concerns: verdict list judged partly from headings; Step 1 FAIL output below)

## Commit
133e369 docs: move Copilot pattern guides to docs/guides/PATTERNS.md
17 files: 108 insertions, 2573 deletions. Added docs/guides/PATTERNS.md (+107), docs/INDEX.md (+1);
deleted .github/copilot-instructions.md, .github/prompts/ (11), .github/agents/ (2), .github/instructions/ (1).
Nothing under .superpowers/ or src/ staged (git status clean for staged set apart from the commit).

## Checks
- Step 1 before work: `FAIL`.
- Step 1 after work: `PASS`.
- Link acceptance command: empty output (between echo markers LINKS / END nothing printed).
- `git grep -l 'copilot-instructions'` printed exactly five: CLAUDE.md, docs/progress/plans/2026-10-11-claude-config-and-records-design.md, docs/progress/plans/2026-10-11-claude-config-and-records-plan.md, docs/progress/plans/README.md, docs/progress/sessions/2026-05-09-maintenance-security-tooling.md.

## Corrections (old -> new)
Authentication
- "protects routes (admin -> /admin, host -> /host, player -> /player)" -> middleware only protects `/admin` pages and `/api/admin` (src/middleware.ts).
- "Store user context via useAuth() hook (if implemented)..." -> removed: no `useAuth` in src.
- "check role for route access" -> "check the admin allowlist" (middleware uses isAdminUser).
- `docs/04-presentation-and-realtime.md` (2 citations) -> `PRESENTATION-LAYER.md` (relative link; same dir docs/guides).
Realtime
- "currently using createNoopRealtimeClient stub" -> providers.tsx creates the Supabase client and falls back to createNoopRealtimeClient.
Error handling
- Bullet on `InvalidQuizStateError`, `PlayerNotFoundError`: removed, no such classes.
- Bullet on Result/union returns: removed, no Result pattern in src.
- `{ error: string, code?: string }` -> `{ error: string }` (no `code` in any route).
- "Log unexpected errors to Sentry..." bullet: removed, Sentry not in src (not grepped in package.json output: no hit).
- Example Error Path code block: removed, used nonexistent QuizAlreadyEndedError/QuizNotFoundError.
- "automatically handle errors via onError" -> "handle errors via the onError callback" (wording only).
Performance
- Player list `staleTime: 10s` -> 5s (use-host-quiz-players.ts:76).
- Quiz state "refetch on blur" -> "`refetchInterval` 5s as fallback" (use-host-quiz-state.ts:146-147).
- `gcTime` mention and "Quiz questions staleTime: Infinity" line: removed, no use in src.
- Index list `quizId, playerId, sessionId` -> dropped `sessionId` (not in schema).
- "Use `selectMany` for bulk operations": removed, not in src.
- Verified, unchanged: src/lib/debounce-broadcast.ts (500ms default), `include` (quizInclude in prisma-quiz.repository.ts), route groups (admin)/(host)/(player), RealtimeClient/RealtimeClientProvider/useRealtimeClient, getUser(), setQueryData, `src/hooks/**`.
- Left as unverified guidance (no code claim): pagination 20/page, <100KB bundles, dynamic imports for dialogs/charts (only ReactQueryDevtools uses dynamic).

## Verdicts on other sections of copilot-instructions
- Architecture Overview: already in CLAUDE.md
- Critical Prisma v7 Setup: already in CLAUDE.md
- Type Safety Guidelines (no `any`, unknown + guards): unique and live
- Iterative Development Approach: historical/process (superseded by user-level workflow)
- Planning Workflow (Scrum Board Alternative): already in CLAUDE.md (Planning Workflow)
- Implementation Steps: historical/process
- Today's Progress: historical/process
- MCP-Assisted Testing (Playwright MCP): historical/process (tool names mcp_microsoft_pla_* are stale; CLAUDE.md covers Playwright MCP)
- MCP Toolbox Configuration: historical/process (VS Code mcp.json; MCP now in plugins, task 1)
- Essential Workflows: already in CLAUDE.md (Adding Features / Commands)
- Key Patterns: already in CLAUDE.md
- DTO-First Development: unique and live (zod DTO -> mapper -> routes/hooks; paths player.dto.ts / player-mapper.ts not verified)
- Documentation Requirements: already in CLAUDE.md (Documentation Practices)
- Styling & UI Components: unique and live (Tailwind 4, cn(), shadcn)
- Debugging Quick Reference: already in CLAUDE.md
- Environment & Deployment: unique and live (partly stale: .vscode/mcp.json line)
- Common Pitfalls: already in CLAUDE.md
(Authentication, Realtime, Error Handling, Performance moved to PATTERNS.md.)

## Departures from the plan
- INDEX bullet written in the existing `- **[..](..)** – desc` style per controller ruling, not the brief's literal text.
- Only the H1 plus four `##` headings; subheadings are `###`.
- Added a one-line cross-link to PRESENTATION-LAYER.md in the intro paragraph.

## Concerns
- Verdicts for Architecture Overview, Iterative Development, Implementation Steps, Today's Progress, MCP Toolbox, Essential Workflows, Documentation Requirements, Debugging, Common Pitfalls were judged from headings and CLAUDE.md overlap, not a line-by-line read. I read the bodies only of Type Safety, DTO-First, Styling, Environment, MCP-Assisted Testing (start).
- Unchanged claims listed above as guidance only.

## Self-review
git show --stat HEAD matches expectation; PATTERNS.md has exactly 4 `##` headings; all relative links to PRESENTATION-LAYER.md resolve; every path/symbol named in PATTERNS.md (src/middleware.ts, src/app/providers.tsx, src/infrastructure/realtime/, src/lib/debounce-broadcast.ts, src/hooks/**) exists.

## Evidence
Commands: step 1 check (FAIL then PASS), `command grep -n '^## '` on the copilot file, `ls`/`command grep -rn` per symbol in src, sed of src/middleware.ts, links command (empty), `git grep -l 'copilot-instructions'`, `git show --stat HEAD`.

## Fix round 1
Commit f9bad7b docs: correct PATTERNS.md claims against the code (only docs/guides/PATTERNS.md).
1. Deleted the "Implementation reference" subsection of Authentication (the false PRESENTATION-LAYER.md pointer).
2. Statuses routes return (`grep -rn "status: [0-9]" src/app/api | sed ... | uniq -c`): 201 x2, 400 x8, 404 x9, 429 x3, 500 x12. Removed "403 for permission errors" as a route status, added 429, and added a line that 403 comes from src/middleware.ts for non-admin users on admin routes.
3. Domain/application bullet now: entities and use cases throw plain `Error`; the route maps message (`/not found/i` -> 404, else 400). Checked: advance-question.use-case.ts:24 `throw new Error(...not found.)`; admin questions route.ts:97 `/not found/i.test(message)`.
4. Both MCP calls now `mcp__supabase__get_logs(service: ...)`; `.mcp.json` server key is `supabase`; kept 'api' and 'postgres' (both valid services).
5. Toast/snackbar line replaced by inline error text from the hook's `error.message` (host-quiz-dashboard.tsx:140-144 renders it in a destructive div); no toast lib in package.json (grep for sonner/toast: no hit).
Checks: Step 1 -> PASS; link acceptance command -> empty output. Not verified: the "Never store tokens"/401 bullets at :20 left unchanged as out of the five findings.
