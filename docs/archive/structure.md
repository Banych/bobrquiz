# Application Structure (DDD-lite)

## Guiding Principles
- Follow a DTO → Entity → Service → Presentation flow.
- Keep business rules in pure TypeScript (domain) so they stay testable without Next.js.
- Application services orchestrate repositories, emit domain events, and expose typed results to hooks/TanStack Query.
- Presentation layer deals only in DTOs and hooks so UI code stays declarative and easy to hydrate on the client.

```
HTTP/WebSocket request
   ↓ (validation transforms)
DTO (zod/yup schemas)
   ↓
Domain Entities & Value Objects
   ↓
Application Services / Use Cases
   ↓
Repositories (Prisma → Supabase)
   ↓
Presentation (hooks, components, pages)
```

## Layer Details

### Domain
- **Entities**: `Quiz`, `Question`, `Player`, `Answer`, etc. Each exposes behavior (start/end quiz, record answer, compute score) and enforces invariants. `Quiz` now tracks a shareable `joinCode` so clients can discover sessions without leaking internal IDs; the aggregate surfaces it for repositories/API layers.
- **Value objects**: `Timer`, `Score`, session codes, media references.
- **Aggregates**: `QuizSessionAggregate` coordinates quiz state machine and events.
- **Events**: `QuizStartEvent`, `PlayerAnsweredEvent`, `QuizEndedEvent` for downstream reactions.
- **Location**: `src/domain/**` as already established. Domain stays framework-agnostic.

### Application (Use Cases & Services)
- **Use cases** in `src/application/use-cases` orchestrate multiple entities/repositories (e.g., `startQuiz`, `submitAnswer`).
- **Services** in `src/application/services` encapsulate reusable workflows (player service, quiz service). They expose DTO-shaped outputs so hooks can consume them directly.
- **DTOs & Validation**: Introduce `src/application/dtos/` with zod schemas. DTOs are shared between API routes, services, and hooks.
- **Error handling**: typed errors bubble up for React to render friendly states.

### Infrastructure / Data Access
- **Prisma + Supabase**: `src/infrastructure/database/prisma` holds the Prisma schema, generated client, and adapter-wired client (`@prisma/adapter-pg`). Repository implementations live under `src/infrastructure/repositories`, fulfilling the domain interfaces in `src/domain/repositories`.
- **Realtime**: `src/infrastructure/realtime` provides the Supabase Realtime adapter (`RealtimeClient`), replacing the earlier generic WebSocket placeholder.
- **External APIs**: wrappers for media/CDN, analytics, etc., live here.

### Presentation
- **Next.js routes**: `src/app/**` contains host, player, admin routes (App Router). Server components fetch initial DTOs; client components rely on TanStack Query.
- **UI kit**: `src/components/ui` for primitive components, plus feature-specific components under `src/components/feature-name`.
- **Hooks**: `src/hooks/**` houses TanStack Query hooks plus realtime wiring (`useHostSession`, `usePlayerSession`, etc.). Hooks wrap application services, manage caching, and expose optimistic updates; presentation code does not talk to Supabase directly.
- **State sync**: TanStack Query handles server state; local component state only for ephemeral UI (input text, modal toggles).

## Data Contracts
- **DTOs**:
  - `QuizDTO`: id, title, rounds, timing config, media descriptors.
  - `QuestionDTO`: prompt metadata minus correct answers for host view, minimal metadata for player view.
  - `PlayerDTO`: id, name, status, score snapshot.
- They are the only shapes crossing the presentation boundary. Entities never leak to React components.

## Directory Targets
```plaintext
src/
├── app/                   # Next.js routes (host, player, admin)
├── components/
│   ├── ui/                # Reusable primitives
│   └── feature/           # Host/Player/Admin composites
├── hooks/                 # TanStack Query + realtime hooks
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── aggregates/
│   ├── events/
│   └── repositories/      # Interfaces only
├── application/
│   ├── dtos/
│   ├── services/
│   └── use-cases/
├── infrastructure/
│   ├── database/
│   │   ├── prisma/        # schema.prisma + generated client + adapter-wired Prisma client
│   ├── repositories/      # Prisma implementations
│   ├── realtime/          # Supabase Realtime adapter
│   └── media/             # integrations (Supabase Storage, etc.)
└── lib/                   # Shared utils (formatters, logger, config)
```

## Testing Strategy Alignment
- **Domain**: pure unit tests (Vitest) per entity/value object.
- **Application**: service/use-case integration tests with in-memory repositories or Prisma test DB.
- **Infrastructure**: contract tests ensuring repository behavior matches domain expectations.
- **Presentation**: component tests (React Testing Library) + Playwright flows once host/player UIs are ready.

## Hooks & TanStack Query Usage
- Each feature page gets a `queries.ts` file that exports hook factories (e.g., `useHostRoundStats(sessionId)`).
- Hooks call application services through thin API routes (`app/api/**`). Server routes validate DTOs, call services, and return JSON.
- Realtime hooks subscribe to Supabase channels and update Query caches via `queryClient.setQueryData` for low-latency UI updates.

## Deployment Flow
- Yarn scripts orchestrate build/test/lint.
- Vercel handles Next.js deployment; Prisma migrations run via GitHub Action + Supabase connection.
- If Supabase Realtime limits are reached, we can swap the adapter to another transport (e.g., self-hosted WebSocket worker) without changing hooks. Track the decision in Infrastructure docs before R5.
