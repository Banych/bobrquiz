# Handover (2026-11-14): host sign-up, part 2 (email sign-in on dev)

Paste the prompt below into a new Claude Code session started in
`/home/banykinv/Documents/repos/bobrquiz`.

---

Host sign-up (issue 129) is split into three PRs. Part 1 is merged and deployed (PR #166, docs
PR #168). The per-host caps that had to land before sign-ups open are merged too (issue 167,
PR #169, docs PR #170). This session builds **part 2, email sign-in on dev**: the sign-in page
with link and code, the confirm page, Turnstile, and the e2e rewrite. Restate part 2's
acceptance criteria and plan in chat, and start the first edit only when the user says so.

## Read first

1. `CLAUDE.md`: the code map's **Auth** and **Admin** entries, **Testing**, **Common pitfalls**
   2 and 3, and **Prisma v7 setup** item 6 (read-only queries without psql).
2. The spec, `docs/progress/plans/2026-11-14-host-signup-design.md`, all of it. Part 2 builds
   **Sign-in mechanics**, **Layers**, **Turnstile**, **Dev project settings**, **Tests** and
   **Carried into part 2**. Its **To verify while building** list is unrun: run each item
   before the plan relies on it.
3. `docs/parking-lot.md`, the 2026-11-14 rows. Three are marked "yes" (player name and count
   limits, answer limits, host-driven row growth): they are the user's scope question, not
   part 2's work. Don't build them unless the user moves them in.

There is no ledger: the ship profile keeps plans in chat. Record rulings in the spec or the PR
text.

## What is established

| Fact | How it was established |
|---|---|
| Sign-in is email-only: a link to our `/auth/confirm` page with a Continue button, plus a code typed on the waiting screen (option 3) | user's ruling, 2026-11-14 |
| Sender: Resend Free on `bobrquiz.com`; bot check: Cloudflare Turnstile | user's rulings, 2026-11-14 |
| `bobrquiz.com` is registered in the Vercel team, Vercel DNS, auto-renew; not yet attached to the project | Vercel `list_domains`, 2026-11-14 |
| Supabase's built-in mailer only reaches team addresses, 2 an hour; leaked-password protection is Pro-only; the Send Email hook is on Free | Supabase docs, fetched 2026-11-14 |
| Vercel Preview and Development use the dev project `Quiz-game-dev`; Production has its own | `docs/progress/plans/2026-07-03-r6-supabase-prod-isolation.md` |
| Every existing account has a confirmed email (dev 2 of 2; production checked by the user) | read-only `pg` query on dev, and the dashboard, 2026-11-14 |
| `safeRedirectPath` (`src/lib/safe-redirect.ts`) takes paths only and refuses dot-segment tricks; part 2's confirm action gets an absolute `next` and needs origin handling | part 1 code and both reviews |
| Caps: 100 quizzes per host, 100 questions per quiz, options and answers at most 200 characters; past a cap the routes answer 400 "Limit reached: …" | PR #169 |
| Dev data is far under the caps: one owner with 10 quizzes, largest quiz 5 questions | read-only `pg` query on dev, 2026-11-14 |
| Production quiz counts per owner are **not** checked; an account at 100 or more can no longer create quizzes | open: ask the user to run `SELECT "ownerId", COUNT(*) FROM "Quiz" GROUP BY 1 ORDER BY 2 DESC LIMIT 5;` in the production SQL editor |
| `src/tests/domain/entities/question.test.ts` "should randomize options" is flaky (1 in 24): it failed PR #169's first CI run and passed on a rerun | CI run 43609832619, 2026-11-14; parked |
| Next.js 16.4.3 | `node_modules/next/package.json` |

Counts on `master` (`7fd3fbe`). They were measured on the caps branch, whose tree differs from
master only in `docs/progress/PROGRESS.md`. A run with other numbers needs a reason before you
go on:

| Check | Result |
|---|---|
| `yarn lint` | 0 errors, 5 warnings (none in auth files) |
| `yarn test:run` | 94 files passed, 1 skipped; 830 tests passed, 1 skipped (the flaky test above can fail 1 run in 24) |
| `yarn build` | exit 0 |
| `yarn test:e2e` (`DATABASE_POOL_MAX=10 SESSION_JOIN_RATE_LIMIT=100`) | 50 passed |

## How to execute

- **Stop after every task** — review loop closed, ledger entry written, doc sweep done — and
  report the rulings made, then wait for the user's go-ahead. This overrides the skill's default
  of continuing. In this ship-profile repository a task is one PR, and its "ledger entry" is the
  work-index line in `docs/progress/PROGRESS.md` after the merge (on its own docs branch and PR,
  as #168 and #170 did).
- Lane: standard with a risk trigger (auth, `src/app/api/**`, `src/proxy.ts`). The spec is
  approved; part 2 also needs a security review before its PR. Part 2 is about 15 files, past the
  10-file guide; the user already accepted keeping the e2e rewrite in it, so it doesn't break
  between PRs. Say so again when you restate the plan.
- Branch: `git switch -c feat/host-signup-email --no-track origin/master`, then
  `git push -u origin feat/host-signup-email`. Merges go through a PR and wait for the user. PR
  text is drafted, shown, and posted only as approved. Part 2's PR says "Part of #129", not
  `Closes`; set labels (the issue's plus a type label), milestone "Anyone can host" and assignee
  `Banych` right after `gh pr create`.
- Agents: the main session writes the code. Before the PR, dispatch `task-reviewer-capable`
  (whole branch against the spec) and `security-reviewer` in parallel, without a `model`
  argument. Searches can go to Explore or general-purpose sized per the user's CLAUDE.md.
- **Re-check every claim** from a reviewer or subagent: test counts from the run's own summary,
  commit contents, files touched. Record `git status --porcelain` and `git rev-parse HEAD` before
  each read-only agent and compare after.
- Environment:
  - Supabase dashboard changes (dev sign-ups, templates, captcha secret, redirect allowlist)
    are the user's: the Supabase MCP needs `/mcp` authentication and was not used. Give the user
    the exact settings as a checklist (the spec's **Dev project settings**), early, since e2e on
    the branch needs them.
  - e2e: port 3000 must be free (Playwright reuses a running server), the worktree needs its own
    `node_modules`, and the two env overrides above are required.
  - Vitest runs in a Node environment on `.test.ts` only, with no DOM tooling: component behaviour
    is covered in Playwright (see `e2e/admin-limits.spec.ts` for intercepting a request with
    `page.route`).
  - GitHub auto-merge can't be enabled on this repo while a check is failing ("unstable"); to
    merge when green, check CI when the user asks and merge with
    `gh pr merge <n> --merge --match-head-commit <sha>`.
  - The Vercel CLI link exists only in the main checkout.
  - zsh: quote a word that starts with `=` (`echo "-----"`, never `echo ====`).
  - Never run anything that asks for a password (`sudo`, `paru`): hand the command to the user.

## What comes next

After part 2: part 3, the production rollout, in the spec's **Rollout order**. Attach the
domain, set up Resend and DNS, change the Supabase production settings, deploy, turn on
Turnstile, then sign-ups. Write the ADR and the auth guide from the spec's **Records**. Part 3
closes #129. Before sign-ups open, the user decides on the three "yes" parking-lot rows from
issue 167's security review. The landing page call to action (#130) follows.
