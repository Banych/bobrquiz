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

# API routes must not import Prisma types or entities directly
grep -r "from '@infrastructure/" src/app/api/
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
grep -r "from '@infrastructure/" src/application/
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
grep -rn ": any" src/
grep -rn "as any" src/
grep -rn "<any>" src/
```

All `any` usages are violations. Each one must be typed properly.

## Check 7: `await params` in Route Handlers

```bash
# Next.js 15 requires awaiting params before accessing
grep -rn "params\." src/app/api/ | grep -v "await params"
grep -rn "params\." src/app/ | grep -v "await" | grep "\.tsx"
```

Check manually that every route handler has `const { id } = await params;` pattern.

## Quick Full Sweep

Run all checks at once:

```bash
echo "=== Domain imports from other layers ===" && \
grep -rn "from '@application/\|from '@infrastructure/\|from 'next" src/domain/ 2>/dev/null || echo "CLEAN"

echo "=== Entities in presentation ===" && \
grep -rn "from '@domain/entities/\|from '@domain/aggregates/" src/components/ src/hooks/ src/app/ 2>/dev/null || echo "CLEAN"

echo "=== Wrong Prisma import ===" && \
grep -rn "from '@prisma/client'" src/ 2>/dev/null || echo "CLEAN"

echo "=== Any types ===" && \
grep -rn ": any\|as any" src/ 2>/dev/null | grep -v ".test." | grep -v node_modules || echo "CLEAN"
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
