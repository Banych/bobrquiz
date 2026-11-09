# Parking lot — not in the current milestone

Only the user moves an item into a milestone, and only by removing an issue of similar size.

| Date | Item | Source | Blocks first payment? |
|---|---|---|---|
| 2026-11-09 | Player answers stay locked for 10 s after a lock even when the host advances sooner: `use-round-summary-listener.ts` clears the round summary on a fixed 10 s timer, not on the next question, so options stay disabled (measured on dev: 10.0 s for all 3 players, 0.68 s when the host waited 11 s) | issue 126 verification | no |
| 2026-11-09 | Production Supabase Auth Site URL may still be `http://localhost:3000` (every auth log line's referer is localhost), so reset and sign-up confirmation links would point at localhost; check Authentication → URL Configuration | issue 126 verification | yes |
