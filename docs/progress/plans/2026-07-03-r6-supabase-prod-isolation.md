# R6 — Isolate Production Supabase from Dev/Preview

**Date Created:** 2026-07-03
**Status:** 📋 Planning (design approved by user, not yet executed)
**Estimated Time:** ~2–3 hours
**Depends on:** R6 Phase 5 security hardening ✅ (RLS-enable follow-up already applied same day, see below)
**Resumability:** This file is self-contained — if work pauses mid-way, resume by checking the "Progress checkpoint" note at the bottom and the checkboxes below.

---

## Overview

### How this was found

While investigating what "R6 Phase 6 — Marketing & Launch" (specifically "Configure Vercel production environment") actually required, we discovered the app has **already been auto-deploying to production since April 2025** via Vercel's GitHub integration — every push to `master` deploys live, independent of any deliberate launch decision. `docs/plan.md` previously said "no production deployment exists yet"; that was wrong (see the same-day plan.md reconciliation entry).

Digging further (via `vercel env ls` + hash-comparing pulled values, never printing secrets) found that **every real credential — `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` — is identical across Vercel's Production, Preview, and Development environments.** The single Supabase project backing all of this is literally named **"Quiz-game-dev"** in the Supabase dashboard, confirming it was only ever meant for dev use.

Practical consequence: local `yarn dev`, every PR preview deployment (including dependabot PRs), and the live production site all read/write the same database, and a test admin account (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) has admin-panel access to what's presented as "production."

**Related, already-fixed same-day**: this investigation also surfaced that Supabase's advisor showed `rls_disabled_in_public` (ERROR) on all 7 tables — contradicting the Phase 5 session's "RLS verified clean" claim. That's a separate issue (in-project security, not cross-environment isolation) and was already fixed via migration `20260703183721_enable_rls_all_tables` — see `dev-notes.md`. It's mentioned here only because the new production project must inherit this migration (it does automatically, since RLS-enable is now a tracked Prisma migration).

### What's NOT in scope for this plan

- Custom domain (currently only auto-generated `*.vercel.app` aliases) — separate concern, not blocking isolation
- Tightening the `quiz-media` bucket's "allows listing" WARN-level advisory — pre-existing, unrelated to isolation
- `auth_leaked_password_protection` WARN — pre-existing, unrelated
- Any Supabase Branching approach — considered and explicitly rejected in favor of a second standalone project (see Technical Decisions)

---

## Goals

- [ ] Production Vercel environment reads/writes a Supabase project that Preview and Development never touch
- [ ] New production project has the same schema (via existing Prisma migrations, including RLS-enable), the same `quiz-media` storage bucket + policy, and admin Auth user(s) for the current `ADMIN_EMAILS`
- [ ] Test credentials (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) no longer exist in Vercel's Production environment
- [ ] A live Playwright MCP check against the production URL confirms writes land in the new project, not the old one
- [ ] `yarn test` still passes, `yarn build` still succeeds (no application code changes expected — this is infra/config only)

---

## Implementation Steps

### Step 1 — Create the new Supabase project · Small · ⚠️ irreversible/provisions real cloud infra — pause for explicit go-ahead immediately before running

- [ ] Generate a strong DB password locally (never print it in chat/logs)
- [ ] `supabase projects create quiz-game-prod --org-id pgdavqvzxncsvpjdlcrn --db-password <generated> --region eu-west-1` (omit `--size` to stay on the default/free tier — do not select a paid compute size without asking)
- [ ] Record the new project's `ref`, API URL, anon key, service-role key (via `supabase projects api-keys` or dashboard) — handle as secrets throughout, never printed in full

### Step 2 — Apply schema · Small

- [ ] Point a throwaway `DATABASE_URL`/`DIRECT_URL` (pooler + direct, per `.env.example`'s comment about Supavisor) at the new project
- [ ] `npx prisma migrate deploy --schema src/infrastructure/database/prisma/schema.prisma` — applies all 9 existing migrations (including `20260703183721_enable_rls_all_tables`) fresh, no data to migrate (current project's app tables are essentially empty: 0 quizzes, 2 test players, 1 audit log row)
- [ ] Verify via `mcp__supabase__list_tables`-equivalent (or `supabase db` inspection) that all 6 app tables + `_prisma_migrations` exist with RLS enabled from the start

### Step 3 — Recreate Storage · Small

- [ ] Create `quiz-media` bucket in the new project (public bucket, matching current config — see `docs/06-media-uploads.md` for the original setup steps)
- [ ] Recreate the "Public read access for quiz media" policy on `storage.objects` to match current behavior (parity only — not fixing the pre-existing "allows listing" WARN as part of this pass)

### Step 4 — Recreate Auth · Small

- [ ] Create Supabase Auth user(s) in the new project for whatever email(s) are currently in `ADMIN_EMAILS` (reusing current value per user decision — same emails, new project)
- [ ] Do **not** create a `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` account here — those stay dev/preview-only

### Step 5 — Update Vercel environment variables · Small · ⚠️ repoints live production data — pause for explicit go-ahead immediately before running

- [ ] For **Production environment only**, set: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → new project's values
- [ ] Leave `ADMIN_EMAILS` value unchanged (same emails, now valid in the new project's Auth too)
- [ ] Remove `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` from the **Production** environment scope specifically (keep them in Preview/Development)
- [ ] Confirm Preview and Development env vars are untouched (still pointing at `Quiz-game-dev`)

### Step 6 — Redeploy & verify · Small

- [ ] Trigger a fresh Production deployment (env var changes don't auto-redeploy) — e.g. `vercel redeploy` or an empty commit/promote of the current build
- [ ] Playwright MCP against the live production URL: log in as the real admin email, create a quiz, confirm it does **not** appear when querying the old `Quiz-game-dev` project directly (proves isolation)
- [ ] `mcp__supabase__get_advisors(type: 'security')` against the **new** project — confirm no ERROR-level findings (RLS should already be clean since it shipped in the schema from Step 2)

### Step 7 — Document · Small

- [ ] Update this plan's status to ✅ Complete, check all boxes
- [ ] Add a session file entry (`docs/progress/sessions/2026-07-03-...md` or fold into dev-notes.md/PROGRESS.md per this repo's convention) covering what was built and the technical decisions below
- [ ] Update `docs/plan.md`'s R6 Phase 6 checklist ("Configure Vercel production environment") to reflect this — it was previously unstarted/assumed-not-deployed; now it's genuinely isolated

---

## Technical Decisions

**Decision: new standalone Supabase project vs. Supabase Branching**
Chose a second standalone Supabase project for production, keeping the current "Quiz-game-dev" project for dev/preview. Considered Supabase's built-in branching feature (which would flip this: keep the *current* project as production, branch off it for dev/preview — less setup since the real bucket/auth already live there). Rejected because `list_branches` errored on this project (branching unavailable or requires a plan upgrade) and `create_branch` requires a cost confirmation step, making its availability/pricing uncertain; a second free-tier project is the simpler, unambiguous path today. User explicitly chose this option when presented with the trade-off.

**Decision: fresh empty production database, no data migration**
The current project's app tables hold no real user data (0 quizzes, 2 leftover test players, 1 audit log row) — it's been dev/test traffic the whole time, never real production usage. So the new production project starts empty rather than cloning data. If this project ever had *actual* production data, this decision would need revisiting (a real migration/backfill, not a fresh start).

**Decision: exclude TEST_ADMIN_EMAIL/PASSWORD from Production**
These exist only for Playwright E2E tests, which never run against live production. Keeping them there was pure exposure (a documented test credential with real admin access) with zero benefit. User confirmed removal when presented with the trade-off.

**Decision: reuse current ADMIN_EMAILS value rather than provisioning different production-only admins**
User confirmed reusing the same email(s) already in `ADMIN_EMAILS` — no separate production-admin identity needed at this stage.

---

## Success Criteria

### Functional
- [ ] Production, Preview, and Development point at three different configurations (Production: new project exclusively; Preview + Development: current `Quiz-game-dev` project, shared as before — only Production was carved out)
- [ ] Admin login works on production with the real admin email
- [ ] A quiz created via the production URL is verifiably absent from the dev project's tables

### Non-functional
- [ ] No application code changes — this is Vercel/Supabase configuration only
- [ ] `yarn test` passes (439+ tests, unaffected — they run against the dev project as before)
- [ ] `yarn build` succeeds
- [ ] No secrets (DB password, service-role key, etc.) ever printed in chat or committed to git

---

## Files Changed

- None expected in application code. Infra/config only: new Supabase project, Vercel Production env vars, this plan file, and doc updates (dev-notes.md, PROGRESS.md, plan.md) at completion.

---

## Progress Checkpoint (update this section if work pauses mid-plan)

**Last known state as of writing:** Design approved by user. Supabase CLI authenticated locally (`npx supabase projects list` works). Vercel CLI authenticated and linked to the existing `quiz-game` project (`.vercel/project.json` present). Nothing in Steps 1–7 has been executed yet — this file was written immediately after design approval, before any step began.

**To resume:** re-read this file top to bottom, confirm CLI auth is still valid (`npx supabase projects list`, `npx vercel whoami`), then continue from Step 1.
