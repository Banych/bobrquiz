---
description: Use when changing schema.prisma — the migration workflow for this repo's non-standard Prisma v7 setup, from schema edit through migration, client regeneration and layer updates, with rollback steps.
---
# Prisma Migration Workflow

Safe database schema migration workflow for this project.

## Usage
```
/prisma-migrate [description of changes]
```

## Important: Non-Standard Prisma Setup

This project uses Prisma v7 with driver adapters:
- Schema: `src/infrastructure/database/prisma/schema.prisma`
- Generated client: `./generated/client` (git-ignored)
- Import from: `@infrastructure/database/prisma/generated-client`

## Migration Steps

### 1. Modify Schema
Edit `src/infrastructure/database/prisma/schema.prisma`

Common patterns:
```prisma
// Add field with default
model Quiz {
  newField String @default("")
}

// Add optional field
model Quiz {
  newField String?
}

// Add relation
model Quiz {
  answers Answer[]
}

// Add index
model Player {
  @@index([quizId, status])
}
```

### 2. Create Migration
```bash
yarn prisma:migrate -- --name describe_your_change
```

This creates a migration file in `src/infrastructure/database/prisma/migrations/`

### 3. Regenerate Client
```bash
yarn prisma:generate
```

**Critical**: Always run this after schema changes or imports will break.

### 4. Update Domain Layer
If the schema change reflects a domain concept:

1. Update entity in `src/domain/entities/`
2. Update repository interface in `src/domain/repositories/`
3. Update tests in `src/tests/domain/`

### 5. Update Infrastructure Layer
1. Update repository implementation in `src/infrastructure/repositories/`
2. Update entity ↔ Prisma mappers
3. Update tests in `src/tests/infrastructure/repositories/`

### 6. Update Application Layer
1. Update DTO in `src/application/dtos/`
2. Update DTO mappers in `src/application/mappers/`
3. Update affected use cases
4. Update tests

### 7. Verify
```bash
yarn test
yarn build
```

## Rollback (if needed)
```bash
# See migration status
npx prisma migrate status --schema src/infrastructure/database/prisma/schema.prisma

# Reset to clean state (DESTROYS DATA)
npx prisma migrate reset --schema src/infrastructure/database/prisma/schema.prisma
```

## Common Pitfalls

1. **Forgetting `yarn prisma:generate`** - Imports will fail
2. **Wrong import path** - Use `@infrastructure/database/prisma/generated-client`, NOT `@prisma/client`
3. **Missing mapper updates** - Update both repository mapper AND DTO mapper
4. **Test isolation** - Call `resetServices({ force: true })` in tests after schema changes

## Seed Data
```bash
yarn prisma:seed
```
Runs `src/infrastructure/database/prisma/seed.ts`
