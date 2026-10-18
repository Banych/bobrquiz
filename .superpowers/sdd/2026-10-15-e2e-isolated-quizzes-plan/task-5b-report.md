# Task 5b report

## Status
DONE

## Commit
78b7c75d5be984eb1b44b4e175bd14ca8765682a feat(api): let the join rate limit come from the environment
Files: .env.example, src/app/api/session/join/route.ts, src/lib/rate-limit.ts, src/tests/lib/rate-limit.test.ts (4 files, +49 -2)

## Departures from the plan
- Added one test beyond the brief: 'names the bad value in the error' (asserts /"ten"/), because the task asked for the bad value in the message.
- Error wording: `Rate limit must be a positive integer, got "<trimmed>".` (no env var name, since the helper is generic).
- Join route and .env.example as briefed; add-player and answer routes untouched. .env.development.local not touched.

## Evidence
Red (yarn test:run src/tests/lib/rate-limit.test.ts, before implementing), exit 1:
 Test Files  1 failed (1)
      Tests  8 failed | 7 passed (15)
 (cause: "TypeError: resolveRateLimit is not a function")
Green, same file: Test Files  1 passed (1) / Tests  15 passed (15)
Full yarn test:run, exit 0:
 Test Files  69 passed | 1 skipped (70)
      Tests  522 passed | 1 skipped (523)
yarn lint: exit 0 (0 errors, 5 pre-existing warnings in other files)
yarn -s tsc --noEmit -p .: exit 0
prettier + eslint on the three touched source files: clean.
