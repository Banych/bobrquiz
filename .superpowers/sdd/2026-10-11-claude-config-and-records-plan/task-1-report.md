# Task 1 report: Tooling (MCP servers, settings, gitignore, findings note)

## Status
DONE_WITH_CONCERNS (concerns are minor, listed below; no blocker)

## What I did
1. Ran the Step 1 check before any change. It printed FAIL.
2. Applied Step 2: `git mv` of the settings file, then rewrote `.mcp.json` and `.claude/settings.json` from the brief's blocks, edited `.gitignore`, and created the findings note. Bash heredocs with quoted delimiters were used so the bytes match the brief.
3. Ran the Step 3 checks. All gave the expected output.
4. Committed the four named paths (plus the rename's deletion of the old settings file) with the brief's message verbatim. No trailers.
5. Self-reviewed `git show --stat HEAD` against the brief.

## Commits
```
commit 4e8ca1322c45ab930d0ed052b6bc98677c12b657
    chore(claude): move MCP servers to plugins, commit project settings

 .claude/settings.json                              | 51 ++++++++++++++++++++++
 .claude/settings.local.json                        | 35 ---------------
 .gitignore                                         |  3 +-
 .mcp.json                                          | 35 +--------------
 .../findings/2026-10-11-mcp-servers-cachyos.md     | 32 ++++++++++++++
 5 files changed, 86 insertions(+), 70 deletions(-)
```

## Tests
No test suite applies: this task changes config and docs only. The acceptance checks are the Step 1 and Step 3 commands below.

Step 1 before the change:
```
FAIL
```

Step 1 after the change (exit 0):
```
PASS
```

Step 3:
```
json ok
json exit=0
0
c1 exit=1
0
c2 exit=1
```
The two counts exit 1 because `grep -c` exits 1 when the count is 0. That is grep's normal behaviour, and the output `0` is the expected result.

## Departures from the plan
- `.mcp.json` now ends with a trailing newline. The original file had none, and the brief's block does not say either way. The JSON is otherwise byte-identical to the brief.
- `.gitignore`: the appended comment follows `supabase/.temp/` directly, with no blank line. I read "keep exactly one newline before the appended comment" as "add no separator when the last line is non-empty". The file's last line is `supabase/.temp/`, so the append gives exactly one newline there.
- `docs/progress/findings/` did not exist, so I created it with `mkdir -p`. The brief's file path is unchanged.

## Files changed
- `.mcp.json`: github, playwright and context7 removed; only supabase remains.
- `.claude/settings.local.json` → `.claude/settings.json`: content as the brief specifies.
- `.gitignore`: `/docs/superpowers/` line deleted; two-line block appended.
- `docs/progress/findings/2026-10-11-mcp-servers-cachyos.md`: created, verbatim from the brief.

## Evidence
Commands run, in order:
- `test ! -e .claude/settings.local.json && test -e .claude/settings.json && ! command grep -q '"cmd"' .mcp.json && command grep -qx '.claude/settings.local.json' .gitignore && ! command grep -q '^/docs/superpowers/' .gitignore && echo PASS || echo FAIL` → `FAIL` (before), `PASS` (after)
- `git mv .claude/settings.local.json .claude/settings.json`
- `sed -i '/^\/docs\/superpowers\/$/d' .gitignore` then `cat >> .gitignore` with the two-line block
- `git add .mcp.json .claude/settings.json .gitignore docs/progress/findings/2026-10-11-mcp-servers-cachyos.md`
- `git diff --cached -M -- .gitignore .mcp.json` (reviewed; showed only the intended removals and the append)
- `git commit -F -` (brief's message) → `[chore/claude-config-and-records 4e8ca13] chore(claude): move MCP servers to plugins, commit project settings`, `5 files changed, 86 insertions(+), 70 deletions(-)`
- `git show --stat HEAD` (output in Commits above)
- `git status --porcelain` after commit → empty (the `.superpowers/` directory is git-ignored and was not staged)
- Node JSON parse of both files → `json ok`
- `command grep -c 'mcp__plugin_github_github__\*' .claude/settings.json` → `0`
- `command grep -cE 'github__(create|merge|...)' .claude/settings.json` → `0`

## Self-review findings
- `.claude/settings.json` content matches the brief's block, and the old `settings.local.json` is deleted in the same commit.
- `.mcp.json` contains only `supabase`, with the brief's URL unchanged.
- `.gitignore` diff: one line removed (`/docs/superpowers/`), block appended. No other line touched.
- The findings file matches the brief's block, including the "To do by hand" section that the controller's later tasks rely on.
- The commit has no `Co-Authored-By`, `Claude-Session` or other trailer. The message is the brief's text.

## Concerns
- `.claude/settings.local.json` was tracked in git before this commit. The findings note already records the "Assumed" risk that pulling this branch on Windows could be blocked by uncommitted edits to the old file. This is the expected behaviour for the rename, but it is a real risk for the Windows machine.
- The `.gitignore` spacing choice (no blank line before the appended comment) is a judgement call. It is cheap to change later if the controller prefers a blank line.

## Unverified
- Whether the Claude Code harness actually picks up `.claude/settings.json` on this machine: no session was started, so that was not observed.
- Whether `claude mcp list` now shows only `supabase` plus the user-level plugins: that run belongs to Task 7, so it was not done here.

## Fix round 1

Finding: the appended `.gitignore` block sat directly under `supabase/.temp/`, with no blank separator line unlike every other group.

Fix: inserted exactly one blank line between `supabase/.temp/` and the `# Per-machine Claude Code overrides…` comment. Nothing else changed.

Commit: 860d3f3 chore(claude): separate settings ignore block in .gitignore (no trailers)

`git diff HEAD -- .gitignore` (before commit):
```
@@ -51,5 +51,6 @@ next-env.d.ts
 
 # Supabase CLI local link state (machine-specific, not project config)
 supabase/.temp/
+
 # Per-machine Claude Code overrides (shared settings live in .claude/settings.json)
 .claude/settings.local.json
```

`tail -4 .gitignore | cat -A`:
```
supabase/.temp/$
$
# Per-machine Claude Code overrides (shared settings live in .claude/settings.json)$
.claude/settings.local.json$
```

`git show --stat HEAD`:
```
 .gitignore | 1 +
 1 file changed, 1 insertion(+)
```

`git status --porcelain` after commit: empty.
