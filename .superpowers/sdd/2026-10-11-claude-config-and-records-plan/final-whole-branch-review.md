# Whole-branch review — chore/claude-config-and-records

**Reviewer:** task-reviewer-capable (opus pin, no model override), read-only, handed back in
its final message and saved here by the main session on 2026-10-15.
**Range:** 6a28b02..c17cb16. The run was interrupted by a power-off on 2026-10-13 and resumed
from its saved transcript. Tamper check clean: HEAD c17cb16, empty `git status --porcelain`,
ledger directory listing unchanged.

## Verdict

CHANGES_REQUESTED: 1 Important, 12 Minor, 0 Critical. Every spec item is delivered or
covered by a recorded ruling. Tests: 65 files passed | 1 skipped (66), 466 tests passed |
1 skipped (467), exit 0. Lint: exit 0. Link check: no new broken links. Product code: no changes.

## A. Spec coverage and cross-file consistency

Delivered, checked against c17cb16:

- **§4 tooling.**
  - `.mcp.json` holds supabase only.
  - `.claude/settings.json` parses. It no longer has the dropped servers or
    `enableAllProjectMcpServers`, and its deny list is unchanged.
  - The github allow list names read-only tools only.
  - `.gitignore` has both changes.
  - The findings note has its "After" section filled in.
- **§3 commands.**
  - 6 deleted, 6 kept, each with a `description:`.
  - create-hook names files that exist.
  - The product-owner line is updated.
- **§2.**
  - The Copilot files are gone. `dependabot.yml` and `workflows/ci.yml` are kept.
  - PATTERNS.md has the 4 headings and is linked from INDEX.
  - CLAUDE.md is 214 lines.
  - Its records table is byte-identical to the one in plans/README.md.
  - Every path, script and alias CLAUDE.md names exists.
  - The capable-tier rationale is true:
    - #58: use-presence, presence-heartbeat-controller
    - #59: providers, use-presence, realtime/presence-tracker
    - #60: use-host-quiz-state
    - #63: use-player-session, realtime/supabase-realtime-client
- **§1.**
  - Archive moves are `git mv`, at 100% similarity except 07's status line.
  - The frozen headers are added.
  - The #63 ledger's 4 files are force-added.
  - PROGRESS:
    - #63 is marked ✅.
    - The R6 row is rewritten.
    - #58/#59/#60 lines are added, with dates and commits verified (a9a7c76, 2d0e4d8, 404baa1,
      b66389b, f9d4673).
  - ADRs 018–022 are added. ADR-016 guideline 3 is marked superseded. "Open ideas" is renamed.
  - Status lines are fixed: #55 did ship branding.
- **Commits.** All Conventional Commits; no attribution lines.

Open plan steps (not defects): Task 7 Steps 7, 8 and 10.

## Findings

### Important

**I1. `docs/INDEX.md:124` tells readers to write to the frozen dev-notes file.**
- The line reads: "Completed work? Append to progress/dev-notes.md and reference session file".
- It contradicts ADR-022, `plans/README.md:14`, the frozen header in dev-notes.md and INDEX.md's
  own line 48.
- Also live navigation to frozen history: INDEX.md :164 and :165 (dev-notes, sessions), :94
  ("Read recent session notes") and :80.
- Fix:
  - :124 becomes "add one Work index line to progress/PROGRESS.md".
  - :164–165 point at the Work index and progress/plans/.
  - :80 and :94 say the sessions are historical.

### Minor

**M2. The kept commands carry stale content.**
- `create-hook.md:159` lists the channel `session:{sessionId}`, which no code uses.
- `create-hook.md:168` points at `src/infrastructure/realtime/broadcasters/`, which does not
  exist.
- The create-hook event list leaves out `leaderboard:update`.
- `create-entity.md:18,101` give the path `I[EntityName]Repository.ts`. The real files are
  kebab-case (`quiz-repository.ts`).

**M3. The reason given for not using `yarn test` is wrong in the agent shell.**
- In the Bash tool, `timeout 90 yarn test` exited 0 after one run: stdin is not a TTY, so vitest
  does not enter watch mode.
- CLAUDE.md:16 and :183 say it "never exits".
- These commands still say `yarn test`:
  - prisma-migrate.md:82
  - architecture-check.md:148
  - create-entity.md:169,183
  - create-use-case.md:216,230
- Fix: reword CLAUDE.md :16 and :183 ("watch mode in an interactive terminal; use test:run for
  verdicts"), and change the commands to `yarn test:run`.

**M4. CLAUDE.md:133 says repositories always upsert. The quiz repository does not.**
- `prisma-quiz.repository.ts`:
  - :222 calls `prisma.quiz.create`.
  - :145, :177 and :240 call `prisma.quiz.update`.
- `prisma-audit-log.repository.ts:16` calls `.create`.
- Only player and question upsert.

**M5. Code breaks two of CLAUDE.md's layer rules, including its own route snippet.**
- "Presentation → @application/dtos/* only" (CLAUDE.md:38) is broken in two places:
  - The route snippet calls `getServices()`.
  - 24 files under src/app/api import `@application/services`.
- "Application → @domain/* only" is broken: `src/application/services/factories.ts` imports
  infrastructure.
- Fix: name the composition-root exception.

**M6. CLAUDE.md:53 calls the wrong file git-ignored.**
- `generated-client.ts` is a tracked re-export.
- The git-ignored directory is `generated/`.

**M7. DECISION-LOG's "Open ideas" still lists audit logging, which shipped.**
- It shipped in 0968ae8: migration `20260308164750_add_audit_logs_table`, the repository, and
  `api/admin/audit`.

**M8. This branch's own records break plans/README.md's status-line rule.**
- The spec still says "Approved design, pending implementation plan".
- The plan has no status line.
- The two status lines this branch set don't use the "✅ Complete — PR #NN" form.

**M9. `docs/plan.md:35` is a live roadmap pointer to the moved `actions/07-…` file.**
- Correction 7 protects history, not live navigation.

**M10. The `.superpowers/sdd/.gitignore` file exists only on this machine.**
- It is not tracked and ignores itself.
- The root `.gitignore` has no superpowers entry.
- On a fresh clone, a ledger's diffs and briefs would show as untracked, and `git add -A` would
  sweep them in.
- Fix: add `/.superpowers/` to the root `.gitignore`.

**M11. Shared settings auto-allow destructive tools (carried over from master).**
- `mcp__supabase__*` allows `execute_sql`, `apply_migration` and branching on the dev project
  without a prompt.
- `Bash(git checkout*)` and `Bash(git stash*)` cover `git checkout -- .` and `git stash clear`.
- The deny list has `git push --force*` but not `git push -f`.
- Not a regression. The user's call.

**M12. PROGRESS.md: the three 2026-07-05 one-liners render under the 2026-08-01 heading.**
- Fix: add a `### 2026-07-05` heading.

**M13. Small leftovers.**
- ARCHITECTURE.md:28 says "Next.js 15".
- ARCHITECTURE.md:362 describes PROGRESS.md as "Release & session tracking".
- PATTERNS.md:104 points at the frozen sessions/.
- `.vscode/mcp.json` is still tracked (Copilot/VS Code config).
- CLAUDE.md:203 doesn't say that `plugin:supabase:supabase` is unscoped.

## C. Deferred minors triage

1. **plan.md:36 R6 phases.** Recommends fixing before merge.
   - plan.md:325 itself checks off a Phase 6 item done on 2026-07-04.
   - Suggested cell: "Phases 1–3, 5 done; 6 in progress (prod environment 2026-07-04); 4 not
     started". The user owns the wording.
2. **The lint ruling on the scratch file.** Fine for merge.
   - `eslint.config.mjs` ignores do not cover `.superpowers/`.
   - A one-line follow-up for the user.
3. **The Task 1 .gitignore blank line.** Fixed in 860d3f3.
4. **The Task 1 final newline in .mcp.json.** Fine.
5. **The Task 2 report friction.** Fine.
6. **The unverified Supabase `get_logs(service: 'api')`.** Still unverified (needs auth); fine.
7. **The Task 5 heading nit.** Same as M12.
8. **The Task 6 minors.** All addressed.

## Evidence (as reported)

- HEAD c17cb16 at start and after the restart; status empty.
- `git diff -M --stat 6a28b02 c17cb16`: 68 files, +2075/−3924.
- `yarn test:run`: exit 0, 65|1 files, 466|1 tests.
- `yarn lint`: exit 0, 0 errors, 5 warnings.
- `timeout 90 yarn test`: exit 0. `process.stdin.isTTY` is undefined.
- Link check: 24 broken, all from the baseline of 27; `comm -13` empty.
- Both JSON files parse.
- No changes under src/tests/e2e/servers.
- Attribution grep over the range: 0.
- `git ls-files .superpowers .claude`: the 6 commands, settings.json and the 4 #63 ledger files.
- `.superpowers/sdd/.gitignore` is untracked and ignores itself; the root .gitignore has no
  superpowers entry.
- Layer-rule greps: factories.ts imports infrastructure; 24 api files import
  `@application/services`.
- Repository grep: as in M4.
- `generated-client.ts` is tracked.
- `src/app/api/admin/audit/route.ts` exists; 0968ae8.
- plan.md:325 checks off a Phase 6 item.

Main session spot-check (2026-10-15): I1, M2, M4, M6, M7, M9 and M10 confirmed by reading the
lines and running `git ls-files`.

## Unverified (as reported)

- The github plugin tool names.
- Supabase `get_logs(service: 'api')`.
- Whether subagent-driven development recreates `.superpowers/sdd/.gitignore` on another
  machine.
- Windows behaviour.
- The width of the `mcp__supabase__*` grant under `project_ref`.
- Task 7 Step 7. It was recorded in the ledger on 2026-10-13, after the reviewer read it.
