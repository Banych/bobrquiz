-- Enable Row Level Security on all public tables with no policies (default-deny).
--
-- Supabase auto-exposes every public-schema table via PostgREST/GraphQL to the
-- `anon` and `authenticated` roles unless RLS blocks it, regardless of whether
-- the app's own code queries them that way. This app never uses the Supabase
-- JS client for table queries (only Prisma via a direct Postgres connection,
-- plus realtime channels using the service-role key, which bypasses RLS) -- so
-- there is no legitimate reason for anon/authenticated to have any access here.
-- Enabling RLS with zero policies denies both roles entirely while leaving
-- Prisma's connection (table owner) unaffected, since Postgres table owners
-- bypass RLS by default.
--
-- `_prisma_migrations` itself is excluded here: it's Prisma's own internal
-- tracking table, created outside the migration history (not present in the
-- shadow database Prisma uses to validate migrations), so it can't be
-- referenced from a tracked migration. It's covered separately, applied
-- directly to each real database instead.
ALTER TABLE "public"."Quiz" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Player" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Answer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;