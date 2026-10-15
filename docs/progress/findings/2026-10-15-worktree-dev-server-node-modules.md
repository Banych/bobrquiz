# A worktree with a symlinked node_modules cannot run the dev server — findings (2026-10-15)

**Ran:** `yarn dev` in `.claude/worktrees/test-e2e-isolated-quizzes` (branch
`test/e2e-isolated-quizzes`), CachyOS, Next.js 16.3.8 with Turbopack, yarn 1.22.22. The worktree's
`node_modules` was a symlink to the main checkout's (`node_modules -> ../../../node_modules`).
Ledger: `.superpowers/sdd/2026-10-15-e2e-isolated-quizzes-plan/progress.md`.

## Symptom

`next dev --turbopack` printed "Ready in 212ms", then panicked on the first request:

```
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid, it points out of the filesystem root
```

`yarn test:run`, `yarn lint`, `tsc` and `yarn test:e2e` (against a server running elsewhere) had
all worked with the symlink in earlier worktrees this day.

## Why

Turbopack treats the project directory as its filesystem root and refuses to follow a symlink that
leaves it. The `.env.local` symlink, which also points outside, did not trip it (Next read it:
"Environments: .env.local"); only module resolution through `node_modules` did.

## What works

Replace the symlink with a real install, then generate the Prisma client (it is git-ignored and
lives under `src/`, so a fresh worktree has none):

```bash
rm node_modules            # removes the symlink only
yarn install --frozen-lockfile --prefer-offline
yarn prisma:generate
```

With a warm yarn cache the install took 3.7 s (1.1G on disk, btrfs). `yarn dev` then served the
worktree on :3000.

## Rule

A worktree that only runs unit tests, lint or tsc can keep the `node_modules` symlink. A worktree
that runs `yarn dev` needs its own install.
