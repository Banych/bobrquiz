# Private Realtime channels with the public key — findings (2026-10-18)

**Ran:** a throwaway Node script (`@supabase/supabase-js` from the repo's `node_modules`, legacy
JWT keys from `.env.local`) against the dev Supabase project (`iwnx…`), 2026-10-18. It checked the
first assumption in `docs/progress/plans/2026-10-18-host-player-identity-design.md` before planning.

**Setup:** the dev project had no policies on `realtime.messages`, with row-level security on
(`relrowsecurity = true`). Two temporary policies were added through the Supabase MCP server:
- `spike_identity_select`: `for select to anon`, topic `like 'spike-identity%'`, extension
  `broadcast`.
- `spike_identity_insert`: `for insert to anon`, topic `like 'spike-identity-send:%'`, extension
  `broadcast`.

Both were dropped afterwards; `pg_policies` for schema `realtime` then counted 0. The first
`drop` call failed with the MCP error "Invalid or expired requestState", and a retry with
`drop policy if exists` succeeded. "Allow public access" was not changed, and no app channel was
touched.

## Results

Each client used `channel(topic, { config: { private, broadcast: { ack: true } } })`. Sends were
`channel.send({ type: 'broadcast', … })`, read back after 3 s.

| # | Check | Result |
|---|---|---|
| T1 | Public-key client, private, topic no policy covers (`spike-other:…`): negative control | `CHANNEL_ERROR` "Unauthorized: You do not have permissions to read from this Channel topic: spike-other:…" |
| T2 | Public-key client, private, `spike-identity:…` (select policy only) | `SUBSCRIBED` |
| T3 | Service-role client, private, same topic, sends | send `ok`; the T2 client received it |
| T4 | Second public-key client, private, same topic, sends | send `error`; the T2 client did not receive it |
| T5 | Public-key clients, private, `spike-identity-send:…` (insert allowed): positive control | send `ok`; received |
| T6 | Public-key client, **public** channel, same topic name as T2, sends | send `ok`; the private T2 client did **not** receive it, and this public client did not receive the service-role send from T3 |

## What it means

- **Checked as `anon`.** A client holding only the public key, with no signed-in user, is checked
  against policies written `to anon`.
- **Receive without send.** A `select`-only policy lets the client receive, and its sends are
  refused (T4). T5 shows the refusal comes from the missing insert policy, not from the harness.
- **The server is unaffected.** The service-role key sends on private channels regardless of the
  policies.
- **Public and private channels are separate.** Public and private channels with the same topic
  name don't exchange messages (T6). Forged sends on a public channel never reach private
  subscribers, so turning off "Allow public access" is extra protection rather than a precondition.
  The setting change no longer has to be timed against other users of the dev project.
- **Not checked:** presence on private channels (the design drops browser presence), and the new
  `sb_publishable_…` keys (the project still uses the legacy keys).
