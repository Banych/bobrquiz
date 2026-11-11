# Guide: Infrastructure & Data Layer (Prisma & Repositories)

This guide covers how to work with Prisma, design the database schema, implement repositories, and manage migrations. It's where domain entities meet persistence.

## Overview

The data layer bridges the domain (pure business logic) and infrastructure (persistence, external services). Key components:

1. **Prisma schema** (`schema.prisma`): Domain models → SQL tables
2. **Migrations**: Version-controlled schema changes
3. **Repository implementations**: Prisma adapters for domain interfaces
4. **Mappers**: Convert Prisma types ↔ domain entities

**Location**: `src/infrastructure/database/`

---

## Prisma Schema Design

### File Location & Configuration

The schema lives at a custom path (not the default `prisma/schema.prisma`):

```
src/infrastructure/database/prisma/
├── schema.prisma          # Domain models
├── migrations/            # Version-controlled SQL diffs
├── generated/
│   └── client/            # Auto-generated (git-ignored)
└── seed.ts                # Demo data
```

This is configured in `prisma.config.ts` at the project root.

### Naming Conventions

- **Tables**: snake_case (`quiz`, `question`, `player`)
- **Columns**: snake_case (`created_at`, `is_published`)
- **Relations**: Descriptive names (`quizQuestions`, `playerAnswers`)
- **Enums**: PascalCase (`QuizStatus`, `PlayerStatus`)

### Schema Pattern

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client"
  output   = "./generated/client"  # Custom path for v7 adapter
}

// ============= ENUMS =============

enum QuizStatus {
  DRAFT
  ACTIVE
  COMPLETED
  PAUSED
}

enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  TEXT
}

enum PlayerStatus {
  LOBBY
  ANSWERING
  ANSWERED
  DISCONNECTED
}

enum ScoringAlgorithm {
  EXPONENTIAL_DECAY
  LINEAR
  FIXED
}

// ============= MODELS =============

model Quiz {
  // Primary key
  id        String   @id @default(cuid())

  // Core fields
  title     String
  status    QuizStatus @default(DRAFT)
  joinCode  String   @unique

  // Settings (R5: Scoring config)
  scoringAlgorithm  ScoringAlgorithm @default(EXPONENTIAL_DECAY)
  scoringDecayRate  Float            @default(2.0)

  // Relations
  questions Question[]
  players   Player[]

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([joinCode])
  @@index([status])
}

model Question {
  id        String   @id @default(cuid())
  quizId    String
  quiz      Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)

  // Content
  prompt    String
  type      QuestionType
  points    Int      @default(10)
  orderIndex Int     @default(0)

  // Media (R4)
  mediaUrl  String?
  mediaType String?  // "image" | "video" | etc.

  // Options (for MC/T/F)
  options   String[] @default([])
  correctAnswer String? // For T/F, MC (first correct option)

  // Timing (R3)
  durationSeconds Int @default(30)
  answersLockedAt DateTime? // When submissions stop (R5)

  // Domain events
  answers   Answer[]

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([quizId, orderIndex])
  @@index([quizId])
}

model Player {
  id        String   @id @default(cuid())
  quizId    String
  quiz      Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)

  // Player info
  name      String
  status    PlayerStatus @default(LOBBY)
  score     Int      @default(0)

  // Session tracking (R3)
  sessionId String?
  joinedAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  disconnectedAt DateTime?

  // Domain events
  answers   Answer[]

  @@unique([quizId, name])
  @@index([quizId])
  @@index([sessionId])
}

model Answer {
  id        String   @id @default(cuid())
  playerId  String
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  questionId String
  question  Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  // Answer data
  value     String   // User's response
  isCorrect Boolean  @default(false)
  pointsEarned Int   @default(0)

  // Timing
  submittedAt DateTime @default(now())
  responseTimeMs Int?  // How long to answer (R5)

  @@unique([playerId, questionId])
  @@index([playerId])
  @@index([questionId])
}

model LeaderboardSnapshot {
  id        String   @id @default(cuid())
  quizId    String
  quiz      Quiz?    @relation(fields: [quizId], references: [id], onDelete: SetNull)

  // Snapshot data (JSON)
  entries   Json     // [{ playerId, name, score, rank }]

  // When snapshot was taken
  takenAt   DateTime @default(now())

  @@index([quizId])
}
```

### Key Design Decisions

**Cascading deletes**: `onDelete: Cascade` means deleting a quiz deletes all questions/players/answers. (Can change to `SetNull` if you want to archive.)

**Optional fields**: `mediaUrl?` for questions without images, `correctAnswer?` for text questions (no correct answer predefined).

**Unique constraints**: `@@unique([quizId, orderIndex])` ensures questions have unique ordering within a quiz.

**Enums over strings**: Use Prisma enums for status fields (type-safe, fewer DB values).

---

## Migrations

### Creating a Migration

After schema changes:

```bash
# Detect changes, create migration, apply to DB
yarn prisma:migrate -- --name add_scoring_config

# Or explicitly
yarn prisma migrate dev --name add_scoring_config
```

This:
1. Compares `schema.prisma` to current DB
2. Prompts if you need to reset (destructive for dev DB)
3. Generates SQL in `src/infrastructure/database/prisma/migrations/`
4. Applies the migration
5. Regenerates Prisma client

### Migration Best Practices

1. **Descriptive names**: `add_scoring_config` not `change_schema`
2. **Commit migrations**: Always version-control `.sql` files in `migrations/`
3. **Test before push**: Run locally, verify data isn't lost unexpectedly
4. **Never edit SQL manually**: Let Prisma generate it; manually editing creates sync issues

### Troubleshooting Migrations

**"Shadow database not configured"**
```bash
# Fix: Add SHADOW_DATABASE_URL to .env.local
SHADOW_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/quiz_game_shadow?schema=public"
```

**"Cannot run migrate in production"**
```bash
# Use prisma migrate deploy (no reset) in prod
yarn prisma migrate deploy
```

**"Prisma client out of sync"**
```bash
# Regenerate after schema changes
yarn prisma:generate
```

---

## Repository Implementations

Repositories implement domain interfaces (defined in `src/domain/repositories/**`) using Prisma.

### Pattern

```typescript
// src/infrastructure/repositories/prisma-quiz-repository.ts

import { Injectable } from '@nestjs/common'; // Optional: dependency injection
import { prisma } from '@infrastructure/database/client';
import { Quiz } from '@domain/entities/quiz';
import { IQuizRepository } from '@domain/repositories/quiz-repository';

// ============= MAPPERS =============

/**
 * Convert Prisma Quiz model → Domain Quiz entity
 */
function prismaQuizToEntity(data: PrismaQuiz): Quiz {
  const quiz = new Quiz(data.id, data.title);
  quiz.status = data.status;
  quiz.joinCode = data.joinCode;
  quiz.scoringAlgorithm = data.scoringAlgorithm;
  quiz.scoringDecayRate = data.scoringDecayRate;
  return quiz;
}

/**
 * Convert Domain Quiz entity → Prisma-ready data
 */
function entityToQuizData(quiz: Quiz) {
  return {
    title: quiz.title,
    status: quiz.status,
    joinCode: quiz.joinCode,
    scoringAlgorithm: quiz.scoringAlgorithm,
    scoringDecayRate: quiz.scoringDecayRate,
  };
}

// ============= REPOSITORY =============

export class PrismaQuizRepository implements IQuizRepository {
  async findEntityById(id: string): Promise<Quiz | null> {
    const row = await prisma.quiz.findUnique({
      where: { id },
      include: { questions: true, players: true },
    });
    if (!row) return null;
    return prismaQuizToEntity(row);
  }

  async findByJoinCode(code: string): Promise<Quiz | null> {
    const row = await prisma.quiz.findUnique({
      where: { joinCode: code },
      include: { questions: true, players: true },
    });
    if (!row) return null;
    return prismaQuizToEntity(row);
  }

  async findAll(): Promise<Quiz[]> {
    const rows = await prisma.quiz.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(prismaQuizToEntity);
  }

  async save(quiz: Quiz): Promise<void> {
    const data = entityToQuizData(quiz);

    // Upsert: Insert if new, update if exists
    await prisma.quiz.upsert({
      where: { id: quiz.id },
      create: { id: quiz.id, ...data },
      update: data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.quiz.delete({ where: { id } });
  }
}
```

### Key Patterns

**Mappers**: Keep conversion logic in repository (not scattered across code).

**Upsert**: Use `upsert` for save (handles both create/update).

**Include relations**: Fetch child entities (questions, players) with `.include()` when rebuilding aggregates.

**Separate concerns**: Mapper functions (pure) vs. DB operations (async).

### Repository Testing

```typescript
// src/tests/infrastructure/repositories/prisma-quiz-repository.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaQuizRepository } from '@infrastructure/repositories/prisma-quiz-repository';
import { Quiz } from '@domain/entities/quiz';

describe('PrismaQuizRepository', () => {
  let repo: PrismaQuizRepository;

  beforeEach(async () => {
    // Set DATABASE_URL_TEST and ENABLE_PRISMA_INTEGRATION_TESTS=true
    await resetDatabase(); // From seed-helpers
    repo = new PrismaQuizRepository();
  });

  it('should save and retrieve a quiz', async () => {
    const quiz = new Quiz('q1', 'My Quiz');
    await repo.save(quiz);

    const retrieved = await repo.findEntityById('q1');
    expect(retrieved?.getTitle()).toBe('My Quiz');
  });

  it('should find by join code', async () => {
    const quiz = new Quiz('q1', 'My Quiz');
    quiz.joinCode = 'ABC123';
    await repo.save(quiz);

    const retrieved = await repo.findByJoinCode('ABC123');
    expect(retrieved?.getId()).toBe('q1');
  });

  it('should delete a quiz', async () => {
    const quiz = new Quiz('q1', 'My Quiz');
    await repo.save(quiz);
    await repo.delete('q1');

    const retrieved = await repo.findEntityById('q1');
    expect(retrieved).toBeNull();
  });
});
```

---

## Seeding Demo Data

The seed script populates your database with sample quizzes for testing:

```typescript
// src/infrastructure/database/prisma/seed.ts

import { prisma } from '../client';
import { createSampleQuiz, seedSampleQuiz } from './seed-helpers';

async function main() {
  console.log('🌱 Seeding database...');

  // Reset: Drop all tables and recreate schema
  await resetDatabase();

  // Create sample quizzes
  const quiz1 = await seedSampleQuiz(prisma, {
    title: 'General Knowledge',
    questions: [
      { prompt: 'What is 2+2?', type: 'MULTIPLE_CHOICE', options: ['4', '5'], correct: '4' },
      { prompt: 'Is the sky blue?', type: 'TRUE_FALSE', correct: 'true' },
    ],
  });

  console.log('✅ Database seeded');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run with:
```bash
yarn prisma:seed
```

Set `SEED_QUIZ_OWNER_ID` to the owner's Supabase auth user id (Authentication → Users) first; without it the seed exits before touching the database.

---

## Prisma Client Lifecycle

The Prisma client is a singleton to avoid connection leaks:

```typescript
// src/infrastructure/database/client.ts

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
if (typeof window === 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('Shutting down Prisma client...');
    await prisma.$disconnect();
  });
}
```

**Why singleton?** Each `new PrismaClient()` opens a connection pool. Creating multiple instances (e.g., in tests) exhausts connections and causes crashes.

---

## Common Operations

### Fetch with Relations

```typescript
const quiz = await prisma.quiz.findUnique({
  where: { id: 'q1' },
  include: {
    questions: { orderBy: { orderIndex: 'asc' } },
    players: true,
  },
});
```

### Batch Operations

```typescript
// Update many players at once
await prisma.player.updateMany({
  where: { quizId: 'q1', status: 'ANSWERING' },
  data: { status: 'ANSWERED' },
});
```

### Transactions

```typescript
const [quiz, newPlayer] = await prisma.$transaction([
  prisma.quiz.update({ where: { id: 'q1' }, data: { status: 'ACTIVE' } }),
  prisma.player.create({ data: { quizId: 'q1', name: 'Alice' } }),
]);
```

### Raw SQL

```typescript
const result = await prisma.$queryRaw`
  SELECT COUNT(*) as count
  FROM Player
  WHERE quizId = ${quizId}
`;
```

---

## Workflow Summary

1. **Update `schema.prisma`** with new models/fields
2. **Run migration**: `yarn prisma:migrate -- --name <change>`
3. **Commit migration**: Check in `migrations/*.sql`
4. **Regenerate client**: `yarn prisma:generate` (usually auto)
5. **Implement repository**: Write Prisma adapter for domain interface
6. **Test repository**: Integration tests against test DB
7. **Deploy**: `yarn prisma migrate deploy` in production

---

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) – Data flow and layer contracts
- [guides/DDD-STRUCTURE.md](DDD-STRUCTURE.md) – Domain entities and repository interfaces
- [guides/SETUP.md](SETUP.md) – Prisma configuration and environment setup
- [DECISION-LOG.md](../DECISION-LOG.md) – ADR-002 on Prisma v7 + driver adapter
