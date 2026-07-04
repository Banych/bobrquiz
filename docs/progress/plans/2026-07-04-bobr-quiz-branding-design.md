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

**Style (revised during implementation):** the original plan called for a hand-authored,
geometric flat-vector mark (circles/rounded rects, Duolingo-owl-style) parameterized by a
`MascotColors` palette so it could re-theme via CSS variables for dark mode. That
approach was tried and rejected after two rounds of visual review — hand-typed SVG
path coordinates cannot reach cartoon-illustration quality through guessing alone; the
results read as amateurish rather than polished.

**What shipped instead:** a real vector trace of a commissioned reference image,
sourced through vectorizer.io (raster-to-vector auto-trace), replacing the hand-drawn
geometry entirely. This trades the "re-themes automatically via CSS vars" property for
"looks like an actual illustrated character" — judged the better trade once the
hand-drawn version was seen next to the reference.

**Reference description (for future pose variants — keep new poses consistent with this):**
A 3/4-profile head-and-shoulders bust (not a full sitting body), in the exaggerated
rubber-hose/flash-animation style of 90s Nickelodeon cartoons (visual touchstone: *The
Angry Beavers*). Facing right. Construction, top to bottom:
- **Hair/fur silhouette:** a large, jagged, spiky mass on top of the head (4-6
  asymmetric pointed spikes of varying height, tallest toward the back), with smaller
  jagged tufts continuing down the back of the head and along the neck/shoulder line.
  Bold black outline throughout — flat cel-shaded fills, no gradients or textures.
- **Eye:** a single visible eye, sly and half-lidded (heavy upper eyelid over a thin
  sliver of eye-white, small dark pupil near the front/nose-side corner) — this is the
  mascot's main expression carrier. One thick, arched eyebrow sits close above it.
- **Ear:** one small teardrop-shaped ear on the back/left of the head, darker brown
  with a darker inner shadow, tucked where the hair meets the face.
  fill (currently a muted plum/purple in this asset) — a deliberate two-tone accent,
  distinct from the fur palette, echoing the original reference image.
- **Mouth:** a simple curved smirk line beneath the eye, running toward the snout.
- **Whiskers:** a few thin lines plus small dots near the cheek/snout base.
- **Teeth:** prominent front teeth hanging below the snout tip, cream/off-white (not
  orange/brown — this was an explicit correction from the first reference image), with
  a center divider line suggesting two teeth.
- **Body:** shoulders/chest continue the same jagged fur silhouette, cropped at the
  bottom edge (no arms/hands, no full sitting pose).

**Color palette (as traced, brown-forward per explicit correction from the first
reference):** primary mid-brown fur, a darker brown for shading/contours, a light tan
for highlight streaks, near-white/cream for teeth and small highlights, a muted
plum/purple for the nose, near-black for linework. No yellow/orange anywhere — earlier
reference images skewed yellow-orange and were explicitly rejected for that reason.

**v1 scope:** one default pose only, reused across every surface. No pose variants
(host/celebratory/dejected/dam-building) in this pass — those are deferred to a future
session. When that session happens, generate new poses through the same pipeline
(reference image → vectorizer.io trace) rather than hand-authoring paths, and keep the
face construction (sly half-lidded eye, arched brow, jagged hair, cream teeth, plum
nose) consistent across poses so they read as the same character.

**Construction:** vector-traced SVG as the single source of truth, fixed color palette
(no CSS-variable re-theming — the mascot now looks the same in light and dark mode,
which reads fine since the reference character itself has one fixed palette, not
unlike how a real logo/mascot mark doesn't reskin per background).
- `src/components/brand/beaver-mascot.tsx` — React component rendering the traced
  `<svg>` paths, accepting `className`/`size` props.
- **Revised during planning:** a literal binary `favicon.ico` would require adding a
  new image/ICO-conversion dependency (none exists in this repo). Instead,
  `src/app/icon.tsx` uses Next's `generateImageMetadata()` to render multiple sizes
  (16/32/192/512) dynamically from this same SVG component via `ImageResponse` — no
  new dependencies, no static binary files, and the same sizes double as the PWA
  manifest icons. The stock `src/app/favicon.ico` is deleted outright. Trade-off:
  no literal `/favicon.ico` file, which only affects very old browsers or tools that
  hardcode that path instead of reading the `<link rel="icon">` tag Next injects.

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
- `src/app/icon.tsx` — dynamic multi-size icon route (`generateImageMetadata` +
  `ImageResponse`), covering the browser tab icon and PWA manifest icon sizes
- `src/app/apple-icon.tsx` — same pattern, Apple touch icon conventions
- `src/app/opengraph-image.tsx` — `ImageResponse`-based share image: mascot + "Bobr
  Quiz" wordmark on the new brand palette
- `src/app/manifest.ts` — dynamic manifest file convention (`MetadataRoute.Manifest`),
  referencing the icon sizes generated by `icon.tsx` — no static PWA icon files needed

**Changed:**
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
- `src/app/not-found.tsx` — already exists (Card-based 404 with a "Go Home" button);
  add the mascot to its header. Zero extra art cost since it reuses the same default
  mark, and a 404 page is a standard low-risk branding touch point.

**Removed:**
- `src/app/favicon.ico` — deleted; superseded by the dynamic `icon.tsx` route (see
  Mascot Design above)
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
