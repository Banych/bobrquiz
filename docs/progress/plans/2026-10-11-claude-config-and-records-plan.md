# Claude Config and Records Cleanup Implementation Plan

**Status:** ✅ Complete — PR #64

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One record per piece of work, a CLAUDE.md that holds only accurate project facts, six
working commands, and MCP servers that connect on CachyOS.

**Architecture:** Docs and config only; no product code. Seven tasks, one commit each: tooling,
commands, Copilot → patterns guide, archive moves, records content, CLAUDE.md rewrite, then
verification by the main session. CLAUDE.md comes last because it links everything the
earlier tasks produce.

**Tech Stack:** Markdown, JSON, git. Checks use `yarn lint`, `yarn test:run`, `claude mcp list`
and a link-check script in the plan workspace.

**Spec:** `docs/progress/plans/2026-10-11-claude-config-and-records-design.md`

**Workspace (git-ignored, `.superpowers/sdd/.gitignore` = `*`):**
`.superpowers/sdd/2026-10-11-claude-config-and-records-plan/`
- `check-links.mjs` checks relative markdown links in `docs/` (except `docs/archive/`),
  `.claude/`, `CLAUDE.md` and `README.md`. It prints `file:line -> target` and exits 1 on any
  broken link.
- `links-baseline.txt` holds the 27 distinct broken links on master before this work (as
  `file -> target`, line numbers stripped). All of them are pre-existing: old session files
  linking repo-root paths, and code samples in commands.

**Link acceptance command** (used by Tasks 3–6; `W` is the workspace path). It prints the
broken links that are not in the baseline. Empty output passes.

```bash
W=.superpowers/sdd/2026-10-11-claude-config-and-records-plan
node $W/check-links.mjs | command grep ' -> ' | command grep -v '2026-10-11-claude-config-and-records' \
  | sed 's/:[0-9]* ->/ ->/' | LC_ALL=C sort -u > $W/links-after.txt
LC_ALL=C comm -13 $W/links-baseline.txt $W/links-after.txt
```

The spec and plan for this work are filtered out because their example links are illustrative.
The baseline is sorted with `LC_ALL=C` to match.

## Global Constraints

- No file under `src/`, `tests/`, `e2e/` or `servers/` changes.
- Commits: Conventional Commits, subject ≤ 72 chars, no `Co-Authored-By` or any AI
  attribution.
- Use yarn scripts where one exists. `prisma migrate status` and `prisma migrate reset` have
  none, so raw `npx prisma` stays for those two only.
- Nothing is deleted from history except the Copilot files (spec §2) and the six retired
  commands (spec §3). Superseded docs move with `git mv`.
- Historical session and plan files change only in status lines and in link paths to moved
  files.
- The test verdict command is `yarn test:run`. `yarn test` is vitest watch mode.
- Capable-tier files (verbatim in CLAUDE.md, Task 6):
  - `src/infrastructure/realtime/**`
  - `src/hooks/use-presence.tsx`
  - `src/hooks/use-realtime-client.tsx`
  - `src/hooks/use-reconnection.ts`
  - `src/hooks/use-countdown-timer.ts`
  - `src/lib/presence-heartbeat-controller.ts`
  - `src/lib/debounce-broadcast.ts`

## Plan corrections to the spec (rulings, 2026-10-11)

1. **The spec says the plugin servers are "listed as connected"; only some are.**
   `claude mcp list` (Claude Code 2.1.296) shows:

   | Server | Status |
   |---|---|
   | `plugin:github:github` | ✔ Connected |
   | `plugin:playwright:playwright` | ✔ Connected |
   | `plugin:context7:context7` | ! Needs authentication |
   | project `supabase` | ! Needs authentication |

   The findings note (Task 1) records this as measured. Authenticating through `/mcp` is the
   user's step.
2. **Spec §4 says "rename" the github permission; it is narrowed instead.** Renaming
   `mcp__github__*` to `mcp__plugin_github_github__*` would let PR creation, merges and
   comments run without a prompt. That contradicts "never post without approval". The new
   allow list names the plugin's read-only tools one by one.
3. **Both `.gitignore` edits go in Task 1** (spec §1 had the `/docs/superpowers/` removal under
   records), so the file changes in one commit.
4. **`create-hook`**: only lines 21–22 are stale. `use-[entity-name].ts` (lines 16, 27) is
   already kebab-case and stays.
5. **`prisma-migrate`** needs only its frontmatter (see Global Constraints on raw
   `npx prisma`).
6. **`docs/archive/` is excluded from the link check.** Moved files keep their outbound links
   as written; they are history.
7. **Plain-text historical mentions of moved paths stay** (plan-check, 2026-10-11). Examples:
   ADR-017's "Consolidated structure.md + 01-04 steps", and dev-notes lines describing past
   work. Rewriting them would change what those records said at the time. Markdown links are
   rewritten.
8. **The "Commands available" list is dropped from CLAUDE.md**, as the spec says. The
   `description:` lines carry it.

## Review Focus

- **Permissions too open.** A github write tool (create/merge PR, comment) must still prompt.
  Pinned by Task 1 Step 3: no `mcp__plugin_github_github__*` wildcard and no write-tool name in
  `allow`.
- **Ledger commits bloat.** A force-add that sweeps in `*.diff` or `*-brief.md`. Pinned by
  Task 4 Step 6's `git ls-files` check.
- **A haiku implementer can't find the essentials.** The new CLAUDE.md must name the test
  verdict command and the capable-tier list. Pinned by Task 6 Step 3's greps.
- **A live doc still links to a moved file.** Pinned by the link acceptance command in Tasks
  4–6.
- **Windows pull.** `git mv .claude/settings.local.json .claude/settings.json` deletes the
  tracked local file on the Windows checkout. Uncommitted edits there would block the pull.
  Not testable here; it is in the findings note's "assumed" list and the finish-step message.

---

### Task 1: Tooling (MCP servers, settings, gitignore, findings note)

**Agent:** `implementer-transcribe`. This task carries its complete content.

**Files:**
- Modify: `.mcp.json`
- Rename + modify: `.claude/settings.local.json` → `.claude/settings.json`
- Modify: `.gitignore`
- Create: `docs/progress/findings/2026-10-11-mcp-servers-cachyos.md`

**Interfaces:**
- Produces: `.claude/settings.json` is the committed project settings file; Task 6's CLAUDE.md
  names it. The findings path is linked from this work's PROGRESS index line (Task 7 Step 10).

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
test ! -e .claude/settings.local.json && test -e .claude/settings.json \
  && ! command grep -q '"cmd"' .mcp.json \
  && command grep -qx '.claude/settings.local.json' .gitignore \
  && ! command grep -q '^/docs/superpowers/' .gitignore \
  && echo PASS || echo FAIL
```

Expected now: `FAIL`.

- [ ] **Step 2: Apply the changes**

```bash
git mv .claude/settings.local.json .claude/settings.json
```

`.mcp.json`, whole file:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=iwnxzdhhrreogxauxehm&features=docs,account,database,debugging,development,functions,branching,storage"
    }
  }
}
```

`.claude/settings.json`, whole file:

```json
{
  "permissions": {
    "allow": [
      "Bash(yarn *)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git add*)",
      "Bash(git branch*)",
      "Bash(git checkout*)",
      "Bash(git stash*)",
      "Bash(git fetch*)",
      "Bash(git pull*)",
      "Bash(npx prisma *)",
      "Bash(npx playwright *)",
      "Bash(npx shadcn@latest *)",
      "Bash(ls:*)",
      "Bash(grep *)",
      "mcp__supabase__*",
      "mcp__plugin_playwright_playwright__*",
      "mcp__plugin_context7_context7__*",
      "mcp__plugin_github_github__get_commit",
      "mcp__plugin_github_github__get_file_contents",
      "mcp__plugin_github_github__get_label",
      "mcp__plugin_github_github__get_latest_release",
      "mcp__plugin_github_github__get_me",
      "mcp__plugin_github_github__get_release_by_tag",
      "mcp__plugin_github_github__get_tag",
      "mcp__plugin_github_github__issue_read",
      "mcp__plugin_github_github__list_branches",
      "mcp__plugin_github_github__list_commits",
      "mcp__plugin_github_github__list_issues",
      "mcp__plugin_github_github__list_pull_requests",
      "mcp__plugin_github_github__list_releases",
      "mcp__plugin_github_github__list_tags",
      "mcp__plugin_github_github__pull_request_read",
      "mcp__plugin_github_github__search_code",
      "mcp__plugin_github_github__search_commits",
      "mcp__plugin_github_github__search_issues",
      "mcp__plugin_github_github__search_pull_requests",
      "mcp__ide__getDiagnostics"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -f*)"
    ]
  },
  "enabledMcpjsonServers": ["supabase"]
}
```

`.gitignore` changes:
- Delete the line `/docs/superpowers/` (line 31) and nothing else around it.
- Append at the end:

```
# Per-machine Claude Code overrides (shared settings live in .claude/settings.json)
.claude/settings.local.json
```

`docs/progress/findings/2026-10-11-mcp-servers-cachyos.md`, whole file:

```markdown
# MCP servers on CachyOS — findings (2026-10-11)

**Ran:** `claude mcp list` in this repo, Claude Code 2.1.296, CachyOS, before and after the
config change in `chore/claude-config-and-records`.

## Observed

- Before: the project `.mcp.json` launched `github`, `playwright` and `context7` through
  `cmd /c npx …`. All three failed: `ENOENT: Executable not found in $PATH: "cmd"`. `cmd` exists
  only on Windows.
- The same three are provided by user-level plugins. `plugin:github:github` (HTTP) and
  `plugin:playwright:playwright` (`npx @playwright/mcp@latest`) showed ✔ Connected.
  `plugin:context7:context7` (HTTP) showed "! Needs authentication".
- The project `supabase` server (HTTP, scoped by `project_ref`) showed "! Needs
  authentication" on this machine. `plugin:supabase:supabase` is also installed but is not
  scoped to the project; the project entry is the one to use.
- After: `.mcp.json` holds only `supabase`; see the "After" run below.

## After

(Filled in by Task 7 from its own `claude mcp list` run.)

## Assumed — attack these first

- The plugin `playwright` server starts on Windows without a `cmd /c` wrapper.
- Pulling this branch on Windows replaces `.claude/settings.local.json` with
  `.claude/settings.json` cleanly. Uncommitted edits to the old file there would block the
  pull; move them aside first.

## To do by hand

- Run `/mcp` and authenticate `supabase` and `plugin:context7:context7` on each machine.
```

- [ ] **Step 3: Run the acceptance checks**

Run the Step 1 command. Expected: `PASS`.

```bash
node -e 'for (const f of [".mcp.json", ".claude/settings.json"]) JSON.parse(require("fs").readFileSync(f, "utf8")); console.log("json ok")'
command grep -c 'mcp__plugin_github_github__\*' .claude/settings.json
command grep -cE 'github__(create|merge|update|delete|push|add|fork|assign|request|sub_issue|issue_write|pull_request_review_write|run_secret)' .claude/settings.json
```

Expected: `json ok`, then `0`, then `0`.

- [ ] **Step 4: Commit**

```bash
git add .mcp.json .claude/settings.json .gitignore docs/progress/findings/2026-10-11-mcp-servers-cachyos.md
git commit -m "chore(claude): move MCP servers to plugins, commit project settings

The cmd /c launchers in .mcp.json only work on Windows, so github,
playwright and context7 failed on CachyOS. The user-level plugins
provide all three. Project settings become settings.json (shared);
settings.local.json is now per-machine. The github allow list names
read-only tools so writes still prompt."
```

---

### Task 2: Commands

**Agent:** `implementer-transcribe`. This task carries its complete content.

**Files:**
- Delete: `.claude/commands/{session-start,fullstack-planner,add-feature,test,debug,README}.md`
- Modify (frontmatter added at line 1): `.claude/commands/{create-entity,create-use-case,create-hook,architecture-check,prisma-migrate,product-owner}.md`
- Modify: `.claude/commands/create-hook.md:21-22`

**Interfaces:**
- Produces: the six kept command names. Task 6 lists them in CLAUDE.md. Task 6 reads the
  deleted `debug.md` and `test.md` from `origin/master` with `git show`.

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
cd .claude/commands && ls | sort | tr '\n' ' '; echo
for f in *.md; do head -1 "$f" | command grep -qx -- '---' && sed -n 2p "$f" | command grep -q '^description: ' || echo "NO-FM $f"; done
command grep -n 'usePlayerSession.ts\|useQuizState.ts' create-hook.md; cd - >/dev/null
```

Expected now:
- 12 files listed (11 commands plus README).
- `NO-FM` printed for each.
- Two create-hook matches.

- [ ] **Step 2: Apply the changes**

```bash
git rm -q .claude/commands/session-start.md .claude/commands/fullstack-planner.md \
  .claude/commands/add-feature.md .claude/commands/test.md .claude/commands/debug.md \
  .claude/commands/README.md
```

Insert at line 1 of each kept file. The existing `# Title` line stays directly after the
closing `---`.

`create-entity.md`:
```
---
description: Use when adding a new domain entity — scaffolds the entity class, its repository interface and a domain test skeleton following the project's entity conventions.
---
```

`create-use-case.md`:
```
---
description: Use when adding a new application use case — scaffolds the use-case class, DTO changes, service wiring, the API route and use-case tests for success and not-found paths.
---
```

`create-hook.md`:
```
---
description: Use when adding a TanStack Query hook in src/hooks — scaffolds the query key factory, the fetcher with the project's error parsing, and an optional Supabase realtime subscription.
---
```

`architecture-check.md`:
```
---
description: Use when reviewing changes for DDD layer violations — checks imports across domain, application, infrastructure and presentation, entities or Prisma types leaking into UI or DTOs, and wrong Prisma imports.
---
```

`prisma-migrate.md`:
```
---
description: Use when changing schema.prisma — the migration workflow for this repo's non-standard Prisma v7 setup, from schema edit through migration, client regeneration and layer updates, with rollback steps.
---
```

`product-owner.md`:
```
---
description: Use when clarifying requirements, reviewing a feature from the business side, or writing product-facing docs for the quiz game — acts as product owner against docs/plan.md and the mockups.
---
```

In `product-owner.md`, the line `Read relevant docs (\`docs/plan.md\`, session notes)` (line 40
before the frontmatter) becomes `Read relevant docs (\`docs/plan.md\`, the specs and plans in
\`docs/progress/plans/\`)`.

In `create-hook.md`, replace the two lines that were lines 21–22 before the frontmatter
(they are 24–25 after it):

```
src/hooks/usePlayerSession.ts   — query + mutation + realtime (most complete)
src/hooks/useQuizState.ts       — query + realtime without mutation
```

with:

```
src/hooks/use-player-session.ts   — query + mutation + realtime (most complete)
src/hooks/use-host-quiz-state.ts  — query + realtime without mutation
```

- [ ] **Step 3: Run the acceptance check**

Run the Step 1 command. Expected:
- Exactly `architecture-check.md create-entity.md create-hook.md create-use-case.md prisma-migrate.md product-owner.md`.
- No `NO-FM` line.
- No create-hook match.

Then confirm both hook files exist:

```bash
ls src/hooks/use-player-session.ts src/hooks/use-host-quiz-state.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A .claude/commands
git commit -m "chore(claude): retire six commands, describe the six kept

session-start, fullstack-planner, add-feature, test and debug are
superseded by the superpowers workflow skills; README by the
descriptions. The kept commands get frontmatter descriptions so they
show when they apply, and create-hook's example paths match the
kebab-case files."
```

---

### Task 3: Patterns guide replaces the Copilot files

**Agent:** `implementer` (sonnet). Each moved section has to be checked against the code.

**Files:**
- Create: `docs/guides/PATTERNS.md`
- Modify: `docs/INDEX.md` (add one link under the guides list)
- Delete: `.github/copilot-instructions.md`, `.github/prompts/` (11 files), `.github/agents/`
  (2 files), `.github/instructions/` (1 file)

**Interfaces:**
- Consumes: `.github/copilot-instructions.md` sections "Authentication Workflows" (≈line 672),
  "Realtime & State Management" (≈689), "Error Handling Patterns" (≈704) and "Performance
  Optimization" (≈740). Find exact bounds with `command grep -n '^## ' .github/copilot-instructions.md`.
- Produces: `docs/guides/PATTERNS.md` with exactly these `##` headings, in order:
  `## Authentication`, `## Realtime and state`, `## Error handling`, `## Performance`. Task 6
  links the file by this path.

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
test -f docs/guides/PATTERNS.md && test ! -e .github/copilot-instructions.md \
  && test ! -e .github/prompts && test ! -e .github/agents && test ! -e .github/instructions \
  && test -f .github/dependabot.yml && test -f .github/workflows/ci.yml \
  && [ "$(command grep -c '^## ' docs/guides/PATTERNS.md)" = 4 ] \
  && command grep -q 'guides/PATTERNS.md' docs/INDEX.md && echo PASS || echo FAIL
```

Expected now: `FAIL`.

- [ ] **Step 2: Build PATTERNS.md**

- Open it with a title and one paragraph: what the guide covers and that CLAUDE.md holds the
  short form.
- Copy each of the four sections under its new heading.
- For every file path, hook, function or class a section names, check it exists
  (`ls`, `command grep -rn <symbol> src`).
  - Correct renamed paths (e.g. `usePlayerSession.ts` → `use-player-session.ts`).
  - Delete statements about code that no longer exists.
  - Repoint `docs/04-presentation-and-realtime.md` (cited at copilot-instructions :687 and
    :702) to `docs/guides/PRESENTATION-LAYER.md`. Task 4 archives `docs/04-…`.
  - Keep a list of each correction for the report.
- Do not add new guidance.

- [ ] **Step 3: Account for the rest of copilot-instructions**

For every other `##` section of `.github/copilot-instructions.md`, give a one-line verdict in
the report, one of:
- "already in CLAUDE.md"
- "historical/process (superseded by the user-level workflow)"
- "unique and live"

Do not move "unique and live" sections; the controller rules on them in the review round.

- [ ] **Step 4: Link and delete**

- Add `- [Patterns](guides/PATTERNS.md) — auth, realtime and state, error handling, performance`
  to the guides list in `docs/INDEX.md`, matching that list's existing bullet style.
- Then run:

```bash
git rm -rq .github/copilot-instructions.md .github/prompts .github/agents .github/instructions
```

- [ ] **Step 5: Run the acceptance checks**

- Step 1 command. Expected: `PASS`.
- The link acceptance command. Expected: empty output.
- `git grep -l 'copilot-instructions'`. Expected: exactly these five, two rewritten by Tasks 5
  and 6 and three that are history:
  - `CLAUDE.md`
  - `docs/progress/plans/README.md`
  - `docs/progress/sessions/2026-05-09-maintenance-security-tooling.md`
  - the two 2026-10-11 spec and plan files

- [ ] **Step 6: Commit**

```bash
git add docs/guides/PATTERNS.md docs/INDEX.md
git commit -m "docs: move Copilot pattern guides to docs/guides/PATTERNS.md

Copilot is no longer used on this repo. The auth, realtime, error
handling and performance sections survive in one guide, checked
against the current code; the instructions, prompts and agents that
mirrored .claude/commands are removed."
```

(`git rm` already staged the deletions.)

---

### Task 4: Archive superseded docs and commit the #63 ledger

**Agent:** `implementer` (sonnet). Rewriting the links needs judgment.

**Files:**
- Move (`git mv`) into `docs/archive/`:
  - `docs/progress/actions/` → `docs/archive/actions/`
  - `docs/REORGANIZATION-SUMMARY.md`
  - `docs/structure.md`
  - `docs/01-setup-project.md`
  - `docs/02.1-define-ddd-structure.md`
  - `docs/02.2-application-layer.md`
  - `docs/03-infrastructure-layer.md`
  - `docs/04-presentation-and-realtime.md`
  - `docs/06-media-uploads.md`
- Create: `docs/archive/README.md`
- Modify (link paths only): every `*.md` outside `docs/archive/` that names a moved path.
  Found on master:
  - `docs/DECISION-LOG.md:579,594,598`
  - `docs/INDEX.md:47`
  - `docs/plan.md:35`
  - `docs/progress/PROGRESS.md:219,232`
  - `docs/progress/dev-notes.md:93,141,149,224,249`
  - `docs/progress/file-ideas.md:13`
  - `docs/progress/plans/2026-01-31-r5-completion-plan.md:142`
  - `docs/progress/plans/2026-02-01-r5-phase6-final-integration.md:81,189`
  - `docs/progress/plans/2026-07-03-r6-supabase-prod-isolation.md:59`
  - `docs/progress/sessions/`: 2025-11-30-host-mvp-session-targets, 2025-11-30-session-targets,
    2025-12-05-prisma-adapter-upgrade, 2025-12-20-complete-r4-content-admin,
    2025-12-20-fix-e2e-auth-conflicts, 2025-12-20-r4-auth-foundation,
    2026-01-11-r5-phase2-ui-enhancements

  Re-find them with the Step 1 grep.
- Modify: `docs/ARCHITECTURE.md:709`. Its link `PROGRESS.md` is broken on master; point it at
  `progress/PROGRESS.md`.
- Modify: `docs/ARCHITECTURE.md:358-377`, the `docs/` tree. Make it match the tree after the
  move: `archive/`, `guides/` (including `PATTERNS.md`), `progress/` with `plans/`,
  `sessions/` and `findings/`, and no `progress/actions/`.
- Modify: `docs/progress/PROGRESS.md:418` and `:429`. These are `[actions/](actions/)`
  directory links, which the Step 1 grep does not catch. Task 5 rewrites both sections, so
  here just point them at `../archive/actions/`.
- Modify (status line only): `docs/archive/actions/07-r5-realtime-scoring-implementation.md`
  becomes `✅ Superseded by docs/progress/plans/2026-01-31-r5-completion-plan.md (R5 complete
  2026-02-01)`.
- Modify: `docs/progress/dev-notes.md` and `docs/progress/sessions/` get a frozen header (Step 4).
- Force-add: `.superpowers/sdd/2026-08-01-realtime-broadcast-listener-leak-fix/{progress.md,task-1-report.md,task-2-report.md,final-fix-report.md}`

**Interfaces:**
- Produces: the archive paths above. Task 5's PROGRESS and DECISION-LOG edits use them.

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
command grep -rnE 'progress/actions/|actions/0[0-9]-|REORGANIZATION-SUMMARY\.md|(^|[^-a-zA-Z])structure\.md|(01-setup-project|02\.1-define-ddd-structure|02\.2-application-layer|03-infrastructure-layer|04-presentation-and-realtime|06-media-uploads)\.md' \
  --include='*.md' docs CLAUDE.md README.md | command grep -v '^docs/archive/' \
  | command grep -v 'archive/' | command grep -v '2026-10-11-claude-config-and-records'
```

Expected now: the lines listed under Files, plus about 35 lines inside the files being moved
(those drop out after the move under `archive/`).

- [ ] **Step 2: Move**

```bash
mkdir -p docs/archive
git mv docs/progress/actions docs/archive/actions
git mv docs/REORGANIZATION-SUMMARY.md docs/structure.md docs/01-setup-project.md \
  docs/02.1-define-ddd-structure.md docs/02.2-application-layer.md \
  docs/03-infrastructure-layer.md docs/04-presentation-and-realtime.md \
  docs/06-media-uploads.md docs/archive/
```

`docs/archive/README.md`:

```markdown
# Archive

Superseded docs, kept for history. Nothing here is maintained and links inside these files may
point at paths that have since moved.

- `actions/` — Release R1–R5 action notes (2025-11 to 2025-12); replaced by `docs/progress/plans/`.
- `01-…` to `06-…` — the original step-by-step build docs; replaced by `docs/ARCHITECTURE.md`
  and `docs/guides/`.
- `structure.md`, `REORGANIZATION-SUMMARY.md` — the 2026-01-24 documentation reorganization.
```

- [ ] **Step 3: Rewrite links**

For each hit from Step 1 that is a markdown link `](…)`, point the path at its new location,
correct relative to the linking file. Leave plain-text mentions as written (plan correction 7).
Do not reword anything else on the line.

- [ ] **Step 4: Freeze headers**

Insert directly under the H1 of `docs/progress/dev-notes.md`:

```markdown
> **Frozen 2026-10-11 — historical, no new entries.** Each piece of work is now recorded once:
> spec and plan in `docs/progress/plans/`, ledger in `.superpowers/sdd/<plan>/`, and one line
> in `docs/progress/PROGRESS.md`. See `docs/progress/plans/README.md`.
```

Create `docs/progress/sessions/README.md` with an H1 `# Session notes (historical)` followed by
the same quoted block.

- [ ] **Step 5: Force-add the #63 ledger**

```bash
L=.superpowers/sdd/2026-08-01-realtime-broadcast-listener-leak-fix
git add -f $L/progress.md $L/task-1-report.md $L/task-2-report.md $L/final-fix-report.md
```

- [ ] **Step 6: Run the acceptance checks**

- The Step 1 command piped through `command grep '](' `. Expected: no output, so no markdown
  link names a pre-move path. The plain-text hits that remain are all in `docs/DECISION-LOG.md`,
  `docs/progress/dev-notes.md` or `docs/progress/sessions/`. List them in the report.
- The link acceptance command. Expected: empty output.
- The ledger check:

  ```bash
  git ls-files .superpowers | sort
  git ls-files .superpowers | command grep -E '\.diff$|-brief\.md$' | wc -l
  ```

  Expected: exactly the four ledger files, then `0`.

- [ ] **Step 7: Commit**

```bash
git add -A docs
git commit -m "docs: archive superseded docs, freeze session log

Action notes, the numbered build docs and the 2026-01 reorganization
report move to docs/archive with their links updated. Session notes
and dev-notes are frozen in favour of one record per piece of work.
The listener-leak ledger (progress and reports) is committed; its
diffs and briefs stay out, as git and the plan already hold them."
```

---

### Task 5: Records content (PROGRESS index, DECISION-LOG, plan statuses, plans README)

**Agent:** `implementer` (sonnet). The ADR text has to be drawn from existing plans and sessions.

**Files:**
- Modify: `docs/progress/PROGRESS.md`
- Modify: `docs/DECISION-LOG.md`
- Modify (status line only):
  - `docs/progress/plans/2026-07-04-bobr-quiz-branding-design.md`
  - `docs/progress/plans/2026-01-31-r5-completion-plan.md`
- Rewrite: `docs/progress/plans/README.md`

**Interfaces:**
- Consumes: the archive paths from Task 4.
- Produces: the records convention in `docs/progress/plans/README.md`. Task 6 copies its table
  into CLAUDE.md. Also ADR numbers 018–022, which Task 6 does not reference.

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
command grep -c '^## ADR-0\(18\|19\|20\|21\|22\):' docs/DECISION-LOG.md
command grep -n '🚧\|In progress' docs/progress/PROGRESS.md | head
command grep -n '#58\|#59\|#60' docs/progress/PROGRESS.md
command grep -n '^\*\*Status' docs/progress/plans/2026-07-04-bobr-quiz-branding-design.md docs/progress/plans/2026-01-31-r5-completion-plan.md
command grep -c 'implementer-transcribe' docs/progress/plans/README.md
```

Expected now:
- `0` ADR headings.
- 🚧 lines for #63 and R6.
- No #58–#60 lines.
- Two stale statuses.
- `0` mentions of `implementer-transcribe`.

- [ ] **Step 2: PROGRESS.md**

- **Top.** Replace the first paragraph with:

  > Index of releases and merged work. Each piece of work gets one line under "Work index":
  > date — title — PR — links to its spec, plan and ledger. Details live in those files, not
  > here. Entries before 2026-10-11 are the older, longer format and are kept as written.

- **R6 row.** Derive the status from `docs/plan.md`'s R6 section and
  `git log --oneline --merges origin/master`. Name which phases are done and which are not
  started. Replace the `~2026-03-31` target with `—` unless `docs/plan.md` states a new one.
- **Section heading.** Rename "Session Notes (Chronological)" to "Work index (latest first)".
- **2026-08-01 entry.** Change 🚧 to ✅ and the Status bullet to
  `Complete — 14/14 realtime-client tests, full suite and lint clean, manual multi-tab check done (f9d4673).`
  Then add `- Ledger: [.superpowers/sdd/2026-08-01-realtime-broadcast-listener-leak-fix/progress.md](../../.superpowers/sdd/2026-08-01-realtime-broadcast-listener-leak-fix/progress.md)`
  and `- PR: [#63](https://github.com/Banych/bobrquiz/pull/63)`.
- **New one-line entries** in date order for PR #58, #59 and #60. Take the date, title and
  links from `git log --merges` and the matching `docs/progress/plans/2026-07-05-*` files.
  Format, one line each:

  ```markdown
  - **2026-07-05** — Presence heartbeat resilience — [PR #58](https://github.com/Banych/bobrquiz/pull/58) — [design](plans/…-design.md) · [plan](plans/…-implementation.md)
  ```

  PR #60 has no plan files; give its PR link and fix commit only.
- **"How to Update This File" (≈414–420).** Replace it with three lines:
  - Merged a piece of work: add one Work index line (see `plans/README.md`).
  - Finished a release: update the release table.
  - Found a bug or idea: log it in `file-ideas.md`.
- **"Related Documents" (≈424–430).**
  - Keep INDEX.md and file-ideas.md.
  - Replace the dev-notes, actions and sessions bullets with:
    - `plans/` for specs and plans
    - `findings/` for measured findings
    - `sessions/` and `dev-notes.md`, marked "historical, frozen 2026-10-11"
    - `../archive/` for superseded docs

- [ ] **Step 3: DECISION-LOG.md**

Append after ADR-017:
- Heading in ADR-017's style: `## ADR-0NN: Title (YYYY-MM-DD)`.
- `**Status**:` and `**Date**:` lines.
- These subsections: `### Decision`, `### Rationale`, `### Rejected` and `### References`.

Five to fifteen lines each. Use only what the sources say. If a source gives no rejected
alternative, write "Not recorded" under `### Rejected`.

Do not name the retired commands or `copilot-instructions` in any ADR; Task 7 Step 4 greps
for them. Say "the project's former planning and session commands" if needed.

| ADR | Topic | Source to read |
|---|---|---|
| 018 | Separate production Supabase project (2026-07-04) | `plans/2026-07-03-r6-supabase-prod-isolation.md`; PROGRESS 2026-07-04 entry |
| 019 | `master` is branch-protected; all work via PR | `git log -S'branch-protected' --oneline -- CLAUDE.md` and the session it points to; date = that commit |
| 020 | Presence: channel reuse across remounts and heartbeat resilience (#58, #59) | `plans/2026-07-05-*-design.md` |
| 021 | One realtime `channel.on` binding per (channel, event), fanned out via a handler registry (#63) | `plans/2026-08-01-realtime-broadcast-listener-leak-fix.md` decision log |
| 022 | One record per piece of work (2026-10-11) | `plans/2026-10-11-claude-config-and-records-design.md`. Supersedes ADR-016's guideline 3 (DECISION-LOG.md:558) ("Session notes: … update progress/dev-notes.md"). Add a line under ADR-016's guideline 3: `(Superseded by ADR-022.)` |

Then:
- Rename "## Future ADRs" to "## Open ideas (not decisions)".
- Delete any `### TBD` entry an existing ADR already decides. Name each deletion in the report.
- Set the file's top "Updated" line, if it has one, to 2026-10-11.

- [ ] **Step 4: Plan statuses**

- `2026-07-04-bobr-quiz-branding-design.md`: set its status line to
  `✅ Implemented — PR #55 (plan: 2026-07-04-bobr-quiz-branding-implementation.md)`.
- `2026-01-31-r5-completion-plan.md`: set it to `✅ Complete (2026-02-01)`.

- [ ] **Step 5: Rewrite docs/progress/plans/README.md**

Whole file:

````markdown
# Plans and specs

Every piece of work that adds or changes behaviour, and every non-trivial fix, leaves exactly
these records:

| Artifact | Path | Written when |
|---|---|---|
| Spec | `docs/progress/plans/YYYY-MM-DD-<topic>-design.md` | end of brainstorming, approved before planning |
| Plan | `docs/progress/plans/YYYY-MM-DD-<topic>-plan.md` | writing-plans, checked by plan-checker before task 1 |
| Ledger | `.superpowers/sdd/<plan>/progress.md` and `*-report.md`, added with `git add -f` | during execution; diffs and briefs stay uncommitted |
| Index line | `docs/progress/PROGRESS.md` → "Work index" | when the PR merges |
| ADR | `docs/DECISION-LOG.md` | only for a decision that outlives the work |

No session files and no `dev-notes.md` lines; both are frozen history.

## Plan shape

- A plan carries interfaces (the names and types neighbouring tasks rely on), the test code,
  and the exact acceptance commands with their expected output.
- Full implementation code goes only in tasks routed to `implementer-transcribe`. Every other
  task describes what to build and how it is checked, not the code.
- Each task names its agent:
  - `implementer-transcribe`: haiku; the plan carries the complete code.
  - `implementer`: sonnet; integration or judgment.
  - `implementer-capable`: opus; any capable-tier file listed in `CLAUDE.md`.
- The test verdict command is `yarn test:run`. It is run by the main session, and its counts
  go in the ledger.

## Status line

Specs and plans carry one status line under the title:
- `Approved design, pending implementation plan`
- `In progress`
- `✅ Complete — PR #NN`
- `Superseded by <path>`

Update it in the commit that changes it.
````

- [ ] **Step 6: Run the acceptance checks**

Run the Step 1 commands. Expected:
- `5` ADR headings.
- No 🚧 line for #63, and the R6 row matches what Step 2 derived.
- One line each for #58, #59 and #60.
- Both status lines updated.
- `1` or more mentions of `implementer-transcribe`.

Then run the link acceptance command. Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add docs/progress/PROGRESS.md docs/DECISION-LOG.md docs/progress/plans/README.md \
  docs/progress/plans/2026-07-04-bobr-quiz-branding-design.md docs/progress/plans/2026-01-31-r5-completion-plan.md
git commit -m "docs: make PROGRESS an index, backfill ADRs 018-022

PROGRESS.md becomes one line per merged piece of work, with the
missing presence and leaderboard fixes added and the listener-leak
entry closed. DECISION-LOG gets the decisions made since January,
which lived only in plans and sessions. plans/README describes the
one-record-per-work convention and the plan shape."
```

---

### Task 6: CLAUDE.md rewrite

**Agent:** `implementer` (sonnet).

**Files:**
- Rewrite: `CLAUDE.md`

**Interfaces:**
- Consumes:
  - `docs/guides/PATTERNS.md` (Task 3).
  - The records table in `docs/progress/plans/README.md` (Task 5).
  - The six kept commands (Task 2).
  - `.claude/settings.json` (Task 1).
  - The deleted `debug.md` and `test.md`: read them with
    `git show origin/master:.claude/commands/debug.md` and `…/test.md`.
  - The current CLAUDE.md: `git show origin/master:CLAUDE.md`.

- [ ] **Step 1: Write the acceptance check and see it fail**

```bash
wc -l < CLAUDE.md
for s in 'Next.js 16' 'yarn test:run' '## Capable-tier files' 'src/infrastructure/realtime/' \
  'src/lib/presence-heartbeat-controller.ts' 'docs/progress/plans/' 'docs/guides/PATTERNS.md' \
  '@utils/'; do command grep -qF "$s" CLAUDE.md || echo "MISSING $s"; done
for s in 'Next.js 15' 'copilot-instructions' 'sessions/' 'session-start' 'fullstack-planner' 'Phase 4.3'; do
  command grep -qF "$s" CLAUDE.md && echo "STALE $s"; done
```

Expected now:
- `409` lines.
- Several `MISSING` lines.
- `STALE` for `Next.js 15`, `copilot-instructions`, `sessions/`, `session-start`,
  `fullstack-planner` and `Phase 4.3`.

- [ ] **Step 2: Write the new CLAUDE.md**

Target 150–200 lines. Sections in this order, with these `##` headings:

1. **Project** (3–4 lines):
   - Real-time quiz game.
   - Next.js 16 (App Router), Prisma v7 with the pg driver adapter, Supabase (Postgres, Auth,
     Realtime, Storage).
   - DDD-lite: Domain → Application → Infrastructure → Presentation.
2. **Commands**: the yarn scripts from package.json that matter, one line each.
   - Mark `yarn test:run` as the verdict command and `yarn test` as watch mode.
   - Show the single-file form `yarn test:run src/tests/…`.
3. **Architecture and layer rules**:
   - The data-flow line.
   - The four layers with their directories.
   - The import rules block (from the current file).
   - Path aliases matching `tsconfig.json` exactly. Read it; it includes `@/*` and `@utils/*`.
4. **Prisma v7 setup**: the current four points, unchanged unless they are wrong.
5. **Testing**:
   - Every feature needs domain, use-case and repository tests, plus where each lives. List
     the `src/tests/` subdirectories that exist.
   - The testing patterns: factory helper, mocked repos with `vi.fn()`, the exact not-found
     message, `resetServices({ force: true })`.
   - Playwright for E2E.
   - Pull in anything project-specific from `test.md` that isn't already here.
6. **Key patterns**: the API route, use case and entity snippets, realtime naming, query hook,
   and repository rules.
   - Check each claim against the code (e.g. `command grep -rn 'staleTime' src/hooks`) and fix
     any that are wrong.
   - End the section with `Long form: docs/guides/PATTERNS.md`.
7. **Capable-tier files**:
   - One sentence: "Route any task touching these to `implementer-capable` and
     `task-reviewer-capable`; regressions in this repo have clustered here (#58, #59, #60, #63)."
   - Then the list verbatim from Global Constraints.
8. **Records**:
   - One sentence: specs and plans go to `docs/progress/plans/`, not `docs/superpowers/`.
   - The table copied from `docs/progress/plans/README.md`.
   - A pointer to that README for plan shape.
   - "Process (brainstorming → spec → plan → subagent-driven development → branch passes)
     follows the user-level workflow and is not repeated here."
9. **Common pitfalls**: the current list. Drop the `/architecture-check` cross-reference
    wording only if it no longer reads right.
10. **Debugging order**:
    - The current five-step block, with Supabase logs, SQL, advisors and a UI snapshot.
    - Add anything project-specific from `debug.md` that isn't already here.
    - MCP note: supabase comes from `.mcp.json` (authenticate with `/mcp`); playwright and
      github come from the user-level plugins.
11. **Working rules**:
    - Use yarn scripts.
    - The dev server is assumed running at :3000 (ask the user to start it otherwise).
    - Never commit to `master`; branch from `origin/master`.
    - No `Co-Authored-By` or other AI attribution.
    - Shared Claude settings live in `.claude/settings.json`; per-machine overrides go in
      `.claude/settings.local.json`, which is git-ignored.

Drop everything else in the current file: Planning Workflow, Documentation Practices, the MCP
server table, Custom Skills, Pattern Reference, and the "recovery pattern" pointer.

- [ ] **Step 3: Run the acceptance checks**

- The Step 1 command. Expected: a line count of 150–200, no `MISSING` and no `STALE` lines.
- The link acceptance command. Expected: empty output.
- `git grep -l 'copilot-instructions'`. Expected: only the 2026-05-09 session file and the two
  2026-10-11 plan files.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): rewrite CLAUDE.md as project facts only

Down from 409 lines: corrected stack (Next.js 16), test verdict
command, aliases synced with tsconfig, the capable-tier file list
that routes work to the opus agents, and where records live. The
planning, session and skill sections are dropped in favour of the
user-level workflow; long-form patterns live in docs/guides."
```

---

### Task 7: Verification (main session, not a subagent)

- [ ] **Step 1: Test verdict.** Run `yarn test:run` and record files, tests, failures and the
  exit code in the ledger. They must equal the baseline counts the controller records in the
  ledger before dispatching Task 1 (same command, same branch, before any change).
- [ ] **Step 2: Lint.** Run `yarn lint` and record the exit code. Expected: 0. Flat-config ESLint lints none of the .md or .json files this branch touches, so this only proves nothing else broke. The JSON is covered by Task 1 Step 3.
- [ ] **Step 3: Links.** Run the link acceptance command. Expected: empty output.
- [ ] **Step 4: Stale references.**

  ```bash
  git grep -nE 'copilot-instructions|\.github/prompts|session-start|fullstack-planner' -- ':!docs/archive' ':!docs/progress/sessions' ':!docs/progress/plans/2026-10-11-*'
  ```

  Expected: no output.
- [ ] **Step 5: MCP.** Run `claude mcp list` (strip the `[mcp-sdk]` lines). Expected:
  - No `cmd` ENOENT line.
  - Project `supabase` listed.
  - `plugin:github:github` and `plugin:playwright:playwright` ✔ Connected.

  Paste the relevant lines into the findings note's "After" section and commit it:
  `docs: record MCP server check after config change`.
- [ ] **Step 6: Product code untouched.**

  ```bash
  git diff --stat origin/master -- src tests e2e servers
  ```

  Expected: empty output.
- [ ] **Step 7: Commands.** Ask the user to open a fresh `claude` session in the repo and
  confirm the six commands appear with their descriptions in `/` completion. Record the
  answer in the ledger.
- [ ] **Step 8: Ledger.** Force-add this plan's `progress.md` and `*-report.md` files; leave
  `check-links.mjs`, the link files, diffs and briefs uncommitted. Commit with
  `docs: add ledger for claude config and records cleanup`.
- [ ] **Step 9: Branch passes.** This branch has no production or hook code, so it gets the
  whole-branch review only (`branch-passes`).
- [ ] **Step 10: Finish.** Draft the PR and wait for approval. Its description names the
  Windows steps: move aside local edits to `.claude/settings.local.json` before pulling, then
  authenticate `/mcp`. Add the PROGRESS.md index line for this work in the merge-ready commit.
