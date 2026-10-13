---
description: Use when adding a new application use case — scaffolds the use-case class, DTO changes, service wiring, the API route and use-case tests for success and not-found paths.
---
# Create Use Case

Scaffold a new application use case following the exact patterns used in this codebase.

## Usage
```
/create-use-case [verb-noun description]
```

Example: `/create-use-case archive-quiz` → creates `archive-quiz.use-case.ts`

## What Gets Created

1. `src/application/use-cases/[verb-noun].use-case.ts` — use case class
2. `src/application/dtos/[entity].dto.ts` — update DTO if needed
3. `src/tests/application/use-cases/[verb-noun].use-case.test.ts` — tests

## Step 1: Read Existing Code First

Read a similar use case to match the exact style:
```
src/application/use-cases/start-quiz.use-case.ts
src/application/use-cases/submit-answer.use-case.ts
```

## Step 2: Create Use Case Class

File: `src/application/use-cases/[verb-noun].use-case.ts`

**IMPORTANT:** Use cases in this codebase are **classes** that **throw errors** — NOT functions returning Result objects.

```typescript
import { I[Entity]Repository } from '@domain/repositories/I[Entity]Repository';

export class [VerbNoun]UseCase {
  constructor(
    private readonly [entity]Repository: I[Entity]Repository,
    // add other repository dependencies as needed
  ) {}

  async execute([entityId]: string, /* other params */): Promise<ReturnType> {
    // 1. Validate required inputs (throw directly)
    if (![entityId]) {
      throw new Error('[Entity] ID is required');
    }

    // 2. Fetch entity
    const entity = await this.[entity]Repository.findById([entityId]);
    if (!entity) {
      // EXACT format used throughout codebase — the API layer regex catches this
      throw new Error(`[Entity] with ID ${[entityId]} not found`);
    }

    // 3. Apply domain logic (entity method will throw if invalid state)
    entity.doSomething();

    // 4. Persist
    await this.[entity]Repository.save(entity);

    // 5. Return — can be void, an ID, or a mapped DTO
    return entity.id;
  }
}
```

**Critical conventions:**
- Error format for "not found": `` `[Entity] with ID ${id} not found` `` — the API layer uses `/not found/i` regex to map this to 404
- Don't catch errors inside the use case — let them bubble to the API route
- Return type depends on what the API route needs (often just the ID or void)

## Step 3: Update DTO (if needed)

File: `src/application/dtos/[entity].dto.ts`

```typescript
import { z } from 'zod';

// Input schema (for API validation)
export const [VerbNoun]InputSchema = z.object({
  [entityId]: z.string().min(1, '[Entity] ID is required'),
  // other required fields with validation messages
  // optional fields use .optional()
});
export type [VerbNoun]Input = z.infer<typeof [VerbNoun]InputSchema>;

// Output DTO (add to existing file if entity DTO exists)
export const [Entity]DTO = z.object({
  id: z.string(),
  // only fields presentation layer needs
});
export type [Entity]DTO = z.infer<typeof [Entity]DTO>;
```

## Step 4: Wire into Service

Service files use **kebab-case** with a `-service` suffix: `quiz-service.ts`, `player-service.ts`, `answer-service.ts`.
Find the appropriate service file for your entity and add the new method:

File: `src/application/services/[entity]-service.ts`

```typescript
async [verbNoun]([entityId]: string): Promise<string> {
  return this.[verbNoun]UseCase.execute([entityId]);
}
```

Then wire the use case in the factory. All services are assembled in `getServices()` inside `src/application/services/factories.ts`:

File: `src/application/services/factories.ts`

```typescript
// In getRepositories() — add new Prisma repos if needed (returned as const object)
const getRepositories = () => {
  // ...existing repos...
  return { ..., [entity]Repository } as const;
};

// In getServices() — destructure repos and create the new use case
const { ..., [entity]Repository } = getRepositories();
const [verbNoun]UseCase = new [VerbNoun]UseCase([entity]Repository);

// Add use case to the existing service constructor
const [entity]Service = new [Entity]Service(
  // existing use cases...
  [verbNoun]UseCase,
);
```

## Step 5: Create API Route

File: `src/app/api/[entity]/[action]/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';
import { [VerbNoun]InputSchema } from '@application/dtos/[entity].dto';

type RouteContext = { params: Promise<{ [entityId]: string }> };
type ErrorResponse = { error: string };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { [entityId] } = await params;
    const body = await request.json();
    const parsed = [VerbNoun]InputSchema.parse({ [entityId], ...body });

    const { [entity]Service } = getServices();
    const result = await [entity]Service.[verbNoun](parsed.[entityId]);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] [verb-noun] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message } satisfies ErrorResponse, { status });
  }
}
```

## Step 6: Write Tests

File: `src/tests/application/use-cases/[verb-noun].use-case.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import { [VerbNoun]UseCase } from '@application/use-cases/[verb-noun].use-case';
import type { I[Entity]Repository } from '@domain/repositories/I[Entity]Repository';
import { [Entity] } from '@domain/entities/[entity]';

const make[Entity] = (): [Entity] => new [Entity]('entity-1', /* valid props */);

describe('[VerbNoun]UseCase', () => {
  let entityRepo: Mocked<I[Entity]Repository>;
  let useCase: [VerbNoun]UseCase;

  beforeEach(() => {
    entityRepo = {
      findById: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    useCase = new [VerbNoun]UseCase(entityRepo);
  });

  it('should succeed and return id', async () => {
    entityRepo.findById.mockResolvedValue(make[Entity]());

    const result = await useCase.execute('entity-1');

    expect(result).toBe('entity-1');
    expect(entityRepo.save).toHaveBeenCalledOnce();
  });

  it('should throw when entity not found', async () => {
    entityRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toThrow('[Entity] with ID missing not found');
    expect(entityRepo.save).not.toHaveBeenCalled();
  });

  it('should throw when entity rejects command (invalid state)', async () => {
    const entity = make[Entity]();
    // set entity to a state where the command is invalid
    entityRepo.findById.mockResolvedValue(entity);

    await expect(useCase.execute('entity-1')).rejects.toThrow(/* expected error message */);
  });
});
```

## Step 7: Run Tests

```bash
yarn test src/tests/application/use-cases/[verb-noun].use-case.test.ts
```

Must pass before considering the use case complete.

## Checklist

- [ ] Use case is a **class** with `execute()` method (not a standalone function)
- [ ] "not found" error uses exact format: `` `[Entity] with ID ${id} not found` ``
- [ ] No try/catch inside the use case — errors bubble up
- [ ] DTO schema and types added/updated
- [ ] Use case wired into service and factories.ts
- [ ] API route created with standard error handling pattern
- [ ] Tests: success path, not found (verifies error message), invalid state
- [ ] `yarn test src/tests/application/` passes
