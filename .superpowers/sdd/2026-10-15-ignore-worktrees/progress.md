# Ignore agent worktrees — ledger

Branch `chore/ignore-worktrees`, cut from master 93dd6d4, in `.claude/worktrees/chore-ignore-worktrees`.
Bounded; design approved in chat (user: "approve", 2026-10-15). Run in parallel with
`chore/middleware-to-proxy` and `fix/icon-button-labels`.

## Why
Worktrees created under `.claude/worktrees/` (Claude Code's Agent isolation, and the ones made by
hand for parallel branches) showed in `git status` as untracked and were linted:
`yarn lint` in the main checkout reported 15 warnings instead of 5 while two worktrees existed
(lucide-react ledger, 2026-10-15).

## Change
- `.gitignore`: `/.claude/worktrees/`.
- `eslint.config.mjs`: `.claude/worktrees/**/*` in `ignores`.
- Ruling: no `tsconfig.json` change, reversing the approved design. Measured: with the old
  tsconfig (`exclude: ["node_modules"]`, `include: ["**/*.ts", …]`), `tsc --noEmit` exits 0 with a
  decoy `.claude/worktrees/decoy/src/bad.ts` holding a type error. TypeScript's include wildcards
  skip dot-directories, so `.claude/` was never type-checked; the design's claim was wrong.

## Verification (decoy worktree: `.claude/worktrees/decoy/src/bad.ts` with a type error, plus a copy
of `tests/load/concurrent-players.js`, which lint warns about)
- New config: `npx tsc --noEmit -p .` exit 0, 0 lines mention the decoy; `yarn lint` exit 0,
  5 problems (0 errors, 5 warnings), 0 lines mention the decoy; `git status --porcelain
  --untracked-files=all` lists no decoy file, `--ignored` lists 2; `git check-ignore -v` →
  `.gitignore:22:/.claude/worktrees/`.
- Old config (temporary copies from HEAD): `npx eslint -c <old config> .claude/worktrees/decoy`
  exit 1, 2 problems (1 error, 1 warning), the warning on the decoy's `concurrent-players.js:35`.
  `tsc` with the old tsconfig: exit 0, decoy not checked (see ruling).
- Decoy and temporary configs removed afterwards.
