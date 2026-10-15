# R6 — Isolate Production Supabase from Dev/Preview

**Date Created:** 2026-07-03
**Status:** ✅ Complete
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

- [x] Production Vercel environment reads/writes a Supabase project that Preview and Development never touch
- [x] New production project has the same schema (via existing Prisma migrations, including RLS-enable), the same `quiz-media` storage bucket + policy, and admin Auth user(s) for the current `ADMIN_EMAILS`
- [x] Test credentials (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) no longer exist in Vercel's Production environment
- [x] A live Playwright MCP check against the production URL confirms writes land in the new project, not the old one
- [x] `yarn test` still passes (439 passed, 1 skipped); `yarn build` not separately re-run (no application code changed, only infra/config)

---

## Implementation Steps

### Step 1 — Create the new Supabase project · Small · ⚠️ irreversible/provisions real cloud infra — pause for explicit go-ahead immediately before running ✅

- [x] Generate a strong DB password locally (never print it in chat/logs) — saved to `C:\Users\banyk\secrets\quiz-game-prod-db-password.txt`
- [x] `supabase projects create quiz-game-prod --org-id pgdavqvzxncsvpjdlcrn --db-password <generated> --region eu-west-1` — created, ref `noyjptzwsagwofwsevwm`, status ACTIVE_HEALTHY. Confirmed still within Free-tier limits (org had only 1 active project before this)
- [x] Record the new project's `ref`, API URL, anon key, service-role key — saved to `C:\Users\banyk\secrets\quiz-game-prod-api-keys.json`, never printed in full. All prod values also consolidated into gitignored `.env.prod` at repo root

### Step 2 — Apply schema · Small ✅

- [x] Pointed `DATABASE_URL`/`DIRECT_URL` at the new project — pooler host required probing (`aws-0-eu-west-1.pooler.supabase.com`; `aws-1` returned "tenant not found" even though TCP was reachable — confirmed via a real `pg` auth test, not just DNS/TCP)
- [x] `npx prisma migrate deploy` — applied all 7 existing migrations (including `20260703183721_enable_rls_all_tables`) cleanly, no data to migrate
- [x] Verified via direct SQL (`pg_class.relrowsecurity`) that all 6 app tables + `_prisma_migrations` exist with RLS enabled from the start (`_prisma_migrations` RLS applied separately via direct SQL, same as the dev-project fix — it's outside tracked migrations)

### Step 3 — Recreate Storage · Small ✅

- [x] Created `quiz-media` bucket in the new project via direct SQL insert into `storage.buckets`, matching the current project's exact config (public, 10 MB limit, same 4 allowed MIME types — confirmed via `mcp__supabase__list_storage_buckets` against the dev project first)
- [x] Recreated all 3 `storage.objects` policies (public read, authenticated upload, authenticated delete) per `docs/06-media-uploads.md`
- [x] Verified via curl: `GET .../storage/v1/object/public/quiz-media/test.txt` → 404 `not_found` body (not 403), confirming public read works

### Step 4 — Recreate Auth · Small ✅

- [x] Created a Supabase Auth user in the new project for the real admin email in `ADMIN_EMAILS` (the second comma-separated entry turned out to be an empty trailing value, not a second real admin — confirmed by inspecting the raw string). Generated a random password via Admin API (`email_confirm: true`), saved to `C:\Users\banyk\secrets\quiz-game-prod-admin-passwords.json`, verified with a real password-grant login test (200 OK)
- [x] Did **not** create a `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` account — those stay dev/preview-only

### Step 5 — Update Vercel environment variables · Small · ⚠️ repoints live production data — pause for explicit go-ahead immediately before running ✅

- [x] Set `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on **Production only** → new project's values
- [x] Left `ADMIN_EMAILS` value unchanged (still shared across all three environments)
- [x] Removed `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` from Production; confirmed still present in Preview/Development
- [x] Confirmed Preview and Development still point at `Quiz-game-dev` (hash-verified against local `.env` for the readable `development`-type vars; functionally verified for `preview` via the Step 6 live test)

**Notable snag**: `vercel env rm NAME production` on a variable that was previously a single value shared across Development+Preview+Production **deletes the variable entirely**, not just its Production association — it does not support slicing one environment out of a multi-environment entry. This wiped Development+Preview values for all 7 vars mid-step. Recovered by re-adding them from the local `.env` file (confirmed identical to the pre-existing Vercel values via the same hash-comparison technique used earlier in this investigation). **Lesson**: when narrowing a shared var to one environment, capture ALL its current values *before* removing anything, not just the one being changed.

**Second snag**: `vercel env add NAME <env> --yes < file` intermittently appeared to write an empty value when piping via stdin with `--yes`. Investigation via direct Vercel API calls (`GET /v10/projects/{id}/env?decrypt=true`) revealed this was a false alarm: `preview`/`production` targets default to Vercel's **Sensitive** type, which is genuinely write-only forever (never returned by `pull`, dashboard, or API `decrypt=true`) — `development` defaults to the readable **Encrypted** type. The CLI's `add`/`pull` round-trip simply cannot be used to verify a sensitive var's value after the fact. Confirmed the actual values were correctly set via the Step 6 functional (live login + live DB write) test instead, and via direct Vercel API `PATCH` calls (200 OK) as a belt-and-suspenders re-write. **Lesson**: for Vercel Sensitive-type vars, verify with a functional/behavioral test, not a read-back.

### Step 6 — Redeploy & verify · Small ✅

- [x] Triggered a fresh Production deployment via `vercel deploy --prod` — new deployment `dpl_5uZWPR3ZcxDLYxHzJERqANoappyM`, aliased to `quiz-game-kappa-sepia.vercel.app`
- [x] Playwright MCP against the live production URL: logged in as the real admin email (session cookie/DOM login through the actual `/login` page, not just the Supabase Auth API), created quiz `PROD-ISOLATION-TEST-2026-07-04` (id `cmr6ako49000004i2lnxfqepa`)
- [x] Verified via direct SQL against the **new** project (`DIRECT_URL` from `.env.prod`): quiz present
- [x] Verified via `mcp__supabase__execute_sql` against the **old** `Quiz-game-dev` project (the one the MCP server is pinned to): quiz **absent** — isolation proven end-to-end, not just by config inspection
- [x] Deleted the test quiz from the new prod project afterward (cleanup, not real production data)
- [ ] `mcp__supabase__get_advisors(type: 'security')` against the new project — **not run**; the Supabase MCP server is pinned to the old `Quiz-game-dev` project ref via `.mcp.json` and has no tool access to the new project. Verified RLS manually instead (see Step 2) — all 7 tables confirmed `relrowsecurity = true` via direct SQL. Full advisor parity (e.g. `auth_leaked_password_protection` WARN) is unverified on the new project; already out of scope per this plan's "What's NOT in scope" section.

### Step 7 — Document · Small ✅

- [x] Update this plan's status to ✅ Complete, check all boxes (this step)
- [x] Added entries to `dev-notes.md` and `PROGRESS.md` covering what was built and the technical snags/decisions
- [x] Updated `docs/plan.md`'s R6 Phase 6 checklist ("Configure Vercel production environment") to reflect this — it was previously unstarted/assumed-not-deployed; now it's genuinely isolated

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
- [x] Production, Preview, and Development point at three different configurations (Production: new project exclusively; Preview + Development: current `Quiz-game-dev` project, shared as before — only Production was carved out)
- [x] Admin login works on production with the real admin email (verified via a real browser session through `/login`, not just the Supabase Auth API)
- [x] A quiz created via the production URL is verifiably absent from the dev project's tables

### Non-functional
- [x] No application code changes — this was Vercel/Supabase configuration only
- [x] `yarn test` passes (439 passed, 1 skipped)
- [ ] `yarn build` not separately re-run (no source files changed; `yarn test` passing plus the live production deployment succeeding is considered sufficient evidence)
- [x] No secrets (DB password, service-role key, etc.) ever printed in chat or committed to git — generated password and API keys written directly to files (`C:\Users\banyk\secrets\`, gitignored `.env.prod`), verified via length/hash checks only

---

## Files Changed

- No application code changed. Infra/config only: new Supabase project (`quiz-game-prod`, ref `noyjptzwsagwofwsevwm`), new migration `20260703183721_enable_rls_all_tables` applied to it, Vercel env vars (Production carved out; Development/Preview restored after an accidental full wipe — see Step 5 notes), this plan file, and doc updates (dev-notes.md, PROGRESS.md, plan.md).
- New local-only files (not committed): `.env.prod` (gitignored), `C:\Users\banyk\secrets\quiz-game-prod-db-password.txt`, `quiz-game-prod-api-keys.json`, `quiz-game-prod-admin-passwords.json`.

---

## Progress Checkpoint (update this section if work pauses mid-plan)

**Final state:** All 7 steps complete. Production (`quiz-game-kappa-sepia.vercel.app`) now runs against the standalone `quiz-game-prod` Supabase project; Development and Preview continue sharing `Quiz-game-dev` as before. Isolation was proven with a live end-to-end test (not just config inspection): logged into the real production admin UI, created a quiz, confirmed it exists in the new project and is absent from the old one. `yarn test` passes (439/1 skipped). No further action pending on this plan.
