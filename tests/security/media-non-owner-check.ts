/**
 * Checks that a signed-in user who does not own a quiz cannot write to that
 * quiz's folder in the `quiz-media` bucket through the Storage API with the
 * public anon key (issue 128). Dev only: run with `yarn media:check-non-owner`,
 * which loads `.env.local`.
 *
 * 1. Plants a file in a quiz folder owned by the main admin (TEST_ADMIN_EMAIL),
 *    with the service-role key.
 * 2. Signs in as the second test admin (TEST_AUTH_ADMIN_*) with the anon key and
 *    tries to upload next to the planted file and to remove it.
 * 3. Checks with the service-role key that the planted file is still there and
 *    the attempted upload is not, then removes both.
 *
 * Step 3 is the verdict: when a policy denies a delete, `remove()` returns
 * success with an empty list, so "no error" proves nothing.
 *
 * Exit 0 when both writes were refused, 1 when either got through, 2 when the
 * check could not run. Prints no email addresses.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'quiz-media';

/** A 1×1 PNG. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const findUserId = async (
  admin: SupabaseClient,
  email: string
): Promise<string> => {
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  throw new Error('No auth user matches the configured test email');
};

const findOwnedQuizId = async (
  admin: SupabaseClient,
  ownerId: string
): Promise<string> => {
  const { data, error } = await admin
    .from('Quiz')
    .select('id')
    .eq('ownerId', ownerId)
    .order('createdAt')
    .limit(1);
  if (error) throw new Error(`quiz lookup failed: ${error.message}`);
  const quiz = (data as { id: string }[] | null)?.[0];
  if (!quiz) {
    throw new Error(
      'The main admin owns no quiz; create one in the admin UI first'
    );
  }
  return quiz.id;
};

const fileExists = async (
  admin: SupabaseClient,
  folder: string,
  name: string
): Promise<boolean> => {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (error) throw new Error(`list failed: ${error.message}`);
  return (data ?? []).some((f) => f.name === name);
};

async function main(): Promise<number> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const ownerEmail = requireEnv('TEST_ADMIN_EMAIL');
  const otherEmail = requireEnv('TEST_AUTH_ADMIN_EMAIL');
  const otherPassword = requireEnv('TEST_AUTH_ADMIN_PASSWORD');
  if (ownerEmail.toLowerCase() === otherEmail.toLowerCase()) {
    throw new Error('TEST_ADMIN_EMAIL and TEST_AUTH_ADMIN_EMAIL must differ');
  }

  const noSession = { persistSession: false, autoRefreshToken: false };
  const admin = createClient(url, serviceKey, { auth: noSession });
  const other = createClient(url, anonKey, { auth: noSession });

  const ownerId = await findUserId(admin, ownerEmail);
  const otherId = await findUserId(admin, otherEmail);
  const quizId = await findOwnedQuizId(admin, ownerId);
  if (ownerId === otherId) throw new Error('Owner and other user are the same');

  const folder = `questions/${quizId}`;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const plantedName = `${stamp}-planted.png`;
  const attemptName = `${stamp}-attempt.png`;
  const plantedPath = `${folder}/${plantedName}`;
  const attemptPath = `${folder}/${attemptName}`;

  console.log(`quiz folder: ${folder} (owned by the main admin)`);

  const planted = await admin.storage
    .from(BUCKET)
    .upload(plantedPath, PNG_1X1, { contentType: 'image/png' });
  if (planted.error) {
    throw new Error(`planting failed: ${planted.error.message}`);
  }

  try {
    const signIn = await other.auth.signInWithPassword({
      email: otherEmail,
      password: otherPassword,
    });
    if (signIn.error) {
      throw new Error(`second admin sign-in failed: ${signIn.error.message}`);
    }

    const upload = await other.storage
      .from(BUCKET)
      .upload(attemptPath, PNG_1X1, { contentType: 'image/png' });
    console.log(
      `other user's upload: ${upload.error ? `error "${upload.error.message}"` : 'no error'}`
    );

    const remove = await other.storage.from(BUCKET).remove([plantedPath]);
    console.log(
      `other user's delete: ${remove.error ? `error "${remove.error.message}"` : `no error, ${remove.data?.length ?? 0} object(s) reported removed`}`
    );

    await other.auth.signOut({ scope: 'local' });

    const plantedStillThere = await fileExists(admin, folder, plantedName);
    const attemptLanded = await fileExists(admin, folder, attemptName);
    console.log(`planted file still there: ${plantedStillThere}`);
    console.log(`attempted upload landed: ${attemptLanded}`);

    const refused = plantedStillThere && !attemptLanded;
    console.log(
      refused
        ? 'PASS: the non-owner could neither upload nor delete'
        : 'FAIL: a non-owner session can write to another owner’s media'
    );
    return refused ? 0 : 1;
  } finally {
    const cleanup = await admin.storage
      .from(BUCKET)
      .remove([plantedPath, attemptPath]);
    if (cleanup.error) {
      console.error(
        `cleanup failed, remove by hand: ${plantedPath}, ${attemptPath} (${cleanup.error.message})`
      );
    }
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      `ERROR: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
);
