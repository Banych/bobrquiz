# Supabase anonymous clients — ledger

Branch `fix/supabase-anon-clients`, cut from master 93dd6d4, in `.claude/worktrees/fix-supabase-anon-clients`.
Bug fix: root cause first (read-only investigation, opus), then option (b) approved in chat
(user: "approve (b)", 2026-10-15). Capable-tier files → implementer-capable, task-reviewer-capable.

## Symptom
Dev log (lucide-react ledger): 302 lines "Multiple GoTrueClient instances detected in the same
browser context" (151 browser warnings, each mirrored by the server): N=1 69, N=2 69, N=3 13.
Call sites from the mirrored lines: N=1 and N=2 at supabase-realtime-client.ts:235, N=3 at
supabase-auth-client.ts:23.

## Root cause
auth-js counts GoTrueClients per storageKey and warns for every instance after the first in a
browser (`@supabase/auth-js/dist/main/GoTrueClient.js:115-121`). The presence tracker
(presence-tracker.ts:316, module-cached) and the realtime client (supabase-realtime-client.ts:235,
uncached) both called `createClient(url, anonKey)` under supabase-js's default key
`sb-<ref>-auth-token` (index.mjs:373), the same key as the @supabase/ssr cookie client. React
StrictMode (default on in Next 16 dev; next.config sets no reactStrictMode) ran the providers'
`useMemo` factory twice, creating a discarded third client. Admin pages add the ssr client.
The anon clients use no auth and, with persistSession false, never shared storage, a lock or a
BroadcastChannel with the ssr client: the warning was the only cross-client effect. Each anon
client did start a 30 s token-refresh ticker (autoRefreshToken defaulted to true); on the server
the realtime client was built per SSR render, and the presence client once per process.

Options considered (chat, 2026-10-15): (a) one shared browser client — rejected: admin JWT on
realtime, collapsed rate limits, largest change in capable-tier files; (c) `accessToken` callback
so no GoTrueClient is created — rejected: documented for third-party auth, still needs the cache.

## Change (implementer-capable; b7bdc30, 77e036e)
- Both anon clients: `persistSession`, `autoRefreshToken`, `detectSessionInUrl` false and their own
  storage keys (named constants REALTIME_ANON_STORAGE_KEY, PRESENCE_ANON_STORAGE_KEY).
- `getSupabaseRealtimeClient()` + `resetSupabaseRealtimeClient()`, module-cached like
  `getPresenceTracker()`; `createSupabaseRealtimeClient` no longer exported (providers was its only
  caller).
- Server guard (`typeof window === 'undefined'`): the realtime getter returns null (providers fall
  back to the no-op client); `getPresenceTracker` returns a fresh, uncached no-op tracker (its type
  is not nullable). Neither caches on the server.
- providers.tsx: `useState(() => getSupabaseRealtimeClient() ?? createNoopRealtimeClient())`
  instead of `useMemo`; nothing else changed.
- New e2e/supabase-clients.spec.ts: `/` with an empty storageState and `/admin/quizzes` with the
  admin session; fails on any console message containing "Multiple GoTrueClient".

## Verification (implementer, re-checked where marked)
- Red first: 9 failed | 41 passed (50) before the code; after: 50 passed (50). Controller re-run
  of src/tests/infrastructure/realtime: Test Files 4 passed (4), Tests 50 passed (50).
- Mutations: removing the getter's cache check fails "returns the same instance…" (1 failed |
  20 passed); disabling both window guards fails 3 server tests (3 failed | 47 passed); restored.
- yarn test:run: Test Files 65 passed | 1 skipped (66); Tests 477 passed | 1 skipped (478); exit 0.
- yarn lint: exit 0, 5 warnings (pre-existing files). tsc: exit 0 (covers the e2e spec).
  yarn build: exit 0 with .env.local (linked).
- Commits checked for attribution trailers by the controller: 0.
- Pending: E2E (dev server in this worktree), task-reviewer-capable.
