# Bobr Quiz Visual Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the stock Next.js/shadcn visual identity with a warm brown/amber
"Bobr Quiz" brand: a single flat-vector meme-deadpan beaver mascot, retheme'd color
tokens, generated icons/OG image/manifest, and mascot placement on the hero, join
screen, admin header, and 404 page.

**Architecture:** One SVG shape function (`mascotShapes`) is the single source of
geometry, parameterized by a `MascotColors` object. The live app renders it through
`<BeaverMascot>` using CSS custom properties (theme-aware, no separate dark-mode
artwork). Server-only raster contexts (favicon, Apple icon, OG image, PWA manifest
icons) can't read CSS custom properties, so they render the same shapes through a
shared `createMascotIconResponse` helper using literal hex colors instead.

**Superseded post-plan:** the hand-drawn geometry described above was replaced with a
vectorized cartoon trace after visual review — see "Post-Plan Additions" at the end of
this file. `mascotShapes()` now takes no arguments and uses one fixed color palette;
`MascotColors`/`MASCOT_COLORS_CSS_VAR`/`MASCOT_COLORS_STATIC` no longer exist.

**Tech Stack:** Next.js 16 App Router file conventions (`icon.tsx`, `apple-icon.tsx`,
`opengraph-image.tsx`, `manifest.ts`), `next/og` `ImageResponse`, Tailwind v4 `@theme`
tokens, Vitest (node environment, no DOM/testing-library).

**Companion spec:** [2026-07-04-bobr-quiz-branding-design.md](2026-07-04-bobr-quiz-branding-design.md)

## Global Constraints

- Presentation layer only — no domain/application/infrastructure changes (per spec scope).
- Never commit directly to `master` — this plan is executed on a feature branch, PR required.
- Use yarn scripts only (`yarn lint`, `yarn test`, `yarn build`, `yarn dev`) — never raw `npx`/`eslint` calls.
- No new npm dependencies — the plan was revised during brainstorming specifically to avoid needing an image/ICO conversion library.
- Path aliases: `@components/*` → `src/components/*`, `@ui/*` → `src/components/ui/*`, `@lib/*` → `src/lib/*` (see `tsconfig.json`).
- Vitest runs with `environment: 'node'` and no `@testing-library/react` — component tests call the function component directly (it returns a plain React element object, no DOM needed) and must be named `*.test.ts` (not `.test.tsx`) even when testing a `.tsx` subject, matching `src/tests/components/connection-status-banner.test.ts`.
- Test include glob is `src/tests/**/*.test.ts` (`vitest.config.ts`) — a test file outside this pattern will silently never run.

---

### Task 1: Mascot shape geometry + color constants

**Files:**
- Create: `src/components/brand/beaver-mascot-shapes.tsx`
- Test: `src/tests/components/beaver-mascot-shapes.test.ts`

**Interfaces:**
- Produces: `MascotColors` interface (`fur`, `furDark`, `belly`, `teeth`, `eye`, `nose`, all `string`), `mascotShapes(colors: MascotColors): JSX.Element` (a `<>...</>` fragment of `<ellipse>`/`<circle>`/`<rect>`/`<path>` elements, viewBox-agnostic — callers wrap it in their own `<svg viewBox="0 0 200 200">`), `MASCOT_COLORS_CSS_VAR: MascotColors` (values are `var(--mascot-*)` strings, for use inside the live app where CSS custom properties resolve), `MASCOT_COLORS_STATIC: MascotColors` (literal hex, for `next/og` `ImageResponse` contexts, which render outside the app's CSS cascade and cannot read CSS custom properties).

- [x] **Step 1: Write the failing test**

```typescript
// src/tests/components/beaver-mascot-shapes.test.ts
import { describe, it, expect } from 'vitest';
import type { MascotColors } from '@components/brand/beaver-mascot-shapes';

describe('beaver-mascot-shapes', () => {
  it('should export mascotShapes, MASCOT_COLORS_CSS_VAR, and MASCOT_COLORS_STATIC', async () => {
    const mod = await import('@components/brand/beaver-mascot-shapes');
    expect(typeof mod.mascotShapes).toBe('function');
    expect(mod.MASCOT_COLORS_CSS_VAR).toBeDefined();
    expect(mod.MASCOT_COLORS_STATIC).toBeDefined();
  });

  it('should define all six mascot color keys on the CSS-var palette', async () => {
    const { MASCOT_COLORS_CSS_VAR } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const keys: Array<keyof MascotColors> = [
      'fur',
      'furDark',
      'belly',
      'teeth',
      'eye',
      'nose',
    ];
    keys.forEach((key) => {
      expect(MASCOT_COLORS_CSS_VAR[key]).toMatch(/^var\(--mascot-/);
    });
  });

  it('should define all six mascot color keys on the static hex palette', async () => {
    const { MASCOT_COLORS_STATIC } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const keys: Array<keyof MascotColors> = [
      'fur',
      'furDark',
      'belly',
      'teeth',
      'eye',
      'nose',
    ];
    keys.forEach((key) => {
      expect(MASCOT_COLORS_STATIC[key]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('should render a fragment containing the eye and teeth shapes', async () => {
    const { mascotShapes, MASCOT_COLORS_STATIC } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const fragment = mascotShapes(MASCOT_COLORS_STATIC);
    const children = fragment.props.children as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;
    const fills = children.map((child) => child.props.fill);
    expect(fills).toContain(MASCOT_COLORS_STATIC.eye);
    expect(fills).toContain(MASCOT_COLORS_STATIC.teeth);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `yarn test beaver-mascot-shapes`
Expected: FAIL — `Cannot find module '@components/brand/beaver-mascot-shapes'`

- [x] **Step 3: Write the implementation**

```tsx
// src/components/brand/beaver-mascot-shapes.tsx
export interface MascotColors {
  fur: string;
  furDark: string;
  belly: string;
  teeth: string;
  eye: string;
  nose: string;
}

/**
 * Shared beaver geometry. Callers wrap this in their own
 * `<svg viewBox="0 0 200 200">` — kept viewBox-agnostic so it can be
 * embedded at any size, in the live app (CSS-var colors) or in
 * next/og ImageResponse contexts (static hex colors).
 */
export function mascotShapes(colors: MascotColors) {
  return (
    <>
      <ellipse cx="100" cy="172" rx="50" ry="26" fill={colors.furDark} />
      <path
        d="M70 165 L75 178 M90 168 L93 182 M110 168 L107 182 M130 165 L125 178"
        stroke={colors.belly}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <ellipse cx="100" cy="118" rx="55" ry="50" fill={colors.fur} />
      <ellipse cx="100" cy="132" rx="30" ry="34" fill={colors.belly} />
      <circle cx="100" cy="62" r="42" fill={colors.fur} />
      <circle cx="66" cy="30" r="12" fill={colors.furDark} />
      <circle cx="134" cy="30" r="12" fill={colors.furDark} />
      <circle cx="66" cy="30" r="6" fill={colors.belly} />
      <circle cx="134" cy="30" r="6" fill={colors.belly} />
      <ellipse cx="100" cy="78" rx="26" ry="20" fill={colors.belly} />
      <circle cx="84" cy="58" r="7" fill={colors.eye} />
      <circle cx="116" cy="58" r="7" fill={colors.eye} />
      <ellipse cx="100" cy="76" rx="7" ry="5" fill={colors.nose} />
      <rect
        x="90"
        y="86"
        width="10"
        height="18"
        rx="3"
        fill={colors.teeth}
        stroke={colors.furDark}
        strokeWidth="1.5"
      />
      <rect
        x="100"
        y="86"
        width="10"
        height="18"
        rx="3"
        fill={colors.teeth}
        stroke={colors.furDark}
        strokeWidth="1.5"
      />
    </>
  );
}

export const MASCOT_COLORS_CSS_VAR: MascotColors = {
  fur: 'var(--mascot-fur)',
  furDark: 'var(--mascot-fur-dark)',
  belly: 'var(--mascot-belly)',
  teeth: 'var(--mascot-teeth)',
  eye: 'var(--mascot-eye)',
  nose: 'var(--mascot-nose)',
};

export const MASCOT_COLORS_STATIC: MascotColors = {
  fur: '#8a5a3b',
  furDark: '#5c3c28',
  belly: '#e8d2b0',
  teeth: '#fdf6e8',
  eye: '#241a13',
  nose: '#3b2415',
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `yarn test beaver-mascot-shapes`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add src/components/brand/beaver-mascot-shapes.tsx src/tests/components/beaver-mascot-shapes.test.ts
git commit -m "feat: add shared beaver mascot shape geometry and color palettes"
```

---

### Task 2: Color palette retheme + live `BeaverMascot` component

**Files:**
- Modify: `src/app/globals.css` (full replacement, shown below)
- Create: `src/components/brand/beaver-mascot.tsx`
- Test: `src/tests/components/beaver-mascot.test.ts`

**Interfaces:**
- Consumes: `mascotShapes`, `MASCOT_COLORS_CSS_VAR` from Task 1 (`@components/brand/beaver-mascot-shapes`)
- Produces: `BeaverMascotProps` (`{ className?: string; size?: number }`), `BeaverMascot(props: BeaverMascotProps): JSX.Element` — used by Tasks 6–9 for hero/join/admin/404 placement.
- New CSS custom properties consumed by Task 1's `MASCOT_COLORS_CSS_VAR`: `--mascot-fur`, `--mascot-fur-dark`, `--mascot-belly`, `--mascot-teeth`, `--mascot-eye`, `--mascot-nose` (defined in both `:root` and `.dark`).

- [x] **Step 1: Write the failing test**

```typescript
// src/tests/components/beaver-mascot.test.ts
import { describe, it, expect } from 'vitest';
import type { BeaverMascotProps } from '@components/brand/beaver-mascot';

describe('BeaverMascot', () => {
  it('should export BeaverMascot component', async () => {
    const mod = await import('@components/brand/beaver-mascot');
    expect(typeof mod.BeaverMascot).toBe('function');
  });

  it('should default size to 48 when not provided', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const element = BeaverMascot({});
    expect(element.props.width).toBe(48);
    expect(element.props.height).toBe(48);
  });

  it('should apply a provided size to width and height', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const props: BeaverMascotProps = { size: 96 };
    const element = BeaverMascot(props);
    expect(element.props.width).toBe(96);
    expect(element.props.height).toBe(96);
  });

  it('should forward className to the svg element', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const element = BeaverMascot({ className: 'h-12 w-12' });
    expect(element.props.className).toBe('h-12 w-12');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `yarn test beaver-mascot.test`
Expected: FAIL — `Cannot find module '@components/brand/beaver-mascot'`

- [x] **Step 3: Replace `src/app/globals.css`**

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(0.98 0.012 75);
  --foreground: oklch(0.22 0.03 50);
  --card: oklch(0.99 0.008 75);
  --card-foreground: oklch(0.22 0.03 50);
  --popover: oklch(0.99 0.008 75);
  --popover-foreground: oklch(0.22 0.03 50);
  --primary: oklch(0.72 0.16 65);
  --primary-foreground: oklch(0.22 0.04 50);
  --secondary: oklch(0.55 0.06 50);
  --secondary-foreground: oklch(0.98 0.01 75);
  --muted: oklch(0.94 0.02 65);
  --muted-foreground: oklch(0.5 0.03 55);
  --accent: oklch(0.9 0.04 65);
  --accent-foreground: oklch(0.25 0.04 50);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.88 0.02 60);
  --input: oklch(0.88 0.02 60);
  --ring: oklch(0.72 0.16 65);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);

  --mascot-fur: oklch(0.5 0.08 55);
  --mascot-fur-dark: oklch(0.35 0.07 50);
  --mascot-belly: oklch(0.88 0.04 70);
  --mascot-teeth: oklch(0.97 0.02 80);
  --mascot-eye: oklch(0.2 0.01 50);
  --mascot-nose: oklch(0.3 0.05 40);
}

.dark {
  --background: oklch(0.16 0.02 50);
  --foreground: oklch(0.95 0.02 70);
  --card: oklch(0.22 0.03 50);
  --card-foreground: oklch(0.95 0.02 70);
  --popover: oklch(0.22 0.03 50);
  --popover-foreground: oklch(0.95 0.02 70);
  --primary: oklch(0.75 0.15 65);
  --primary-foreground: oklch(0.18 0.03 50);
  --secondary: oklch(0.32 0.04 50);
  --secondary-foreground: oklch(0.95 0.02 70);
  --muted: oklch(0.26 0.03 50);
  --muted-foreground: oklch(0.65 0.03 60);
  --accent: oklch(0.3 0.04 55);
  --accent-foreground: oklch(0.95 0.02 70);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 16%);
  --ring: oklch(0.75 0.15 65);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);

  --mascot-fur: oklch(0.58 0.09 55);
  --mascot-fur-dark: oklch(0.42 0.08 50);
  --mascot-belly: oklch(0.82 0.05 70);
  --mascot-teeth: oklch(0.95 0.02 80);
  --mascot-eye: oklch(0.15 0.01 50);
  --mascot-nose: oklch(0.28 0.05 40);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [x] **Step 4: Write `src/components/brand/beaver-mascot.tsx`**

```tsx
import {
  mascotShapes,
  MASCOT_COLORS_CSS_VAR,
} from './beaver-mascot-shapes';

export interface BeaverMascotProps {
  className?: string;
  size?: number;
}

export function BeaverMascot({ className, size = 48 }: BeaverMascotProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Bobr Quiz mascot"
    >
      {mascotShapes(MASCOT_COLORS_CSS_VAR)}
    </svg>
  );
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `yarn test beaver-mascot.test`
Expected: PASS (4 tests)

- [x] **Step 6: Visual smoke check**

Run `yarn dev` (assume already running per project convention), navigate to
`http://localhost:3000` with Playwright MCP, and confirm the page background/button
colors have shifted from gray to warm brown/amber (full placement happens in Task 7 —
this step only confirms the token retheme took effect on existing elements like the
numbered-circle badges, which reference `bg-primary` already).

- [x] **Step 7: Commit**

```bash
git add src/app/globals.css src/components/brand/beaver-mascot.tsx src/tests/components/beaver-mascot.test.ts
git commit -m "feat: retheme color tokens to brown/amber and add BeaverMascot component"
```

---

### Task 3: Shared PNG response helper + `icon.tsx` + `apple-icon.tsx`

**Files:**
- Create: `src/components/brand/mascot-image-response.tsx`
- Create: `src/app/icon.tsx`
- Create: `src/app/apple-icon.tsx`
- Remove: `src/app/favicon.ico`
- Test: `src/tests/components/mascot-image-response.test.ts`

**Interfaces:**
- Consumes: `mascotShapes`, `MASCOT_COLORS_STATIC` from Task 1
- Produces: `createMascotIconResponse(size: number): ImageResponse` — reused by Task 5's manifest icon routes.

**Note (revised during planning):** the design spec discussed `generateImageMetadata()`
for multi-size icons, but its exact generated-URL shape isn't something this plan can
verify without live Next.js docs access. Using the standard single-size `icon.tsx` /
`apple-icon.tsx` file convention (which Next auto-links in `<head>` without the caller
needing to know the URL) plus small explicit Route Handlers for the manifest's PNG
sizes (Task 5) achieves the same goal — one dynamically-rendered SVG source, zero new
dependencies, zero static binary files — without depending on unverified internal
routing behavior.

- [x] **Step 1: Write the failing test**

```typescript
// src/tests/components/mascot-image-response.test.ts
import { describe, it, expect } from 'vitest';

describe('mascot-image-response', () => {
  it('should export createMascotIconResponse as a function', async () => {
    const mod = await import('@components/brand/mascot-image-response');
    expect(typeof mod.createMascotIconResponse).toBe('function');
  });

  it('should return a Response with an image/png content-type', async () => {
    const { createMascotIconResponse } = await import(
      '@components/brand/mascot-image-response'
    );
    const response = createMascotIconResponse(64);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `yarn test mascot-image-response`
Expected: FAIL — `Cannot find module '@components/brand/mascot-image-response'`

- [x] **Step 3: Write the implementation**

```tsx
// src/components/brand/mascot-image-response.tsx
import { ImageResponse } from 'next/og';
import { mascotShapes, MASCOT_COLORS_STATIC } from './beaver-mascot-shapes';

export function createMascotIconResponse(size: number) {
  return new ImageResponse(
    (
      <svg width={size} height={size} viewBox="0 0 200 200">
        {mascotShapes(MASCOT_COLORS_STATIC)}
      </svg>
    ),
    { width: size, height: size }
  );
}
```

```tsx
// src/app/icon.tsx
import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return createMascotIconResponse(32);
}
```

```tsx
// src/app/apple-icon.tsx
import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return createMascotIconResponse(180);
}
```

- [x] **Step 4: Delete the stock favicon**

```bash
rm src/app/favicon.ico
```

- [x] **Step 5: Run test to verify it passes**

Run: `yarn test mascot-image-response`
Expected: PASS (2 tests)

- [x] **Step 6: Manual verification**

With `yarn dev` running, open `http://localhost:3000/icon` and
`http://localhost:3000/apple-icon` directly in a browser (or via Playwright MCP
`browser_navigate`) and confirm each renders the beaver mark as a PNG at the expected
size.

- [x] **Step 7: Commit**

```bash
git add src/components/brand/mascot-image-response.tsx src/app/icon.tsx src/app/apple-icon.tsx src/tests/components/mascot-image-response.test.ts
git rm src/app/favicon.ico
git commit -m "feat: generate favicon and apple-icon from the mascot SVG, drop stock favicon.ico"
```

---

### Task 4: Open Graph share image

**Files:**
- Create: `src/app/opengraph-image.tsx`

**Interfaces:**
- Consumes: `mascotShapes`, `MASCOT_COLORS_STATIC` from Task 1

- [x] **Step 1: Write the implementation**

```tsx
// src/app/opengraph-image.tsx
import { ImageResponse } from 'next/og';
import {
  mascotShapes,
  MASCOT_COLORS_STATIC,
} from '@components/brand/beaver-mascot-shapes';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
          background: '#1a120b',
        }}
      >
        <svg width="220" height="220" viewBox="0 0 200 200">
          {mascotShapes(MASCOT_COLORS_STATIC)}
        </svg>
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 700,
            color: '#f6e6c8',
          }}
        >
          Bobr Quiz
        </div>
      </div>
    ),
    { ...size }
  );
}
```

There is no meaningful unit test here (the file's entire content is a single
`ImageResponse` render — Task 3's tests already cover that `next/og` wiring works).
Verification is manual, in Step 2.

- [x] **Step 2: Manual verification**

With `yarn dev` running, open `http://localhost:3000/opengraph-image` in a browser (or
via Playwright MCP `browser_navigate` + `browser_take_screenshot`) and confirm it
renders the mascot beside the "Bobr Quiz" wordmark on the dark brown background at
1200×630.

- [x] **Step 3: Commit**

```bash
git add src/app/opengraph-image.tsx
git commit -m "feat: add Open Graph share image with mascot and wordmark"
```

---

### Task 5: PWA manifest + manifest icon routes

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/app/icon-192.png/route.tsx`
- Create: `src/app/icon-512.png/route.tsx`

**Interfaces:**
- Consumes: `createMascotIconResponse` from Task 3 (`@components/brand/mascot-image-response`)

- [x] **Step 1: Write the manifest icon routes**

```tsx
// src/app/icon-192.png/route.tsx
import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export async function GET() {
  return createMascotIconResponse(192);
}
```

```tsx
// src/app/icon-512.png/route.tsx
import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export async function GET() {
  return createMascotIconResponse(512);
}
```

- [x] **Step 2: Write `src/app/manifest.ts`**

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bobr Quiz',
    short_name: 'Bobr Quiz',
    description:
      'Host live multiplayer quiz sessions with real-time scoring, speed bonuses, and instant leaderboards.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a120b',
    theme_color: '#c98a3e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

No unit test — `manifest.ts` is a plain data-returning file conforming to a Next.js
type contract; Task 3 already covers the underlying `ImageResponse` wiring the icon
routes depend on. Verification is manual, in Step 3.

- [x] **Step 3: Manual verification**

With `yarn dev` running, open `http://localhost:3000/manifest.webmanifest`,
`http://localhost:3000/icon-192.png`, and `http://localhost:3000/icon-512.png`
directly (or via Playwright MCP) and confirm the manifest JSON is well-formed and both
icon URLs render the mascot PNG at their respective sizes.

- [x] **Step 4: Commit**

```bash
git add src/app/manifest.ts src/app/icon-192.png src/app/icon-512.png
git commit -m "feat: add PWA manifest with mascot-generated icons"
```

---

### Task 6: Remove unused create-next-app boilerplate

**Files:**
- Remove: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

- [x] **Step 1: Confirm nothing references these files**

Run: `grep -rn "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" src/`
Expected: no output (already confirmed during spec research, re-verify before deleting)

- [x] **Step 2: Delete the files**

```bash
git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

- [x] **Step 3: Commit**

```bash
git commit -m "chore: remove unused create-next-app boilerplate SVGs"
```

---

### Task 7: Hero placement (`src/app/page.tsx`)

**Files:**
- Modify: `src/app/page.tsx:1-17`

**Interfaces:**
- Consumes: `BeaverMascot` from Task 2 (`@components/brand/beaver-mascot`)

- [x] **Step 1: Add the import**

```typescript
// src/app/page.tsx — add alongside existing imports at the top
import { BeaverMascot } from '@components/brand/beaver-mascot';
```

- [x] **Step 2: Place the mascot above the hero heading**

Change:
```tsx
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Bobr Quiz
        </h1>
```
to:
```tsx
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <BeaverMascot size={96} className="mb-2" />
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Bobr Quiz
        </h1>
```

- [x] **Step 3: Manual verification**

Playwright MCP: navigate to `http://localhost:3000`, snapshot, confirm the mascot
renders above "Bobr Quiz" and the numbered feature badges show the new amber
`bg-primary`. Repeat with dark mode toggled (if the app has a dark-mode toggle;
otherwise force via `prefers-color-scheme` emulation) to confirm the mascot's fur
color shifts appropriately.

- [x] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add mascot to landing page hero"
```

---

### Task 8: Join screen placement (`src/components/player/player-join-form.tsx`)

**Files:**
- Modify: `src/components/player/player-join-form.tsx:1-6, 153-157`

**Interfaces:**
- Consumes: `BeaverMascot` from Task 2 (`@components/brand/beaver-mascot`)

- [x] **Step 1: Add the import**

```typescript
// src/components/player/player-join-form.tsx
import { BeaverMascot } from '@components/brand/beaver-mascot';
```
(add alongside the existing `import { ScoringInfoBadge } from './scoring-info-badge';` line)

- [x] **Step 2: Place the mascot in the header**

Change:
```tsx
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
            Bobr Quiz
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Join the action</h1>
```
to:
```tsx
        <header className="text-center">
          <BeaverMascot size={64} className="mx-auto mb-2" />
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
            Bobr Quiz
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Join the action</h1>
```

**Note:** this screen's dark glassmorphic styling (`bg-gradient-to-b from-slate-950
via-purple-950/40 to-slate-950`) is untouched per the spec — it doesn't use the
`--background`/`--foreground` tokens at all, so Task 2's retheme has no effect here.
`BeaverMascot`'s CSS-var colors (warm browns) will read fine against this dark
gradient without any extra handling.

- [x] **Step 3: Manual verification**

Playwright MCP: navigate to `http://localhost:3000/join`, snapshot, confirm the
mascot renders above the "Bobr Quiz" eyebrow text and reads clearly against the dark
purple gradient background.

- [x] **Step 4: Commit**

```bash
git add src/components/player/player-join-form.tsx
git commit -m "feat: add mascot to player join screen header"
```

---

### Task 9: Admin header wordmark (`src/app/(admin)/admin/layout.tsx`)

**Files:**
- Modify: `src/app/(admin)/admin/layout.tsx:1-6, 38-39`

**Interfaces:**
- Consumes: `BeaverMascot` from Task 2 (`@components/brand/beaver-mascot`)

- [x] **Step 1: Add the import**

```typescript
// src/app/(admin)/admin/layout.tsx
import { BeaverMascot } from '@components/brand/beaver-mascot';
```
(add alongside the existing `import { Button } from '@/components/ui/button';` line)

- [x] **Step 2: Replace the plain-text title with a mascot + wordmark lockup**

Change:
```tsx
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold">Quiz Admin</h1>
```
to:
```tsx
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <BeaverMascot size={28} />
              <h1 className="text-xl font-bold">Bobr Quiz Admin</h1>
            </div>
```

- [x] **Step 3: Manual verification**

Playwright MCP: navigate to `http://localhost:3000/admin` (requires an authenticated
session — check with the user whether a test admin login is available; if not, this
step can be verified visually once and the wordmark reviewed via source inspection),
snapshot, confirm the mascot + "Bobr Quiz Admin" wordmark render correctly in the
header next to the Dashboard/Quizzes nav links.

- [x] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/layout.tsx"
git commit -m "feat: add mascot wordmark to admin dashboard header"
```

---

### Task 10: 404 page placement (`src/app/not-found.tsx`)

**Files:**
- Modify: `src/app/not-found.tsx:1-9, 12-19`

**Interfaces:**
- Consumes: `BeaverMascot` from Task 2 (`@components/brand/beaver-mascot`)

- [x] **Step 1: Add the import**

```typescript
// src/app/not-found.tsx
import { BeaverMascot } from '@components/brand/beaver-mascot';
```
(add alongside the existing `import Link from 'next/link';` line)

- [x] **Step 2: Place the mascot above the 404 card title**

Change:
```tsx
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-6xl font-bold text-muted-foreground">
            404
          </CardTitle>
```
to:
```tsx
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <BeaverMascot size={64} className="mx-auto mb-2" />
          <CardTitle className="text-6xl font-bold text-muted-foreground">
            404
          </CardTitle>
```

- [x] **Step 3: Manual verification**

Playwright MCP: navigate to `http://localhost:3000/this-page-does-not-exist`,
snapshot, confirm the mascot renders above the "404" heading.

- [x] **Step 4: Commit**

```bash
git add src/app/not-found.tsx
git commit -m "feat: add mascot to the 404 page"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [x] **Step 1: Run the full test suite**

Run: `yarn test`
Expected: all tests PASS, including the new Task 1–3 tests

- [x] **Step 2: Run lint**

Run: `yarn lint`
Expected: no errors

- [x] **Step 3: Run a production build**

Run: `yarn build`
Expected: build succeeds; confirms `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`,
`manifest.ts`, and the `icon-192.png`/`icon-512.png` routes all compile as valid Next.js
file-convention/route modules.

- [x] **Step 4: Playwright visual pass across all four surfaces, light and dark**

Using Playwright MCP against the running dev server:
- `http://localhost:3000` (hero) — screenshot in light mode and dark mode
- `http://localhost:3000/join` (join screen) — screenshot
- `http://localhost:3000/admin` (admin header) — screenshot, if an authenticated
  session is available
- `http://localhost:3000/this-page-does-not-exist` (404) — screenshot in light mode
  and dark mode

Confirm: mascot renders correctly and legibly on every surface in both modes, amber
primary color is applied to buttons/CTAs/focus rings, no layout shift or overflow from
the added mascot markup.

- [x] **Step 5: Spot-check generated assets by URL**

`http://localhost:3000/icon`, `/apple-icon`, `/opengraph-image`, `/manifest.webmanifest`,
`/icon-192.png`, `/icon-512.png` — confirm each resolves and renders the expected image
or JSON.

- [x] **Step 6: Update the plan's status and open a PR**

Mark this plan's tasks complete, then follow the project's PR workflow (branch already
created for this work per CLAUDE.md's master-protection rule — do not commit to
`master` directly).

---

## Status: ✅ Complete (all 11 tasks + post-plan additions below)

PR: [#55](https://github.com/Banych/bobrquiz/pull/55) against `master`.

## Post-Plan Additions (not in original scope)

**Bug fixes found during implementation review:**
- Task 1's `mascotShapes()` originally returned a React Fragment (`<>...</>`), which
  crashes Satori (the engine behind `next/og`'s `ImageResponse`) with `TypeError:
  Cannot convert a Symbol value to a string` — this 500'd `/icon` and `/apple-icon` in
  the actual dev server. Fixed by using `<g>` (a real SVG grouping element) instead.
  This bug recurred a second time when the mascot geometry was fully replaced (see
  below) — same fix applied.
- An implementer added an unjustified `export const dynamic = 'force-dynamic'` to
  `icon.tsx`/`apple-icon.tsx` on the incorrect premise that `ImageResponse` can't be
  statically generated. Removed; confirmed via `yarn build`'s route table that both
  are correctly statically optimized (`○`) without it.
- 32 Prettier formatting errors across Tasks 1–4's new files, caught by `yarn lint`
  (implementers had only run `yarn test`). Fixed via `yarn lint:fix`.
- Missing `metadataBase` in `src/app/layout.tsx` — harmless before this branch, but
  became load-bearing once `opengraph-image.tsx` shipped (without it, the `og:image`
  URL resolves against `localhost:3000` in production). Added, pointing at
  `https://bobrquiz.vercel.app`.

**Task 12 (added mid-implementation, not in original plan): join screen retheme.**
User feedback after visual review: the player join screen's dark slate/purple gradient
with emerald accents and rose error text clashed with the new brand, even though the
original design spec explicitly left it out of scope. Retheme'd to a stone/amber dark
gradient (`src/components/player/player-join-form.tsx`), keeping the same dark,
immersive treatment — only the hue changed. Reviewed clean, no regressions.

**Mascot redesign (the biggest deviation from plan).** The design spec's originally
approved mascot ("flat-vector, Duolingo-owl-style geometric mark") was implemented as
planned in Task 1, but rejected on visual review — twice — as looking amateurish. Two
rounds of hand-typed SVG path coordinates (a spiky-hair/angry-eyebrow tweak, then a
full profile-bust reshape) could not reach cartoon-illustration quality through
guessing alone. Resolved by: generating a reference image via ChatGPT in the desired
style (Angry-Beavers-inspired, brown-forward, white teeth), running it through
vectorizer.io for a real multi-color vector trace, and wiring that traced geometry
directly into `beaver-mascot-shapes.tsx` in place of the hand-drawn version. This
dropped the CSS-variable color re-theming (`MascotColors`/`MASCOT_COLORS_CSS_VAR`/
`MASCOT_COLORS_STATIC` all removed) in favor of one fixed palette baked into the trace
— judged an acceptable trade once the difference in visual quality was seen directly.
Full construction description recorded in the design spec's "Mascot Design" section
for future pose-variant work. Reference assets kept at
`docs/progress/plans/assets/mascot-reference.png` and `mascot-reference-trace.svg`.
