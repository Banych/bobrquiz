# Action 07 – R5 Realtime & Scoring Implementation Plan

**Status**: ✅ Superseded by docs/progress/plans/2026-01-31-r5-completion-plan.md (R5 complete 2026-02-01)
**Started**: TBD
**Target Completion**: TBD

## Overview

Implement production-ready game loop with configurable speed-based scoring, round transitions with result summaries, reconnection flows, and load testing. Defer PostHog analytics instrumentation to R6.

## Design Decisions

### Scoring Algorithm
- **Strategy Pattern**: `ScoringStrategy` interface with pluggable implementations
- **Default**: Exponential decay formula: `basePoints * Math.exp(-decayRate * (timeTaken / totalTime))`
- **Configuration**: Per-quiz settings via `scoringAlgorithm` enum ('EXPONENTIAL_DECAY' | 'LINEAR' | 'FIXED') and `scoringDecayRate` Float field
- **Default decay rate**: 2.0 (aggressive), with admin UI allowing 0.5 (gentle) to 5.0 (very aggressive) range

### Round Transitions
- **Host Control**: Manual host control for question advancement (no auto-advance)
- **Answer Locking**: `answersLockedAt` timestamp on Question model; late submissions receive 403 Forbidden with clear error message
- **Leaderboard Snapshots**: Persist historical snapshots after each question via `LeaderboardSnapshot` model for analytics/replay features

### Connection Health
- **Heartbeat**: 10-second ping interval from client to server
- **Disconnect Threshold**: 3 missed heartbeats (30 seconds) before marking player as disconnected
- **UX**: Disconnected players show `WifiOff` icon in `text-orange-500` with tooltip "Disconnected 45s ago, waiting for reconnection"
- **Leaderboard Behavior**: Disconnected players remain visible in leaderboard but visually distinguished

### Load Testing
- **Target**: 100 concurrent players, 50 simultaneous answer submissions
- **Performance Goal**: <300ms round trip latency for realtime broadcasts
- **Tools**: k6 or Artillery for load test scenarios
- **Defer Analytics**: PostHog instrumentation deferred to R6

---

## Phase 1: Configurable Speed-Based Scoring (2-3 days)

### Database Schema Changes
Add to `src/infrastructure/database/prisma/schema.prisma`:

```prisma
model Quiz {
  // ... existing fields ...
  scoringAlgorithm  ScoringAlgorithm @default(EXPONENTIAL_DECAY)
  scoringDecayRate  Float            @default(2.0)
}

enum ScoringAlgorithm {
  EXPONENTIAL_DECAY
  LINEAR
  FIXED
}
```

**Migration**: `yarn prisma:migrate dev --name add-scoring-config`

### Domain Layer Changes

**Create `src/domain/value-objects/scoring-strategy.ts`**:
```typescript
export interface ScoringStrategy {
  calculate(basePoints: number, timeTaken: number, totalTime: number): number;
}

export class ExponentialDecayStrategy implements ScoringStrategy {
  constructor(private decayRate: number = 2.0) {}

  calculate(basePoints: number, timeTaken: number, totalTime: number): number {
    if (totalTime <= 0) return basePoints;
    const timeRatio = timeTaken / totalTime;
    return Math.floor(basePoints * Math.exp(-this.decayRate * timeRatio));
  }
}

export class LinearDecayStrategy implements ScoringStrategy {
  calculate(basePoints: number, timeTaken: number, totalTime: number): number {
    if (totalTime <= 0) return basePoints;
    const remainingRatio = Math.max(0, 1 - (timeTaken / totalTime));
    return Math.floor(basePoints * (0.5 + 0.5 * remainingRatio));
  }
}

export class FixedPointsStrategy implements ScoringStrategy {
  calculate(basePoints: number): number {
    return basePoints;
  }
}
```

**Update `src/domain/aggregates/player-session.ts`**:
- Inject `ScoringStrategy` into `submitAnswer` method
- Replace fixed `points = question.points` with `points = strategy.calculate(question.points, timeTaken, question.timeLimitSeconds)`
- Ensure answer entity stores calculated points

**Update `src/domain/aggregates/quiz-session.ts`**:
- `calculateLeaderboard` should persist `currentRank` field after sorting
- Add method to retrieve scoring strategy based on quiz settings

### Application Layer Changes

**Update `src/application/dtos/quiz.dto.ts`**:
```typescript
export const QuizSettingsSchema = z.object({
  // ... existing fields ...
  scoringAlgorithm: z.enum(['EXPONENTIAL_DECAY', 'LINEAR', 'FIXED']).default('EXPONENTIAL_DECAY'),
  scoringDecayRate: z.number().min(0.1).max(5.0).default(2.0),
});
```

**Update `src/application/services/player-service.ts`**:
- In `submitAnswer`, retrieve quiz settings and construct appropriate `ScoringStrategy`
- Pass strategy to `playerSession.submitAnswer()`

**Update `src/app/api/player/answer/route.ts`**:
- After successful answer submission, trigger leaderboard recalculation
- Broadcast updated leaderboard via `broadcastQuizState`

### Admin UI Changes

**Update `src/components/admin/create-quiz-dialog.tsx`** and **`edit-quiz-dialog.tsx`**:
- Add "Scoring Settings" section with:
  - Select dropdown for `scoringAlgorithm` (Exponential Decay, Linear Decay, Fixed Points)
  - Number input for `scoringDecayRate` (0.5 - 5.0, step 0.1) when exponential/linear selected
  - Help text explaining each algorithm

### Testing

**Unit Tests** (`src/tests/domain/value-objects/scoring-strategy.test.ts`):
- Test exponential decay edge cases (0s answer, full time, mid-range)
- Test linear decay calculations
- Test fixed points always returns base value
- Verify decay rate variations (0.5, 2.0, 5.0)

**Integration Tests** (`src/tests/integration/scoring-flow.test.ts`):
- Submit multiple answers with different timings
- Verify scores calculated correctly per strategy
- Confirm leaderboard updates after each answer

---

## Phase 2: Round Transitions & Results (2-3 days)

### Database Schema Changes

```prisma
model Question {
  // ... existing fields ...
  answersLockedAt DateTime?
}

model LeaderboardSnapshot {
  id             String   @id @default(cuid())
  quizId         String
  questionIndex  Int
  playerId       String
  score          Int
  rank           Int
  capturedAt     DateTime @default(now())

  quiz   Quiz   @relation(fields: [quizId], references: [id], onDelete: Cascade)
  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([quizId, questionIndex])
  @@index([playerId])
}
```

**Migration**: `yarn prisma:migrate dev --name add-round-tracking`

### Domain Layer Changes

**Update `src/domain/aggregates/quiz-session.ts`**:
```typescript
export class QuizSession {
  // ... existing methods ...

  lockCurrentQuestion(): void {
    const question = this.getCurrentQuestion();
    if (!question) throw new Error('No active question to lock');
    if (question.answersLockedAt) throw new Error('Question already locked');

    question.answersLockedAt = new Date();
  }

  isQuestionLocked(): boolean {
    const question = this.getCurrentQuestion();
    return !!question?.answersLockedAt;
  }
}
```

**Create `src/domain/events/question-advanced.event.ts`**:
```typescript
export class QuestionAdvancedEvent {
  constructor(
    public readonly quizId: string,
    public readonly previousQuestionIndex: number,
    public readonly newQuestionIndex: number,
    public readonly timestamp: Date = new Date()
  ) {}
}
```

### Application Layer Changes

**Create `src/application/dtos/round-summary.dto.ts`**:
```typescript
export const PlayerResultSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  correct: z.boolean(),
  timeTaken: z.number(),
  pointsEarned: z.number(),
});

export const LeaderboardDeltaSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  previousRank: z.number().nullable(),
  currentRank: z.number(),
  rankChange: z.number(),
});

export const RoundSummaryDTOSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  correctAnswer: z.string(),
  playerResults: z.array(PlayerResultSchema),
  averageTime: z.number(),
  correctCount: z.number(),
  totalPlayers: z.number(),
  leaderboardDeltas: z.array(LeaderboardDeltaSchema),
});

export type RoundSummaryDTO = z.infer<typeof RoundSummaryDTOSchema>;
```

**Create `src/application/use-cases/lock-question.use-case.ts`**:
- Load quiz session
- Call `lockCurrentQuestion()`
- Persist via repository
- Save leaderboard snapshot for current question
- Return round summary DTO

**Create `src/application/mappers/round-summary-mapper.ts`**:
- Map question + answers + leaderboard deltas to `RoundSummaryDTO`

### API Routes

**Create `src/app/api/quiz/[quizId]/question/lock/route.ts`**:
```typescript
export async function POST(request: Request, { params }: { params: { quizId: string } }) {
  const { quizId } = await params;
  const { lockQuestionUseCase } = getServices();

  const roundSummary = await lockQuestionUseCase.execute(quizId);

  // Broadcast round summary to all players
  await broadcastRoundSummary(quizId, roundSummary);

  return NextResponse.json({ roundSummary }, { status: 200 });
}
```

**Update `src/app/api/player/answer/route.ts`**:
```typescript
// After validating request...
const quiz = await quizRepository.findById(quizId);
if (quiz?.isQuestionLocked()) {
  return NextResponse.json(
    { error: 'Answers are locked for this question. Too late!' },
    { status: 403 }
  );
}

// ... continue with normal flow ...
```

**Update `src/app/api/quiz/[quizId]/advance/route.ts`**:
- Emit `QuestionAdvancedEvent` domain event
- Broadcast event via realtime infrastructure

### Realtime Infrastructure

**Create `src/infrastructure/realtime/broadcast-round-events.ts`**:
```typescript
export async function broadcastRoundSummary(
  quizId: string,
  roundSummary: RoundSummaryDTO
): Promise<void> {
  const client = getRealtimeClient();
  const channel = client.channel(`quiz:${quizId}`);

  await channel.send({
    type: 'broadcast',
    event: 'round-summary',
    payload: roundSummary,
  });
}
```

### Testing

**E2E Test** (`e2e/round-transitions.spec.ts`):
```typescript
test('should reject late answers after question lock', async ({ page }) => {
  // Host starts quiz, advances to question 1
  // Player attempts to answer
  // Host locks question
  // Player attempts second answer -> should see 403 error toast
  // Host advances to next question
  // Verify round summary displayed
});
```

---

## Phase 3: Reconnection & Connection Health (2-3 days)

### Database Schema Changes

```prisma
model Player {
  // ... existing fields ...
  lastHeartbeatAt DateTime?
  latencyMs       Int?
  reconnectCount  Int       @default(0)

  leaderboardSnapshots LeaderboardSnapshot[]
}
```

**Migration**: `yarn prisma:migrate dev --name add-connection-tracking`

### Application Layer Changes

**Create `src/application/dtos/connection-status.dto.ts`**:
```typescript
export const ConnectionStatusDTOSchema = z.object({
  playerId: z.string(),
  connected: z.boolean(),
  latency: z.number().nullable(),
  lastSeen: z.date(),
  disconnectedDuration: z.number().nullable(), // seconds since last heartbeat
});

export type ConnectionStatusDTO = z.infer<typeof ConnectionStatusDTOSchema>;
```

**Create `src/application/use-cases/update-player-heartbeat.use-case.ts`**:
```typescript
export class UpdatePlayerHeartbeatUseCase {
  async execute(playerId: string, latencyMs: number): Promise<void> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) throw new Error('Player not found');

    player.lastHeartbeatAt = new Date();
    player.latencyMs = latencyMs;

    await this.playerRepository.update(player);
  }
}
```

**Create `src/application/use-cases/reconnect-player.use-case.ts`**:
```typescript
export class ReconnectPlayerUseCase {
  async execute(quizId: string, playerId: string): Promise<{
    quizState: QuizSessionDTO;
    playerSession: PlayerSessionDTO;
  }> {
    const player = await this.playerRepository.findById(playerId);
    if (!player) throw new Error('Player not found');

    player.reconnectCount += 1;
    player.status = 'Active';
    player.lastHeartbeatAt = new Date();

    await this.playerRepository.update(player);

    const quizState = await this.quizService.getQuizState(quizId);
    const playerSession = await this.playerService.getPlayerSession(playerId);

    return { quizState, playerSession };
  }
}
```

### API Routes

**Create `src/app/api/player/heartbeat/route.ts`**:
```typescript
export async function POST(request: Request) {
  const body = await request.json();
  const { playerId, clientTimestamp } = body;

  const latencyMs = Date.now() - clientTimestamp;

  const { updatePlayerHeartbeatUseCase } = getServices();
  await updatePlayerHeartbeatUseCase.execute(playerId, latencyMs);

  return NextResponse.json({ serverTimestamp: Date.now() }, { status: 200 });
}
```

**Create `src/app/api/quiz/[quizId]/reconnect/route.ts`**:
```typescript
export async function POST(request: Request, { params }: { params: { quizId: string } }) {
  const { quizId } = await params;
  const body = await request.json();
  const { playerId } = body;

  const { reconnectPlayerUseCase } = getServices();
  const result = await reconnectPlayerUseCase.execute(quizId, playerId);

  return NextResponse.json(result, { status: 200 });
}
```

### Client-Side Changes

**Update `src/hooks/use-player-session.ts`**:
```typescript
export function usePlayerSession(quizId: string, playerId: string) {
  // ... existing code ...

  // Heartbeat interval
  useEffect(() => {
    if (!playerId) return;

    const sendHeartbeat = async () => {
      const clientTimestamp = Date.now();
      await fetch('/api/player/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, clientTimestamp }),
      });
    };

    const interval = setInterval(sendHeartbeat, 10_000); // 10 seconds
    sendHeartbeat(); // Send immediately

    return () => clearInterval(interval);
  }, [playerId]);

  // Reconnection handler
  const reconnect = async () => {
    const response = await fetch(`/api/quiz/${quizId}/reconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });

    if (response.ok) {
      const { quizState, playerSession } = await response.json();
      // Update TanStack Query cache
      queryClient.setQueryData(['quiz', quizId], quizState);
      queryClient.setQueryData(['player', playerId], playerSession);
    }
  };

  return { ...existingReturns, reconnect };
}
```

### Host UI Changes

**Update `src/components/host/player-list.tsx`**:
```typescript
import { WifiOff } from 'lucide-react';
import { Badge } from '@ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui/tooltip';

export function PlayerList({ players }: { players: PlayerDTO[] }) {
  return (
    <div className="space-y-2">
      {players.map((player) => {
        const isDisconnected = player.status === 'Disconnected';
        const disconnectedDuration = isDisconnected && player.lastHeartbeatAt
          ? Math.floor((Date.now() - new Date(player.lastHeartbeatAt).getTime()) / 1000)
          : 0;

        return (
          <div key={player.id} className="flex items-center gap-2">
            <span className={isDisconnected ? 'text-muted-foreground' : ''}>
              {player.name}
            </span>

            {isDisconnected && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-orange-500 border-orange-500">
                    <WifiOff className="h-3 w-3 mr-1" />
                    Disconnected
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Disconnected {disconnectedDuration}s ago, waiting for reconnection
                </TooltipContent>
              </Tooltip>
            )}

            <span className="ml-auto">{player.score} pts</span>
          </div>
        );
      })}
    </div>
  );
}
```

### Background Job (Optional)

**Create `src/infrastructure/jobs/mark-disconnected-players.ts`**:
```typescript
// Run periodically (e.g., every 15s) to mark players as disconnected if no heartbeat for 30s
export async function markDisconnectedPlayers(): Promise<void> {
  const threshold = new Date(Date.now() - 30_000); // 30 seconds ago

  const prisma = getPrismaClient();
  await prisma.player.updateMany({
    where: {
      status: 'Active',
      lastHeartbeatAt: { lt: threshold },
    },
    data: { status: 'Disconnected' },
  });
}
```

**Note**: If using Vercel, consider triggering via cron job or external service. For MVP, client-side checks may suffice.

### Testing

**E2E Test** (`e2e/player-reconnection.spec.ts`):
```typescript
test('should allow player to reconnect after network interruption', async ({ page, context }) => {
  // Player joins quiz and answers question 1
  // Simulate network disconnection (setOffline)
  await context.setOffline(true);
  await page.waitForTimeout(40_000); // Wait past 30s threshold

  // Re-enable network
  await context.setOffline(false);

  // Verify reconnection triggers, state restored
  await expect(page.getByText(/Reconnected/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Question 2/i })).toBeVisible();
});
```

---

## Phase 4: Load Testing (1-2 days)

### Setup

**Install k6**:
```bash
brew install k6  # macOS
# or
curl https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz | tar xvz
```

**Create `load-tests/` directory structure**:
```
load-tests/
  ├── scenarios/
  │   ├── concurrent-joins.js
  │   ├── simultaneous-answers.js
  │   └── sustained-session.js
  ├── helpers/
  │   └── api-client.js
  └── run-all.sh
```

### Test Scenarios

**`load-tests/scenarios/concurrent-joins.js`**:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 100, // 100 virtual users
  duration: '30s',
};

export default function () {
  const joinCode = __ENV.JOIN_CODE || 'TEST123';
  const playerName = `Player-${__VU}-${__ITER}`;

  const res = http.post(`${__ENV.BASE_URL}/api/player/add`, JSON.stringify({
    quizId: __ENV.QUIZ_ID,
    name: playerName,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
    'has playerId': (r) => JSON.parse(r.body).playerId !== undefined,
  });

  sleep(1);
}
```

**`load-tests/scenarios/simultaneous-answers.js`**:
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  iterations: 50, // Each VU submits one answer
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/player/answer`, JSON.stringify({
    playerId: `player-${__VU}`,
    questionId: __ENV.QUESTION_ID,
    answer: 'Option A',
    timeTaken: Math.floor(Math.random() * 10) + 1,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'latency < 300ms': (r) => r.timings.duration < 300,
  });
}
```

**`load-tests/scenarios/sustained-session.js`**:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '10m', // 10-minute sustained load
};

export default function () {
  // Simulate player heartbeat
  const heartbeatRes = http.post(`${__ENV.BASE_URL}/api/player/heartbeat`, JSON.stringify({
    playerId: `player-${__VU}`,
    clientTimestamp: Date.now(),
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(heartbeatRes, {
    'heartbeat status is 200': (r) => r.status === 200,
  });

  sleep(10); // Wait 10s between heartbeats
}
```

### Run Scripts

**`load-tests/run-all.sh`**:
```bash
#!/bin/bash

export BASE_URL="http://localhost:3000"
export QUIZ_ID="your-quiz-id-here"
export QUESTION_ID="your-question-id-here"

echo "Running concurrent joins test..."
k6 run scenarios/concurrent-joins.js

echo "Running simultaneous answers test..."
k6 run scenarios/simultaneous-answers.js

echo "Running sustained session test..."
k6 run scenarios/sustained-session.js

echo "All tests complete. Check results above."
```

### Performance Monitoring

**Enable Prisma Query Logging** in `src/infrastructure/database/prisma/client.ts`:
```typescript
const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'production' ? [] : [
    { emit: 'event', level: 'query' },
  ],
});

prisma.$on('query', (e) => {
  console.log(`Query: ${e.query}`);
  console.log(`Duration: ${e.duration}ms`);
});
```

### Documentation

**Create `docs/performance.md`**:
```markdown
# Performance Benchmarks

## Test Environment
- **Date**: YYYY-MM-DD
- **Environment**: Local development / Vercel Preview / Production
- **Database**: Supabase (region: us-east-1)
- **Node Version**: 22.x

## Results

### Concurrent Joins (100 VUs, 30s)
- **Total Requests**: X
- **Success Rate**: Y%
- **Avg Response Time**: Zms
- **P95 Response Time**: Wms

### Simultaneous Answers (50 VUs)
- **Total Requests**: X
- **Success Rate**: Y%
- **Avg Latency**: Zms
- **P95 Latency**: Wms
- **Realtime Broadcast Latency**: <300ms ✅

### Sustained Session (20 VUs, 10m)
- **Total Heartbeats**: X
- **Success Rate**: Y%
- **Connection Drops**: Z

## Bottlenecks Identified
- [ ] Database connection pool saturation (if any)
- [ ] Supabase Realtime channel capacity limits
- [ ] Prisma query N+1 issues

## Recommendations
- [ ] Horizontal scaling strategy for >200 concurrent players
- [ ] Database connection pool tuning
- [ ] Caching layer for quiz metadata
```

---

## Phase 5: Wrap R5 & Prep R6 (1 day)

### Documentation Updates

**Update `docs/plan.md`**:
- Mark R5 as complete with completion date
- Update progress indicators

**Create `docs/progress/sessions/YYYY-MM-DD-r5-realtime-scoring-complete.md`**:
```markdown
# YYYY-MM-DD – R5 Realtime & Scoring Complete ✅

## Completed Deliverables
- [x] Configurable speed-based scoring with exponential decay (default)
- [x] Per-quiz scoring algorithm and decay rate settings
- [x] Round transitions with answer locking and result summaries
- [x] LeaderboardSnapshot persistence after each question
- [x] Player reconnection flows with 30s disconnect threshold
- [x] Connection health monitoring with heartbeat mechanism
- [x] Visual indicators for disconnected players (WifiOff icon, orange badge)
- [x] Load testing with k6 (100 concurrent joins, 50 simultaneous answers)
- [x] Performance documentation with <300ms broadcast latency verified

## Design Decisions
- **Scoring**: Exponential decay with configurable decay rate (0.5-5.0)
- **Host Control**: Manual question advancement (no auto-advance)
- **Answer Lock**: 403 Forbidden for late submissions after lock
- **Disconnect**: 3 missed heartbeats (30s) before marking as disconnected
- **Leaderboard**: Disconnected players remain visible with visual distinction

## Known Limitations
- PostHog analytics deferred to R6
- Auto-advance quiz setting deferred to future release
- Background job for marking disconnected players not implemented (relies on client checks)

## Next Steps (R6)
- Audit log system
- PostHog analytics instrumentation
- Testing improvements (aria-labels, per-worker admin accounts)
- Polish UI/UX based on user feedback
```

**Update `docs/progress/dev-notes.md`**:
```markdown
## 2025-MM-DD – R5 Implementation Notes

### Scoring Strategy Pattern
- Created pluggable `ScoringStrategy` interface for future algorithms
- Exponential decay formula: `basePoints * Math.exp(-decayRate * timeRatio)`
- Per-quiz configuration via `scoringAlgorithm` and `scoringDecayRate` fields

### Connection Health Architecture
- Client sends heartbeat every 10s with latency measurement
- Server stores `lastHeartbeatAt`, `latencyMs`, `reconnectCount`
- 30s threshold for marking disconnected (3 missed heartbeats)
- Reconnection endpoint restores full quiz + player state

### Load Testing Results
- Verified <300ms broadcast latency with 50 concurrent players
- Supabase Realtime handled 100 concurrent connections without issues
- No database connection pool saturation observed at MVP scale
- Performance benchmarks documented in `docs/performance.md`
```

### Demo Script

**Create `docs/r5-demo-script.md`**:
```markdown
# R5 Demo Script – Realtime & Scoring

## Setup
1. Create quiz with 3 questions in admin panel
2. Set scoring to "Exponential Decay" with decay rate 2.0
3. Start dev server: `yarn dev`
4. Open host dashboard in browser 1
5. Open 3 player tabs in browsers 2-4

## Demo Flow

### 1. Speed-Based Scoring (2 min)
- Host starts quiz
- Player 1 answers immediately (3s) → ~95 points
- Player 2 answers slowly (8s) → ~45 points
- Player 3 answers at limit (10s) → ~20 points
- **Show**: Leaderboard auto-updates after each answer with speed-adjusted scores

### 2. Round Transitions (3 min)
- Host locks question after 10s
- Player 4 (late) attempts to answer → **Show**: "Too late!" error toast
- Host reviews round summary showing correctness, times, leaderboard deltas
- Host advances to question 2
- **Show**: All players see new question simultaneously (<300ms)

### 3. Reconnection Flow (2 min)
- Player 2 closes tab (simulated disconnect)
- Wait 35s → **Show**: Host sees "Disconnected" badge on Player 2
- Player 2 reopens tab with saved playerId
- **Show**: Auto-reconnect, state restored, Player 2 rejoins leaderboard

### 4. Final Results (1 min)
- Complete remaining questions
- Host ends quiz
- **Show**: Final leaderboard with historical snapshots
- **Show**: Per-question breakdown of who answered correctly

## Key Talking Points
- Exponential decay rewards speed, configurable per quiz
- Manual host control ensures pacing flexibility
- Reconnection preserves player progress (no penalty)
- Sub-300ms realtime updates for snappy UX
- Historical snapshots enable post-game analytics
```

---

## Testing Checklist

### Unit Tests
- [ ] `scoring-strategy.test.ts` – All strategy calculations
- [ ] `player-session.test.ts` – Speed-based scoring integration
- [ ] `quiz-session.test.ts` – Answer locking, leaderboard snapshots

### Integration Tests
- [ ] `scoring-flow.test.ts` – End-to-end answer submission with different timings
- [ ] `round-transition-flow.test.ts` – Lock → summary → advance flow
- [ ] `reconnection-flow.test.ts` – Disconnect → reconnect with state restoration

### E2E Tests
- [ ] `round-transitions.spec.ts` – Late answer rejection, round summary display
- [ ] `player-reconnection.spec.ts` – Network interruption and recovery
- [ ] `speed-scoring.spec.ts` – Verify faster answers get higher scores

### Load Tests
- [ ] `concurrent-joins.js` – 100 players joining within 30s
- [ ] `simultaneous-answers.js` – 50 answers submitted within 1s
- [ ] `sustained-session.js` – 10-minute session with heartbeats

---

## Risks & Mitigation

### Risk: Realtime broadcast latency >300ms under load
**Mitigation**: Load test with k6 before declaring R5 complete. If latency exceeds target, investigate Supabase channel limits or consider horizontal scaling.

### Risk: Scoring strategy changes break existing quizzes
**Mitigation**: Default all existing quizzes to `EXPONENTIAL_DECAY` with `decayRate: 2.0` via migration. Add unit tests for backward compatibility.

### Risk: Reconnection logic fails with stale state
**Mitigation**: Include timestamp validation in reconnection endpoint. Reject reconnection if quiz has ended or player has been removed.

### Risk: Background job not implemented for marking disconnected players
**Mitigation**: Document limitation clearly. For MVP, rely on client-side checks and host manual intervention. Schedule background job implementation for R6 if needed.

---

## Success Criteria

- [ ] All unit, integration, E2E tests passing
- [ ] Load tests verify <300ms broadcast latency
- [ ] Admin can configure scoring algorithm per quiz
- [ ] Host can lock questions and view round summaries
- [ ] Players see visual indicators for disconnected peers
- [ ] Players can reconnect after 30s+ disconnection
- [ ] Performance benchmarks documented
- [ ] Demo script successfully executed with 4+ players
- [ ] Session log and dev-notes updated
- [ ] `docs/plan.md` marked R5 complete

---

**Status**: 📋 Ready to begin Phase 1
