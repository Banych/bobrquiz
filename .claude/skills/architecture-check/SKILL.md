---
name: architecture-check
description: Use when reviewing changes for DDD layer violations — checks imports across domain, application, infrastructure and presentation, entities or Prisma types leaking into UI or DTOs, and wrong Prisma imports.
---
# Architecture Check

Review code for DDD layer violations, import rule breaches, and anti-patterns.

## Usage
```
/architecture-check [optional: path or component to check]
```

Without arguments: checks the entire `src/` directory.

## Layer Import Rules

```
Domain      → MUST NOT import from application/, infrastructure/, app/, components/, hooks/
Application → MUST NOT import from infrastructure/, app/, components/, hooks/
Infrastructure → MUST NOT import from app/, components/, hooks/
Presentation → MUST NOT import domain entities, Prisma types, or infrastructure directly
```

Accepted exceptions (the checks below already skip them):

- `src/application/services/factories.ts` is the composition root and imports infrastructure to
  wire the services.
- API routes import the realtime broadcasters (`@infrastructure/realtime/broadcast-*`) directly
  (ADR-024).
- The generated Prisma client (`src/infrastructure/database/prisma/generated/`) is not our code;
  its `any` types are not violations.

## Check 1: Domain Layer Purity

```bash
# Domain must not import from other layers
grep -r "from '@application/" src/domain/
grep -r "from '@infrastructure/" src/domain/
grep -r "from '@components/" src/domain/
grep -r "from 'next" src/domain/
grep -r "from '@prisma/" src/domain/
```

Expected: **no results**. Any output = violation.

## Check 2: Presentation Layer (Entities Leaking)

```bash
# Components/hooks must not import domain entities
grep -r "from '@domain/entities/" src/components/
grep -r "from '@domain/entities/" src/hooks/
grep -r "from '@domain/aggregates/" src/components/
grep -r "from '@domain/aggregates/" src/hooks/

# API routes must not import Prisma types or entities directly (the broadcasters are allowed)
grep -r "from '@infrastructure/" src/app/api/ | grep -v "from '@infrastructure/realtime/broadcast-"
grep -r "from '@domain/entities/" src/app/api/
```

Expected: **no results**.

## Check 3: Wrong Prisma Import

```bash
# Must use generated-client, never @prisma/client
grep -r "from '@prisma/client'" src/
grep -r "from \"@prisma/client\"" src/
```

Expected: **no results** (the adapter pattern requires the custom import).

## Check 4: DTO Leakage Check (Prisma types in DTOs)

```bash
# DTOs must not reference Prisma types
grep -r "Prisma\." src/application/dtos/
# Application must not import infrastructure (the composition root is allowed)
grep -r "from '@infrastructure/" src/application/ | grep -v '^src/application/services/factories.ts:'
```

Expected: **no results**.

## Check 5: Relative Import Anti-Pattern

```bash
# Should use path aliases, not relative imports across layers
grep -r "from '\.\./\.\./domain/" src/application/
grep -r "from '\.\./\.\./application/" src/infrastructure/
grep -r "from '\.\./\.\./\.\." src/app/
```

Expected: **no results** in cross-layer cases.

## Check 6: `any` Type Usage

```bash
# The generated Prisma client is excluded
grep -rn ": any" --exclude-dir=generated src/
grep -rn "as any" --exclude-dir=generated src/
grep -rn "<any>" --exclude-dir=generated src/
```

All `any` usages are violations. Each one must be typed properly.

## Check 7: `await params` in Route Handlers

```bash
# Next.js 15 requires awaiting params before accessing
grep -rn "params\." src/app/api/ | grep -v "await params"
grep -rn "params\." src/app/ | grep -v "await" | grep "\.tsx"
```

Check manually that every route handler has `const { id } = await params;` pattern. A hit in a
`'use client'` page that takes `params` from `useParams()` is not a violation: that hook returns
a plain object.

## Quick Full Sweep

Run all checks at once. An empty section means clean. A `No such file or directory` line means
that check did not run, so it says nothing about the code. Keep stderr visible and don't print
"CLEAN" on a non-zero exit, because grep exits non-zero both for "no match" and for a missing
path.

```bash
echo "=== Domain imports from other layers ==="
grep -rn "from '@application/\|from '@infrastructure/\|from 'next" src/domain/

echo "=== Entities in presentation ==="
grep -rn "from '@domain/entities/\|from '@domain/aggregates/" src/components/ src/hooks/ src/app/

echo "=== Infrastructure in application or API routes (exceptions skipped) ==="
grep -rn "from '@infrastructure/" src/application/ src/app/api/ \
  | grep -v '^src/application/services/factories.ts:' \
  | grep -v "from '@infrastructure/realtime/broadcast-"

echo "=== Wrong Prisma import ==="
grep -rn "from '@prisma/client'" src/

echo "=== Any types ==="
grep -rn ": any\|as any\|<any>" --exclude-dir=generated src/ | grep -v ".test."
```

## Reviewing a Specific File

When reviewing a single file, check:

1. **What it imports** - does anything violate layer rules?
2. **What it exports** - does it expose the right abstraction?
3. **Where it's imported by** - use grep to find consumers, verify they should have access

```bash
# Find all consumers of a file
grep -rn "from '@domain/entities/quiz'" src/
```

## Common Violations Found in This Codebase

| Anti-pattern | Fix |
|---|---|
| Component imports `Quiz` entity | Create/use `QuizDTO` from `@application/dtos/` |
| Use case imports Prisma type | Accept repository interface, map inside repo |
| API route calls repository directly | Route → service → use case → repository |
| Infrastructure imports `@application/dtos` | Infra should accept/return domain types; mapper lives in application |
| Missing `await params` in route | `const { quizId } = await params;` |

## After Fixing Violations

```bash
yarn test:run    # Ensure nothing broke
yarn build       # Catch remaining type errors
yarn lint        # Check import order and style
```

## Observed vs assumed

Runs are named by their ledger: `.superpowers/sdd/2026-10-15-architecture-check-false-hits/`.

**Observed**

- On the whole tree at 039249c, every grep in Checks 1-6 and Check 7's API-route grep is empty,
  except for the three exceptions now skipped: 6 lines in `factories.ts` (Check 4), 11
  broadcaster imports in API routes (Check 2) and 31 `any` lines, all in the generated Prisma
  client (Check 6). With the exclusions, all three are empty too. Check 7's second grep
  (`src/app/`, `.tsx`) returns one line, `src/app/(admin)/admin/quizzes/[quizId]/page.tsx:21`. It
  is a `'use client'` page reading `useParams()`, not an unawaited route param (confirmed
  2026-10-15, hand run and review).
- The Quick Full Sweep, extracted from this file and run as written, prints one line for each
  violation planted in a fake tree (domain → application, an entity in a component, infrastructure
  in an application service and in an API route, `@prisma/client`, `: any`). It skips the three
  exceptions planted next to them, and prints nothing on the real tree (confirmed 2026-10-15,
  hand run).
- With `src/domain/` missing, the sweep prints `No such file or directory` under its heading
  instead of an empty section. The old `2>/dev/null ... || echo "CLEAN"` form printed `CLEAN`
  for a missing path (both confirmed 2026-10-15, hand run).
- The Bash tool's `grep` (bundled ugrep) and the system grep gave identical output for every
  check and both sweeps. Started at `src/`, ugrep does not apply the repo root's `.gitignore`,
  so it searches the git-ignored generated client too (confirmed 2026-10-15, hand run).

**Assumed — attack these first**

- Checks 1-7 run one by one catch the same planted violations the sweep does; the planted tree
  was run through the sweep only.
- Check 5 catches every cross-layer relative import; its patterns are `../../domain/`,
  `../../application/` and `../../..` only.
- Check 7 finds a route handler that reads `params` without awaiting it; a handler with
  `const { id } = params;` has no `params.` text for the grep to match.
- Infrastructure imports in the presentation layer are checked in `src/app/api/` only. Outside
  it, 8 lines in 6 files import `@infrastructure/` today (`src/app/providers.tsx`, three admin
  components using `@infrastructure/storage/supabase-storage`, `src/hooks/use-presence.tsx`,
  `src/hooks/use-realtime-client.tsx`). No check reports them, and nobody has ruled whether they
  are violations (2026-10-15).
- `--exclude-dir=generated` skips only the Prisma client; it would also skip any other
  directory named `generated` under `src/` (none exists today).
- No run on a single diff yet (the case ADR-023 waits for before an agent is considered).
