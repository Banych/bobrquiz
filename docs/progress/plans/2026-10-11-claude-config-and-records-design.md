# Claude config and progress records — design

**Date:** 2026-10-11
**Status:** Approved design, pending implementation plan
**Branch:** `chore/claude-config-and-records` (from `origin/master` at 6a28b02)

## Why

Four problems, each observed in the repo on 2026-10-11:

1. **The same work is written up 3–6 times.** The realtime listener-leak fix (PR #63) is told
   in its plan's decision log, its session file, PROGRESS.md, dev-notes.md, the ledger's
   `final-fix-report.md` and `task-1-report.md`. Meanwhile PRs #58–#60 have no summary at all,
   only plans of 570–920 lines for fixes of a few commits.
2. **Two workflows compete.** CLAUDE.md prescribes its own plan template, status emoji and
   session files, and `/session-start` and `/fullstack-planner` repeat that. The user-level
   workflow (brainstorming → spec → writing-plans → plan-checker → subagent-driven development
   with named agents → committed ledger → branch passes) is what sessions actually follow.
   CLAUDE.md names no capable-tier files, so routing to the opus agents has nothing to go on.
3. **Config is stale and bloated.**
   - CLAUDE.md is 409 lines (~6k tokens, loaded by every subagent including haiku
     implementers). About 60% of it copies `.github/copilot-instructions.md`.
   - It says Next.js 15 (package.json: 16.2.6).
   - None of the 11 `.claude/commands` has a `description:`. The commands README lists 6 of
     the 11, and `/create-hook` names files that were renamed.
   - DECISION-LOG.md's last entry is 2026-01-24. PROGRESS.md still shows #63 in progress.
   - `docs/progress/actions/`, `REORGANIZATION-SUMMARY.md`, `structure.md` and the numbered
     docs are superseded.
4. **Tooling breaks on CachyOS.** `.mcp.json` launches github, playwright and context7 through
   `cmd /c` (Windows-only), so all three fail to connect here. The permissions still name
   those servers' prefixes. `.claude/settings.local.json` is committed although its name says
   machine-local.

Copilot is no longer used on this repo (user, 2026-10-11).

## Decisions

**Decision: records stay in `docs/progress/` (layout A)**
- Specs and plans go to `docs/progress/plans/`. The ledger stays at `.superpowers/sdd/<plan>/`,
  where subagent-driven development writes it, and is force-added.
- Rejected: moving to the superpowers defaults (`docs/superpowers/specs|plans`). That splits
  the design history at 2026-10, or costs a move of 21 files and their links.
- Rejected: fixing staleness only. That removes neither the duplication nor the competing
  workflow.
- Cheap to reverse: two `git mv`s.

**Decision: one record per piece of work**
- A spec, a plan, a committed ledger and one PROGRESS.md index line.
- DECISION-LOG.md gets an entry only for a decision that outlives the work.
- No session files, and no dev-notes lines.
- Rejected: keeping session files as a summary. In the #63 sample, every useful line in the
  session file (root cause with numbers, rejected alternative, verification counts, deferrals)
  was already in the plan or the ledger.

**Decision: only `progress.md` and `*-report.md` are committed from a ledger**
- The `review-*.diff` files are regenerable git ranges and the `task-*-brief.md` files re-paste
  the plan. Together they were ~2,200 of the ~2,455 lines in the #63 ledger.
- `.superpowers/sdd/.gitignore` (`*`) stays, so these are force-added by name.

**Decision: Copilot files are deleted, not trimmed**
- The user no longer uses Copilot. Its long-form pattern sections move to
  `docs/guides/PATTERNS.md`, so the knowledge survives in one copy.

**Decision: github, playwright and context7 come from the user-level plugins**
- Those plugins are installed and connect on CachyOS. A project `.mcp.json` entry has to pick
  one OS's launcher.
- Supabase stays in `.mcp.json`: it is HTTP and project-specific (project ref).
- Assumed, not observed: the plugin servers work on the Windows machine. Recorded as a finding
  to confirm there.

## Design

### 1. Records

New convention, per piece of work:

| Artifact | Path | Written when |
|---|---|---|
| Spec | `docs/progress/plans/YYYY-MM-DD-<topic>-design.md` | end of brainstorming |
| Plan | `docs/progress/plans/YYYY-MM-DD-<topic>-plan.md` | writing-plans |
| Ledger | `.superpowers/sdd/<plan>/progress.md` + `*-report.md`, force-added | during execution |
| Index line | `docs/progress/PROGRESS.md` | when the PR merges |
| ADR | `docs/DECISION-LOG.md` | only for a decision that outlives the work |

Plan shape follows the user-level rule. A plan carries interfaces, test code and exact
acceptance commands, plus full implementation code only in tasks routed to
`implementer-transcribe`. `docs/progress/plans/README.md` is rewritten to say this and to
describe the table above. The old template goes.

One-off cleanup:
- `docs/progress/sessions/` and `docs/progress/dev-notes.md` get a header: historical, no new
  entries, and where records live now.
- `git mv` to `docs/archive/`:
  - `docs/progress/actions/`
  - `docs/REORGANIZATION-SUMMARY.md`
  - `docs/structure.md`
  - `docs/01-setup-project.md`, `02.1-…`, `02.2-…`, `03-…`, `04-…`
  - `docs/06-media-uploads.md` (superseded by `docs/guides/MEDIA-UPLOADS.md`, 603 lines vs
    347)

  Fix the links that pointed at them (INDEX.md, ARCHITECTURE.md, anything else a link check
  finds).
- PROGRESS.md:
  - Mark #63 complete.
  - Correct the R6 row and target date.
  - Add index lines for #58, #59 and #60, which have none.
  - Restate the top of the file as the index the convention above describes.
- Plan status fixes:
  - `2026-07-04-bobr-quiz-branding-design.md` (shipped in #55)
  - `2026-01-31-r5-completion-plan.md` (complete)
  - `actions/07-…` (moving to the archive anyway; its status is fixed so the archive is not
    misleading)
- DECISION-LOG.md backfill, one short ADR each with a link to where the reasoning lives:
  - Supabase production isolation (2026-07-04)
  - master-branch protection
  - presence channel reuse and heartbeat design (#58/#59)
  - dispatcher registry for realtime listener binding (#63)
  - Close the stale "Future ADRs" list or mark it as ideas.
- `.gitignore`: remove `/docs/superpowers/` (obsolete) and add `.claude/settings.local.json`.
- Commit the #63 ledger's `progress.md`, `task-1-report.md`, `task-2-report.md` and
  `final-fix-report.md`.

### 2. CLAUDE.md and the Copilot files

CLAUDE.md is rewritten to about 180 lines. It holds only project facts. For process it points
to the user-level workflow rather than restating it.

- **Keep (corrected):**
  - Overview: Next.js 16, Prisma v7, Supabase.
  - Commands, with `yarn test:run` as the test verdict command (`yarn test` is vitest watch
    mode).
  - Architecture and layer import rules.
  - Path aliases synced with tsconfig (adds `@/*`, `@utils/*`).
  - The Prisma v7 adapter gotcha.
  - Testing requirements and where tests live.
  - Key patterns, condensed: API route, use case, entity, realtime naming, query hook,
    repository.
  - Common pitfalls.
  - Debug order (absorbs `/debug`'s Supabase-logs and Playwright checklist).
  - Git rules: never commit to master, no AI attribution.
- **Add:**
  - **Capable-tier files**: `src/infrastructure/realtime/**`, `src/hooks/use-presence.tsx`,
    `src/hooks/use-realtime-client.tsx`, `src/hooks/use-reconnection.ts`,
    `src/hooks/use-countdown-timer.ts`, `src/lib/presence-heartbeat-controller.ts` and
    `src/lib/debounce-broadcast.ts`. Basis: fix commits since 2026-07 cluster there (#58, #59,
    #60, #63), and each involves subscriptions, timers or teardown ordering.
  - **Records**: the table from section 1 and the location override ("specs and plans go to
    `docs/progress/plans/`, not `docs/superpowers/`").
  - A link to `docs/guides/PATTERNS.md`.
- **Drop:**
  - Planning Workflow, the Documentation Practices table, the session-file rules and the
    MCP-server table (servers now come from plugins).
  - The custom-skills list (descriptions now carry it).
  - The dangling "recovery pattern" pointer.
  - Everything that duplicated copilot-instructions.

`docs/guides/PATTERNS.md` gets copilot-instructions' Authentication Workflows, Realtime & State
Management, Error Handling Patterns and Performance Optimization sections, checked against the
code as they move (stale paths corrected). `docs/INDEX.md` links it.

Delete: `.github/copilot-instructions.md`, `.github/prompts/`, `.github/agents/`,
`.github/instructions/`. Keep `.github/dependabot.yml` and `.github/workflows/`. Remove the
remaining references (`docs/progress/plans/README.md` is rewritten anyway; the 2026-05-09
session file is history and keeps its mention).

### 3. Commands

| Command | Fate | Reason |
|---|---|---|
| `session-start` | delete | replaced by the ledger |
| `fullstack-planner` | delete | brainstorming → writing-plans → subagent-driven development |
| `add-feature` | delete | same flow; layer order lives in CLAUDE.md |
| `test` | delete | test-driven-development + CLAUDE.md testing section |
| `debug` | delete | systematic-debugging + CLAUDE.md debug order |
| `README` | delete | the `description:` lines replace the index |
| `create-entity` | keep | add `description:` |
| `create-use-case` | keep | add `description:` |
| `create-hook` | keep | add `description:`; fix file names (`use-player-session.ts`, `use-host-quiz-state.ts`, kebab-case pattern) |
| `architecture-check` | keep | add `description:` |
| `prisma-migrate` | keep | add `description:`; replace raw `npx prisma` with yarn scripts where one exists |
| `product-owner` | keep | add `description:` |

Descriptions follow the "Use when …" form so the skill listing shows when each applies.

### 4. Tooling

- `.mcp.json`: keep `supabase` only.
- `git mv .claude/settings.local.json .claude/settings.json`.
  - Remove `enabledMcpjsonServers` entries for the three dropped servers, and
    `enableAllProjectMcpServers`.
  - Rename `mcp__playwright__*`, `mcp__github__*` and `mcp__context7__*` to the plugin prefixes
    (`mcp__plugin_playwright_playwright__*`, `mcp__plugin_github_github__*`,
    `mcp__plugin_context7_context7__*`).
  - Keep the deny list.
- `.gitignore`: `.claude/settings.local.json` (per-machine overrides from now on).
- Findings note `docs/progress/findings/2026-10-11-mcp-servers-cachyos.md`:
  - Observed: `cmd` ENOENT for three servers on CachyOS, Claude Code session 2026-10-11.
  - Observed: the plugin servers listed as connected here.
  - Assumed: the same on Windows; attack this first.

## Testing and verification

Docs and config only; no product code changes.
- `yarn lint` passes (Prettier covers the markdown it is configured for).
- `yarn test:run` passes with the same counts as on master, recorded with counts. Nothing
  imports the moved files, but the run proves it.
- A link check over `docs/**/*.md` and `CLAUDE.md` finds no relative link to a missing file.
- A fresh `claude` session in the repo shows:
  - all six kept commands with their descriptions
  - no connection failure for github, playwright or context7
  - supabase connected
- `git grep` finds no live reference to deleted paths (`copilot-instructions`, `.github/prompts`,
  `session-start`, `fullstack-planner`) outside archived history.

## Out of scope

- Rewriting historical session or plan files beyond their status lines.
- Changing user-level `~/.claude` config or agents.
- Product code.
