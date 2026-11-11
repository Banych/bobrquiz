import { NextResponse } from 'next/server';
import { getServices } from '@application/services/factories';

// Called once a day by the Vercel cron in vercel.json, so the free-plan
// Supabase project sees database activity and is not paused for inactivity
// (docs/progress/findings/2026-11-09-production-supabase-paused.md)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getServices().pingDatabaseUseCase.execute();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API] keepalive ping failed:', error);
    return NextResponse.json(
      { error: 'Database ping failed' },
      { status: 500 }
    );
  }
}
