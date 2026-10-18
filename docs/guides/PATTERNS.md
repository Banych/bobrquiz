# Patterns

Long-form patterns for authentication, realtime and state, error handling and
performance. `CLAUDE.md` holds the short form (key patterns and common
pitfalls); this guide holds the detail behind them. For hooks, API routes and
components in full, see [PRESENTATION-LAYER.md](PRESENTATION-LAYER.md).

## Authentication

**Supabase Auth** manages user sessions via the Next.js proxy (`src/proxy.ts`, Next 16's name for middleware).

### Session management

- The proxy verifies the JWT and protects the admin routes (`/admin` pages and `/api/admin` endpoints)
- Redirect unauthenticated users to login; check the admin allowlist for route access

### Auth patterns

- API routes should call `getUser()` from the Supabase client to verify the session
- Return 401 if the session is invalid; return 403 if the role is insufficient
- Use Supabase RLS (Row-Level Security) policies to restrict database access by user ID and role
- Never store auth tokens in localStorage; rely on Supabase session cookies

## Realtime and state

### Server state

- **TanStack Query** handles caching, synchronization, and invalidation of server state
- `src/hooks/**` wraps TanStack Query + domain service calls (queries for reads, mutations for writes)
- Optimistic updates: use `setQueryData` before the mutation completes to improve perceived performance

### Realtime subscriptions

- `src/infrastructure/realtime/` contains the WebSocket adapter contract (`RealtimeClient`); `src/app/providers.tsx` creates the Supabase client and falls back to `createNoopRealtimeClient` when it is unavailable
- Components access it via `RealtimeClientProvider`/`useRealtimeClient`
- Event handlers call `queryClient.setQueryData()` to update the cache when the server pushes updates (e.g., quiz state changes)
- **Never** subscribe to raw WebSocket events in components; always wrap in custom hooks

### Implementation reference

See [PRESENTATION-LAYER.md](PRESENTATION-LAYER.md) for realtime subscription patterns, event types, and optimistic update strategies.

## Error handling

**Errors propagate through layers with structured logging and user-friendly messages.**

### Domain and application layer

- Domain entities and use cases throw plain `Error` with a descriptive message; the API route maps the message to a status (`/not found/i` -> 404, otherwise 400)

### API route error mapping

- Catch errors from services and map them to HTTP status codes:
  - `404` if the error message matches `/not found/i`
  - `400` for validation errors (zod parse failures)
  - `429` for rate-limited requests
  - `500` for unexpected errors (inspect via MCP: `mcp__supabase__get_logs(service: 'api')`)
  - `403` is returned by `src/proxy.ts` for non-admin users on admin routes, not by the routes themselves
- Return a JSON error response with `{ error: string }` structure

### Client-side error handling

- TanStack Query mutations handle errors via the `onError` callback
- Show the hook's `error.message` as inline error text in the component (e.g. `host-quiz-dashboard.tsx`)

## Performance

**Optimize for quiz gameplay: fast turn-taking, responsive UI, and efficient data loading.**

### Query optimization

- Use TanStack Query `staleTime` to minimize API calls:
  - Quiz state: `staleTime: 5s` (updates via realtime; `refetchInterval` 5s as fallback)
  - Player list: `staleTime: 5s` (updates via realtime)
- Combine related queries into a single API call when possible (e.g., quiz + questions + player state)
- Use `useQuery` for reads, `useMutation` for writes; batch writes when safe

### Pagination and lazy loading

- Admin quiz list: use cursor-based pagination or limit to 20 per page
- Question bank: load on demand in dialogs (don't load all questions upfront)
- Player results: stream to the UI incrementally as scoring completes

### Bundle and code splitting

- Route-based code splitting: Next.js auto-splits by `(admin)`, `(host)`, `(player)` route groups
- Lazy load heavy components: dialog modals, chart libraries via dynamic imports
- Monitor bundle size: `yarn build` output shows size per route; keep client bundles < 100KB

### Database optimization

- Index frequently queried columns: `quizId`, `playerId` (already in schema)
- Use the Supabase MCP to check slow queries: `mcp__supabase__get_logs(service: 'postgres')` for slow logs
- Avoid N+1 queries: Prisma's `include` strategy rebuilds aggregates efficiently

### Realtime performance

- Debounce broadcast events (e.g., player score updates) to avoid flooding the WebSocket
- Use `src/lib/debounce-broadcast.ts` to batch updates every 500ms
- Unsubscribe from unused channels to reduce server load
- A route that broadcasts after a write wraps the broadcast in its own `try/catch` with a
  `console.warn` and still returns 200: the write already happened, and an error response invites a
  retry the domain may refuse (the lock route's retry got "Question already locked", 2026-10-16;
  start and reset routes follow the same shape)

### Implementation reference

See the plans in `docs/progress/plans/` (and the historical `docs/progress/sessions/`) for real
examples of optimization decisions and measured impact.
