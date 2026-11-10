# Load Testing with k6

This directory contains k6 load tests for validating quiz game performance under concurrent load.

## Prerequisites

1. **Install k6:**
   ```bash
   # Windows (via Chocolatey)
   choco install k6

   # macOS (via Homebrew)
   brew install k6

   # Or download from https://k6.io/docs/getting-started/installation/
   ```

2. **Start dev server:**
   ```bash
   yarn dev
   ```

3. **Update quiz ID in config.js:**
   ```javascript
   quizId: 'your-quiz-id-here'
   ```

## Test Scenarios

### 1. Concurrent Player Joins (`concurrent-players.js`)
Tests system handling of 10→25→50 concurrent player joins over 2 minutes.

**Run:**
```bash
k6 run tests/load/concurrent-players.js
```

**Metrics:**
- Player join latency (target: <500ms P95)
- Session creation success rate
- Database connection pool usage

### 2. Answer Submission Storm (`answer-submission-storm.js`)
Tests 25 players submitting answers rapidly (simulates quiz round).

**Run:**
```bash
k6 run tests/load/answer-submission-storm.js
```

**Metrics:**
- Answer submission latency (target: <300ms P95)
- Realtime broadcast delay
- Leaderboard calculation time

### 3. Presence Heartbeat Load (`presence-heartbeat-load.js`)
Tests sustained heartbeat traffic (25 players, 30s intervals, 5 minutes).

**Run:**
```bash
k6 run tests/load/presence-heartbeat-load.js
```

**Metrics:**
- Heartbeat processing time (target: <100ms P95)
- Connection status accuracy
- No false disconnections

## Configuration

All tests share configuration from `config.js`:
- `baseUrl` - API base URL (default: http://localhost:3000)
- `quizId` - Quiz to test against (must exist in database)
- `thresholds` - Performance targets for each operation
- `stages` - Load ramp-up/down patterns

## Performance Targets

| Operation     | Target P95 | Notes                                     |
| ------------- | ---------- | ----------------------------------------- |
| Player Join   | <500ms     | Includes DB insert + session creation     |
| Answer Submit | <300ms     | Includes validation + scoring + broadcast |
| Heartbeat     | <100ms     | Simple timestamp update                   |

**Note:** These targets are for production builds. Dev server (`yarn dev`) will be significantly slower due to hot-reload overhead.

## Interpreting Results

**Success Criteria:**
- ✅ 0% error rate (all requests return 2xx status)
- ✅ Latency within targets (P95 metrics)
- ✅ No false disconnections during heartbeat test

**Common Issues:**
- **High latency on dev server:** Expected - run tests against production build (`yarn build && yarn start`)
- **Setup timeout:** Reduce player count or increase `setupTimeout` in test options
- **404 errors:** Verify quiz ID exists and API routes are correct

## Test Output Example

```
✓ http_req_duration < 500ms
✓ http_req_failed < 1%

checks.........................: 100.00% ✓ 573 ✗ 0
http_req_duration..............: avg=189ms  p(95)=201ms
http_req_failed................: 0.00%   ✓ 0 ✗ 573
```

## Troubleshooting

**"Quiz not found" error:**
- Update `quizId` in `config.js` with valid ID from your database
- Run `yarn prisma:seed` to create demo quiz (set `SEED_QUIZ_OWNER_ID` to the owner's Supabase auth user id first, Authentication → Users; without it the seed exits before touching the database)

**Timeout during setup:**
- Reduce `totalPlayers` in test file
- Increase `setupTimeout` in test options
- Check dev server isn't overwhelmed

**Player name duplicates:**
- Uses timestamp + iteration number for uniqueness
- If still duplicated, check `generatePlayerName()` in config.js

## References

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/docs/test-types/load-testing/)
- [R5 Phase 5 Session Notes](../../docs/progress/sessions/2026-01-31-r5-phase5-load-testing.md)
