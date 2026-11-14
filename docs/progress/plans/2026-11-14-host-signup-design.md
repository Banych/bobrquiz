# Host sign-up: anyone with an email address can host (issue 129)

Status: In progress (part 1 merged in PR #166; part 2 on feat/host-signup-email; part 3 to come)

## Why

Hosts are gated by the `ADMIN_EMAILS` allowlist (`isAdminUser` in
`src/infrastructure/auth/supabase-auth-client.ts`, checked in `src/proxy.ts`), accounts are made
by hand in the Supabase dashboard, and sign-ups are disabled in both Supabase projects. A
stranger cannot become a host, so nobody can pay for hosting.

Everything a host can see or change is already scoped to the quiz's owner (quiz owners, issues
127 and 138–140; media, issue 128). The allowlist is now the only thing between a new account
and hosting, and nothing in the app needs it any more: the quiz-owner spec ruled out an
operator view (Vlad, 2026-11-10).

## Goals

- A visitor types their email on one sign-in page, proves they own it, and is a host with an
  empty quiz list. The same page signs returning hosts in; there is no separate sign-up form.
- The email carries both a link and a short code. The link signs in the device it is opened
  on; the code, typed on the waiting screen, signs in the device that asked for it.
- An account that has not proved its email reaches no host page and no host or admin API.
- `ADMIN_EMAILS` is gone from the code, the env checks, `.env.example` and the e2e setup.
- Sign-in emails reach any address, from `bobrquiz.com`.

## Non-goals

- **No passwords in the UI.** Existing accounts sign in by email link or code like everyone
  else; their passwords stay in Supabase but no page asks for one. No forgot or reset flow.
- **No operator view**, unchanged from the quiz-owner spec.
- **No "change my email" flow.** A host who loses their mailbox loses the account (parked).
- **No per-host limits** (quizzes per host, the media-cap fan-out). They stay in the parking
  lot unless Vlad moves them in.
- **No landing page call to action**: issue 130. The home page's "Host Game" link keeps
  pointing at `/host`, which sends a signed-out visitor to sign-in.
- **No proxy logging change**: the email in the proxy's log line is issue 101.
- **No custom email sender on dev.** The dev project keeps Supabase's built-in mailer, which
  only reaches the project team's addresses, two emails an hour (my call: dev sign-ins are by
  the team, and e2e never sends a real email).
- Leaked-password protection (issue 109) needs the Supabase Pro plan and is not done here; with
  no password form it matters less, but the issue stays open for Vlad to close or keep.

## Anti-goals (a failure even if it works)

- A sign-in link that a mail scanner can use up by opening it: the link must not sign in on a
  plain GET.
- A sign-in that only works in the browser that asked for it (Supabase's PKCE code link does
  this, so it is not used).
- A redirect after sign-in that can leave bobrquiz (issue 108 must be closed by this work).
- An unconfirmed account treated as signed in anywhere, page or API.
- Existing hosts losing their quizzes: an account is matched by email, so the same email must
  keep the same Supabase user id and therefore the same `Quiz.ownerId`.
- Real hosts unable to sign in because someone filled the form with strangers' addresses until
  the daily email cap ran out: that is what the bot check is for.

## Constraints (checked 2026-11-14)

- Supabase's built-in mailer only delivers to the project team's addresses, two an hour
  (supabase.com/docs/guides/auth/auth-smtp, /auth/rate-limits). Production needs a custom SMTP
  sender, and with one Supabase allows 30 auth emails an hour by default, adjustable on its
  Rate Limits page.
- A magic link or code can be requested once every 60 seconds per address, and expires after
  an hour (supabase.com/docs/guides/auth/auth-email-passwordless).
- `signInWithOtp` creates the user on first use unless `shouldCreateUser: false`; that is how
  sign-up happens here.
- Leaked-password protection is Pro-only (supabase.com/docs/guides/auth/password-security).
- Resend Free: 3,000 emails a month, at most 100 a day, one verified domain, SMTP included,
  and Supabase lists it as a supported sender (resend.com/pricing).
- Production Supabase is on the Free plan (ADR-026).
- `bobrquiz.com` is registered in the Vercel team with Vercel DNS (bought 2026-11-14).

## Approaches considered

**Sign-in method.** Password sign-up needs leaked-password protection (issue 109), which needs
Supabase Pro, plus a forgot/reset flow (two more pages). Email-only sign-in needs neither and
keeps the Free plan. **Chosen: email only** (Vlad, 2026-11-14).

**What the email does.** Example: Ana asks on the classroom laptop and reads mail on her phone.
1. Supabase's standard link (PKCE): fails on the phone (the code verifier lives in the laptop's
   browser), and a mail scanner that opens it first uses it up. Least code.
2. Link to our own confirm page with a Continue button, verified on the server with the token
   hash: works on any device and survives scanners; signs in the phone, not the laptop.
3. As 2, plus the email's one-time code, typed on the laptop's waiting screen: signs in the
   device she is at. One input more than 2.
**Chosen: 3** (Vlad, 2026-11-14).

**Email sender.** Resend Free, Brevo Free (300 a day), Mailjet Free (200 a day), Amazon SES
(cents, but a sandbox approval of up to 96 hours) and a self-hosted server (Postal, mailcow;
blocked port 25 on most hosts and an unknown IP that lands in spam) were compared. **Chosen:
Resend Free on bobrquiz.com** (Vlad, 2026-11-14); moving to Resend Pro or SES is a settings
change in Supabase when a day passes about 100 sign-ins.

**Domain.** A product domain versus one umbrella domain for all of Vlad's projects. **Chosen:
`bobrquiz.com`** (Vlad, 2026-11-14): its email reputation stays its own and it can be handed
off with the product.

**Bot check.** Without one, Supabase's per-address and per-hour limits only slow a form
flooded with strangers' addresses, and Resend's 100-a-day cap still runs out in hours.
**Chosen: Cloudflare Turnstile** (Vlad, 2026-11-14), which Supabase verifies itself.

## Design

### What the host sees

```
/login                         /login (after Send)
┌───────────────────────────┐  ┌───────────────────────────────────┐
│ Sign in                   │  │ Check your email                  │
│ Host quizzes with bobrquiz│  │ We sent a link and a code to      │
│ Email [ana@school.org   ] │  │ ana@school.org                    │
│ [Turnstile]               │  │ Code [________]  [Sign in]        │
│ [Email me a sign-in link] │  │ Resend (in 42 s) · Use another email│
└───────────────────────────┘  └───────────────────────────────────┘

/auth/confirm?token_hash=…&type=…&next=/host
┌───────────────────────────┐
│ Sign in to bobrquiz       │
│ [Continue]                │
└───────────────────────────┘
```

- The sign-in page has one email field, the Turnstile widget and one button. New and returning
  hosts use it the same way. "Admin Login" becomes "Sign in" everywhere it is shown.
- After sending, the same page shows the waiting screen: the address, a code field, a resend
  button that unlocks after 60 seconds, and a way back to change the address.
- The email's link opens `/auth/confirm`, which shows a Continue button. Nothing is verified
  until it is pressed.
- After either path the host lands on the page they were sent from (the `redirect` parameter),
  or `/admin` when there was none.
- Errors are shown in words: wrong or expired code, used or expired link (with a link back to
  sign-in), too many requests (Supabase's 60-second limit), bot check failed.

### Who is a host

Any Supabase user whose email is confirmed (`email_confirmed_at` set), in a session signed in by
the emailed link or code, not a password (added in part 2: "Password sessions refused" under To
verify while building). Proving the email by link or code confirms it. One shared check in `src/infrastructure/auth/` decides this, and both
the proxy and `getCurrentUserId` use it, so an unconfirmed user is treated exactly like a
signed-out one: redirect to sign-in on pages, 401 on `/api/admin/**`, `null` user id in every
route and page that calls `getCurrentUserId`. The 403 "not in the allowlist" branch is removed.
Confirm-email must stay on in Supabase: with it off, Supabase stamps `email_confirmed_at` at
sign-up, so the code check would pass every new account (security review of part 1). The check
still refuses accounts that never proved their email, such as one made by hand without
confirming. (My call.)

### Sign-in mechanics

- **Asking for the email**: the browser calls `signInWithOtp({ email, options: {
  captchaToken, emailRedirectTo } })` through the existing browser client, as the password
  sign-in does today. Supabase verifies the Turnstile token itself; the app holds no Turnstile
  secret.
- **The code**: the browser calls `verifyOtp({ email, token, type: 'email' })`. The session
  cookie is set the same way the password sign-in sets it now.
- **The link**: the confirm page's Continue button posts to the server, which calls
  `verifyOtp({ token_hash, type })` through the cookie-aware server client and redirects. A
  GET never verifies.
- **Email templates**: Supabase's "Magic Link" and "Confirm signup" templates (a first-time
  address gets the second) both carry the link
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next={{ .RedirectTo }}`
  and the code `{{ .Token }}`. A template is fixed per project, so the page to return to rides
  in `{{ .RedirectTo }}`: the browser sends `emailRedirectTo: <its origin><path>`. The link
  always opens on the project's Site URL (`https://bobrquiz.com`, dev `http://localhost:3000`),
  never on the host that asked. The template text is kept in the repo (see Records) and pasted
  into both projects. (My call, after the builder check.)
- **Where the link lands**: when `emailRedirectTo` is not on the project's redirect allowlist,
  Supabase silently puts the Site URL in its place. The confirm action therefore keeps only the
  path and query of `next`, and only when its origin is the confirm page's own; anything else
  lands on `/admin`. A wrong allowlist then costs the return path, never the sign-in.
  Allowlists: production `https://bobrquiz.com/**`; dev `http://localhost:3000/**` and
  `http://localhost:3001/**`. Vercel previews and other local ports sign in with the code,
  which works on any host; their link opens on the dev Site URL. (My call.)
- **Redirect checks**: one helper in `src/lib/` accepts only a same-site path (starts with one
  `/`, not `//` or `/\`, no scheme), or an absolute URL on the current origin reduced to its
  path, and falls back to `/admin`. The sign-in page, the confirm page and the server action
  all use it. This closes issue 108.

### Layers

The confirm action needs the cookie-aware Supabase server client, which a page may not import
today. My call: the server-side auth calls live in `src/infrastructure/auth/` next to
`get-current-user.ts` (the session check, and the token-hash verify), and the existing exception
"API routes and server-component pages may import the current-user helper" widens to those
auth session helpers. The sign-in page keeps importing the browser client, as the login page
does now; it is already on the CLAUDE.md "owed" list and no new presentation file joins it.

### Turnstile

- Widget: `@marsidev/react-turnstile` or Cloudflare's script tag; builder's choice, with the
  site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (added to `.env.example` and env validation).
- Dev uses Cloudflare's published always-pass test keys (site key in `.env.local`, secret in the
  dev Supabase project's captcha settings), so local runs and e2e pass the check. Vercel's
  Preview and Development environments point at the dev Supabase project (prod isolation,
  2026-07-03), so they get the test site key too. Only Vercel's Production environment gets the
  real site key, from a Turnstile site registered for `bobrquiz.com`.
- The widget resets after every send, because a token is single-use.

### Domain and email

- `bobrquiz.com` becomes the production domain of the Vercel project; `bobrquiz.vercel.app`
  redirects to it. `SITE_URL` in `src/lib/site-url.ts` changes to `https://bobrquiz.com`.
- Resend sends from `bobrquiz <login@bobrquiz.com>` (the address is my call). Its DNS records
  (DKIM, SPF and the bounce MX), plus a `_dmarc` TXT record starting at `p=none`, go into
  Vercel DNS.
- Production Supabase: custom SMTP through Resend, Site URL `https://bobrquiz.com`, the
  redirect URL allowlist updated, Turnstile secret set, templates replaced, sign-ups enabled.

### Dev project settings

Before the code merges (e2e on the branch needs them): sign-ups on (my call; one switch to
undo), confirm-email on, the two new templates, the redirect allowlist above, and Turnstile on
with Cloudflare's always-pass test secret. Also, in both projects: "Secure email change" on and
the Phone provider off (see "Password sessions refused": the host check depends on both). The built-in mailer stays. CLAUDE.md's "sign-ups stay
disabled in both projects until issue 129 ships" pitfall is rewritten in the same change.

### Rollout order (production)

Each step is safe on its own; sign-ups open last.
1. Attach `bobrquiz.com` to the Vercel project, redirect `bobrquiz.vercel.app`, check the site
   loads on both names.
2. Resend account and domain; DNS records in Vercel; Resend shows the domain verified.
3. Supabase: custom SMTP, Site URL, redirect URLs, both templates. Send one test sign-in to a
   team address (sign-ups still off, so only existing accounts get mail).
4. Merge and deploy the code with `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set. Turnstile is not yet
   enforced in Supabase, so the token is sent and ignored.
5. Turn on Turnstile in Supabase with the real secret; sign in once as an existing host.
6. Turn on sign-ups. A new address signs up, confirms, creates a quiz and runs a game on
   production, and sees none of the existing quizzes.
7. Remove `ADMIN_EMAILS` from the Vercel environments.

Rollback: turn sign-ups off in Supabase (one switch); the rest can stay.

## Tests

- **Unit**: the redirect helper (accepted paths, every rejected shape, the fallback); the
  confirmed-user check; the proxy (no user, unconfirmed user and confirmed user on pages and
  `/api/admin/**`, with `ADMIN_EMAILS` unset); `getCurrentUserId` returning `null` for an
  unconfirmed user; the sign-in form (send, waiting screen, code, errors, resend countdown)
  with the Supabase client mocked; the confirm page and action (GET only renders, POST verifies
  and redirects through the helper, a bad or used token shows the error).
- **e2e** (no real email is sent):
  - `auth.setup.ts` signs the shared test host in through the service-role admin API's
    `generateLink`, then the confirm page's Continue button. `TEST_ADMIN_PASSWORD` and
    `TEST_AUTH_ADMIN_PASSWORD` go away.
  - A sign-up spec: a fresh address, the real form (test Turnstile key), the send request
    intercepted, the code taken from `generateLink` and typed on the waiting screen, an empty
    quiz list, a quiz created and started. The user is deleted afterwards through the admin
    API.
  - The link path once: `generateLink`'s token hash on `/auth/confirm`, Continue, lands on the
    `next` path.
  - `admin-auth.spec.ts` is rewritten for the new page; `signed-out.spec.ts` keeps covering
    the redirects.
- **The dev storage check** (`tests/security/media-non-owner-check.ts`,
  `yarn media:check-non-owner`) signs in its second account with `TEST_AUTH_ADMIN_PASSWORD`,
  which goes away, and a password sign-in without a captcha token would be refused once dev
  enforces Turnstile. It is rewritten to sign that account in through `generateLink` and
  `verifyOtp`, keeping `TEST_AUTH_ADMIN_EMAIL`, and run once after the change: it must still
  print PASS. It matters more once any stranger can hold a signed-in session. (My call, after
  the builder check.)

## Records

- ADR: hosts sign in by emailed link or code, any confirmed account hosts, Turnstile on the
  form, Resend on `bobrquiz.com` (outlives the work).
- `docs/guides/`: a short auth guide with the Supabase settings per project, the template text
  and the rollout steps above.
- CLAUDE.md: the Auth line of the code map, the widened layer exception, `ADMIN_EMAILS`
  removed, `SITE_URL`.
- `e2e/README.md`, `.env.example`, `docs/guides/SETUP.md`: the allowlist and test passwords
  removed, the service-role key and Turnstile test key added.
- Parking lot: "change my email"; reopen the "host entry points read as admin-only" row (its
  premise was "until sign-ups open"): the title rename covers the login card, the sitemap part
  goes with issue 130.

## To verify while building

These came from reading, not running; each needs a run before the plan relies on it.
- The `type` value each template's link needs for `verifyOtp` with a token hash (`email`,
  `magiclink` or `signup`), and whether a first-time address really gets "Confirm signup".
- The code length Supabase sends (6 by default, configurable), so the field accepts it.
- That `generateLink` with type `magiclink` creates a missing user and returns both a token
  hash and a code usable by `verifyOtp`, and that it bypasses the captcha.
- That `{{ .RedirectTo }}` is URL-escaped where the template puts it inside a query string,
  and what it holds when `emailRedirectTo` is not on the allowlist.
- Cloudflare's always-pass test keys and their behaviour with Supabase's captcha check.
- How long a session lasts on the Free plan (Supabase documents time-boxed and inactive
  session limits as paid settings; the default is believed to be no expiry).
- That intercepting the send request in Playwright leaves `generateLink`'s code valid.

Results so far (part 2, run on dev 2026-11-14 with a throwaway `@example.com` user, created by
`generateLink` and deleted after; supabase-js 2.105.4):
- `generateLink` with type `magiclink` creates a missing user, unconfirmed, and reports
  `verification_type: "signup"` for it (`magiclink` once it exists). It returns a token hash and
  a code (`email_otp`).
- `verifyOtp({ token_hash, type: 'email' })` verifies both the signup and the magic-link hash and
  confirms the user; `type: 'magiclink'` also works for the magic-link one. A used hash fails with
  `otp_expired` ("Email link is invalid or has expired"). **Ruling:** both templates use
  `type=email`, and the confirm action verifies with `email` whatever the link says.
- `verifyOtp({ email, token, type: 'email' })` signs in with the code; a wrong code fails with
  `otp_expired`, status 403.
- **The dev project sends 8-digit codes**, not 6. The code field accepts 6 to 10 digits.
- A newer link voids the older code, so the e2e send intercept must keep the form's request from
  reaching Supabase before `generateLink` is asked for the code (it does: the route is answered
  in the browser).
- Still open: the captcha bypass (dev's Turnstile is not on yet), `{{ .RedirectTo }}` escaping
  and the "Confirm signup" template for a first-time address (both need one real email), whether
  a browser-sent (PKCE) token hash verifies on another device, and session length (not checked).

With dev's settings applied (2026-11-14: sign-ups on, both templates, the redirect allowlist, Turnstile
with the always-pass test secret, secure email change on, phone off):
- **Enforced:** a password sign-in with no captcha token fails with `captcha_failed` ("no
  captcha_token found"); with Cloudflare's dummy token `XXXX.DUMMY.TOKEN.XXXX` it gets past the
  captcha.
- **Bypassed:** `generateLink` and both `verifyOtp` calls (code, token hash) need no captcha
  token. Full e2e passed 57/57 and `yarn media:check-non-owner` printed PASS under enforcement.

Builder rulings (part 2):
- The sign-in form's behaviour is covered in Playwright, not unit tests: Vitest runs in Node with
  no DOM. Its pure parts (error messages, the redirect helper, the confirm action) have unit tests.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is optional in env validation, so CI's build needs no new
  value; without it the form shows no widget and Supabase refuses the send where it enforces a
  captcha.
- An absolute `next` that is only the origin (what Supabase puts in place of a refused return
  address) lands on `/admin`, not the home page.
- A signed-in host who opens `/login` sees the form; not redirected (left to the builder).

Password sessions refused (ruled by Vlad 2026-11-14, after part 2's security review):
- **The hole:** with sign-ups open, anyone can sign an address up through Supabase's public
  sign-up endpoint with a password. When the owner later signs in by email, that confirms the
  address, and the attacker's password then signs in to the confirmed account. Reproduced on dev
  2026-11-14 with a throwaway address: the password failed with `email_not_confirmed` before the
  code was used, and signed in after.
- **The fix:** "Who is a host" adds a second condition. The session must have been signed in by
  the emailed code or link: the access token's `amr` claim contains `otp` (or `magiclink`).
  `getHostUser` in `src/infrastructure/auth/confirmed-user.ts` reads the session, has the auth
  server verify its token with `getUser(token)`, and checks that same token; the proxy and
  `getCurrentUserId` both use it. A password session is treated as signed out.
- **Observed on dev:** code and token-hash sign-ins both report `otp`, for a first-time address
  too, and a token refresh keeps it.
- **Cost:** a host still signed in with a password is sent to sign-in once after the deploy.
- **Tested by:** `e2e/host-signup.spec.ts`, which builds a password session for a confirmed
  account and checks that `/admin` redirects and `/api/admin` answers 401, while a code session
  through the same cookies passes.
- **Settings it depends on** (security re-review, 2026-11-14, reasoned from GoTrue's source and
  not run):
  - **The weakness:** the attacker's password still works against Supabase itself, and a
    password session can change the account's email or phone (`PUT /auth/v1/user`).
  - **Secure email change:** with it off, the attacker moves the account to their own address,
    confirms the change from their own inbox, and signs in there by code. That code session
    reports `otp` and carries the victim's user id. With it on (the hosted default), the old
    address must confirm the change too.
  - **Phone provider:** with it on, the same move works through a phone number and an SMS code.
  - **Required in both projects:** "Secure email change" on and the Phone provider off.
  - **The sturdier fix, not built:** remove the password on the first email sign-in, through the
    service role.

## Carried into part 2 (from part 1's reviews)

- `safeRedirectPath` (part 1) takes paths only. The confirm action's `next` is an absolute URL
  (`{{ .RedirectTo }}`), so part 2 either adds an origin parameter to the helper or strips the
  origin before calling it; either way the dot-segment cases stay in its tests.
- The new sign-in page shows a message when Supabase refuses an unconfirmed account, instead of
  sending it back to sign-in with no word.

## Left to the builder

- Component and file names, the Turnstile wrapper, the waiting screen's exact layout and copy.
- Whether a signed-in host visiting `/login` is sent on to `/admin`.
- How the e2e helper cleans up users it created when a run crashes.
