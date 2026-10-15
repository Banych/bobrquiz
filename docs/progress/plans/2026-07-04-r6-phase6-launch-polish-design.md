# R6 Phase 6 — Launch Polish (minus custom domain) Design Spec

**Goal:** Close out the remaining, in-scope items of `docs/plan.md`'s R6 Phase 6
("Marketing & Launch") now that the Bobr Quiz visual branding pass (PR #55) has
shipped: landing page content polish, SEO basics, a production-safe demo quiz,
and a README launch blurb. Custom domain configuration is explicitly **out of
scope** — the current `bobrquiz.vercel.app` production URL is sufficient for now.

**Context:** `docs/plan.md` Phase 6 checklist items covered by this spec:
- Marketing Landing Page: feature highlights with icons, testimonials/social-proof
  placeholder, "Free to use" note, SEO optimization (meta tags, sitemap)
- Launch Preparation: demo quiz with sample questions, launch announcement content

Not covered (explicitly deferred, not part of this spec):
- Custom domain (per user instruction — current Vercel domain is enough)
- Product screenshots in the hero (no design/asset decision made for this)
- Demo video (marked optional in the original checklist, not requested)
- Pricing section — deferred; product doesn't yet have a feature set worth
  charging for. A "Free to use" badge is used instead of a pricing table.

## Architecture

Presentation-layer-only changes, consistent with the branding work this builds
on, plus one small additive infrastructure-layer seed helper. No domain or
application layer changes.

```
src/app/page.tsx                                    — landing page content additions
src/app/sitemap.ts                                   — new
src/app/robots.ts                                     — new
src/app/(player)/join/page.tsx                        — + page metadata
src/app/(host)/host/page.tsx                          — + page metadata
src/infrastructure/database/prisma/seed-helpers.ts    — + seedLaunchDemoQuiz()
src/infrastructure/database/prisma/seed-launch-demo.ts — new runner script
package.json                                          — + "seed:demo" script
README.md                                             — + launch blurb section
```

## Section 1: Landing page content polish (`src/app/page.tsx`)

**"Free to use" badge** — `<Badge variant="secondary">Free to use</Badge>`
(the `Badge` component already exists and is used on `/host`) placed in the
hero, near the CTA row.

**New "Why Bobr Quiz" section** — added between the existing "How It Works"
section and the footer. Same 3-column card grid pattern as "How It Works", but
using `lucide-react` icons (already a project dependency — no new installs)
instead of numbered badges:
- `Zap` — "Speed-based scoring" — rewards fast, correct answers
- `Trophy` — "Live leaderboards" — real-time rank updates as the game plays
- `QrCode` — "Instant join" — players scan a QR code or type a join code, no
  app install

**Testimonials placeholder** — a small section immediately after "Why Bobr
Quiz": a centered card/banner reading *"Be one of our first players — reviews
coming soon."* No fake quotes, no placeholder names — chosen deliberately
during brainstorming because a fabricated testimonial on a real product page
reads as dishonest; an honest "coming soon" note fills the same visual slot
without that risk.

No changes to the existing hero heading, description, or CTA buttons — all
additions are additive, placed below/around the existing content.

## Section 2: SEO basics

**`src/app/sitemap.ts`** (new) — `MetadataRoute.Sitemap` listing only the
public, indexable entry points: `/`, `/join`, `/host`. Admin (`/admin`,
`/login`), API routes, and ephemeral per-session URLs (`/quiz/*/live`,
`/play/*`) are excluded — they're either auth-gated or single-use links that
have no business being indexed.

**`src/app/robots.ts`** (new) — disallows `/admin`, `/login`, `/api`,
`/quiz/*/live`, `/play/*`; allows everything else.

**Page-specific metadata** — both `(player)/join/page.tsx` and
`(host)/host/page.tsx` are server components already (verified by reading both
files — neither has a `'use client'` directive, so each can export its own
`metadata` object directly even though `join/page.tsx` renders a client
component (`PlayerJoinForm`) as a child):
- `/join`: title *"Join a Bobr Quiz — Bobr Quiz"*, description *"Enter a join
  code to play live multiplayer trivia."*
- `/host`: title *"Host a Quiz — Bobr Quiz"*, description *"Pick a quiz and
  start a live session."*

No per-page OG/Twitter-card overrides — the shared `opengraph-image.tsx` from
the branding work already covers social previews for every route via
`metadataBase` inheritance.

## Section 3: Demo quiz seed

**Problem:** the existing `seed.ts` / `seedSampleQuiz()` in
`seed-helpers.ts` is a **dev/E2E test fixture**, not something safe to run
against production — `seed.ts`'s `main()` calls `resetDatabase()`, which
deletes every quiz, player, and answer in the target database. Its sample
questions are also developer-flavored ("React hooks were introduced in which
version?", "Briefly describe what DTO stands for.") rather than general-
audience trivia suitable for a public landing-page demo.

**Design:** given the app's live, host-driven session model (no solo/self-
paced play mode exists, and building one is out of scope for this pass — it
was considered and rejected as too large during brainstorming), the demo quiz
is seeded into the database and appears in the site owner's own admin/host
quiz list; the owner manually starts a live session when they want to
demonstrate the product. This requires no new application features.

**New `seedLaunchDemoQuiz()` in `seed-helpers.ts`:**
- Additive and idempotent: uses `prisma.quiz.upsert()` keyed on `joinCode`
  (already `@unique` in the schema) so re-running it is always safe and never
  touches `resetDatabase()` or any other quiz's data.
- Title: **"Bobr Quiz Demo"**
- Join code: **`TRYBOBR`**
- 5 new general-knowledge questions (broadly approachable, not dev-flavored),
  mixing `multiple_choice` and `true_false` types, 100 points each, 20s time
  per question:
  1. "What is the largest planet in our solar system?" (MC: Mercury / Venus /
     Jupiter / Saturn → Jupiter)
  2. "True or false: Mount Everest is the tallest mountain on Earth." (TF →
     true)
  3. "Which ocean is the largest?" (MC: Atlantic / Indian / Pacific / Arctic →
     Pacific)
  4. "How many continents are there?" (MC: 5 / 6 / 7 / 8 → 7)
  5. "True or false: A group of crows is called a murder." (TF → true)
- No pre-seeded players or answers (unlike the dev fixture) — a real demo
  session should start empty.

**New runner script** `src/infrastructure/database/prisma/seed-launch-demo.ts`
— mirrors `seed.ts`'s shape (call the function, log the result, disconnect).

**New `yarn seed:demo` script** in `package.json`, parallel to the existing
raw `"seed": "tsx .../seed.ts"` entry. Deliberately **not** wired through
`prisma db seed` (the `prisma:seed` script), since that command is fixed to
the one seed file configured for Prisma and is meant for the destructive
dev/E2E fixture.

**Testing:** one test verifying `seedLaunchDemoQuiz()` is idempotent — calling
it twice does not create a duplicate quiz (asserts on quiz count / id
stability keyed by the fixed join code).

**Execution:** the user will run `yarn seed:demo` against production
themselves after this ships; it is not run as part of this implementation.

## Section 4: README launch blurb

A new short intro section in `README.md`, placed below the title and above the
technical setup instructions — a few sentences pitching Bobr Quiz to a human
reader: what it does (host live multiplayer trivia with real-time scoring and
leaderboards), who it's for, and the core join-by-code flow. Includes a
one-line pointer to the demo join code (`TRYBOBR`) once it exists in
production. Written content only — no code changes.

## Testing

- New Vitest test for `seedLaunchDemoQuiz()` idempotency (Section 3).
- No new tests needed for `sitemap.ts`/`robots.ts`/page metadata exports —
  these are plain data-returning files conforming to Next.js type contracts,
  consistent with how `manifest.ts` was treated as untested in the branding
  plan.
- Manual Playwright verification of the landing page's new sections (light
  and dark mode), `/sitemap.xml`, `/robots.txt`, and the demo quiz's presence
  in the admin quiz list after running `yarn seed:demo` locally.

## Out of scope / deferred (for the record)

- Custom domain — explicit user instruction, current Vercel URL is enough.
- Pricing tiers — no feature set yet that justifies charging; revisit later.
- Product screenshots in the hero, demo video — not requested.
- Self-paced/solo demo play mode — would require new application-layer
  functionality (a non-host-driven session type); considered during
  brainstorming and rejected as out of scope for a launch-polish pass.
