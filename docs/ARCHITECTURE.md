# Bobr Quiz – Architecture & Design

This document captures the DDD-lite architecture, tech stack decisions, and layer contracts that define the entire application. It supersedes the numbered step docs (01-04) and serves as the authoritative reference for understanding how to extend or modify the codebase.

## Table of Contents
1. [Vision & Tech Stack](#vision--tech-stack)
2. [Core Architecture (DDD-Lite)](#core-architecture-ddd-lite)
3. [Data Flow](#data-flow)
4. [Layer Details](#layer-details)
5. [Directory Structure](#directory-structure)
6. [Design Decisions & Trade-offs](#design-decisions--trade-offs)
7. [Common Patterns](#common-patterns)

---

## Vision & Tech Stack

### Product Vision
- **Host/Admin desktop**: Runs quiz, controls rounds, views live stats. Mirrors mockups in `docs/mockups/`.
- **Player mobile**: Joins with code, sees timers and answer inputs only (no questions leaked).
- **Admin portal**: Reusable quiz library, media management, timing configuration.
- **Realtime**: <300ms round-trip for answer/timer sync across Web + mobile.

### Technology Stack

| Layer               | Choice                                            | Rationale                                                              |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| **Frontend**        | Next.js 15 (App Router) + React 19                | Server/client components, streaming, built-in API routes               |
| **Styling**         | Tailwind 4 + shadcn UI                            | Token-driven design, accessible primitives, rapid iteration            |
| **State**           | TanStack Query + Supabase Realtime                | Server state cache + WebSocket events for <300ms latency               |
| **ORM**             | Prisma v7 + driver adapter (`@prisma/adapter-pg`) | Type safety, migrations, adapter pattern for Vercel Edge compatibility |
| **Database**        | Supabase Postgres                                 | Managed PostgreSQL, RLS for auth, Storage for media                    |
| **Auth**            | Supabase Auth + email allowlist (R4), RLS (R5)    | Cookie-based sessions, simple MVP auth, scales to enterprise RLS       |
| **Hosting**         | Vercel (Next.js) + Supabase Cloud                 | Serverless, auto-scaling, built-in GitHub integration                  |
| **Testing**         | Vitest (unit) + Playwright (E2E)                  | Fast feedback, component/flow coverage, MCP-assisted manual testing    |
| **Package Manager** | Yarn                                              | Workspaces, lock determinism, faster install                           |

---

## Core Architecture (DDD-Lite)

This codebase follows **Domain-Driven Design (DDD-lite)** principles: business logic lives in the domain layer, stays framework-agnostic, and is orchestrated by application services that expose typed results (DTOs) to presentation.

### Guiding Principles

1. **DTO → Entity → Service → Repository → Hook**
   - Every API request/WebSocket event validates into a DTO (zod schema)
   - DTOs map to domain entities that enforce invariants
   - Application services orchestrate entities + repositories
   - Repositories persist to Prisma/Supabase without leaking ORM details
   - Hooks/pages consume only DTOs—never entities or Prisma types

2. **Business Rules in Pure Domain Layer**
   - Entities (Quiz, Player, Answer) encapsulate invariants and behavior
   - Services calculate scores, advance rounds, emit events
   - No Next.js, React, or Prisma code in `src/domain/**`
   - Domain layer testable in isolation without database

3. **One-Way Dependency Flow**
   ```
   Presentation (pages, hooks, components)
   ↓ (depends on DTOs)
   Application (services, use cases)
   ↓ (depends on entities, repositories)
   Domain (entities, value objects, aggregates, events)
   ↓ (depends on nothing—framework agnostic)

   Infrastructure (Prisma, Supabase, WebSocket)
   ↓ (implements domain interfaces)
   Domain (repositories interface only)
   ```

---

## Data Flow

### HTTP Request Path
```
User action (form submit, button click)
   ↓
Next.js API route validates input via zod DTO schema
   ↓
Application service receives DTO input
   ↓
Service calls domain service/use case with entity inputs
   ↓
Entity enforces invariants, performs business logic
   ↓
Repository persists changes to Prisma → Supabase Postgres
   ↓
Service maps entity back to DTO output
   ↓
API route returns JSON DTO to client
   ↓
TanStack Query updates cache
   ↓
Component re-renders with new data
```

### Realtime Event Path (Supabase Realtime)
```
Database change (quiz advanced, player answered)
   ↓
Supabase Realtime trigger broadcasts to channel
   ↓
Client-side RealtimeClient receives event JSON
   ↓
Event handler parses JSON into DTO shape
   ↓
TanStack Query `setQueryData()` updates cache optimistically
   ↓
Components watching query re-render with new data
```

---

## Layer Details

### Domain Layer (`src/domain/**`)

**Responsibility**: Pure business logic, invariant enforcement, framework-agnostic.

**Key Artifacts**:

- **Entities** (`entities/**`): `Quiz`, `Question`, `Player`, `Answer`
  - Encapsulate identity and mutable behavior
  - Constructor/factory enforces invariants (e.g., "Quiz cannot start without ≥1 question")
  - Expose commands (`start()`, `submitAnswer()`) and queries (`getScore()`, `getStatus()`)
  - Example: `Quiz.start()` validates state, transitions to Active, emits `QuizStartedEvent`

- **Value Objects** (`value-objects/**`): `Timer`, `Score`, `Scoring Strategy`, `JoinCode`
  - Immutable, identity via equality not ID
  - Example: `Timer` encapsulates countdown logic; `Score` represents calculated points with method to format for display
  - `ScoringStrategy` interface with implementations (`ExponentialDecay`, `Linear`, `Fixed`)

- **Aggregates** (`aggregates/**`): `QuizSessionAggregate`
  - Cluster of entities coordinating state transitions
  - Single root entity (`Quiz`) controls lifecycle
  - Example: `QuizSessionAggregate.startRound()` → validates current state → transitions questions → emits events → returns updated aggregate

- **Events** (`events/**`): `QuizStartedEvent`, `PlayerAnsweredEvent`, `QuizEndedEvent`, `RoundEndedEvent`
  - Immutable records of what happened
  - Payload is DTO-ready (serializable)
  - Used for: realtime broadcasting, audit logs, analytics, side effects

- **Repositories** (`repositories/**`): Interfaces only
  - Define async methods the infrastructure must implement
  - Example: `IQuizRepository.findActiveByCode(code: string): Promise<Quiz | null>`
  - No Prisma types, no HTTP details

**Testing**: Pure Vitest unit tests, no mocks for entities/VOs, mocked repositories.

### Application Layer (`src/application/**`)

**Responsibility**: Orchestrate domain entities via use cases/services, expose DTOs to presentation.

**Key Artifacts**:

- **Use Cases** (`use-cases/**`): Single-purpose orchestrators
  - Kebab-cased files: `start-quiz.use-case.ts`, `submit-answer.use-case.ts`
  - Input: DTO (zod-validated)
  - Process: Call repositories, instantiate domain entities, invoke commands
  - Output: DTO or error enum
  - Example:
    ```typescript
    export async function startQuizUseCase(input: StartQuizInput): Promise<Result<QuizDTO, StartQuizError>> {
      const quiz = await quizRepo.findEntityById(input.quizId); // Fetch entity
      if (!quiz) return { success: false, error: 'QUIZ_NOT_FOUND' };
      quiz.start(); // Domain command
      await quizRepo.save(quiz); // Persist
      return { success: true, data: quizToDTO(quiz) }; // Return DTO
    }
    ```

- **Services** (`services/**`): Facade grouping related use cases
  - Examples: `QuizService`, `PlayerService`, `AnswerService`
  - Expose methods like `startQuiz()`, `submitAnswer()`, `getQuizState()`
  - Depend only on repositories + domain, not Next.js or React
  - Centralize error mapping, logging, telemetry hooks
  - Return typed error enums for API routes to map to HTTP status codes

- **Service Factory** (`services/factories.ts`): Singleton wiring
  - Instantiates all services with Prisma repositories
  - Ensures single Prisma client instance
  - Exported: `getServices()` called by API routes
  - Tests call `resetServices({ force: true })` to inject test repositories

- **DTOs** (`dtos/**`): Data contracts
  - Zod schemas for every API input/output shape
  - Examples: `StartQuizInput`, `QuizDTO`, `PlayerDTO`, `SubmitAnswerInput`
  - Centralize entity→DTO mappers (e.g., `quizToDTO()`, `playerToDTO()`)
  - Reused across API routes, hooks, and service tests

**Testing**: Vitest with in-memory repository doubles, covering success + error paths.

### Infrastructure Layer (`src/infrastructure/**`)

**Responsibility**: Implement domain interfaces, manage external services (Prisma, Supabase, WebSocket).

**Key Artifacts**:

- **Database** (`database/`):
  - `prisma/schema.prisma`: All models (Quiz, Question, Player, Answer, etc.)
  - `prisma/migrations/`: Version-controlled Prisma migrations
  - `prisma/generated/client/`: Generated Prisma types (git-ignored, regenerated via `yarn prisma:generate`)
  - `client.ts`: Singleton Prisma client with driver adapter, graceful shutdown
  - Seed helpers (`seed-helpers.ts`, `seed.ts`) for demo data

- **Repositories** (`repositories/**`):
  - Implement domain repository interfaces
  - Examples: `PrismaQuizRepository`, `PrismPlayerRepository`
  - Rebuild aggregates from normalized rows (e.g., fetch questions, sort by `orderIndex`, hydrate answers)
  - Map Prisma types → domain entities via helpers (e.g., `prismaQuizToEntity()`)
  - Reuse DTO mappers for consistency

- **Realtime** (`realtime/`):
  - `RealtimeClient` interface (transport-agnostic)
  - Implementation: `createSupabaseRealtimeClient` (Supabase Realtime over HTTPS)
  - Methods: `subscribe(channel, callback)`, `emit(channel, event)`, `disconnect()`
  - Broadcast handlers update TanStack Query caches

- **Auth** (`auth/`):
  - Supabase Auth client for browser/server contexts
  - Cookie management via `@supabase/ssr`
  - Admin email allowlist check

- **Storage** (`storage/`):
  - `IStorageService` interface (cloud-agnostic)
  - Supabase implementation: upload/delete files to `quiz-media` bucket
  - Client-side resize helpers normalize image sizes before upload

**Testing**: Integration tests against disposable Prisma test DB, contract tests for repository methods.

### Presentation Layer (`src/app/**`, `src/components/**`, `src/hooks/**`)

**Responsibility**: Render UI, orchestrate user interactions, sync with server/realtime.

**Key Artifacts**:

- **Routes** (`app/**`):
  - Next.js App Router with Server/Client components
  - Structure: `(feature)/**` using route groups for shared layouts
  - Server components fetch initial DTOs via direct service calls
  - Client components subscribe via hooks for live updates
  - API routes (`app/api/**`): Validate DTOs, call services, return JSON

- **Components** (`components/**`):
  - `ui/`: shadcn primitives (Button, Dialog, Input, Table, etc.)
  - `feature/`: Host/Player/Admin composites (QuizList, PlayerAnswerPad, ScoringCard)
  - All components receive DTOs as props—never entities or Prisma types
  - Local state only for ephemeral UI (input text, dialog toggle)

- **Hooks** (`hooks/**`):
  - TanStack Query hooks for data fetching/mutation
  - Pattern: `useQuizState()`, `usePlayerSession()`, `useHostDashboard()`
  - Each hook manages: query key, API endpoint, cache updates, optimistic mutations
  - Realtime hooks subscribe to Supabase Realtime and push events into TanStack cache
  - Example:
    ```typescript
    export function useQuizState(quizId: string) {
      return useQuery({
        queryKey: ['quiz', quizId],
        queryFn: async () => {
          const res = await fetch(`/api/quiz/${quizId}/state`);
          return res.json() as QuizDTO;
        },
        refetchInterval: false, // Realtime only
      });
    }
    ```

**Testing**: Component tests (React Testing Library) + Playwright E2E flows.

---

## Directory Structure

```plaintext
src/
├── app/                              # Next.js App Router routes
│   ├── (admin)/
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   └── admin/
│   │       ├── page.tsx              # Dashboard
│   │       ├── layout.tsx            # Header with logout
│   │       └── quizzes/
│   │           ├── page.tsx          # Quiz CRUD
│   │           └── [quizId]/
│   │               └── page.tsx      # Question CRUD
│   ├── (host)/
│   │   └── quiz/[quizId]/
│   │       └── page.tsx              # Host dashboard
│   ├── (player)/
│   │   ├── join/
│   │   │   └── page.tsx
│   │   └── play/[quizId]/[playerId]/
│   │       └── page.tsx
│   ├── api/
│   │   ├── admin/                    # Admin CRUD endpoints
│   │   ├── quiz/                     # Host/player session endpoints
│   │   └── player/                   # Player action endpoints
│   ├── globals.css                   # Tailwind tokens & utilities
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Landing page
│   └── providers.tsx                 # Query client + realtime context
├── components/
│   ├── ui/                           # shadcn primitives
│   ├── admin/                        # Admin feature components
│   ├── host/                         # Host feature components
│   └── player/                       # Player feature components
├── hooks/
│   ├── use-countdown-timer.ts
│   ├── use-host-quiz-state.ts
│   ├── use-player-session.ts
│   ├── use-realtime-client.tsx
│   └── ... (feature hooks)
├── domain/                           # Pure business logic
│   ├── entities/
│   ├── value-objects/
│   ├── aggregates/
│   ├── events/
│   └── repositories/                 # Interfaces only
├── application/
│   ├── dtos/                         # Zod schemas + mappers
│   ├── services/
│   │   ├── quiz-service.ts
│   │   ├── player-service.ts
│   │   ├── answer-service.ts
│   │   └── factories.ts              # Service instantiation
│   └── use-cases/
├── infrastructure/
│   ├── database/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   ├── generated/            # git-ignored
│   │   │   ├── seed.ts
│   │   │   └── seed-helpers.ts
│   │   └── client.ts                 # Singleton Prisma instance
│   ├── repositories/                 # Prisma implementations
│   ├── realtime/                     # WebSocket/Realtime adapters
│   ├── auth/                         # Supabase Auth client
│   └── storage/                      # File upload service
├── lib/
│   ├── utils.ts                      # `cn()` helper, shared utilities
│   ├── env-validation.ts             # Environment variable schema
│   ├── image-utils.ts                # Client-side image resizing
│   ├── scoring-client.ts             # Score calculation for display
│   └── ... (other utilities)
└── tests/
    ├── domain/                       # Entity/VO unit tests
    ├── application/                  # Service/use case tests
    ├── infrastructure/               # Repository tests
    └── integration/                  # End-to-end integration tests

docs/
├── INDEX.md                          # Navigation hub (this structure)
├── ARCHITECTURE.md                   # Architecture decisions (this file)
├── DECISION-LOG.md                   # Architecture decision records (ADRs)
├── PROGRESS.md                       # Release & session tracking
├── plan.md                           # Roadmap & release goals
├── guides/
│   ├── SETUP.md                      # Initial project setup
│   ├── DDD-STRUCTURE.md              # Building domain/app layers
│   ├── DATA-LAYER.md                 # Prisma & repositories
│   ├── PRESENTATION-LAYER.md         # Routes, hooks, components
│   └── MEDIA-UPLOADS.md              # Image upload feature
├── progress/
│   ├── sessions/
│   │   ├── 2025-12-20-admin-question-crud-rewrite.md
│   │   └── ... (dated session files)
│   ├── actions/
│   │   ├── 01-define-dto-catalog.md
│   │   └── ... (release checklist items)
│   └── dev-notes.md                  # Execution log
└── mockups/                          # UX reference images
```

---

## Design Decisions & Trade-offs

### 1. Prisma v7 + Driver Adapter (Vercel Compatibility)

**Decision**: Use `@prisma/adapter-pg` instead of default Data Proxy.

**Rationale**:
- Vercel Edge Functions require HTTP adapters; driver adapter allows serverless + Edge compatibility
- Single connection pooling strategy (PgBouncer or Supabase Connection Pooler)
- Deterministic builds on Vercel (regenerate client via `prisma:generate` in `prebuild` script)

**Trade-offs**:
- ❌ Cannot use default Prisma client syntax; must instantiate with adapter
- ✅ Full SQL access, no serverless limitations
- ✅ Type safety + migrations stay powerful

**Implementation**:
```typescript
// src/infrastructure/database/client.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
```

### 2. Supabase Realtime over Socket.IO

**Decision**: Use Supabase Realtime (HTTPS long-polling + WebSocket) for <300ms latency.

**Rationale**:
- Native HTTPS support (no CORS issues)
- Built-in presence tracking and message broadcasting
- Scales with Supabase (no separate service needed)
- RLS policies can gate realtime channels per user/quiz

**Trade-offs**:
- ❌ Requires Supabase project (no self-hosted alternative yet)
- ✅ No Socket.IO server to manage
- ✅ Integrated auth via JWT

**Adapter Pattern**: `RealtimeClient` interface allows swapping Supabase for Socket.IO or tRPC WebSockets later.

### 3. Email Allowlist + Supabase RLS (Auth Strategy)

**Decision**:
- **R4**: Simple email allowlist in `.env` for admin access
- **R5+**: Migrate to Supabase RLS policies with custom JWT claims

**Rationale**:
- MVP speed: Email check in middleware is trivial
- Scalability: RLS policies enforce auth at DB layer, not app layer
- Security: Custom JWT claims embed user role, RLS can gate quiz queries per user

**Trade-offs**:
- ❌ Early approach doesn't scale to org-based permissions
- ✅ Can add team/org later via RLS without major refactor
- ✅ Supabase Auth provides free tier for small teams

### 4. TanStack Query + Manual Realtime Cache Updates

**Decision**: Use TanStack Query for server state, manually push Realtime events into cache.

**Rationale**:
- Single source of truth for remote state
- Optimistic mutations (submit answer before server confirms)
- Automatic deduplication, retry logic, stale time management
- Fine-grained control over what triggers re-renders (query-key isolation)

**Trade-offs**:
- ❌ Requires discipline: must always update Query caches on Realtime events
- ✅ Predictable caching strategy
- ✅ Works offline-first (queue mutations, sync when online)

**Example**:
```typescript
// Hook subscribes to realtime, updates query cache
realtime.subscribe('quiz:state', (data: QuizDTO) => {
  queryClient.setQueryData(['quiz', quizId], data);
});
```

### 5. Iterative Test Development (Manual → Automated)

**Decision**: Write E2E tests by first manually exploring UI via Playwright MCP.

**Rationale**:
- Discover real selectors, timing issues, and async behaviors before writing tests
- Avoid flaky tests from bad wait conditions or wrong locators
- Document working UI patterns for future developers

**Trade-offs**:
- ❌ Extra upfront time (manual exploration before automation)
- ✅ Reduced test maintenance (tests match real user flows)
- ✅ Fewer CI flakes and false negatives

**Reference**: See `docs/progress/sessions/2025-12-20-admin-question-crud-rewrite.md` for detailed workflow.

---

## Common Patterns

### R5 Realtime & Scoring Patterns

This section documents the production-ready realtime features implemented in R5.

#### Speed-Based Scoring System

**Scoring Strategies** (`src/domain/value-objects/scoring-strategy.ts`):
- **ExponentialDecay**: Points decrease rapidly at first, then level off. `score = basePoints * e^(-decayRate * responseTime)`
- **LinearDecay**: Points decrease linearly with time. `score = basePoints * (1 - responseTime / maxTime)`
- **FixedPoints**: All correct answers get same points regardless of speed

**Configuration** (per quiz):
- `scoringStrategy`: 'exponential' | 'linear' | 'fixed'
- `basePoints`: Maximum points for instant answer (default: 1000)
- `decayRate`: For exponential, controls decay speed (default: 0.1)
- `timeLimitSeconds`: Question time limit (default: 30s)

**Example Calculation**:
```typescript
// Exponential decay: 1000 * e^(-0.1 * 5) = 607 points for 5-second response
const score = calculateScore(quiz.scoringStrategy, 5, quiz.timeLimitSeconds, quiz.basePoints);
```

#### Presence & Connection Health

**PresenceMonitor** (`src/domain/aggregates/presence-monitor.ts`):
- Tracks heartbeat timestamps per player
- Configurable `heartbeatIntervalMs` (default: 5000ms) and `timeoutMs` (default: 15000ms)
- Emits `presence:connected` / `presence:disconnected` events

**Connection Status Flow**:
```
Player joins → PresenceMonitor.markConnected(playerId)
               ↓
Every 5s → Player sends heartbeat → PresenceMonitor.recordHeartbeat(playerId)
               ↓
No heartbeat for 15s → PresenceMonitor marks disconnected → UI shows "Disconnected"
               ↓
Player returns → PresenceMonitor.markConnected(playerId) → UI shows "Connected"
```

**Hooks**:
- `usePresence()`: Sends periodic heartbeats, monitors online status
- `useNetworkStatus()`: Detects browser online/offline events
- `useReconnection()`: Orchestrates reconnection flow with exponential backoff

#### Round Transitions & Answer Locking

**Question Lifecycle**:
1. **QuestionRevealedEvent**: Host advances to question, timer starts
2. **PlayerAnsweredEvent**: Player submits answer, score calculated
3. **QuestionLockedEvent**: Timer expires OR host locks manually, no more answers accepted
4. **RoundSummaryDTO**: Contains correct answer, player scores, leaderboard delta

**Locking Mechanism**:
```typescript
// API: POST /api/quiz/{quizId}/questions/{questionId}/lock
// Service: lockQuestion() sets question.lockedAt, emits QuestionLockedEvent
// Clients: useRoundSummaryListener() receives event, shows summary overlay
```

**Leaderboard Snapshots**:
- Stored per question for historical analysis
- Contains: rank, playerId, playerName, currentScore, deltaFromPrevious

#### Reconnection Flow

**Auto-Recovery Sequence**:
```
Network disconnect detected (useNetworkStatus)
   ↓
UI shows "Connection lost" indicator
   ↓
Browser online event fires
   ↓
useReconnection initiates recovery:
  1. Re-authenticate session (verify player still in quiz)
  2. Fetch current quiz state (GET /api/quiz/{quizId}/state)
  3. Fetch player session (GET /api/player/{playerId}/session)
  4. Hydrate TanStack Query caches
  5. Resume realtime subscriptions
   ↓
UI shows current question/timer (seamless continuation)
```

**Exponential Backoff**: Retry delays: 1s → 2s → 4s → 8s → 16s (max 5 retries)

### Adding a New Feature (Quiz Operation)

Example: Add ability to mark quiz complete.

**Step 1: Domain Layer**
```typescript
// src/domain/entities/quiz.ts
export class Quiz {
  markComplete(): void {
    if (this.status !== 'ACTIVE') throw new InvalidStateError();
    this.status = 'COMPLETED';
    this.events.push(new QuizCompletedEvent(this.id, Date.now()));
  }
}
```

**Step 2: Repository Interface** (already defined)
```typescript
// src/domain/repositories/quiz-repository.ts
export interface IQuizRepository {
  findEntityById(id: string): Promise<Quiz | null>;
  save(quiz: Quiz): Promise<void>;
}
```

**Step 3: Application Layer (Use Case)**
```typescript
// src/application/use-cases/complete-quiz.use-case.ts
export async function completeQuizUseCase(quizId: string): Promise<Result<QuizDTO>> {
  const quiz = await quizRepo.findEntityById(quizId);
  if (!quiz) return { success: false, error: 'NOT_FOUND' };
  quiz.markComplete();
  await quizRepo.save(quiz);
  return { success: true, data: quizToDTO(quiz) };
}
```

**Step 4: Application Service**
```typescript
// src/application/services/quiz-service.ts
export class QuizService {
  async completeQuiz(quizId: string): Promise<QuizDTO> {
    const result = await completeQuizUseCase(quizId);
    if (!result.success) throw new QuizError(result.error);
    return result.data;
  }
}
```

**Step 5: API Route**
```typescript
// src/app/api/quiz/[quizId]/complete/route.ts
export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const { quizId } = await params;
  const services = getServices();
  const dto = await services.quizService.completeQuiz(quizId);
  return NextResponse.json(dto);
}
```

**Step 6: Hook & Component**
```typescript
// src/hooks/use-complete-quiz.ts
export function useCompleteQuiz() {
  return useMutation({
    mutationFn: (quizId: string) =>
      fetch(`/api/quiz/${quizId}/complete`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (data: QuizDTO) => {
      queryClient.setQueryData(['quiz', data.id], data);
    },
  });
}

// src/components/host/complete-button.tsx
export function CompleteButton({ quizId }: { quizId: string }) {
  const { mutate } = useCompleteQuiz();
  return <button onClick={() => mutate(quizId)}>Complete Quiz</button>;
}
```

### Adding a DTO Field

When a field needs to be added (e.g., `isPublished` to `QuizDTO`):

1. **Update DTO schema**: `src/application/dtos/quiz.dto.ts`
   ```typescript
   export const QuizDTO = z.object({
     ...existing,
     isPublished: z.boolean(),
   });
   ```

2. **Update entity** (if domain-relevant): `src/domain/entities/quiz.ts`
   ```typescript
   export class Quiz {
     isPublished: boolean = false;
     publish(): void { this.isPublished = true; }
   }
   ```

3. **Update mappers**: `src/application/dtos/quiz.dto.ts`
   ```typescript
   export function quizToDTO(quiz: Quiz): QuizDTO {
     return {
       ...existing,
       isPublished: quiz.isPublished,
     };
   }
   ```

4. **Update Prisma schema** (if persisted): `src/infrastructure/database/prisma/schema.prisma`
   ```prisma
   model Quiz {
     ...existing
     isPublished Boolean @default(false)
   }
   ```
   Then: `yarn prisma:migrate -- --name add_published_flag`

5. **Update repository mapper**: `src/infrastructure/repositories/prisma-quiz-repository.ts`
   ```typescript
   function prismaQuizToEntity(row: PrismaQuiz): Quiz {
     const quiz = new Quiz(...);
     quiz.isPublished = row.isPublished;
     return quiz;
   }
   ```

6. **Update all API routes** returning `QuizDTO` (already done if using `quizToDTO()` helper).

7. **Update all hooks/components** consuming `QuizDTO`.

---

## Related Documents

- [DECISION-LOG.md](DECISION-LOG.md) – Architecture decision records with timestamps
- [PROGRESS.md](PROGRESS.md) – Release tracking and session index
- [plan.md](plan.md) – Roadmap and release goals
- [guides/SETUP.md](guides/SETUP.md) – Initial project setup
- [guides/DATA-LAYER.md](guides/DATA-LAYER.md) – Prisma & repository patterns
- [guides/PRESENTATION-LAYER.md](guides/PRESENTATION-LAYER.md) – Routes, hooks, components
