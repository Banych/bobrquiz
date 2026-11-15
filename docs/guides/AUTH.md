# Guide: Host Sign-in Settings

Everything outside the code that host sign-in depends on: the Supabase, Resend, Cloudflare and
Vercel settings per project, the email templates, and the order to turn them on. Written
2026-11-15 after the production rollout of issue 129 (spec:
`docs/progress/plans/2026-11-14-host-signup-design.md`, decision ADR-029). How the code works is
in `docs/guides/SETUP.md` ("Authentication & Authorization").

## Projects

| | Dev | Production |
|---|---|---|
| Supabase project | `Quiz-game-dev` (`iwnxzdhhrreogxauxehm`) | `quiz-game-prod` (`noyjptzwsagwofwsevwm`) |
| Site URL | `http://localhost:3000` | `https://bobrquiz.com` |
| Redirect URLs | `http://localhost:3000/**`, `http://localhost:3001/**` | `https://bobrquiz.com/**` |
| Allow new users to sign up | on | on (since 2026-11-15) |
| Confirm email | on | on |
| Secure email change | on | on |
| Phone provider | off | off |
| Email sender | built-in mailer (team addresses only, 2 an hour) | custom SMTP through Resend |
| Captcha (Attack Protection) | Turnstile, Cloudflare's always-pass test secret | Turnstile, the `bobrquiz.com` widget's secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (test key, `.env.local`) | the `bobrquiz.com` widget's site key (Vercel Production only) |

Vercel's Preview and Development environments point at the dev project, so they get the
always-pass test site key, not the real one (set 2026-11-15; until then only Production had a
key, and a preview build showed no widget and its sends failed the dev project's captcha).
Preview deployments sign in with the code, which works on any host; their email link opens on
the dev Site URL.

Confirm email, Secure email change and the Phone provider are not preferences: the host check
(`src/infrastructure/auth/confirmed-user.ts`) relies on all three. With Confirm email off,
Supabase marks every new account confirmed at sign-up.

## Production email (Resend)

- Domain `bobrquiz.com` verified in Resend (eu-west-1, going by its `rsend-euw1` record). Its
  records are in Vercel DNS:
  TXT `resend._domainkey` (DKIM), CNAME `rsend` and CNAME `send` (SPF and the bounce MX, served
  by Resend through the CNAME), and TXT `_dmarc` = `v=DMARC1; p=none;`.
- API key: sending access, limited to `bobrquiz.com`. It lives only in Supabase's SMTP password
  field.
- Supabase → Authentication → Emails → SMTP: host `smtp.resend.com`, port `465`, username
  `resend`, sender `login@bobrquiz.com`, name `Bobrquiz`.
- Saving custom SMTP raised Supabase's email limit from 2 to 30 an hour (auth log,
  2026-11-15). Resend Free allows 100 a day.
- Checked 2026-11-15: a sign-in email reached a Gmail inbox, signed by `bobrquiz.com` and sent
  through `rsend.bobrquiz.com`.

## Email templates

Both templates carry the code and a link to `/auth/confirm`. The confirm page verifies with type
`email` whatever the link says, and `{{ .RedirectTo }}` arrives URL-escaped, so it survives the
query string. A first-time address gets "Confirm signup"; an existing one gets "Magic Link"
(both seen on production 2026-11-15).

**Magic Link**: subject `Your sign-in link`

```html
<h2>Sign in to bobrquiz</h2>
<p>Enter this code on the sign-in page:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Or open this link to sign in on this device:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Sign in to bobrquiz</a></p>
<p>The code and link work once and expire within an hour. If you didn't ask to sign in, ignore this email.</p>
```

**Confirm signup**: subject `Confirm your email address`

```html
<h2>Welcome to bobrquiz</h2>
<p>Enter this code on the sign-in page to confirm your email and start hosting:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Or open this link to confirm on this device:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirm and sign in</a></p>
<p>The code and link work once and expire within an hour. If you didn't sign up, ignore this email.</p>
```

These are production's bodies. Dev's were pasted in part 2 of issue 129 with the same link and
code; compare them before relying on dev for a template change.

## Turning it on in a project

The order production went through on 2026-11-15. Each step can be checked before the next.

1. Domain: attach it to the Vercel project. Point the old names at it with a 308; a name that
   other names already redirect to can't redirect itself until they point elsewhere (Vercel
   refused `bobrquiz.vercel.app` while `quiz-game-kappa-sepia.vercel.app` still pointed at it).
2. Supabase URL Configuration and the provider switches in the table above. Sign-ups stay off.
3. Resend: domain, DNS records, verify; then Supabase's custom SMTP. **Supabase won't let you edit
   the templates until custom SMTP is saved**, so templates come after the sender.
4. Templates, then one test sign-in by an existing account.
5. Turnstile site key in Vercel, then a production build that includes it. A redeploy of the same
   commit is cancelled by the project's ignored build step (it skips a build whose diff has no
   code outside `*.md`, `docs/` and `.claude/`), so the key went live with the next code merge.
   Check the widget renders on `/login` before step 6.
6. Captcha on in Supabase with the secret; sign in once. Turning it on before the build with the
   site key is live makes every send fail with `captcha_failed`.
7. Sign-ups on; a new address signs up, creates a quiz and runs a game.
8. Remove anything the old sign-in needed (`ADMIN_EMAILS` was deleted from Vercel on 2026-11-15).

Rollback: turn sign-ups off in Supabase. Existing hosts keep signing in.

## Traps seen in the rollout

- A typo in the SMTP host shows in the browser only as "Could not send the email"
  (`unexpected_failure`); Supabase's auth log holds the real error (it was
  `lookup smpt.resend.com: no such host`).
- After signing in or out, leave with a full page load (`src/lib/full-page-navigation.ts`), not
  `router.push`. A production build prefetches the home page's Host and Admin links while the
  visitor is signed out and keeps the redirect to `/login` it got; `router.push` replayed it and
  left a new host on the sign-in page (production, 2026-11-15). Dev servers don't prefetch, so
  only a production build (`yarn build && yarn start`) shows it; the e2e case "a visitor from the
  home page signs up…" fails there without the fix and skips on a dev server.
- Suspected, not reproduced: a second tab that opened the home page before the host signed in
  elsewhere still holds the prefetched redirect, so its Host link can land on `/login` until that
  tab reloads; and Back from `/host` may restore the sign-in form still busy if the browser keeps
  `/login` in its back/forward cache. Both leave the host signed in.
- Session cookies don't move between domains: hosts signed in on `bobrquiz.vercel.app` sign in
  again on `bobrquiz.com`.
