# Bobr Quiz Visual Branding

**Date:** 2026-07-04
**Status:** ✅ Complete
**Branch:** `docs/bobr-quiz-branding-design`
**Plan:** [plans/2026-07-04-bobr-quiz-branding-implementation.md](../plans/2026-07-04-bobr-quiz-branding-implementation.md)
**Spec:** [plans/2026-07-04-bobr-quiz-branding-design.md](../plans/2026-07-04-bobr-quiz-branding-design.md)
**PR:** [#55](https://github.com/Banych/bobrquiz/pull/55)

---

## Summary

Full visual branding pass replacing the stock Next.js/shadcn identity with a warm
brown/amber "Bobr Quiz" brand: a cartoon beaver mascot, a full color-token retheme
(amber as the actual `--primary`), and generated favicon/apple-icon/OG-image/PWA-manifest
assets — all rendered dynamically via `next/og`'s `ImageResponse`, zero new npm
dependencies. Mascot placed on the landing hero, player join screen, admin dashboard
header, and 404 page.

Went through the full `brainstorming` → `writing-plans` → `subagent-driven-development`
workflow for the base implementation, then a second, unplanned round of mascot redesign
driven by direct visual feedback after the base plan shipped.

Final state: 448 tests passing (1 pre-existing skip), lint clean, build passing, full
manual Playwright verification across all placement surfaces including an
authenticated admin-header check.

---

## What Was Built

### Mascot geometry — `src/components/brand/beaver-mascot-shapes.tsx`

Single source of truth: `mascotShapes()` returns the mascot's SVG paths, consumed by
`<BeaverMascot>` (live app) and `createMascotIconResponse()` (server-rendered favicon/
apple-icon/manifest-icon/OG-image contexts via `next/og`).

**This went through three iterations, not one:**

1. **v1 (approved spec): hand-authored geometric mark.** Circles/rounded-rects,
   Duolingo-owl-style, parameterized by a `MascotColors` object so it could re-theme
   via CSS variables (`MASCOT_COLORS_CSS_VAR` for the live app, `MASCOT_COLORS_STATIC`
   for Satori). Implemented per plan, tests passing — then rejected on visual review as
   generic/flat, not matching the "Angry Beavers" reference the user actually wanted.
2. **v2: hand-typed spiky-hair + angry-eyebrow tweak, then a full profile-bust
   reshape.** Both rejected — "looks like a children's drawing," not close to the
   reference. **Root cause acknowledged directly rather than iterated past:** guessing
   SVG path coordinates freehand cannot reach cartoon-illustration quality; that needs
   either a real vector trace or an actual designer, not more guessing.
3. **v3 (shipped): vectorized trace of a commissioned reference image.** User
   generated a reference image via ChatGPT in the target style (brown-forward, cream
   teeth per earlier correction — the first ChatGPT attempt skewed yellow-orange and
   was rejected), then ran it through vectorizer.io for a real multi-color vector
   trace (~40 paths, 8 flat color fills, no gradients — directly Satori-compatible).
   That traced geometry was copied verbatim into `mascotShapes()`.

**Decision: dropped CSS-variable color re-theming.** v3's trace has one fixed
8-color palette; retrofitting it into the old 6-slot `MascotColors` abstraction would
mean manually classifying every one of ~40 paths by semantic role for no real benefit.
A cartoon mascot mark doesn't need to reskin per light/dark background any more than a
real logo does — accepted the fixed palette instead of forcing the old abstraction.

**Decision: padded the trace's native 995×1128 viewBox to a square 1128×1128
(`MASCOT_VIEW_BOX = '-66.5 0 1128 1128'`)** rather than reworking every consumer's
aspect-ratio math — every existing call site already assumed a plain square `size ×
size` box (icon.tsx, apple-icon.tsx, manifest icon routes, BeaverMascot, opengraph-image),
so padding the source instead of the consumers avoided touching five files' layout math.

Full mascot construction description (for future pose variants) recorded in the design
spec's "Mascot Design" section. Reference assets kept at
`docs/progress/plans/assets/mascot-reference.png` (ChatGPT output) and
`mascot-reference-trace.svg` (vectorizer.io output).

### Color palette — `src/app/globals.css`

Full oklch retheme: `--primary` becomes golden amber (light) / vivid amber on deep
brown-black (dark), so existing `bg-primary` usages (hero feature badges, CTAs, focus
rings) pick up the new brand with zero per-component changes. `--destructive`,
`--chart-1..5`, `--sidebar-*` explicitly left untouched (unrelated to brand identity;
no sidebar component is actually used). New `--mascot-*` tokens were added in this pass
but became unused once the mascot dropped CSS-variable theming (harmless dead tokens,
not worth a cleanup commit).

### Generated assets

- `src/app/icon.tsx` / `apple-icon.tsx` — single-size file-convention icons via
  `next/og`. **Deviation from plan:** the plan originally proposed
  `generateImageMetadata()` for multi-size icons; shipped with simpler single-size
  conventions instead since the multi-size API's exact URL scheme couldn't be verified
  without live docs access. Documented inline in the plan as a "Note (revised during
  planning)".
- `src/app/opengraph-image.tsx` — 1200×630 share image, mascot + wordmark on dark brown.
- `src/app/manifest.ts` + `icon-192.png`/`icon-512.png` route handlers — PWA manifest.
- `src/app/favicon.ico` deleted (superseded by the dynamic `icon.tsx` route).

### Placement

Hero (`src/app/page.tsx`), join screen (`player-join-form.tsx`), admin header
(`admin/layout.tsx` — "Bobr Quiz Admin" wordmark lockup), 404 page (`not-found.tsx`).

### Join screen retheme (added mid-session, not in original plan)

User feedback after visual review: the join screen's dark slate/purple gradient with
emerald accents and rose error text clashed with the new brand, even though the
original design spec explicitly scoped it out ("already has its own intentional
look"). Retheme'd to a stone/amber dark gradient — kept the same dark, immersive
treatment, only the hue changed.

---

## Bugs Found and Fixed

**Satori can't render a React Fragment.** `mascotShapes()` originally returned
`<>...</>`; `next/og`'s `ImageResponse` (powered by Satori) crashed with `TypeError:
Cannot convert a Symbol value to a string`, 500-ing `/icon` and `/apple-icon` in the
actual dev server — caught by hitting the routes directly, not by the unit tests
(which only exercised the returned element tree, not an actual Satori render). Fixed
by using `<g>` (a real SVG grouping element) instead of a Fragment. **This bug
recurred** when the mascot geometry was fully replaced in the v3 redesign (same
Fragment mistake, same fix) — caught immediately this time since the /icon 500 was a
known signature.

**Unjustified `dynamic = 'force-dynamic'`.** An implementer subagent added this export
to `icon.tsx`/`apple-icon.tsx` on the incorrect premise that `ImageResponse` requires
per-request generation. Flagged by the task reviewer as contradicting Next.js's actual
static-optimization defaults; removed, then verified via `yarn build`'s route table
that both routes are correctly static (`○`) without it.

**32 Prettier formatting errors** across Tasks 1–4's new files — implementers had only
run `yarn test`, not `yarn lint`. Fixed via `yarn lint:fix`; no behavioral change.

**Missing `metadataBase`.** `src/app/layout.tsx` never set it — harmless before this
branch, but became load-bearing once `opengraph-image.tsx` shipped: without it, Next
resolves the `og:image` URL against `localhost:3000` instead of the real domain in
production. Caught by the final whole-branch review. Added, pointing at
`https://bobrquiz.vercel.app`.

---

## Process Notes

- Executed via `superpowers:subagent-driven-development`: fresh implementer subagent
  per task, task-scoped reviewer after each, final whole-branch reviewer (Opus) at the
  end. Batched Tasks 7–10 (four simple, independent mascot-placement edits) into one
  dispatch per user request to cut overhead — reviewed as one batch, still caught and
  confirmed as clean.
- The mascot redesign (v2/v3 above) was **not** run through the subagent pipeline —
  it's inherently a tight visual-feedback loop with the user (render → screenshot →
  "no, try again") that doesn't fit a fire-and-forget task dispatch. Handled directly,
  iterating with live Playwright screenshots against the running dev server.
- Verified the admin-header placement (originally left as code-review-only, no
  browser check, since no test admin session was available at Task 11 time) after the
  PR was already open, by finding `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` already
  documented in `e2e/auth.setup.ts` and logging in directly via Playwright.

---

## Key Commits

| Hash | Message |
|------|---------|
| `c14bf19` | docs: add Bobr Quiz visual branding design spec |
| `dca6d39` | docs: revise favicon approach in branding spec |
| `87fc19b` | docs: add Bobr Quiz branding implementation plan |
| `96a7989` | feat: add shared beaver mascot shape geometry and color palettes (v1) |
| `b19913e` | feat: retheme color tokens to brown/amber and add BeaverMascot component |
| `35e168b` | feat: generate favicon and apple-icon from the mascot SVG, drop stock favicon.ico |
| `54292cb` | fix: satori-incompatible fragment in mascot shapes, drop unjustified force-dynamic |
| `9779235` | feat: add Open Graph share image with mascot and wordmark |
| `9c8cb4e` | feat: add PWA manifest with mascot-generated icons |
| `742b03a` | chore: remove unused create-next-app boilerplate SVGs |
| `66d5095` | feat: place BeaverMascot across four pages (tasks 7-10) |
| `9425b0b` | style: fix Prettier formatting in branding files |
| `4aac037` | chore: retheme join screen to brand colors (stone/amber palette) |
| `3d0da70` | fix: set metadataBase for OG image resolution, rename stale test |
| `69d01f0` | feat: replace hand-drawn mascot with vectorized cartoon artwork (v3) |

---

## Verification

| Check | Result |
|-------|--------|
| `yarn test` | ✅ 448 passing, 1 pre-existing skip |
| `yarn lint` | ✅ 0 errors (5 pre-existing, unrelated warnings) |
| `yarn build` | ✅ Passes; `/icon`, `/apple-icon` statically optimized |
| Hero, light + dark mode | ✅ Playwright screenshot verified |
| Join screen | ✅ Playwright screenshot verified |
| 404 page | ✅ Playwright screenshot verified |
| Admin header | ✅ Logged in with test admin credentials, verified live |
| `/icon`, `/apple-icon`, `/opengraph-image`, `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png` | ✅ All curl-verified 200, correct content-type |
