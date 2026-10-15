---
name: create-entity
description: Use when adding a new domain entity — scaffolds the entity class, its repository interface and a domain test skeleton following the project's entity conventions.
---
# Create Domain Entity

Scaffold a new domain entity following the exact patterns used in this codebase.

## Usage
```
/create-entity [EntityName]
```

Example: `/create-entity Category`

## What Gets Created

1. `src/domain/entities/[entity-name].ts` — entity class
2. `src/domain/repositories/[entity-name]-repository.ts` — repository interface
3. `src/tests/domain/entities/[entity-name].test.ts` — test file

## Step 1: Read Existing Entities First

Read an existing entity to match conventions exactly:
```
src/domain/entities/quiz.ts       — complex entity with status transitions + collections
src/domain/entities/player.ts     — simpler entity with status + mutable properties
```

Key things to notice: public properties (not private), enum-based status, `Map`/`Set` for collections, synchronous methods only.

## Step 2: Create Entity File

File: `src/domain/entities/[entity-name].ts`

**NOTE:** Entities in this codebase use **public properties** (not private fields with getters). No domain events system — use plain throws for invalid state transitions.

```typescript
export enum [EntityName]Status {
  Pending = 'Pending',
  Active = 'Active',
  Completed = 'Completed',
}

export class [EntityName] {
  id: string;
  status: [EntityName]Status;
  // other public properties
  createdAt: Date;

  constructor(id: string, /* other required args */) {
    // Validate invariants
    if (!id) throw new Error('[EntityName] id is required');

    this.id = id;
    this.status = [EntityName]Status.Pending; // default starting status
    this.createdAt = new Date();
    // assign other properties
  }

  // Status transitions — always validate current status before changing
  activate(): void {
    if (this.status !== [EntityName]Status.Pending) {
      throw new Error('[EntityName] can only be activated if it is in Pending status.');
    }
    this.status = [EntityName]Status.Active;
  }

  complete(): void {
    if (this.status !== [EntityName]Status.Active) {
      throw new Error('[EntityName] can only be completed if it is in Active status.');
    }
    this.status = [EntityName]Status.Completed;
  }

  // Mutation methods — check preconditions before mutating
  updateName(name: string): void {
    if (!name.trim()) throw new Error('[EntityName] name cannot be empty');
    this.name = name.trim();
  }

  // Use Map for keyed relationships, Set for ID collections
  // private _items = new Map<string, Item>();
  // private _memberIds = new Set<string>();

  // Query/computed methods (synchronous only, no DB calls)
  isActive(): boolean {
    return this.status === [EntityName]Status.Active;
  }
}
```

**Conventions to follow:**
- Error message format for state transitions: `'[Entity] can only X if it is in Y status.'`
- All domain methods are **synchronous** — no async, no I/O
- Collections use `Map<string, T>` for keyed access, `Set<string>` for ID sets
- Type assertions for status: `entity.status = record.status as [EntityName]Status` (in mapper)
- No domain events — the aggregate coordinates events if needed

## Step 3: Create Repository Interface

File: `src/domain/repositories/[entity-name]-repository.ts`

```typescript
import { [EntityName] } from '@domain/entities/[entity-name]';

export interface I[EntityName]Repository {
  findById(id: string): Promise<[EntityName] | null>;
  listBy[RelatedEntity]Id([relatedId]: string): Promise<[EntityName][]>;
  save(entity: [EntityName]): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Keep the interface framework-agnostic — no Prisma types, no `undefined`, just `null`.

## Step 4: Write Tests

File: `src/tests/domain/entities/[entity-name].test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { [EntityName], [EntityName]Status } from '@domain/entities/[entity-name]';

// Factory helper — avoids repeating constructor args in every test
const make[EntityName] = (overrides: Partial<{ id: string }> = {}): [EntityName] =>
  new [EntityName](overrides.id ?? 'test-id', /* required args */);

describe('[EntityName]', () => {
  describe('creation', () => {
    it('should create with valid props', () => {
      const entity = make[EntityName]();
      expect(entity.id).toBe('test-id');
      expect(entity.status).toBe([EntityName]Status.Pending);
    });

    it('should throw when id is missing', () => {
      expect(() => new [EntityName]('')).toThrow('[EntityName] id is required');
    });

    // one test per invariant rule
  });

  describe('activate()', () => {
    it('should transition to Active status', () => {
      const entity = make[EntityName]();

      entity.activate();

      expect(entity.status).toBe([EntityName]Status.Active);
    });

    it('should throw when not in Pending status', () => {
      const entity = make[EntityName]();
      entity.activate(); // now Active

      expect(() => entity.activate()).toThrow(
        '[EntityName] can only be activated if it is in Pending status.'
      );
    });
  });

  // Test each command method: happy path + invalid state
});
```

## Step 5: Run Tests

```bash
yarn test:run src/tests/domain/entities/[entity-name].test.ts
```

Must pass before moving to Application layer.

## Checklist

- [ ] Entity class with **public** properties (not private with getters)
- [ ] Status enum with string values matching status names
- [ ] Constructor validates required invariants (throw if invalid)
- [ ] Status transition methods check current status before changing
- [ ] All methods are **synchronous** (no async/await in domain)
- [ ] Repository interface uses `null` (not `undefined`) for missing entities
- [ ] Tests: creation + each invariant, each command (success + wrong state)
- [ ] `yarn test:run src/tests/domain/` passes

## Observed vs assumed

**Observed** — none yet. No run of this skill against the repo has been recorded since it
moved from `.claude/commands/` (2026-10-15).

**Assumed — attack these first**

- `src/domain/entities/quiz.ts` and `player.ts` exist and use public properties, enum status and
  synchronous methods (lines 26-30).
- Domain repository interfaces live in `src/domain/repositories/[entity-name]-repository.ts` and
  are named `I[EntityName]Repository` (lines 102-107).
- Entities are mapped from Prisma records with `record.status as [EntityName]Status` in the
  repository mapper (line 97).
- State-transition errors follow the format `'[Entity] can only X if it is in Y status.'` (line
  94).
- `yarn test:run src/tests/domain/entities/[entity-name].test.ts` runs a single file (line 170).
