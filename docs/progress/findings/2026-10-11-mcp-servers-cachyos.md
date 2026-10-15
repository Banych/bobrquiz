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

`claude mcp list` on 2026-10-13, Claude Code 2.1.296, branch head `f127da2` (`[mcp-sdk]` lines
and unrelated plugins left out):

```
plugin:context7:context7: https://mcp.context7.com/mcp?client=claude-code-plugin (HTTP) - ! Needs authentication
plugin:github:github: https://api.githubcopilot.com/mcp/ (HTTP) - ✔ Connected
plugin:playwright:playwright: npx @playwright/mcp@latest - ✔ Connected
plugin:supabase:supabase: https://mcp.supabase.com/mcp (HTTP) - ! Needs authentication
supabase: https://mcp.supabase.com/mcp?project_ref=iwnxzdhhrreogxauxehm&features=docs,account,database,debugging,development,functions,branching,storage (HTTP) - ! Needs authentication
```

- No `cmd` ENOENT line.
- A session that started before the change, and was continued across it, still reported
  `context7`, `github` and `playwright` failing with `Executable not found in $PATH: cmd`: a
  session keeps the `.mcp.json` it started with. Start a new session to pick up the change.

## Assumed — attack these first

- The plugin `playwright` server starts on Windows without a `cmd /c` wrapper.
- Pulling this branch on Windows replaces `.claude/settings.local.json` with
  `.claude/settings.json` cleanly. Uncommitted edits to the old file there would block the
  pull; move them aside first.

## To do by hand

- Run `/mcp` and authenticate `supabase` and `plugin:context7:context7` on each machine.
