import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated-client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be defined for Prisma to initialize.');
}

const adapter = new PrismaPg({
  connectionString,
  // Limit pool size per serverless function instance.
  // In a serverless environment (Vercel), each lambda can open its own pool;
  // keeping max low prevents exhausting Supabase's connection limit (200).
  // The primary fix is using the Supavisor pooler URL (port 6543) in DATABASE_URL.
  max: 2,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
