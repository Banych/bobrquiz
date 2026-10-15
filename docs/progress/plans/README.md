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
