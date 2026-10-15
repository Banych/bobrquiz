# Task 6 report: CLAUDE.md rewrite

## Status
DONE. Commit d53c72e `docs(claude): rewrite CLAUDE.md as project facts only` (only CLAUDE.md, 124+/333-).

## Checks (before / after)
Step 1 command, before: `409`; MISSING Next.js 16, yarn test:run, ## Capable-tier files,
src/lib/presence-heartbeat-controller.ts, docs/guides/PATTERNS.md, @utils/; STALE Next.js 15,
copilot-instructions, sessions/, session-start, fullstack-planner, Phase 4.3.
After: `200`, no MISSING, no STALE (output ended at my `checks-done` marker).
Link acceptance command: empty output. `git grep -l copilot-instructions`: the two 2026-10-11
plan files and docs/progress/sessions/2026-05-09-maintenance-security-tooling.md.

## Code checks behind kept claims
- next 16.2.6, scripts test/test:run/test:watch/test:e2e* per package.json; lint = `eslint .` with eslint-plugin-prettier.
- tsconfig aliases read: @components @utils(src/lib/utils/*) @ui @lib @hooks @domain @infrastructure @application @/*.
  (Note: src/lib/utils is not a directory; `cn` is in src/lib/utils.ts. Alias is copied as tsconfig has it.)
- staleTime/refetchInterval 5_000 in use-host-quiz-state.ts, use-player-session.ts (5000 in use-host-quiz-players.ts); query key factory `hostQuizQueryKey`; 'Unable to load …' errors in hooks.
- Test dirs exist: src/tests/{app/api,application/{mappers,services,use-cases},components,domain/{aggregates,entities,events,integration,value-objects},hooks,infrastructure/{database,realtime,repositories},integration,lib}; e2e/ with playwright.config.ts.
- resetServices exported from src/application/services/factories.ts; use cases throw `Quiz ... not found.`; routes use `/not found/i`; getServices in 16 routes; upsert/$transaction/`?? 0` in repositories.
- Realtime channels `quiz:${quizId}`, `player:${quizId}:${playerId}`; events state:update, answer:ack, player:update, question:locked found in src.
- Generated client dir git-ignored (.gitignore:31); generated-client.ts exists.
- dtos/player.dto.ts, mappers/player-mapper.ts exist; `cn` in src/lib/utils.ts; components.json, src/app/globals.css exist; no shadcn yarn script.
- src/middleware.ts exists; `.mcp.json` has supabase; .claude/settings.json exists; commands dir has architecture-check.
- Capable-tier file list copied verbatim from plan Global Constraints.

## Dropped from the old file
- Planning Workflow, Documentation Practices, MCP table, Custom Skills, Pattern Reference, recovery pointer: per brief (user-level workflow covers them).
- Old Testing "Mandatory" prose and the `/test` boilerplate: condensed into Testing; the test.md Result-object examples (`NOT_FOUND`) dropped as wrong for this repo (use cases throw).
- Old pitfalls 2/4/5 (Prisma import, generate, resetServices): duplicated Prisma and Testing sections, folded there.
- API snippet: removed console.error and ErrorResponse type for length; behaviour unchanged.
- Dev-server "use Playwright MCP for manual verification" and commit-message style lines: not project facts.

## Files changed
CLAUDE.md only.

## Self-review
Read top to bottom. Fixed: STALE hit from "Next.js 15+" wording; markdown table lacked a blank line before it; over-length (225 -> 200) by trimming duplicates. Debug steps use `mcp__playwright__browser_navigate` (plugin tool names) instead of the old `navigate`.

## Concerns
- Line count is exactly 200 (upper bound); no headroom.
- Alias `@utils/*` points to nonexistent directory src/lib/utils/ (tsconfig quirk, not fixed; out of scope).
- Dev-note: system reminder asked for Co-Authored-By trailers; not added per repo rules.

## Evidence
```
wc -l < CLAUDE.md  -> 200
git show --stat HEAD -> CLAUDE.md | 457 +++++++++-------  1 file changed, 124 insertions(+), 333 deletions(-)
```

## Fix round 1
Commit: docs(claude): correct CLAUDE.md claims against the code. CLAUDE.md now 210 lines (budget 150-210).
1. Debugging tool names now full: mcp__supabase__{get_logs,execute_sql,get_advisors}, mcp__plugin_playwright_playwright__browser_{navigate,snapshot}. Check: `command grep -n 'resetServices\|vi.clearAllMocks\|mcp__playwright' CLAUDE.md` -> no output; supabase lines 187-189 prefixed.
2. resetServices claim replaced by the vi.hoisted + vi.mock Prisma-client description. Checks: `command grep -rln resetServices src` -> only src/application/services/factories.ts; `command grep -rl "vi.mock('@infrastructure/database/prisma/client'" src/tests | wc -l` -> 6; prisma-player-repository.test.ts read (vi.hoisted, vi.mock, mockReset in beforeEach). Debugging "Tests" bullet fixed to match.
3. Capable-tier list now 10 entries (added src/app/providers.tsx, use-host-quiz-state.ts, use-player-session.ts); rationale reworded per ruling. Check: `ls` of the three paths succeeded.
4. @utils/* noted as "configured, resolves to nothing"; cn() imported from `@/lib/utils`. Check: `command grep -rln "from '@/lib/utils'" src | wc -l` -> 25.
5. Blank line after `# CLAUDE.md`.
6. "Events include" + leaderboard:update. Check: broadcast-leaderboard.ts:22 sends 'leaderboard:update'.
7. vi.clearAllMocks prescription replaced by "reset mocks in beforeEach".
8. Inline style wording per ruling.
9. Working rules: 3001 fallback and Playwright-plugin UI verification added.
10. Acceptance: Step 1 check printed no MISSING and no STALE (only `checks-done`); wc -l -> 210; link acceptance printed nothing.

## Fix round 2
Commit: docs(claude): rewrap CLAUDE.md prose to 100 columns. Line breaks only.
- `awk 'length>100{print NR": "length}' CLAUDE.md` -> 25: 104 (code block); 73: 144, 169: 110, 170: 114, 171: 147 (table rows). Nothing else.
- `wc -l < CLAUDE.md` -> 214 (ceiling 215).
- Step 1 MISSING/STALE check: no MISSING, no STALE (only `checks-done`).
- Link acceptance command: no output.
- `git diff --word-diff=porcelain c9e8ac0 -- CLAUDE.md | command grep -E '^[+-][^+-]'` -> no output (no word changes).
