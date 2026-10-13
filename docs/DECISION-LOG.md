# Architecture Decision Log (ADRs)

This document tracks key architectural and technical decisions with timestamps, rationale, status, and trade-offs. Refer here when you need to understand **why** something is built a certain way.

## ADR-001: Domain-Driven Design (DDD-Lite) Architecture

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: N/A

### Decision
Organize the codebase into layers: Domain (business logic), Application (orchestration), Infrastructure (persistence), and Presentation (UI). DTOs are the boundary between layers.

### Rationale
- **Business logic isolation**: Domain layer stays framework-agnostic, testable without mocks
- **Clear contracts**: DTOs make API/hook signatures explicit and type-safe
- **Scalability**: Easy to add new adapters (Prisma → MongoDB) or services (auth, storage) without touching domain
- **Team collaboration**: Developers can work on layers independently

### Trade-offs
- ❌ **Upfront verbosity**: More files (entities, services, DTOs) than naive approach
- ✅ **Long-term maintainability**: Codebase scales to team of 5–20 without major refactors
- ✅ **Testing**: Pure domain tests fast, no mocks needed

### Implementation
See [ARCHITECTURE.md](ARCHITECTURE.md) → **Core Architecture** for full details.

---

## ADR-002: Prisma v7 + Driver Adapter (`@prisma/adapter-pg`)

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Updated**: 2025-12-05 (adapter upgrade)
**Supersedes**: N/A (first-class Prisma support)

### Decision
Use `@prisma/adapter-pg` with Supabase Postgres instead of Prisma's default Data Proxy or raw SQL clients.

### Rationale
- **Vercel compatibility**: Driver adapters work on Edge Functions (no Data Proxy limitations)
- **Type safety**: Prisma schema → generated client types (auto-complete, refactoring)
- **Migrations**: `prisma migrate` handles schema diffs automatically
- **Connection pooling**: Adapter manages Supabase Connection Pooler or PgBouncer
- **Single source of truth**: Schema file is version-controlled; migrations are reproducible

### Trade-offs
- ❌ **Custom instantiation**: Must wire adapter to client (not `import { PrismaClient }`)
- ❌ **Regeneration overhead**: Run `yarn prisma:generate` after schema edits
- ✅ **No serverless limitations**: Full SQL, no 10-second timeout like Data Proxy
- ✅ **Production-ready**: Supabase uses this pattern internally

### Implementation
```typescript
// src/infrastructure/database/client.ts
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

### Breaking Changes
- ❌ Cannot `import { PrismaClient }` from `@prisma/client` directly
- ✅ Import from `@infrastructure/database/prisma/generated-client` (barrel re-export)

### References
- [ARCHITECTURE.md](ARCHITECTURE.md) → **Design Decisions & Trade-offs** → **Prisma v7 + Driver Adapter**
- [guides/DATA-LAYER.md](guides/DATA-LAYER.md) → **Prisma Workflow**

---

## ADR-003: Supabase Realtime for <300ms Latency

**Status**: ✅ **ACTIVE** (R3+)
**Date**: ~2025-12-08
**Supersedes**: N/A (first-class realtime support)

### Decision
Use Supabase Realtime (HTTPS long-polling + WebSocket) to broadcast quiz updates instead of Socket.IO or raw WebSocket.

### Rationale
- **Simplicity**: No separate server; Supabase handles WebSocket infrastructure
- **HTTPS fallback**: Works on restricted networks (no CORS issues unlike Socket.IO)
- **RLS integration**: Realtime respects Supabase RLS policies (future R5+ security)
- **Latency budget**: <300ms achievable with Supabase's infrastructure
- **Scalability**: Auto-scales with Supabase (no self-hosted WebSocket server to manage)

### Trade-offs
- ❌ **Supabase dependency**: Cannot self-host; no local development parity
- ❌ **Pricing**: Realtime events count against Supabase message quota
- ✅ **No Socket.IO complexity**: One less server/config to manage
- ✅ **Built-in features**: Presence, room management, RLS

### Implementation
- **Adapter pattern**: `RealtimeClient` interface allows swapping implementations later
- **Cache updates**: Hooks manually push realtime events into TanStack Query caches
- **Channel structure**: One channel per quiz session (e.g., `quiz:${quizId}`)

### Monitoring
- Check Supabase logs for realtime message volume
- Alert on latency spike (>500ms broadcast delay)

### Migration Path (Future)
If Supabase realtime becomes cost-prohibitive, replace with Socket.IO without changing hook contracts (adapter pattern isolates UI from choice).

### References
- [ARCHITECTURE.md](ARCHITECTURE.md) → **Design Decisions & Trade-offs** → **Supabase Realtime over Socket.IO**
- [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) → **Realtime Adapter**

---

## ADR-004: TanStack Query + Manual Realtime Cache Sync

**Status**: ✅ **ACTIVE** (R2+)
**Date**: ~2025-12-08
**Supersedes**: N/A (first-class data fetching)

### Decision
Use TanStack Query for server state management and manually `setQueryData()` when realtime events arrive.

### Rationale
- **Single cache source**: TanStack Query is the arbiter of what's on screen
- **Optimistic updates**: Mutations update cache immediately, server confirms async
- **Retry logic**: Automatic retry + exponential backoff
- **Deduplication**: Automatic request deduplication (fast, fast, fast = 1 network call)
- **Offline-first**: Queue mutations, sync when online

### Trade-offs
- ❌ **Discipline required**: Must update Query caches on every realtime event
- ❌ **Manual cache key management**: Typos in query keys cause stale data
- ✅ **Predictable behavior**: No magic auto-syncing; easy to debug
- ✅ **Works with Relay, Apollo if needed**: Can swap providers later

### Pattern
```typescript
// Hook subscribes to realtime, updates cache
realtime.subscribe('quiz:state', (data: QuizDTO) => {
  queryClient.setQueryData(['quiz', quizId], data);
});
```

### Gotchas
- Query keys must match across `useQuery()` and `setQueryData()` calls
- Realtime events may arrive out of order; cache latest (CRDT if ordering critical in future)

### References
- [ARCHITECTURE.md](ARCHITECTURE.md) → **Data Flow** → **Realtime Event Path**
- [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) → **Hooks & TanStack Query**

---

## ADR-005: Email Allowlist for Admin (R4), Migrate to RLS (R5+)

**Status**: 🟡 **ACTIVE / PLANNED** (R4 live, R5 planned)
**Date**: 2025-12-20 (R4 implementation)
**Target Migration**: R5
**Supersedes**: N/A (first-class auth)

### Decision – R4 (Current)
Simple email allowlist in `.env` (`ADMIN_EMAILS`) checked by middleware.

### Rationale (R4)
- **Speed to market**: No time for complex auth; email check in middleware is 10 lines
- **MVP sufficient**: Team of 2–3 admins, can manage allowlist manually
- **Externally managed**: Supabase Auth handles user creation; we just check role

### Trade-offs (R4)
- ❌ **Not scalable**: Adding 100 admins requires editing env var + redeploy
- ❌ **No org/team support**: All admins have same permissions
- ✅ **Simple to understand**: New dev reads 1 file (middleware.ts), understands flow
- ✅ **No database migration**: Reuse Supabase `auth.users` table

### Decision – R5+ (Planned)
Migrate to Supabase RLS policies with custom JWT claims (`user.role`).

### Rationale (R5+)
- **Scalability**: RLS policies gate quiz access per user/org
- **Database-enforced**: Security not app layer; impossible to leak admin data
- **Extensible**: Add team/org fields without code changes
- **Compliance-ready**: Audit trails, fine-grained permissions

### Implementation (R5+)
1. Add `role` claim to Supabase JWT (custom claims)
2. Create RLS policies on `quiz`, `question`, `player` tables
3. Remove email allowlist from middleware (delete `.env` check)
4. Update hooks to trust RLS instead of app-layer auth

### Migration Path
R4 → R5 doesn't require user action. Policies activate in parallel; once verified in staging, flip switch in production.

### References
- [ARCHITECTURE.md](ARCHITECTURE.md) → **Design Decisions & Trade-offs** → **Email Allowlist + Supabase RLS**
- [guides/SETUP.md](guides/SETUP.md) → **Authentication & Authorization**

---

## ADR-006: Iterative Test Development (Manual → Automated)

**Status**: ✅ **ACTIVE** (R4+)
**Date**: 2025-12-20
**Supersedes**: N/A (testing methodology)

### Decision
Write E2E tests by **first manually exploring the UI via Playwright MCP**, then automating based on observations.

### Rationale
- **Discover real behavior**: Manual testing finds async form loading, timing issues, selector ambiguities before writing code
- **Reduce flake**: Tests based on manual observation match real user flows, fewer false negatives
- **Documentation**: Session notes from manual testing document working patterns for future devs
- **Efficiency**: Invest time upfront to avoid 10 failed CI runs due to bad wait conditions

### Trade-offs
- ❌ **Extra upfront time**: 30 min manual + 20 min test writing vs. 20 min guessing → 10 CI failures
- ✅ **Reduced maintenance**: Tests match real UI, fewer fixes later
- ✅ **Clear patterns**: Session notes document working selectors/timings for next test

### Pattern
1. **Manual phase**: Use Playwright MCP to navigate, interact, screenshot
   - Record all working selectors (button names, roles, text patterns)
   - Document timing issues (form load delays, async dialog population)
   - Screenshot at each step for reference

2. **Test writing phase**: Translate manual observations to Playwright assertions
   - Use role-based selectors discovered manually
   - Include wait conditions observed (e.g., wait for options to populate)
   - One assertion per test when possible

3. **Debug phase**: Run tests, fix failures against manual exploration notes
   - If test fails, recheck manual behavior (UI may have changed)
   - Add wait conditions if timing was missed

### Example
See **progress/sessions/2025-12-20-admin-question-crud-rewrite.md** for detailed walkthrough.

### References
- [ARCHITECTURE.md](ARCHITECTURE.md) → **Design Decisions & Trade-offs** → **Iterative Test Development**
- **Copilot Instructions** (root) → **MCP-Assisted Testing (Playwright MCP)**

---

## ADR-007: Tailwind 4 + shadcn UI for Styling

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: N/A (first-class styling)

### Decision
Use Tailwind 4 (CSS tokens) + shadcn UI primitives for all UI.

### Rationale
- **Consistency**: Design tokens (color, spacing, typography) centralized in `globals.css`
- **Accessibility**: shadcn components built on Radix UI (WCAG compliant)
- **Speed**: Rapid iteration with utility classes + pre-built components
- **Maintenance**: Single source of truth for styling (no inline styles, CSS-in-JS)
- **Team**: Designers work with tokens; developers reference them

### Trade-offs
- ❌ **Learning curve**: Tailwind utilities feel unfamiliar initially
- ❌ **Class name verbosity**: Some HTML elements have many classes
- ✅ **No runtime overhead**: Tailwind is build-time (no CSS-in-JS bundle cost)
- ✅ **Easy responsive**: Mobile-first design via `sm:`, `md:`, `lg:` prefixes

### Guidelines
1. **Use design tokens**: `text-primary`, `bg-accent`, not arbitrary colors
2. **Centralize dark mode**: `@dark` custom variant in `globals.css`
3. **Add new components via shadcn**: `yarn shadcn add <component>` (tracked in `components.json`)
4. **No inline styles**: If needed, add to `globals.css` as utility class

### References
- [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) → **shadcn + Tailwind Usage**
- **src/app/globals.css** – Token definitions

---

## ADR-008: Yarn as Package Manager

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: npm

### Decision
Use Yarn (v3+) exclusively; commit `yarn.lock` and `.nvmrc`.

### Rationale
- **Deterministic lockfile**: Same `yarn install` produces identical node_modules across CI/local
- **Workspaces**: Future support for monorepo if separating frontend/backend
- **Performance**: Faster install, parallel downloads
- **Team consistency**: `.nvmrc` locks Node version (everyone uses Node 22)

### Trade-offs
- ❌ **Not npm-compatible**: Team must use `yarn` or scripts fail
- ✅ **Better lock semantics**: Fewer "works on my machine" issues
- ✅ **Better CI caching**: Yarn cache is more predictable

### Guidelines
- ❌ Never use `npm install` or `npx` in this repo
- ✅ Always use `yarn` for installs
- ✅ Commit `yarn.lock` to git
- ✅ Use `yarn <script>` for all development

### References
- [guides/SETUP.md](guides/SETUP.md) → **Bootstrap via Yarn**

---

## ADR-009: Vitest for Unit/Integration Tests

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: Jest

### Decision
Use Vitest for all unit and integration tests; Playwright for E2E.

### Rationale
- **Speed**: Vitest ~5x faster than Jest (Vite-powered, no transformation overhead)
- **Compatibility**: Jest-compatible syntax, easy migration if needed
- **Path aliases**: Works out-of-box with `tsconfig.json` via `vite-tsconfig-paths`
- **HMR**: Test files auto-reload when edited (watch mode is instant)

### Trade-offs
- ❌ **Smaller ecosystem**: Fewer Jest plugins available
- ✅ **Simpler config**: Vitest.config.ts is shorter than Jest
- ✅ **Better TS integration**: No `@types/jest` needed

### Guidelines
- Domain/application tests: `src/tests/domain/**`, `src/tests/application/**`
- Integration tests: `src/tests/integration/**` (use `DATABASE_URL_TEST`)
- Run via `yarn test` or `yarn test:watch`
- Coverage: `yarn test:coverage`

### References
- [guides/SETUP.md](guides/SETUP.md) → **ESLint, Prettier, Vitest**
- **vitest.config.ts** – Configuration

---

## ADR-010: Playwright for E2E Testing

**Status**: ✅ **ACTIVE** (R4+)
**Date**: 2025-12-20
**Supersedes**: N/A (first-class E2E testing)

### Decision
Use Playwright with MCP (Model Context Protocol) for E2E tests, following manual-first exploration.

### Rationale
- **Multi-browser**: Test across Chrome, Firefox, Safari
- **MCP integration**: Playwright MCP provides interactive browser tools for manual exploration
- **Debugging**: Screenshots, video, trace files help diagnose flakes
- **Speed**: Parallel test execution, fast startup

### Trade-offs
- ❌ **Flake-prone if not careful**: Async operations require proper waits
- ✅ **Catches real user flows**: Tests what users actually see
- ✅ **Visual debugging**: Screenshots/video included in failed tests

### Pattern
1. Manual exploration via Playwright MCP (discover selectors, timing)
2. Write test based on manual observations
3. Run tests, fix failures against manual notes

### References
- **ARCHITECTURE.md** → **ADR-006: Iterative Test Development**
- **e2e/admin-question-crud.spec.ts** – Example with 9/9 passing tests
- **progress/sessions/2025-12-20-admin-question-crud-rewrite.md** – Detailed workflow

---

## ADR-011: Next.js App Router with Server/Client Components

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: Pages Router

### Decision
Use Next.js 15 App Router with Server Components (default) and Client Components (opt-in via `'use client'`).

### Rationale
- **Performance**: Server components fetch data server-side, send pre-rendered HTML
- **Security**: API keys stay on server; never leak to browser
- **DX**: File-based routing, automatic code splitting
- **React 19**: Async components, automatic client-side hydration optimization

### Trade-offs
- ❌ **Different mental model**: Mixing server/client code requires discipline
- ❌ **Debugging**: SSR errors harder to trace than pure SPA
- ✅ **Better Core Web Vitals**: Pre-rendering improves LCP
- ✅ **Scalability**: Runs on Vercel's Edge Network

### Guidelines
- **Server components** (default): Fetch data, call services, render static content
- **Client components** (`'use client'`): Interactive forms, hooks, event handlers
- **API routes** (`app/api/**`): REST endpoints, validate DTOs, call services
- **Layout nesting**: Reuse parent layouts (auth, header, sidebar)

### References
- [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) → **Next.js Routes**

---

## ADR-012: Supabase Storage for Media (Images)

**Status**: ✅ **ACTIVE** (R4+)
**Date**: 2025-12-20
**Supersedes**: N/A (first-class media support)

### Decision
Use Supabase Storage bucket (`quiz-media`) with RLS policies for image uploads.

### Rationale
- **Simplicity**: One Supabase project manages auth + database + storage
- **Performance**: CDN-backed URLs for fast image loading
- **Security**: RLS policies control who can upload/delete
- **Cost**: Cheap storage, pay only for what's used
- **Scalability**: Handles arbitrary file sizes (10MB limit per business rule)

### Trade-offs
- ❌ **Supabase dependency**: If Supabase goes down, can't upload
- ❌ **No multi-provider**: Cannot split between S3 and Cloudinary
- ✅ **One API**: Supabase SDK handles auth + uploads
- ✅ **No separate billing**: Included in Supabase plan

### Implementation
- Client-side image resize (max 1920x1080, 85% quality) before upload
- Public read access for images (bucket is public)
- Authenticated upload/delete (admin-only via middleware)
- Store URL in Question `mediaUrl` field

### RLS Policies
- **Public read**: Anyone can view images
- **Authenticated upload**: Only authenticated users (gated by middleware)
- **Authenticated delete**: Only authenticated users (further gated by admin email)

### References
- [guides/MEDIA-UPLOADS.md](guides/MEDIA-UPLOADS.md) – Complete setup guide
- **progress/dev-notes.md** – Media upload feature implementation notes

---

## ADR-013: TypeScript Path Aliases

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: Relative imports

### Decision
Use absolute path aliases (`@domain/*`, `@application/*`, etc.) everywhere.

### Rationale
- **Refactoring**: Moving folders doesn't break imports
- **Readability**: `@domain/entities/quiz` is clearer than `../../../domain/entities/quiz`
- **Consistency**: Enforced by config; no relative path confusion

### Aliases
```
@domain      → src/domain
@application → src/application
@infrastructure → src/infrastructure
@components  → src/components
@hooks       → src/hooks
@lib         → src/lib
@ui          → src/components/ui
```

### Configuration
- **tsconfig.json**: Define paths
- **eslint.config.mjs**: Ensure ESLint respects aliases
- **vitest.config.ts**: `vite-tsconfig-paths` plugin for test resolution

### References
- **tsconfig.json** – Path definitions
- **vitest.config.ts** – Vitest configuration

---

## ADR-014: Environment Variables & `.env` Files

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: N/A

### Decision
Manage environment variables via `.env.example` (tracked), `.env.local` (git-ignored), and `NEXT_PUBLIC_*` for client-side vars.

### Rationale
- **Security**: `.env.local` never committed; secrets stay local/CI only
- **Documentation**: `.env.example` shows required vars; onboarding copy → paste
- **Client/server split**: `NEXT_PUBLIC_*` vars available in browser (safe for public keys)
- **TypeScript safety**: Custom validation schema in `src/lib/env-validation.ts`

### Guidelines
1. **Define in `.env.example`**: Every var should have an example
2. **Private vars** (start with `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`):
   - Never commit to `.env.local`
   - Only available on server
   - Examples: `DATABASE_URL`, `ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Public vars** (start with `NEXT_PUBLIC_`):
   - Safe to leak (public API keys, URLs)
   - Embedded in browser bundles
   - Examples: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### References
- [guides/SETUP.md](guides/SETUP.md) → **Environment Files**
- **src/lib/env-validation.ts** – Validation schema

---

## ADR-015: Semantic Versioning & Release Numbering

**Status**: ✅ **ACTIVE** (R0+)
**Date**: ~2025-11-30
**Supersedes**: N/A

### Decision
Use release numbers (R0, R1, ..., R6) for major features; defer semantic versioning to post-launch.

### Rationale
- **Internal tracking**: R0 = foundation, R1 = domain/data, R2 = host MVP, etc.
- **Clear scope**: Each release has explicit acceptance criteria
- **Roadmap clarity**: Stakeholders understand what ships when
- **Post-launch**: Switch to semantic versioning (1.0.0, 1.1.0, 2.0.0) for public releases

### Release Definitions
| Release | Goal               | Status        |
| ------- | ------------------ | ------------- |
| R0      | Foundation         | ✅ Complete    |
| R1      | Domain & Data      | ✅ Complete    |
| R2      | Host MVP           | ✅ Complete    |
| R3      | Player MVP         | ✅ Complete    |
| R4      | Content Admin      | ✅ Complete    |
| R5      | Realtime & Scoring | 📋 In Progress |
| R6      | Polish & Launch    | 📅 Planned     |

### References
- [plan.md](plan.md) → **Release Roadmap**
- [PROGRESS.md](progress/PROGRESS.md) – Release tracking

---

## ADR-016: Documentation as Code

**Status**: ✅ **ACTIVE** (R0+, enforced R4+)
**Date**: ~2025-12-08
**Updated**: 2026-01-24 (reorganized per ADR-017)
**Supersedes**: N/A

### Decision
All documentation lives in `docs/**` as Markdown, version-controlled with code. Update docs immediately when code changes.

### Rationale
- **Single source of truth**: Documentation ≠ code = version mismatch
- **History**: Git blame on doc files shows when/why decisions changed
- **Accessibility**: No wiki logins required; just read MD in editor
- **CI-able**: Can lint doc links, check for broken references

### Guidelines
1. **Update docs when code changes**: If you modify architecture, update [ARCHITECTURE.md](ARCHITECTURE.md)
2. **One ADR per decision**: Timestamp + rationale + trade-offs
3. **Session notes**: After finishing a work session, update [progress/dev-notes.md](progress/dev-notes.md)
   (Superseded by ADR-022.)
4. **Link liberally**: Use relative links so docs are IDE-navigable

### References
- **docs/INDEX.md** – Navigation hub
- [ARCHITECTURE.md](ARCHITECTURE.md) – Live architecture reference
- [DECISION-LOG.md](DECISION-LOG.md) – This file

---

## ADR-017: Documentation Reorganization (2026-01-24)

**Status**: ✅ **ACTIVE** (R5+)
**Date**: 2026-01-24
**Supersedes**: Previous scattered structure

### Decision
Reorganize documentation into clear hierarchy:
- **Core references**: ARCHITECTURE.md, DECISION-LOG.md, plan.md, INDEX.md
- **Guides**: guides/SETUP.md, guides/DDD-STRUCTURE.md, guides/DATA-LAYER.md, guides/PRESENTATION-LAYER.md, guides/MEDIA-UPLOADS.md
- **Progress tracking**: progress/PROGRESS.md (index), progress/sessions/*, progress/actions/*, progress/dev-notes.md

### Rationale
- **Navigation clarity**: Single INDEX.md entry point vs. fragmented structure
- **Role-based guidance**: "I'm a backend engineer" → guides/DATA-LAYER.md
- **Reduced cognitive load**: One place for architecture, one for roadmap, one for progress
- **Simplified onboarding**: New team members have clear path through docs

### Trade-offs
- ❌ **One-time migration effort**: Moved/renamed 6 files, updated cross-references
- ✅ **Future-proof**: New guides (guides/TESTING.md, guides/DEPLOYMENT.md) fit naturally
- ✅ **Reduced searching**: No ambiguity about where to find info

### Changes
1. Created [INDEX.md](INDEX.md) – Master navigation hub
2. Created [ARCHITECTURE.md](ARCHITECTURE.md) – Consolidated structure.md + 01-04 steps + design decisions
3. Created [DECISION-LOG.md](DECISION-LOG.md) – All ADRs in one file (this file)
4. Moved 01-04 to guides/SETUP.md, DDD-STRUCTURE.md, DATA-LAYER.md, PRESENTATION-LAYER.md
5. Created [progress/PROGRESS.md](progress/PROGRESS.md) – Progress tracking index
6. Kept **plan.md** (roadmap), **progress/dev-notes.md** (execution log), **progress/sessions/\***, **progress/actions/\***

### References
- [INDEX.md](INDEX.md) – Start here for navigation
- [ARCHITECTURE.md](ARCHITECTURE.md) – New unified reference
- [guides/](guides/) – Setup & architecture guides

---

## ADR-018: Separate Production Supabase Project (2026-07-04)

**Status**: ✅ **ACTIVE** (R6)
**Date**: 2026-07-04
**Supersedes**: N/A

### Decision
Production runs on its own Supabase project, `quiz-game-prod`. Preview and Development keep sharing the existing `Quiz-game-dev` project. Only Production's Vercel variables were repointed. `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` were removed from Production only. The new project started empty, with no data copied.

### Rationale
- Production, Preview and Development had silently shared one Supabase project since the app's first auto-deploy in April 2025, confirmed by hash-comparing every Vercel env var.
- Local dev, every PR preview and the live site therefore read and wrote the same database, and the test admin account had admin access to what was presented as production.
- The old project held no real user data (0 quizzes, 2 leftover test players), so a fresh start lost nothing. The plan notes that real data would need a migration instead.
- The test credentials exist only for Playwright E2E tests, which never run against production.

### Rejected
- Supabase Branching (keep the current project as production, branch for dev/preview): `list_branches` errored on this project and `create_branch` needs a cost confirmation, so availability and price were uncertain. A second free-tier project was the unambiguous path.

### References
- [progress/plans/2026-07-03-r6-supabase-prod-isolation.md](progress/plans/2026-07-03-r6-supabase-prod-isolation.md) – Steps, snags and technical decisions

---

## ADR-019: `master` Is Branch-Protected; All Work Goes Through a PR (2026-07-04)

**Status**: ✅ **ACTIVE**
**Date**: 2026-07-04
**Supersedes**: N/A

### Decision
Nothing is committed directly to `master`. It is branch-protected and requires a PR. Work goes on a feature branch and reaches `master` through a PR, treated as a hard rule even though branch protection would enforce it anyway. If `master` is checked out locally with commits on it, create a new branch from HEAD; do not rename `master`.

### Rationale
- The rule was added to the project's CLAUDE.md in the same commit that recorded the production isolation work (0a21ba5). The commit message gives it no separate reasoning.
- Context from the same-day plan: every push to `master` auto-deploys to production through Vercel's GitHub integration (see ADR-018). The commit message does not link that to the rule.

### Rejected
Not recorded.

### References
- Commit 0a21ba5, "docs: record R6 prod isolation completion, add master-protection rule"
- [progress/plans/2026-07-03-r6-supabase-prod-isolation.md](progress/plans/2026-07-03-r6-supabase-prod-isolation.md) – Auto-deploy to production on push to `master`

---

## ADR-020: Presence Channel Reuse and Heartbeat Resilience (2026-07-05)

**Status**: ✅ **ACTIVE**
**Date**: 2026-07-05 (PRs #58, #59)
**Supersedes**: N/A

### Decision
- A DB-write failure in `persistPresence()` is re-thrown into the existing retry, backoff and circuit-breaker chain instead of being swallowed. The DB persist cadence is decoupled from the Realtime `track()` cadence (about 20s with jitter against 10s), and the heartbeat slows while the circuit is open. Track and persist loops keep independent failure streaks.
- `PresenceTrackerProvider` is mounted globally in `AppProviders`, and `usePresenceTracker()` throws instead of returning null.
- `SupabasePresenceTracker` keeps a channel alive for a 3-second grace period after `unsubscribe()`. A new `subscribe()` for the same quiz cancels the teardown and reuses the channel, and presence callbacks go through a mutable handler object, so `.on()` is never called twice.

### Rationale
- Heartbeat: the retry chain already existed but never saw DB failures, so the host aged a healthy player to disconnected and removed them with no player-side feedback. Re-throwing reuses all of it.
- Provider: it was never rendered, so no heartbeat ran in production at all. The nullable hook return type hid that.
- Channel reuse: `realtime-js` throws on `.on()` after `subscribe()`, and `RealtimeClient.channel(topic)` dedupes by topic until an async close handshake finishes, so deleting the map entry synchronously was not enough.
- A residual race (a new `subscribe()` landing during the in-flight teardown after the grace period) is accepted: closing it needs an async `subscribe()`, which breaks the interface.

### Rejected
- Server-side presence aggregation (cron or worker batching `lastSeenAt`): needs always-on infrastructure Vercel's serverless model lacks. Revisit if player counts grow well beyond a handful per game.
- Slowing both loops: only the persist call loads Postgres.
- Mounting the provider only in the player route group: the global mount matches `RealtimeClientProvider`.
- Synchronous `teardown()` before recreating the channel (could not confirm it detaches from the internal registry) and never tearing down (no cleanup path).

### References
- [progress/plans/2026-07-05-presence-heartbeat-resilience-design.md](progress/plans/2026-07-05-presence-heartbeat-resilience-design.md)
- [progress/plans/2026-07-05-presence-tracker-provider-design.md](progress/plans/2026-07-05-presence-tracker-provider-design.md)
- [progress/plans/2026-07-05-presence-channel-reuse-design.md](progress/plans/2026-07-05-presence-channel-reuse-design.md)

---

## ADR-021: One Realtime Binding per (Channel, Event), Fanned Out via a Handler Registry (2026-08-01)

**Status**: ✅ **ACTIVE**
**Date**: 2026-08-01 (PR #63)
**Supersedes**: N/A

### Decision
`SupabaseRealtimeClient` makes exactly one real `channel.on()` call per unique `(channelName, event)` pair. That binding fans out to a `Set` of handlers, and `subscribe()` and `unsubscribe()` add to and delete from the set. The public `RealtimeClient` interface is unchanged. The per-channel listener count that decides when to call `channel.unsubscribe()` stays.

### Rationale
- Before, every `subscribe()` call bound a new real listener, and `@supabase/realtime-js` exposes no public `channel.off()` to remove one. One player tab accumulated about 180 stacked `answer:ack` handlers in about 5 minutes, each triggering a DB round-trip per broadcast.
- The registry uses only the documented `on`, `subscribe` and `unsubscribe` methods.
- `usePlayerSession`'s query key was also memoized, since its per-second effect churn was the trigger. This is defense in depth, not the fix.

### Rejected
- Filtering `RealtimeChannel.bindings` to remove one callback: it depends on undocumented internals that could break silently on a dependency bump.

### References
- [progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md](progress/plans/2026-08-01-realtime-broadcast-listener-leak-fix.md) – Goal, architecture and decision log

---

## ADR-022: One Record per Piece of Work (2026-10-11)

**Status**: ✅ **ACTIVE**
**Date**: 2026-10-11
**Supersedes**: ADR-016 guideline 3 (session notes in `progress/dev-notes.md`)

### Decision
Each piece of work leaves a spec, a plan, a committed ledger (`progress.md` and `*-report.md`, force-added) and one index line in `progress/PROGRESS.md`. `DECISION-LOG.md` gets an entry only for a decision that outlives the work. There are no new session files and no new `dev-notes.md` lines; both are frozen history. Specs and plans stay in `docs/progress/plans/`.

### Rationale
- The same work was written up three to six times. The PR #63 fix was told in its plan, a session file, PROGRESS.md, dev-notes.md and two ledger reports, while PRs #58-#60 had no summary at all.
- In the PR #63 sample, every useful line in the session file was already in the plan or the ledger.
- Only `progress.md` and `*-report.md` are committed from a ledger: the review diffs are regenerable and the task briefs re-paste the plan (about 2,200 of the ~2,455 ledger lines).

### Rejected
- Keeping session files as a summary.
- Moving specs and plans to the superpowers defaults (`docs/superpowers/`): it splits the design history at 2026-10 or costs a move of 21 files and their links.
- Fixing staleness only: it removes neither the duplication nor the competing workflow.

### References
- [progress/plans/2026-10-11-claude-config-and-records-design.md](progress/plans/2026-10-11-claude-config-and-records-design.md)
- [progress/plans/README.md](progress/plans/README.md) – The convention as a table

---

## Open ideas (not decisions)

### TBD: Audit Logging (R6)
- Database table for admin actions (create/update/delete quiz, question, player)
- API route to retrieve audit trail per quiz

### TBD: PostHog Analytics (R6)
- Instrumentation for user journeys
- Decide: event-driven (action logs in API) vs. client-side tracking

### TBD: Multi-tenancy / Teams (Post-launch)
- Support org-based quiz ownership
- RLS policies gate access per org

---

## See Also
- [ARCHITECTURE.md](ARCHITECTURE.md) – Detailed architecture reference
- [INDEX.md](INDEX.md) – Documentation navigation hub
- [plan.md](plan.md) – Product roadmap
- [PROGRESS.md](progress/PROGRESS.md) – Release tracking
