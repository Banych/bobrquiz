# Bobr Quiz – Copilot Instructions

## Architecture Overview
This is a **Next.js 15 + Prisma v7 + Supabase** quiz game using **DDD-lite** (Domain-Driven Design) patterns. The critical data flow is:
```
Next.js request → DTO (zod) → use-case/service → domain entities → Prisma repository → Supabase Postgres
```

**Key architectural rules:**
- Domain logic lives in `src/domain/**` (entities, aggregates, value objects) and stays framework-agnostic
- Application layer (`src/application/**`) orchestrates via use cases/services, returns DTOs
- Infrastructure (`src/infrastructure/**`) implements repositories with Prisma
- Presentation (`src/app/**`, `src/components/**`, `src/hooks/**`) consumes only DTOs—never entities or Prisma types

**Layer Import Rules (quick check):**
```
Domain      → imports nothing from app/infra/presentation
Application → imports from @domain/* only
Infrastructure → imports from @domain/*, @application/* only
Presentation  → imports from @application/dtos/* only (never entities, never Prisma)
```

## Critical Prisma v7 Setup
**Prisma uses driver adapters** (not default engine). This is NOT the standard Prisma config:

1. **Generator output:** Schema at `src/infrastructure/database/prisma/schema.prisma` uses:
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "./generated/client"
   }
   ```

2. **Client instantiation:** `src/infrastructure/database/prisma/client.ts` instantiates with `@prisma/adapter-pg`:
   ```ts
   import { PrismaPg } from '@prisma/adapter-pg';
   import { PrismaClient } from './generated-client';

   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
   const prisma = new PrismaClient({ adapter });
   ```

3. **Import path:** All code imports Prisma types via `@infrastructure/database/prisma/generated-client` barrel (NOT `@prisma/client`)

4. **Build workflow:** `package.json` has `"prebuild": "yarn prisma:generate"` so Vercel/CI regenerate the client before `next build` (generated files are git-ignored)

**Common mistakes to avoid:**
- ❌ Importing from `@prisma/client` directly
- ❌ Forgetting to run `yarn prisma:generate` after schema changes
- ❌ Trying to instantiate PrismaClient without the adapter
- ❌ Using `any` type instead of proper domain types (entities, DTOs, aggregates)

## Type Safety Guidelines
**CRITICAL:** Maintain strict TypeScript typing throughout the codebase:

**Never use `any` type unless absolutely necessary:**
- ✅ Use proper domain types: `Player`, `Quiz`, `Question`, `Answer`, `QuizSessionAggregate`
- ✅ Import types explicitly: `import type { Player } from '@domain/entities/player'`
- ✅ Use generic constraints: `Map<string, Player>` not `Map<string, any>`
- ✅ Define explicit return types on all functions and methods
- ❌ Never use `any` in function parameters or return types
- ❌ Never use `any` in variable declarations
- ❌ Never use `any` in type assertions or casts

**When encountering missing types:**
1. Check if the type exists in domain/application/infrastructure layers
2. If missing, create a proper type definition or DTO schema (zod)
3. Use `unknown` with type guards if the type truly cannot be known
4. Document why `unknown` is necessary with inline comments

**Examples:**
```typescript
// ❌ BAD: Using any
private buildSummary(quiz: any, question: any): SummaryDTO {
  const answers = quiz.answers.get(question.id);
  return { ... };
}

// ✅ GOOD: Explicit types
private buildSummary(
  quiz: QuizSessionAggregate,
  question: Question
): RoundSummaryDTO {
  const answers: Answer[] = quiz.answers.get(question.id) || [];
  return { ... };
}
```

## Iterative Development Approach
This codebase enforces an **iterative, incremental development style** via `.github/instructions/iterative-approach-for-work-with-code.instructions.md` (applies to all files):

**Core principles:**
- Break complex tasks into small, testable increments (single function/class/module)
- **Test each piece immediately before moving to the next** - this is mandatory, not optional
- Refactor after each working increment—don't accumulate technical debt
- Document as you go (inline comments + session logs in `docs/progress/`)
- Plan work upfront: outline sub-tasks before coding

**Testing Requirements (MANDATORY):**
1. **Write tests WHILE implementing**, not after - they guide your design
2. **Every new use case** requires a test file in `src/tests/application/use-cases/`
3. **Every new repository** requires a test file in `src/tests/infrastructure/repositories/`
4. **New domain methods** must have tests added to existing test files (e.g., `quiz-session-aggregate.test.ts`)
5. **Minimum coverage:** Happy path + error cases + edge cases
6. **Test patterns:**
   - Use cases: Mock repositories, test success + "not found" + validation errors
   - Repositories: Mock Prisma client, test CRUD operations + edge cases
   - Domain: Direct entity/aggregate testing, no mocks needed

**When you skip tests, you break the development flow.** Tests catch integration issues immediately and serve as living documentation.

**Why this matters:** This project uses DDD layers with strict boundaries (domain → application → infrastructure → presentation). Attempting to implement features "all at once" across layers leads to mismatched contracts between DTOs/entities/repos. Instead:
1. Start with domain entities and test behavior
2. Build application use cases that orchestrate them
3. Wire infrastructure (Prisma repos) and verify with integration tests
4. Finally expose via API routes and hooks

**When adding features:** See the pattern in `docs/progress/sessions/*.md`—each session breaks goals into concrete steps, marks progress incrementally, and documents decisions. Follow this when implementing new quiz flows, player actions, or realtime features.

## Planning Workflow (Scrum Board Alternative)

**CRITICAL:** For any non-trivial feature or multi-step work, create a planning file BEFORE implementation.

### When to Create Planning Files

**Required for:**
- Multi-phase features (R5 Phase 4.3, R6 Phase 1, etc.)
- Features with >5 implementation steps
- Work estimated at >2 hours
- Cross-layer changes (domain → application → infrastructure → presentation)
- Features with complex technical decisions or trade-offs

**Optional for:**
- Single-file bug fixes
- Small refactorings
- Documentation updates
- Trivial UI tweaks

### Planning File Structure

**Location:** `docs/progress/plans/YYYY-MM-DD-feature-name.md`

**Required Sections:**
1. **Header** - Date, status (📋/🚧/✅/⏸️/❌), estimate, dependencies
2. **Overview** - Current state, what's missing, context
3. **Goals** - High-level objectives with checkboxes
4. **Implementation Steps** - Detailed tasks (atomic, <1hr each) with checkboxes
5. **Technical Decisions** - Architecture choices, trade-offs, rationale
6. **Success Criteria** - Functional + non-functional requirements
7. **Files Changed** - List of new/modified files
8. **Time Estimates** - Breakdown by step
9. **Notes & Observations** - Fill in during implementation
10. **Completion Checklist** - Final quality gates

**Example:**
```markdown
# Phase 4.3: Player Reconnection Flow

**Date Created:** 2026-01-31
**Status:** 🚧 In Progress
**Estimated Time:** ~3.5 hours
**Dependencies:** Phase 4.1 ✅, Phase 4.2 ✅

## Implementation Steps

### Step 1: useNetworkStatus Hook
- [x] Create hook that monitors navigator.onLine
- [x] Add event listeners for online/offline
- [x] Write tests (8 tests)
- [x] Success criteria: Detects offline within 1s

### Step 2: Update usePresence
- [ ] Add retry logic with exponential backoff
- [ ] Track last successful heartbeat
- [ ] Add onConnectionError callback
...
```

### Workflow Integration

**1. Before Starting Work:**
```bash
# Create planning file
touch docs/progress/plans/2026-01-31-feature-name.md
# Fill out all sections with checkboxes
# Set status to 📋 Planning
```

**2. During Implementation:**
- Update status to 🚧 In Progress
- Check off steps as you complete them (real-time, not batched)
- Add notes/observations in "Notes & Observations" section
- Update estimates if scope changes

**3. In Session Files:**
- Reference the planning file at the top
- Summarize daily progress with links to plan steps
- Document actual vs. estimated time
- Keep session files DRY (don't duplicate plan details)

**Example session file:**
```markdown
# R5 Phase 4.3 Implementation Session

**Date:** 2026-01-31
**Plan:** [Phase 4.3 Player Reconnection](../plans/2026-01-31-r5-phase4.3-player-reconnection.md)
**Status:** 🚧 In Progress (Step 3/7)

## Today's Progress
- [x] Step 1: useNetworkStatus hook ✅ (30 min, estimated 30 min)
- [x] Step 2: Update usePresence ✅ (45 min, estimated 30 min)
- [ ] Step 3: useReconnection hook (in progress)
```

**4. After Completion:**
- Check all items in "Completion Checklist"
- Update status to ✅ Complete
- Document actual time vs. estimate in session file
- Keep planning file for reference (don't delete)

### Benefits

- **Visibility:** Always know what's in progress and what's next
- **Accountability:** Clear checkboxes prevent "forgot to test" situations
- **Estimation:** Track actual vs. estimated time to improve planning
- **Knowledge transfer:** New developers see full context for past decisions
- **Prevents scope creep:** Forces upfront thinking about all requirements

### Template

See `docs/progress/plans/README.md` for full template and examples.

## MCP-Assisted Testing (Playwright MCP)
**CRITICAL:** Always use **manual-first test development** when writing or debugging E2E tests:

### Required Workflow: Manual Testing → Write Test Cases

1. **Manual Exploration Phase:**
   - Activate tools: `activate_browser_navigation_tools()` and `activate_page_capture_tools()`
   - Navigate: `mcp_microsoft_pla_browser_navigate(url)` to load pages
   - Interact: Use `mcp_microsoft_pla_browser_type()`, `mcp_microsoft_pla_browser_click()` to test complete flows
   - Inspect: `mcp_microsoft_pla_browser_snapshot()` to see page state and locators
   - Document: Record every working selector, dialog behavior, timing issue, and validation rule

2. **Test Writing Phase:**
   - Write simple, focused tests that **exactly match** observed behavior
   - Use role-based selectors discovered during manual testing
   - Include timing checks for async operations (form loading, dialog closing)
   - One assertion per test when possible

3. **Debugging Phase:**
   - Run tests and fix specific failures
   - Use manual testing to verify fixes before updating test code

**Why this matters:** Writing E2E tests without manual verification often leads to:
- Overcomplicated wait conditions and timeouts
- Wrong locator strategies (e.g., strict mode violations from ambiguous selectors)
- Tests that don't match real user flows
- Race conditions from async form loading/dialog operations

**Success Pattern (admin-question-crud.spec.ts):**
- Manual testing discovered all working selectors and timing issues
- Wrote 9 clean tests based on observations
- Fixed 2 bugs during first run (API endpoint, async form loading)
- Result: 9/9 tests passing, maintainable code

**Test Writing Examples:**
```typescript
// ❌ DON'T: Write tests without manual verification
test('should edit question', async ({ page }) => {
  await page.click('button:has-text("Edit")'); // Might match multiple buttons
  await page.fill('input', 'New Text'); // Which input?
  await page.click('button:has-text("Save")');
  // Missing: Wait for async operations, form loading
});

// ✅ DO: Manual test first, then write based on observations
test('should edit question', async ({ page }) => {
  // Click edit (discovered selector via manual testing)
  await page.getByRole('button').filter({ hasText: /^$/ }).first().click();

  // Wait for form to load data (discovered during manual testing)
  await expect(page.getByRole('textbox', { name: 'Question *' }))
    .toHaveValue('Original Question');
  await expect(page.getByRole('textbox', { name: 'Option 1' }))
    .toHaveValue('A');

  // Make changes
  await page.getByRole('textbox', { name: 'Question *' }).fill('Updated');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Wait for dialog to close (discovered timing issue)
  await expect(page.getByRole('dialog', { name: 'Edit Question' }))
    .not.toBeVisible();

  // Verify result
  await expect(page.getByRole('cell', { name: 'Updated' })).toBeVisible();
});
```

**Viewing test results:** After running E2E tests with `yarn test:e2e`, Playwright automatically serves an HTML report (usually on port 9323). Navigate directly to the report using `mcp_microsoft_pla_browser_navigate('http://localhost:9323')` to inspect test results, click on failed tests, view screenshots, and see detailed error messages. If the report shows stale results, kill the old server with `lsof -ti:9323 | xargs kill -9` and restart with `yarn playwright show-report`.

**Reference:** See `docs/progress/sessions/2025-12-20-admin-question-crud-rewrite.md` for complete example of manual-first test development workflow.

## MCP Toolbox Configuration
The project uses three MCP servers configured in `.vscode/mcp.json` for enhanced development workflows:

### Supabase MCP (HTTP)
**Purpose:** Manage Supabase project resources directly from Copilot
**Capabilities:**
- Execute SQL queries and manage database migrations
- Create and manage development branches
- Deploy and retrieve Edge Functions
- Get security/performance advisors (check for missing RLS policies after DDL changes)
- View logs by service type (api, postgres, auth, storage, realtime, edge-function)
- Retrieve project URL and publishable API keys

**Common workflows:**
- After schema changes: `mcp_supabase_get_advisors(type: 'security')` to check for RLS policy issues
- Debug runtime issues: `mcp_supabase_get_logs(service: 'postgres')` or `'edge-function'`
- Get connection info: `mcp_supabase_get_project_url()`, `mcp_supabase_get_publishable_keys()`

### Playwright MCP (stdio)
**Purpose:** Interactive E2E testing and browser automation
**Capabilities:**
- Navigate pages, click, type, drag elements
- Take screenshots and accessibility snapshots
- Evaluate JavaScript on page or elements
- View console messages and network requests
- Install browser if missing

**Usage pattern:** See "MCP-Assisted Testing (Playwright MCP)" section above

### Context7 MCP (HTTP)
**Purpose:** Retrieve up-to-date library documentation and code examples
**Capabilities:**
- Resolve library IDs from package names via `mcp_context7_resolve-library-id(libraryName)`
- Search docs and get code examples via `mcp_context7_search-docs(context7CompatibleLibraryID, query)`

**Common workflows:**
- Check latest TanStack Query API: `mcp_context7_resolve-library-id('tanstack-query')` then `mcp_context7_search-docs(id, 'useQuery options')`
- Verify Next.js patterns: `mcp_context7_resolve-library-id('nextjs')` then query for specific feature
- Look up Prisma v7 adapter API: `mcp_context7_resolve-library-id('prisma')` then `mcp_context7_search-docs(id, 'adapter-pg')`

### Postman MCP (stdio)
**Purpose:** API testing, collection management, and API specification workflows
**Capabilities:**
- **Authentication & Discovery:**
  - Get current user context via `mcp_com_postman_p_getAuthenticatedUser()`
  - Discover available tools with `mcp_com_postman_p_getEnabledTools()`
- **Collections:**
  - Run collections with detailed test results via `mcp_com_postman_p_runCollection()`
  - Create, update, retrieve collections
  - Replace entire collection contents via `mcp_com_postman_p_putCollection()` (supports async with `Prefer: respond-async` header)
  - Generate OpenAPI specs from collections via `mcp_com_postman_p_generateSpecFromCollection()`
- **Environments:**
  - Create, retrieve, update environments
  - Replace environment contents via `mcp_com_postman_p_putEnvironment()`
- **Mock Servers:**
  - Create, update, retrieve, publish mock servers
  - Update mock configuration via `mcp_com_postman_p_updateMock()`
- **API Specifications:**
  - Create spec files with `mcp_com_postman_p_createSpecFile()`
  - Get spec info via `mcp_com_postman_p_getSpec()`
  - Update spec properties via `mcp_com_postman_p_updateSpecProperties()`
  - List generated collections from spec via `mcp_com_postman_p_getSpecCollections()`
- **Tagging:**
  - Get tagged entities (workspaces, APIs, collections) via `mcp_com_postman_p_getTaggedEntities()`
- **Task Monitoring:**
  - Check async task status via `mcp_com_postman_p_getStatusOfAnAsyncApiTask()`

**Common workflows:**
- **API testing:** `mcp_com_postman_p_runCollection(collectionId: '<owner>-<uuid>', environmentId: '<optional>')` with support for iteration count, timeouts, abort/stop on error
- **User context:** `mcp_com_postman_p_getAuthenticatedUser()` to resolve "my workspaces" or "my collections" queries
- **Spec generation:** Generate OpenAPI/AsyncAPI specs from existing collections, then sync back to collections
- **Mock server setup:** Create mocks for testing, update default responses, publish for public access
- **Collection sync:** Use `putCollection()` for bulk updates (include IDs to update, omit IDs to recreate)

**Note:** All MCP servers require Node 22 (use `nvm use` if switching versions). Environment variables like `POSTMAN_API_KEY` and `CONTEXT7_API_KEY` are prompted on first use. Claude Code uses a separate `.mcp.json` at the project root with `mcp__` tool naming (e.g. `mcp__supabase__get_logs`), while Copilot uses `.vscode/mcp.json` with `mcp_` naming (e.g. `mcp_supabase_get_logs`).

### GitHub CLI (`gh`) — Preferred for All GitHub Interactions
**Purpose:** Create PRs, manage issues, add comments (including `@dependabot` commands), check CI status.

**Why prefer `gh` over `mcp_github_*` tools:** GitHub MCP tools require separate OAuth credentials that frequently fail with "Bad credentials". The `gh` CLI uses a persistent authenticated session that reliably works.

**Install (Windows):** `winget install --id GitHub.cli`
**Auth:** `gh auth login --git-protocol https --web`
**After install, refresh PATH in existing terminals:**
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
```

**Common workflows:**
```powershell
# List open PRs / issues
gh pr list --repo Banych/bobrquiz
gh issue list --repo Banych/bobrquiz

# View PR details and CI checks
gh pr view 30 --repo Banych/bobrquiz
gh pr checks 30 --repo Banych/bobrquiz

# Create PR from current branch (branch must already be pushed)
gh pr create --base master --title "feat: ..." --body "..."

# Add a comment (e.g. trigger Dependabot rebase)
gh pr comment 30 --repo Banych/bobrquiz --body "@dependabot rebase"

# Rebase ALL open Dependabot PRs at once
gh pr list --repo Banych/bobrquiz --author dependabot --json number --jq '.[].number' | ForEach-Object {
  gh pr comment $_ --repo Banych/bobrquiz --body "@dependabot rebase"
}
```

**Full skill reference:** See `github-cli` skill in the superpowers skills folder for complete usage patterns, branch protection workflow, and troubleshooting.

### Git Operations (GitKraken MCP - Available but not in mcp.json)
**Purpose:** Git version control operations via MCP tools (alternative to terminal git commands)
**Available Capabilities:**
- **Staging & Committing:**
  - Add files to index or commit changes via `mcp_gitkraken_git_add_or_commit(directory, action: 'add'|'commit', files?, message?)`
  - Push changes to remote via `mcp_gitkraken_git_push(directory)`
- **History & Blame:**
  - Show line-by-line authorship via `mcp_gitkraken_git_blame(directory, file)`
- **Stash Management:**
  - Stash working directory changes via `mcp_gitkraken_git_stash(directory, name?)`
- **Branch Operations:**
  - Branch management tools available via `activate_git_branch_management_tools()` (includes branch, checkout, log, diff, status, worktree)

**Note:** These tools are available in the agent toolbox but NOT currently configured in `.vscode/mcp.json`. Prefer `gh` CLI or terminal `git` commands instead.

### Prisma Operations (Prisma MCP - Available but not in mcp.json)
**Purpose:** Database schema management and Prisma operations via MCP tools
**Available Capabilities:**
- **Migration Management:**
  - Development migrations available via `activate_prisma_migration_tools()` (includes `prisma-migrate-dev`, `prisma-migrate-reset`)
  - Check migration status via `prisma-migrate-status(projectCwd)` - shows local vs DB migration differences
- **Database Management:**
  - Prisma Postgres database tools available via `activate_prisma_postgres_management_tools()` (includes login, create database)
- **Data Visualization:**
  - Open Prisma Studio via `prisma-studio(projectCwd)` to view/edit data in visual UI

**Usage pattern:**
```
# Check migration status before applying changes
prisma-migrate-status(projectCwd: '/Users/vladislavbanykin/Documents/repos/quiz-game')

# Open Prisma Studio to inspect data
prisma-studio(projectCwd: '/Users/vladislavbanykin/Documents/repos/quiz-game')
```

**Note:** These tools are available in the agent toolbox but NOT currently configured in `.vscode/mcp.json`. The project currently uses direct yarn commands (`yarn prisma:migrate`, `yarn prisma:generate`, `yarn prisma:seed`) for Prisma operations. Consider adding Prisma MCP server if interactive migration management is needed.

## Essential Workflows

### MCP-Assisted Testing (Playwright MCP)
When writing or debugging E2E tests, use **Playwright MCP** (`@playwright/mcp` server) for interactive testing:

1. **Activate tools:** Call `activate_browser_navigation_tools()` and `activate_page_capture_tools()`
2. **Navigate:** `mcp_microsoft_pla_browser_navigate(url)` to load pages
3. **Interact:** Use `mcp_microsoft_pla_browser_type()`, `mcp_microsoft_pla_browser_click()` to test flows
4. **Inspect:** `mcp_microsoft_pla_browser_snapshot()` to see page state and locators
5. **Verify:** Observe actual behavior before writing test assertions

**Why this matters:** Writing E2E tests without manual verification often leads to:
- Overcomplicated wait conditions and timeouts
- Wrong locator strategies (e.g., strict mode violations from ambiguous selectors)
- Tests that don't match real user flows

**Best practice:** Test the actual flow interactively via MCP first, then write simplified tests based on what you observed working. Example: Discovered `getByText(/Active/i)` matched 9 elements (player statuses), fixed by scoping to `getByRole('banner').getByText(/Active/i)`.

### Development Commands (Yarn ONLY—never use npm/npx)
```bash
yarn dev                    # Next.js dev server with Turbopack
yarn build                  # Production build (auto-runs prisma:generate)
yarn lint                   # ESLint with Prettier
yarn lint:fix               # ESLint + Prettier auto-fix
yarn test                   # Run Vitest suite
yarn test:watch             # Vitest watch mode
yarn test:coverage          # Run Vitest with coverage report
yarn test:e2e               # Headless Playwright E2E tests
yarn test:e2e:ui            # Interactive Playwright UI mode
yarn test:e2e:debug         # Step-through E2E debug mode
yarn prisma:migrate         # Create/apply Prisma migration
yarn prisma:generate        # Regenerate Prisma client after schema edits
yarn prisma:seed            # Reset DB and seed demo data via seed-helpers.ts
npx shadcn@latest add <component> # Add shadcn UI primitive
```

### Git Commits
- Keep commit messages concise and descriptive
- Do **not** add Co-Authored-By lines to commit messages

### Path Aliases (tsconfig.json + vitest.config.ts)
All imports use absolute paths via these aliases:
- `@domain/*` → `src/domain/*`
- `@application/*` → `src/application/*`
- `@infrastructure/*` → `src/infrastructure/*`
- `@components/*` → `src/components/*`
- `@hooks/*` → `src/hooks/*`
- `@lib/*` → `src/lib/*`
- `@ui/*` → `src/components/ui/*`

**Update both configs if moving folders** or builds/tests break.

### API Route Pattern
See `src/app/api/player/add/route.ts` or `src/app/api/quiz/[quizId]/state/route.ts`:
1. Validate params/body with zod schemas
2. Call `getServices()` from `src/application/services/factories.ts` (singleton that wires Prisma repos)
3. Invoke use case or service method
4. Return JSON DTOs
5. Map domain errors to HTTP codes (404 when error matches `/not found/i`)

### Repository Implementation Pattern
Domain interfaces in `src/domain/repositories/**` define contracts. Prisma implementations in `src/infrastructure/repositories/**` must:
- Rebuild aggregates from normalized DB rows (e.g., `PrismaQuizRepository` sorts questions by `orderIndex`, hydrates answers)
- Map domain value objects (seconds) ↔ Postgres columns (milliseconds for timers)
- Update both repository mapper AND DTO mapper (`src/application/mappers/**`) when schema changes

### Testing Strategy
- **Domain/Application:** In-memory doubles or mocked repos, Vitest under `src/tests/**`
- **Infrastructure:** Use test DB (`DATABASE_URL_TEST`), reset Prisma via `resetServices({ force: true })` between suites
- **Pattern:** See `src/tests/domain/entities/quiz.test.ts` for entity tests, `src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts` for repo contracts

## Key Patterns

### Realtime Naming Conventions
```
Channel:  quiz:{quizId}                  — broadcast to all in a quiz
          player:{quizId}:{playerId}     — broadcast to one player

Event:    state:update    — full state payload (triggers setQueryData)
          answer:ack      — acknowledgment with result
          player:update   — player property change
          question:locked — state change notification
```

### TanStack Query Hooks
```typescript
// Query key — always a const tuple factory
export const entityQueryKey = (id: string) => ['entity', id] as const;

// All queries use the same timing defaults
useQuery({ queryKey, queryFn, initialData, staleTime: 5_000, refetchInterval: 5_000 });

// Fetch error parsing — consistent pattern across all hooks
const { error } = (await response.json().catch(() => ({}))) as { error?: string };
throw new Error(error ?? 'Unable to load entity.');
```

### Repository Pattern
```typescript
// Always upsert (never separate create/update)
await prisma.entity.upsert({ where: { id }, create: {...}, update: {...} });

// Batch operations always use $transaction
await prisma.$transaction(items.map(item => prisma.entity.update(...)));

// Nullable fields: always default with ?? not undefined
const value = record.field ?? 0;
```

### Feature Implementation Order
Always implement features in this order, with tests at each step:
1. **Domain** — Define entity behavior, write domain tests (`src/tests/domain/`)
2. **Application** — Create use case + DTO, write use case tests (`src/tests/application/use-cases/`)
3. **Infrastructure** — Update Prisma schema + repository, write repository tests (`src/tests/infrastructure/repositories/`)
4. **Presentation** — API route + TanStack Query hook + component (components receive DTOs only)

Run `yarn test` before moving to the next layer.

### Testing Patterns
- **Domain tests** (`src/tests/domain/`): Pure unit tests, no mocks. Use factory helpers at top of file:
  ```typescript
  const makeEntity = () => new Entity(...);
  ```
- **Use case tests**: Mock repositories with `vi.fn()`, test: success path + "not found" exact error message + invalid state
- **Repository tests**: Call `resetServices({ force: true })` between tests for a fresh Prisma client
- **E2E tests**: Manual-first — see "MCP-Assisted Testing (Playwright MCP)" section above

## DTO-First Development
**DTOs are the single source of truth** for API contracts:
1. Define/update zod schema in `src/application/dtos/**/*.ts`
2. Update mappers in `src/application/mappers/**` (domain entity ↔ DTO)
3. Update every API route and hook that consumes that DTO
4. **Never** let React components import entities or Prisma types—only DTOs

Example: Adding a field like `playerRank` requires touching:
- `src/application/dtos/player.dto.ts` (zod schema)
- `src/application/mappers/player-mapper.ts` (entity → DTO)
- Any API route returning `PlayerDTO`
- Any hook/component consuming player data

## Documentation Requirements
**Docs are part of the codebase, not optional:**
- `docs/plan.md` – roadmap and release goals
- `docs/structure.md` – DDD layer architecture
- `docs/01-setup-project.md` → `docs/04-presentation-and-realtime.md` – numbered step guides
- `docs/progress/sessions/<DATE>-slug.md` – track each work session (active goals + completed items)
- `docs/progress/dev-notes.md` – append short execution notes after changes
- `docs/progress/actions/*.md` – action items per release

**Update relevant docs immediately when:**
- Architecture patterns change
- New workflows are introduced
- Environment variables are added
- DTO contracts evolve

**Stale docs are treated as regressions** since future agents rely on them.

### Decision Logging

**Record the WHY, not just the WHAT.** The commit message records what changed; the session file must record why the alternative was rejected.

Minimum decision entry format (use in plan files and session files):
```
**Decision: [short label]**
[One sentence on what was chosen.] [One sentence on the alternative considered.] [One sentence on why this was preferred.]
```

**Always document when you:**
- Choose soft delete over hard delete (data retention trade-off)
- Pick a threshold value (timeout, interval, pool size) — explain the reasoning, not just the value
- Disable a linter rule — name the false-positive pattern
- Use a workaround for a framework quirk — name the quirk
- Defer a feature — say what it's deferred *to* and why it was deprioritised now

### What Goes Where

| Artifact | When to create | What to put in it |
|----------|---------------|-------------------|
| **Plan file** (`docs/progress/plans/`) | Before starting any feature >5 steps or >2h | Steps with checkboxes, technical decisions, time estimates, success criteria |
| **Session file** (`docs/progress/sessions/`) | After completing any significant session | What was built, key decisions with rationale, verification results, files changed |
| **dev-notes.md** | Daily — append-only bullet log | One-liner per feature/fix, link to session file |
| **PROGRESS.md** | After each session | Brief session entry in chronological list + execution log |
| **Commit message** | Every commit | *What* changed and *why* (not how) |

### When a Session File Is Required

Create a session file whenever:
- A feature plan was executed (session file = companion to plan file)
- A significant bug was fixed with a non-obvious root cause
- A maintenance or upgrade session touched many files
- A decision was made that a future developer would need to understand

Skip the session file for: single-file typo fixes, trivial dependency bumps, formatting-only changes.

### The Decision Trail Habit

Before closing a plan or session, ask: *"If I came back to this in 6 months, what would confuse me?"*

Common things to capture:
- Why a threshold is the value it is (e.g. "5 min auto-remove: matches the 120s disconnected threshold × 2.5, giving a visible grace period without requiring background jobs")
- Why a pool cap is set where it is (e.g. "`max: 2` because serverless handles one request at a time; 2 allows parallel queries within a request without exhausting Supabase's per-connection limit")
- What alternatives were rejected and why (e.g. "server-side auto-remove via cron was rejected because it requires background job infrastructure we don't have; host-side is acceptable since the host must be present for the game to run")

### Maintenance Sessions

Security and dependency upgrade sessions must record:
- What drove the upgrade (CVE IDs or Dependabot alerts, not just "security")
- What broke during the upgrade and how it was fixed
- Any rules disabled or workarounds added, and why
- What remains unresolved (e.g. transitive CVEs with no available fix)

## Styling & UI Components
- **Tailwind 4** configured in `src/app/globals.css` with OKLCH tokens and `@custom-variant dark`
- Use `cn()` helper from `src/lib/utils.ts` for conditional classes
- Reuse primitives from `src/components/ui` (managed via `components.json`)
- Add new primitives via `yarn shadcn add <component>` (auto-tracked in registry)
- **Avoid inline styles**—use design tokens

## Authentication Workflows
**Supabase Auth** manages user sessions via Next.js middleware.

### Session Management
- Middleware in `src/middleware.ts` verifies JWT and protects routes (admin → `/admin`, host → `/host`, player → `/player`)
- Store user context in React state via `useAuth()` hook (if implemented) or custom context provider
- Redirect unauthenticated users to login; check role for route access

### Auth Patterns
- API routes should call `getUser()` from Supabase client to verify session
- Return 401 if session invalid; return 403 if role insufficient
- Use Supabase RLS (Row-Level Security) policies to restrict database access by user ID and role
- Never store auth tokens in localStorage—rely on Supabase session cookies

### Implementation Reference
See `docs/04-presentation-and-realtime.md` for full auth setup guide and RLS policy patterns.

## Realtime & State Management
### Server State
- **TanStack Query** handles caching, synchronization, and invalidation of server state
- `src/hooks/**` wraps TanStack Query + domain service calls (queries for reads, mutations for writes)
- Optimistic updates: Use `setQueryData` before mutation completes to improve perceived performance

### Realtime Subscriptions
- `src/infrastructure/realtime/` contains WebSocket adapter contract (`RealtimeClient`, currently using `createNoopRealtimeClient` stub)
- Components access via `RealtimeClientProvider`/`useRealtimeClient` hook
- Event handlers call `queryClient.setQueryData()` to update cache when server pushes updates (e.g., quiz state changes)
- **Never** subscribe to raw WebSocket events in components—always wrap in custom hooks

### Implementation Reference
See `docs/04-presentation-and-realtime.md` for realtime subscription patterns, event types, and optimistic update strategies.

## Error Handling Patterns
**Errors propagate through layers with structured logging and user-friendly messages.**

### Domain & Application Layer
- Domain entities/aggregates throw domain-specific errors: `InvalidQuizStateError`, `PlayerNotFoundError`, etc.
- Application use cases catch domain errors and map to application errors (or re-throw)
- Services return errors as part of success/failure unions (if using Result pattern) or throw

### API Route Error Mapping
- Catch errors from services and map to HTTP status codes:
  - `404` if error message matches `/not found/i`
  - `400` for validation errors (zod parse failures)
  - `403` for permission errors
  - `500` for unexpected errors (log to Supabase via MCP: `mcp_supabase_get_logs(service: 'api')`)
- Return JSON error response with `{ error: string, code?: string }` structure

### Client-Side Error Handling
- TanStack Query mutations automatically handle errors via `onError` callback
- Display user-friendly messages (toast/snackbar) from error response
- Log unexpected errors to Sentry or error tracking service (if integrated)

**Example Error Path:**
```typescript
// Domain: Throw specific error
if (quiz.isEnded) throw new QuizAlreadyEndedError();

// API Route: Catch and map
try {
  const result = await endQuizUseCase.execute(quizId);
  return NextResponse.json(result);
} catch (err) {
  if (err instanceof QuizNotFoundError) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
```

## Performance Optimization
**Optimize for quiz gameplay: fast turn-taking, responsive UI, and efficient data loading.**

### Query Optimization
- Use TanStack Query `staleTime` and `gcTime` to minimize API calls:
  - Quiz state: `staleTime: 5s` (updates via realtime; refetch on blur)
  - Player list: `staleTime: 10s` (updates via realtime)
  - Quiz questions: `staleTime: Infinity` (immutable during session)
- Combine related queries into single API call when possible (e.g., quiz + questions + player state)
- Use `useQuery` for reads, `useMutation` for writes; batch writes when safe

### Pagination & Lazy Loading
- Admin quiz list: Use cursor-based pagination or limit to 20 per page
- Question bank: Load on demand in dialogs (don't load all questions upfront)
- Player results: Stream to UI incrementally as scoring completes

### Bundle & Code Splitting
- Route-based code splitting: Next.js auto-splits by `(admin)`, `(host)`, `(player)` route groups
- Lazy load heavy components: Dialog modals, chart libraries via dynamic imports
- Monitor bundle size: `yarn build` output shows size per route; keep client bundles < 100KB

### Database Optimization
- Index frequently queried columns: `quizId`, `playerId`, `sessionId` (already in schema)
- Use Supabase MCP to check slow queries: `mcp_supabase_get_logs(service: 'postgres')` for slow logs
- Avoid N+1 queries: Prisma's `include` strategy rebuilds aggregates efficiently
- Use `selectMany` for bulk operations instead of loops

**Realtime Performance:**
- Debounce broadcast events (e.g., player score updates) to avoid flooding WebSocket
- Use `src/lib/debounce-broadcast.ts` to batch updates every 500ms
- Unsubscribe from unused channels to reduce server load

**Implementation Reference:**
See `docs/progress/sessions/` for real examples of optimization decisions and measured impact.

## Debugging Quick Reference

When something breaks, check in this order:

```bash
# 1. Check Postgres logs for DB errors
mcp_supabase_get_logs(service: 'postgres')

# 2. Check auth/edge function logs
mcp_supabase_get_logs(service: 'auth')

# 3. Inspect current DB state
mcp_supabase_execute_sql(query: 'SELECT * FROM "Quiz" ORDER BY "createdAt" DESC LIMIT 5')

# 4. Check RLS policies after schema changes
mcp_supabase_get_advisors(type: 'security')

# 5. Snapshot current UI state
mcp_microsoft_pla_browser_navigate(url: 'http://localhost:3000')
mcp_microsoft_pla_browser_snapshot()
```

For realtime issues: check the `realtime` service logs and verify Supabase channel subscriptions in `src/infrastructure/realtime/`.

## Environment & Deployment
- `.env.example` documents all required vars (`DATABASE_URL`, Supabase keys, etc.)
- Vercel serves Next.js + API routes
- Supabase provides Postgres (via Prisma) + Storage
- `prebuild` script ensures Prisma client regenerates on every deploy
- **MCP toolbox:** `.vscode/mcp.json` configures Supabase HTTP, Playwright, and Postman MCP servers (all require Node 22 via `nvm use`)

## Common Pitfalls
1. **Forgetting to await Next.js 15 params:** Route handlers must `await params` before accessing `params.quizId`
2. **Skipping Prisma generation:** Always run `yarn prisma:generate` after schema edits or imports break
3. **Importing wrong Prisma path:** Use `@infrastructure/database/prisma/generated-client`, NOT `@prisma/client`
4. **Leaking entities to UI:** Components must receive DTOs, never domain entities
5. **Ignoring path aliases:** Use `@application/*` etc., not relative paths like `../../application`
6. **Missing service factory reset in tests:** Call `resetServices({ force: true })` when tests need fresh Prisma client
7. **Test isolation:** Each repository test suite must call `resetServices({ force: true })` between tests or results bleed across tests
8. **Layer boundary violations:** If imports cross layer boundaries (e.g., presentation importing entities), run an architecture review to detect all violations before they compound