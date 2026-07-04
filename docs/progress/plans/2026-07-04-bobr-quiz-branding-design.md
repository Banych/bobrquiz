# Bobr Quiz — Visual Branding Design

**Status:** 📋 Approved, pending implementation plan
**Scope:** Presentation layer only (no domain/application changes)

## Context

The project was renamed from "Quiz Game" to "Bobr Quiz" (Vercel: bobrquiz.vercel.app,
GitHub: Banych/bobrquiz). Only text/metadata was rebranded so far. Visual identity is
still 100% Next.js/shadcn defaults:

- `src/app/favicon.ico` is the stock Next.js logo
- `public/` only has create-next-app boilerplate (`file.svg`, `globe.svg`, `next.svg`,
  `vercel.svg`, `window.svg`) — unused, no code references them
- `src/app/globals.css` uses the untouched shadcn neutral-gray theme (oklch grayscale
  tokens under `@theme inline`) — no brand color at all
- No `manifest.json`, no Open Graph/Twitter share image
- `src/app/(admin)/admin/layout.tsx` header still reads plain-text "Quiz Admin"

Mascot concept: "Bobr" = beaver, also a current internet meme animal. This is the
primary identity.

## Mascot Design

**Style:** a single flat-vector beaver mark combining geometric construction (circles /
rounded rects, Duolingo-owl-style simplification — scales cleanly from 16px favicon to
full-bleed hero art) with meme-deadpan personality (oversized front teeth, flat deadpan
stare — the "bobr kurwa" internet-meme aesthetic).

**v1 scope:** one default pose only, reused across every surface. No pose variants
(host/celebratory/dejected/dam-building) in this pass — those are deferred to a future
session once the base mark is validated in production.

**Construction:** hand-authored SVG as a single source of truth.
- `src/components/brand/beaver-mascot.tsx` — React component rendering inline `<svg>`
  paths, accepting `className`/`size` props. Colors reference the CSS variables from
  the palette below (e.g. `currentColor` / `var(--color-primary)`), so it re-themes for
  dark mode automatically without separate dark-mode artwork.
- **Exception:** `favicon.ico` must be a literal binary `.ico` file — it cannot be
  generated from JSX at build/request time. This is handled with a one-time static
  export of the same artwork to `src/app/favicon.ico` (legacy `/favicon.ico` lookups
  only); the SVG component remains the single editable source for everything else.

## Color Palette

Retheme the `@theme inline` tokens in `src/app/globals.css` from pure grayscale oklch
to a warm brown/amber palette.

**Light mode:**
- `--background` / `--card`: warm off-white (~0.98 lightness, slight warm hue ~70°)
  instead of pure white
- `--foreground`: dark brown (~0.22 lightness) instead of pure black
- `--primary`: golden amber (~0.72 lightness, chroma ~0.16, hue ~65°) — becomes the
  color for buttons, links, and focus rings across the whole app (not a secondary
  highlight — a full retheme, so existing components pick it up with no per-component
  changes)
- `--primary-foreground`: deep brown, for text/icons on amber buttons
- `--secondary`: mid-brown, for secondary buttons sitting next to amber primaries
- `--muted`, `--border`, `--input`: warm light tan / tan-gray, replacing neutral grays
- `--ring`: matches `--primary` amber

**Dark mode:** deepened and desaturated, not just the same hue at lower lightness —
background goes deep brown-black with reduced chroma, amber stays vivid/bright for
contrast against the dark brown rather than dimming, foreground becomes warm cream.

**Explicitly left untouched:** `--destructive` and `--chart-1..5` (unrelated to this
rebrand pass — chart colors serve data visualization, not brand identity) and
`--sidebar-*` tokens (no shadcn sidebar component is actually used anywhere in the app
today — the admin layout uses a plain custom header/nav, not the sidebar primitive).

## Files

**New:**
- `src/components/brand/beaver-mascot.tsx` — shared SVG mascot component
- `src/app/icon.tsx` — dynamic icon route (`ImageResponse`), the primary favicon path
  for modern browsers
- `src/app/apple-icon.tsx` — same pattern, Apple touch icon conventions
- `src/app/opengraph-image.tsx` — `ImageResponse`-based share image: mascot + "Bobr
  Quiz" wordmark on the new brand palette
- `public/manifest.json` (+ any PWA icon sizes it references) — wired up via
  `metadata.manifest` in `src/app/layout.tsx`

**Changed:**
- `src/app/favicon.ico` — replaced once with a static export of the mascot artwork
- `src/app/globals.css` — token changes per the palette above
- `src/app/page.tsx` — mascot rendered above/beside the hero `<h1>Bobr Quiz</h1>`; the
  numbered-circle feature badges (`rounded-full bg-primary`) pick up the new amber
  automatically, no code change needed there
- `src/components/player/player-join-form.tsx` — mascot placed in the header area next
  to the existing "Bobr Quiz" eyebrow text, above "Join the action"; the dark
  glassmorphic form styling itself is untouched (out of scope — it already has its own
  intentional look)
- `src/app/(admin)/admin/layout.tsx` — replace the plain-text `<h1>Quiz Admin</h1>` with
  a small mascot mark + "Bobr Quiz Admin" wordmark lockup
- `src/app/not-found.tsx` — add if it doesn't already exist; place the mascot there.
  Zero extra art cost since it reuses the same default mark, and a 404 page is a
  standard low-risk branding touch point.

**Removed:**
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`,
  `public/window.svg` — unused create-next-app boilerplate, confirmed nothing in the
  app references them

## Explicitly Deferred (not in this pass)

- Pose variants (host/bowtie, celebratory, dejected, dam-building empty-state) — v1
  ships one default pose everywhere; variants are a future session once the base mark
  is validated
- Mascot placement on host lobby "waiting for players" and win/lose result screens —
  these are exactly the screens that call for a *distinct* pose (per the deferred
  variants above); placing the single default mark there would read as unfinished
  rather than intentional, so it's better to wait for pose variants than to place the
  neutral mark on an emotionally-loaded screen
- Naming/theming copy motifs (dam-building = building a quiz, leaderboard as a "dam"
  of top scores, etc.) — optional polish, only worth doing once the visual direction
  ships and is validated

## Verification

After implementation, use Playwright MCP to screenshot the landing page, join screen,
admin header, and 404 page in both light and dark mode, plus inspect the generated OG
image and manifest icons directly by URL.

## Process Notes

- This design was produced via the `superpowers:brainstorming` skill. The next step is
  `superpowers:writing-plans` to turn this spec into an implementation plan (per this
  project's convention, saved to `docs/progress/plans/` alongside this file, not
  `docs/superpowers/` — that directory is gitignored in this repo).
- Subagents (the `Agent` tool) should be used during implementation where a task is
  genuinely independent and self-contained — e.g. iterating the mascot SVG in
  isolation, or running the Playwright verification screenshots — rather than as a
  default. Most of this work (token edits, component wiring, file placement) is small
  and sequential enough to do directly; reserve subagents for the pieces that
  benefit from isolation or parallelism.
