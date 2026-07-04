# R6 Phase 6 — Launch Polish (minus custom domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out R6 Phase 6's remaining in-scope items — landing page content
polish, SEO basics, a production-safe demo quiz, and a README launch blurb —
now that the Bobr Quiz visual branding pass (PR #55) has shipped.

**Architecture:** Presentation-layer content/metadata additions to the
existing landing page and two route pages, two new Next.js file-convention
metadata routes (`sitemap.ts`, `robots.ts`), one small shared constant, and
one additive/idempotent Prisma seed helper plus its own runner script. No
domain or application layer changes.

**Tech Stack:** Next.js 16 App Router file conventions (`sitemap.ts`,
`robots.ts`), `lucide-react` (already a dependency), Prisma v7 (upsert),
Vitest (mocked Prisma client, matching existing repository test pattern).

**Companion spec:** [2026-07-04-r6-phase6-launch-polish-design.md](2026-07-04-r6-phase6-launch-polish-design.md)

## Global Constraints

- Presentation layer + one additive infrastructure seed helper only — no domain/application changes.
- Custom domain is explicitly out of scope — use the existing production URL `https://bobrquiz.vercel.app` everywhere a base URL is needed.
- No pricing table — use a "Free to use" badge instead; no feature set yet justifies charging.
- No fake testimonials or placeholder names — the testimonials section must say something honest like "reviews coming soon," never a fabricated quote.
- No new npm dependencies — `lucide-react` and `Badge` (`@/components/ui/badge`) already exist in the codebase.
- Never commit directly to `master` — this plan is executed on a feature branch, PR required.
- Use yarn scripts only (`yarn lint`, `yarn test`, `yarn build`) — never raw `npx`/`eslint`/`vitest` calls.
- Path aliases: `@lib/*` → `src/lib/*`, `@components/*` → `src/components/*` (see `tsconfig.json`).
- The new demo-quiz seed script must never call `resetDatabase()` or otherwise touch existing data — it must be additive/idempotent only, keyed on a unique `joinCode`.
- Vitest mocks the Prisma client via `vi.mock('@infrastructure/database/prisma/client', ...)` for infrastructure-layer tests (see `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts` for the established pattern) — no real database connection in tests.
- Test include glob is `src/tests/**/*.test.ts` (`vitest.config.ts`).

---

### Task 1: Shared site URL constant + sitemap + robots

**Files:**
- Create: `src/lib/site-url.ts`
- Modify: `src/app/layout.tsx:22-23` (reuse the constant instead of a literal)
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

**Interfaces:**
- Produces: `SITE_URL: string` (`@lib/site-url`) — the canonical production URL, reused by `layout.tsx`'s `metadataBase`, `sitemap.ts`, and `robots.ts` so it's defined in exactly one place.

No dedicated unit test for this task — `site-url.ts` is a plain string constant, and `sitemap.ts`/`robots.ts` are plain data-returning files conforming to Next.js type contracts, consistent with how `manifest.ts` was treated as untested in the branding implementation plan (`2026-07-04-bobr-quiz-branding-implementation.md`, Task 5). Verification is manual, in Step 5.

- [ ] **Step 1: Create the shared constant**

```typescript
// src/lib/site-url.ts
export const SITE_URL = 'https://bobrquiz.vercel.app';
```

- [ ] **Step 2: Reuse it in `src/app/layout.tsx`**

Add the import alongside the existing imports:

```typescript
// src/app/layout.tsx
import { SITE_URL } from '@lib/site-url';
```

Change:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://bobrquiz.vercel.app'),
  title: 'Bobr Quiz',
  description:
    'Host live multiplayer quiz sessions with real-time scoring, speed bonuses, and instant leaderboards.',
};
```
to:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Bobr Quiz',
  description:
    'Host live multiplayer quiz sessions with real-time scoring, speed bonuses, and instant leaderboards.',
};
```

- [ ] **Step 3: Create `src/app/sitemap.ts`**

```typescript
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/join`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/host`, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
```

Only `/`, `/join`, and `/host` are public, indexable entry points — `/admin`,
`/login`, ephemeral per-session URLs (`/quiz/*/live`, `/play/*`), and API
routes are excluded (either auth-gated or single-use links).

- [ ] **Step 4: Create `src/app/robots.ts`**

```typescript
// src/app/robots.ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/login', '/api', '/quiz/*/live', '/play/*'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 5: Manual verification**

With `yarn dev` running, open `http://localhost:3000/sitemap.xml` and
`http://localhost:3000/robots.txt` directly in a browser (or via Playwright
MCP `browser_navigate`) and confirm both render valid XML/text with the
expected URLs and rules.

- [ ] **Step 6: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/site-url.ts src/app/layout.tsx src/app/sitemap.ts src/app/robots.ts
git commit -m "feat: add sitemap, robots.txt, and shared site URL constant"
```

---

### Task 2: Page-specific metadata for /join and /host

**Files:**
- Modify: `src/app/(player)/join/page.tsx`
- Modify: `src/app/(host)/host/page.tsx:1-16`

**Interfaces:** none (no new exports consumed elsewhere)

Both files are server components already (neither has a `'use client'`
directive — verified by reading both files during design), so each can
export its own `metadata` object directly, even though `join/page.tsx`
renders a client component (`PlayerJoinForm`) as a child. No dedicated unit
test — plain data-returning `Metadata` exports, same rationale as Task 1.

- [ ] **Step 1: Add metadata to `src/app/(player)/join/page.tsx`**

Change:
```tsx
import { Suspense } from 'react';
import { PlayerJoinForm } from '@/components/player/player-join-form';

export default function PlayerJoinPage() {
```
to:
```tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PlayerJoinForm } from '@/components/player/player-join-form';

export const metadata: Metadata = {
  title: 'Join a Bobr Quiz — Bobr Quiz',
  description: 'Enter a join code to play live multiplayer trivia.',
};

export default function PlayerJoinPage() {
```

- [ ] **Step 2: Add metadata to `src/app/(host)/host/page.tsx`**

Change:
```tsx
import { getServices } from '@application/services/factories';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';

export const dynamic = 'force-dynamic';
```
to:
```tsx
import { getServices } from '@application/services/factories';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { QuizListItemDTO } from '@application/dtos/quiz-admin.dto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Host a Quiz — Bobr Quiz',
  description: 'Pick a quiz and start a live session.',
};
```

- [ ] **Step 3: Manual verification**

With `yarn dev` running, view page source (or use Playwright MCP
`browser_navigate` + check the document title) for `http://localhost:3000/join`
and `http://localhost:3000/host` — confirm the browser tab title and
`<meta name="description">` match the new values.

- [ ] **Step 4: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add "src/app/(player)/join/page.tsx" "src/app/(host)/host/page.tsx"
git commit -m "feat: add page-specific SEO metadata to join and host pages"
```

---

### Task 3: Landing page content polish

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:** none (self-contained JSX additions)

No dedicated unit test — this is presentation markup with no logic, same
treatment as the mascot-placement tasks (7–10) in the branding implementation
plan, which relied on manual Playwright verification only.

- [ ] **Step 1: Add imports**

Change:
```tsx
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { BeaverMascot } from '@components/brand/beaver-mascot';
```
to:
```tsx
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { QrCode, Trophy, Zap } from 'lucide-react';
import { BeaverMascot } from '@components/brand/beaver-mascot';
```

- [ ] **Step 2: Add the "Free to use" badge to the hero**

Change:
```tsx
        <p className="mt-4 max-w-xl text-lg text-muted-foreground sm:text-xl">
          Create engaging quizzes, host live game sessions, and challenge your
          friends with real-time multiplayer trivia.
        </p>

        {/* CTAs */}
```
to:
```tsx
        <p className="mt-4 max-w-xl text-lg text-muted-foreground sm:text-xl">
          Create engaging quizzes, host live game sessions, and challenge your
          friends with real-time multiplayer trivia.
        </p>
        <Badge variant="secondary" className="mt-4">
          Free to use
        </Badge>

        {/* CTAs */}
```

- [ ] **Step 3: Add "Why Bobr Quiz" and testimonials-placeholder sections**

Change (the end of the "Features Section" and start of the footer):
```tsx
          </div>
        </div>
      </section>

      {/* Footer */}
```
to:
```tsx
          </div>
        </div>
      </section>

      {/* Why Bobr Quiz Section */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">
            Why Bobr Quiz
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Speed-based scoring
                </CardTitle>
                <CardDescription>
                  Faster correct answers earn more points, keeping every
                  round competitive down to the wire.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Live leaderboards
                </CardTitle>
                <CardDescription>
                  Rankings update in real time as players answer, so everyone
                  sees where they stand instantly.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Instant join
                </CardTitle>
                <CardDescription>
                  Players scan a QR code or type a join code to hop in — no
                  app install required.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Placeholder Section */}
      <section className="border-t px-4 py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          Be one of our first players — reviews coming soon.
        </p>
      </section>

      {/* Footer */}
```

- [ ] **Step 4: Manual verification**

Playwright MCP: navigate to `http://localhost:3000`, snapshot, confirm (in
both light and dark mode): the "Free to use" badge renders near the hero
CTAs, the "Why Bobr Quiz" section renders three icon cards below "How It
Works", and the testimonials placeholder renders its honest "coming soon"
message — no layout shift or overflow.

- [ ] **Step 5: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add free-to-use badge, feature highlights, and testimonials placeholder to landing page"
```

---

### Task 4: Demo quiz seed helper

**Files:**
- Modify: `src/infrastructure/database/prisma/seed-helpers.ts`
- Test: `src/tests/infrastructure/database/prisma/seed-helpers.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@infrastructure/database/prisma/client`; `SeedQuizResult` type (already defined in this file).
- Produces: `seedLaunchDemoQuiz(): Promise<SeedQuizResult>` — used by Task 5's runner script.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/infrastructure/database/prisma/seed-helpers.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const quizMocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

const questionMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock('@infrastructure/database/prisma/client', () => ({
  prisma: {
    quiz: quizMocks,
    question: questionMocks,
  },
}));

describe('seedLaunchDemoQuiz', () => {
  beforeEach(() => {
    quizMocks.upsert.mockReset();
    questionMocks.findMany.mockReset();
    questionMocks.createMany.mockReset();
  });

  it('upserts the quiz by a fixed join code and creates questions only once', async () => {
    const quiz = { id: 'demo-quiz-1', joinCode: 'TRYBOBR' };
    const createdQuestions = [{ id: 'q1' }, { id: 'q2' }];

    quizMocks.upsert.mockResolvedValue(quiz);
    questionMocks.findMany
      .mockResolvedValueOnce([]) // first run: no questions yet
      .mockResolvedValueOnce(createdQuestions) // first run: refetch after create
      .mockResolvedValueOnce(createdQuestions); // second run: already seeded

    const { seedLaunchDemoQuiz } = await import(
      '@infrastructure/database/prisma/seed-helpers'
    );

    await seedLaunchDemoQuiz();
    await seedLaunchDemoQuiz();

    expect(quizMocks.upsert).toHaveBeenCalledTimes(2);
    expect(quizMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { joinCode: 'TRYBOBR' } })
    );
    expect(questionMocks.createMany).toHaveBeenCalledTimes(1);
    expect(questionMocks.createMany.mock.calls[0][0].data).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test seed-helpers`
Expected: FAIL — `seedLaunchDemoQuiz is not a function` (or `undefined`)

- [ ] **Step 3: Write the implementation**

Add to `src/infrastructure/database/prisma/seed-helpers.ts`, alongside the
existing `QUESTION_TEMPLATES` constant and `seedSampleQuiz`/`seedDemoQuiz`
exports (do not modify those — this is a fully separate, additive export):

```typescript
const LAUNCH_DEMO_JOIN_CODE = 'TRYBOBR';

const LAUNCH_DEMO_QUESTIONS: Array<{
  text: string;
  type: QuestionType;
  options?: string[];
  correctAnswers: string[];
  points: number;
}> = [
  {
    text: 'What is the largest planet in our solar system?',
    type: 'multiple_choice',
    options: ['Mercury', 'Venus', 'Jupiter', 'Saturn'],
    correctAnswers: ['Jupiter'],
    points: 100,
  },
  {
    text: 'True or false: Mount Everest is the tallest mountain on Earth.',
    type: 'true_false',
    options: ['true', 'false'],
    correctAnswers: ['true'],
    points: 100,
  },
  {
    text: 'Which ocean is the largest?',
    type: 'multiple_choice',
    options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'],
    correctAnswers: ['Pacific'],
    points: 100,
  },
  {
    text: 'How many continents are there?',
    type: 'multiple_choice',
    options: ['5', '6', '7', '8'],
    correctAnswers: ['7'],
    points: 100,
  },
  {
    text: 'True or false: A group of crows is called a murder.',
    type: 'true_false',
    options: ['true', 'false'],
    correctAnswers: ['true'],
    points: 100,
  },
];

/**
 * Additive, idempotent seed for a production-safe demo quiz. Unlike
 * `seedSampleQuiz`/`seedDemoQuiz` (dev/E2E fixtures that assume a clean
 * database), this never calls `resetDatabase()` and is safe to re-run
 * against a live database — it upserts on the quiz's unique `joinCode` and
 * only creates questions the first time.
 */
export const seedLaunchDemoQuiz = async (): Promise<SeedQuizResult> => {
  const quiz = await prisma.quiz.upsert({
    where: { joinCode: LAUNCH_DEMO_JOIN_CODE },
    update: {},
    create: {
      title: 'Bobr Quiz Demo',
      status: 'Pending',
      timePerQuestion: 20,
      allowSkipping: true,
      joinCode: LAUNCH_DEMO_JOIN_CODE,
    },
  });

  const existingQuestions = await prisma.question.findMany({
    where: { quizId: quiz.id },
    orderBy: { orderIndex: 'asc' },
  });

  if (existingQuestions.length > 0) {
    return { quiz, questions: existingQuestions, players: [] };
  }

  const questionInputs: SeedQuestionInput[] = LAUNCH_DEMO_QUESTIONS.map(
    (template, index) => ({
      id: randomUUID(),
      quizId: quiz.id,
      text: template.text,
      options: template.options ?? [],
      correctAnswers: template.correctAnswers,
      type: template.type,
      points: template.points,
      orderIndex: index,
      isPublished: true,
    })
  );

  await prisma.question.createMany({ data: questionInputs });

  const questions = await prisma.question.findMany({
    where: { quizId: quiz.id },
    orderBy: { orderIndex: 'asc' },
  });

  return { quiz, questions, players: [] };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test seed-helpers`
Expected: PASS (1 test)

- [ ] **Step 5: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/database/prisma/seed-helpers.ts src/tests/infrastructure/database/prisma/seed-helpers.test.ts
git commit -m "feat: add idempotent launch demo quiz seed helper"
```

---

### Task 5: Demo quiz runner script

**Files:**
- Create: `src/infrastructure/database/prisma/seed-launch-demo.ts`
- Modify: `package.json:5-22` (`scripts` block)

**Interfaces:**
- Consumes: `seedLaunchDemoQuiz` from Task 4 (`@infrastructure/database/prisma/seed-helpers`)

No unit test — this is a thin CLI entrypoint mirroring the existing
`seed.ts` runner shape; Task 4's test already covers the underlying seed
logic. Verification is manual, in Step 3.

- [ ] **Step 1: Write the runner script**

```typescript
// src/infrastructure/database/prisma/seed-launch-demo.ts
import { prisma } from '@infrastructure/database/prisma/client';
import { seedLaunchDemoQuiz } from '@infrastructure/database/prisma/seed-helpers';

const main = async () => {
  console.info('Seeding launch demo quiz...');
  const { quiz, questions } = await seedLaunchDemoQuiz();

  console.info(
    `Demo quiz "${quiz.title}" ready with join code ${quiz.joinCode} and ${questions.length} questions.`
  );
};

main()
  .catch((error) => {
    console.error('Launch demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add the yarn script**

Change, in `package.json`'s `"scripts"` block:
```json
    "prisma:seed": "prisma db seed --schema ./src/infrastructure/database/prisma/schema.prisma",
```
to:
```json
    "prisma:seed": "prisma db seed --schema ./src/infrastructure/database/prisma/schema.prisma",
    "seed:demo": "tsx src/infrastructure/database/prisma/seed-launch-demo.ts",
```

This is a new top-level script (distinct from the `"prisma": { "seed": ... }`
config block at the bottom of `package.json`, which is fixed to `seed.ts` and
used only by `prisma db seed`) — `yarn seed:demo` runs `tsx` directly against
the new file, exactly like the pattern Prisma's own seed config uses.

- [ ] **Step 3: Manual verification**

Run `yarn seed:demo` against your local dev database and confirm the console
output reports the quiz title, join code, and question count. Re-run it a
second time and confirm it reports the same quiz/question count with no
errors (idempotency check against a real database, complementing Task 4's
mocked unit test). Then start `yarn dev`, log into `/admin`, and confirm
"Bobr Quiz Demo" appears in the quiz list.

Do **not** run this against production as part of this plan — the user runs
`yarn seed:demo` against production themselves after this ships (per the
design spec).

- [ ] **Step 4: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/database/prisma/seed-launch-demo.ts package.json
git commit -m "feat: add yarn seed:demo script for the production-safe demo quiz"
```

---

### Task 6: README launch blurb

**Files:**
- Modify: `README.md`

**Interfaces:** none

- [ ] **Step 1: Read the current README header**

Read `README.md`'s first ~20 lines to find the exact title line and the point
where technical setup instructions begin, so the new section is inserted in
the right place without duplicating or clobbering existing content.

- [ ] **Step 2: Insert the launch blurb**

Immediately below the title (and any existing one-line tagline) and above the
first setup/installation heading, insert:

```markdown
Bobr Quiz is a real-time multiplayer trivia game. A host starts a live
session and controls the pace; players join instantly from any device by
entering a short code or scanning a QR code — no app install, no account
required to play. Answers score based on speed and correctness, with a live
leaderboard updating after every question.

Want to see it in action? Join a live demo session with code `TRYBOBR` once
one is running, or head to the [production site](https://bobrquiz.vercel.app)
to host your own.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add launch blurb introducing Bobr Quiz"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`
Expected: all tests PASS, including the new Task 4 test (449 tests before
this plan; 450 after)

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: no errors

- [ ] **Step 3: Run a production build**

Run: `yarn build`
Expected: build succeeds; confirms `sitemap.ts` and `robots.ts` compile as
valid Next.js file-convention modules and the landing/join/host pages still
build cleanly.

- [ ] **Step 4: Playwright visual pass, light and dark**

Using Playwright MCP against the running dev server:
- `http://localhost:3000` — screenshot in light and dark mode; confirm the
  "Free to use" badge, "Why Bobr Quiz" section, and testimonials placeholder
  all render correctly with no layout shift
- `http://localhost:3000/join` and `http://localhost:3000/host` — confirm
  page titles reflect the new metadata (via browser tab title or page
  source)
- `http://localhost:3000/sitemap.xml` and `http://localhost:3000/robots.txt`
  — confirm both resolve with the expected content

- [ ] **Step 5: Update this plan's status and open a PR**

Mark this plan's tasks complete, then follow the project's PR workflow
(branch already created for this work per CLAUDE.md's master-protection
rule — do not commit to `master` directly).

---

## Status: 📋 Planning
