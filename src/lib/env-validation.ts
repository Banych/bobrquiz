/**
 * Runtime environment validation helper.
 * Validates required environment variables are present and logs warnings for optional ones.
 */

type EnvVarConfig = {
  key: string;
  required: boolean;
  description: string;
};

const ENV_VARS: EnvVarConfig[] = [
  {
    key: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string (pooled)',
  },
  {
    key: 'DIRECT_URL',
    required: false,
    description: 'Direct PostgreSQL connection for migrations',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    description: 'Supabase project URL',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase anonymous/public key',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    required: false,
    description:
      'Supabase service role key (server-side realtime broadcasts; media uploads and deletes fail with 500 without it)',
  },
  {
    key: 'ADMIN_EMAILS',
    required: false,
    description:
      'Comma-separated admin email allowlist (required for /admin routes)',
  },
];

export const validateEnvironment = (): void => {
  const missing: string[] = [];
  const optional: string[] = [];

  for (const { key, required, description } of ENV_VARS) {
    const value = process.env[key];

    if (!value) {
      if (required) {
        missing.push(`${key} - ${description}`);
      } else {
        optional.push(`${key} - ${description}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((item) => console.error(`  - ${item}`));
    throw new Error(
      'Required environment variables missing. Check .env.example and update your .env file.'
    );
  }

  if (optional.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('⚠️  Optional environment variables not set:');
    optional.forEach((item) => console.warn(`  - ${item}`));
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('✅ Environment validation passed');
  }
};
