---
name: create-hook
description: Use when adding a TanStack Query hook in src/hooks — scaffolds the query key factory, the fetcher with the project's error parsing, and an optional Supabase realtime subscription.
---
# Create Hook

Scaffold a TanStack Query hook with optional Supabase realtime subscription, following the exact patterns used in this codebase.

## Usage
```
/create-hook [entity-name] [--realtime]
```

Examples:
- `/create-hook quiz-session` — query + mutation hook
- `/create-hook player-session --realtime` — includes realtime subscription

## What Gets Created

`src/hooks/use-[entity-name].ts`

## Step 1: Read an Existing Hook First

```
src/hooks/use-player-session.ts   — query + mutation + realtime (most complete)
src/hooks/use-host-quiz-state.ts  — query + realtime without mutation
```

## Step 2: Create the Hook File

File: `src/hooks/use-[entity-name].ts`

### Base Pattern (query + mutation, no realtime)

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { [Entity]DTO } from '@application/dtos/[entity].dto';

// 1. Query key factory — always a const tuple for TypeScript inference
export const [entityName]QueryKey = (id: string) =>
  ['[entity-name]', id] as const;

// 2. Fetch function — standalone async function, not inside the hook
const fetch[Entity] = async (id: string): Promise<[Entity]DTO> => {
  const response = await fetch(`/api/[entity]/${id}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    // EXACT error pattern used throughout codebase
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Unable to load [entity].');
  }

  return (await response.json()) as [Entity]DTO;
};

// 3. Mutation function — standalone async function
const update[Entity] = async (input: { id: string; /* other fields */ }) => {
  const response = await fetch(`/api/[entity]/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? 'Failed to update [entity].');
  }

  return (await response.json()) as [Entity]DTO;
};

// 4. Hook — receives initialData from server component (SSR-first pattern)
export type Use[Entity]Options = {
  id: string;
  initialData: [Entity]DTO;
};

export const use[Entity] = ({ id, initialData }: Use[Entity]Options) => {
  const queryClient = useQueryClient();
  const queryKey = [entityName]QueryKey(id);

  const queryResult = useQuery({
    queryKey,
    queryFn: () => fetch[Entity](id),
    initialData,
    staleTime: 5_000,      // same as use-host-quiz-state and use-player-session
    refetchInterval: 5_000, // same as use-host-quiz-state and use-player-session
  });

  const updateMutation = useMutation({
    mutationFn: update[Entity],
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  // Return: spread query result + typed mutation helpers
  return {
    ...queryResult,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  } as const;
};
```

### With Realtime Subscription

Add these imports and effect inside the hook:

```typescript
import { useEffect, useCallback } from 'react';
import { useRealtimeClient } from '@hooks/use-realtime-client';

// Inside the hook, after queryResult:

const queryClient = useQueryClient();
const realtimeClient = useRealtimeClient();

// Channel names follow the convention: entity:id or entity:parentId:entityId
const channelName = `[entity]:${id}`;

// Callback for setQueryData (optimistic — no refetch)
const applyUpdate = useCallback(
  (updatedData: [Entity]DTO) => {
    queryClient.setQueryData(queryKey, updatedData);
  },
  [queryClient, queryKey]
);

// Subscription effect — always return unsubscribe
useEffect(() => {
  const unsubscribe = realtimeClient.subscribe<[Entity]DTO>(
    channelName,
    'state:update',   // event name convention: entity:action
    (updatedData) => {
      applyUpdate(updatedData);
    }
  );
  return unsubscribe;
}, [applyUpdate, channelName, realtimeClient]);
```

**Use `setQueryData` when** the server sends the full updated state (no refetch needed).
**Use `invalidateQueries` when** you only receive a notification and need to refetch.

## Realtime Channel & Event Naming Conventions

```
Channel names:
  quiz:{quizId}                     — quiz state updates
  player:{quizId}:{playerId}        — player-specific events

Event names (entity:action format):
  state:update       — full state replacement
  answer:ack         — acknowledgement with result
  player:update      — player property change
  player:kicked      — player removed by the host
  question:locked    — question locked notification
  leaderboard:update — leaderboard changed
```

Always match the channel/event names used in `src/infrastructure/realtime/`.

## Query Key Conventions

```typescript
// Single entity
['[entity]', id] as const

// Entity in context of parent
['[entity]', parentId, entityId] as const

// List
['[entity]s', parentId] as const
```

## Checklist

- [ ] Query key is a factory function returning a `const` tuple
- [ ] Fetch functions are standalone (not inside hook body)
- [ ] Error parsing uses `.catch(() => ({}))` fallback
- [ ] `staleTime: 5_000` and `refetchInterval: 5_000` set on queries
- [ ] Realtime subscription in `useEffect` returns unsubscribe cleanup
- [ ] Mutation `onSuccess` calls `invalidateQueries` with the query key
- [ ] Hook returns spread of queryResult + mutation helpers as `const`
- [ ] Channel/event names match those in `src/infrastructure/realtime/`

## Observed vs assumed

**Observed** — none yet. No run of this skill against the repo has been recorded since it
moved from `.claude/commands/` (2026-10-15).

**Assumed — attack these first**

- `use-player-session.ts` and `use-host-quiz-state.ts` exist in `src/hooks/` and hold the
  patterns described (lines 25-26).
- `useRealtimeClient` is exported from `@hooks/use-realtime-client` and its `subscribe<T>(channel,
  event, handler)` returns an unsubscribe function (lines 120 and 140-147).
- Five seconds for `staleTime` and `refetchInterval` suits a new hook, as it does the main query
  hooks (lines 94-95); `use-host-quiz-players` makes its interval configurable instead.
- The channel and event names listed (including `player:kicked`) match those in
  `src/infrastructure/realtime/` (lines 156-170).
- `fetch` with `cache: 'no-store'` and the `.catch(() => ({}))` error parse is the pattern the
  existing hooks use (lines 47-57).
