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
