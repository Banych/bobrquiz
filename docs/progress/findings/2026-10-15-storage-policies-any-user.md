# Storage policies let any signed-in user upload and delete quiz media — findings (2026-10-15)

**Ran:** read-only checks against both Supabase projects, 2026-10-15: dev (`iwnx…`, the one in
`.env.local`) from a Node script in a `READ ONLY` transaction; production (`noyj…`) through its
public auth settings endpoint and the user running the `pg_policies` query in its SQL editor.
Prompted by the ruling to move the admin storage calls behind API routes, which assumed the
policies already stopped non-admins.

## What was found

Both projects carry the same three policies on `storage.objects`:

| policy | cmd | roles | qual / with_check |
|---|---|---|---|
| Authenticated users can delete quiz media | DELETE | {authenticated} | `bucket_id = 'quiz-media'` |
| Authenticated users can upload quiz media | INSERT | {authenticated} | `bucket_id = 'quiz-media'` |
| Public read access for quiz media | SELECT | {public} | `bucket_id = 'quiz-media'` |

Any `authenticated` session may upload or delete any object in `quiz-media`. The admin check
(`ADMIN_EMAILS`, applied by the app in `src/infrastructure/auth/supabase-auth-client.ts`) guards
the app's pages and routes; it never sees a direct call to the Storage API made with the public
anon key and the caller's own session. `docs/guides/MEDIA-UPLOADS.md` said "admin middleware
gates actual access", which held only for the app's own UI.

Before the fix, dev's `GET /auth/v1/settings` returned `disable_signup: false` with the email
provider on: anyone could create an account, confirm it by email, and then use those policies.
No app code calls `signUp` (grep over `src/`); admins are created in the dashboard. Not
exploited or tested by signing up; inferred from the policies and settings.

## Exposure checked

- Dev: 2 `auth.users` rows, both in `ADMIN_EMAILS` and confirmed (created 2025-12-20 and
  2026-10-15); 0 anonymous. `quiz-media` holds 2 objects, the newest from 2026-03-14. Emails were
  compared in-process and never printed.
- Production: the user confirmed in the dashboard that every account is an admin.

## Mitigation (2026-10-15)

The user turned off "Allow new users to sign up" in both projects. Afterwards both return
`disable_signup: true` (`anonymous_users: false`, `mailer_autoconfirm: false`). With only admin
accounts and no signups, nobody else can authenticate. The policies themselves are unchanged:
**re-enabling signups reopens the hole** until the policies are fixed (planned with the move of
uploads to the server).

## Tooling notes from the check

- `vercel env pull --environment=production` (Vercel CLI 64.2.0) returns every production
  variable as `[SENSITIVE]`, `NEXT_PUBLIC_*` included. An empty `DATABASE_URL` made `pg` fail with
  `getaddrinfo ENOTFOUND base` (an empty connection string resolves against `postgres://base`).
  The production URL and anon key were read from the live site's public JS chunks instead.
- `vercel link` (64.2.0) appends `VERCEL_OIDC_TOKEN` to an existing `.env.local` and keeps the
  rest of the file.
- The project's Supabase MCP server (`.mcp.json`) is scoped to the dev project ref, so it cannot
  read production.
