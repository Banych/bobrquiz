/**
 * Email sign-in for e2e without sending email: the service-role key's `generateLink` returns the
 * same token hash and code a sign-in email would carry, and skips the sign-in form's bot check.
 * A newer link or email voids the older code (seen on dev 2026-11-14), so a spec that sends the
 * form must keep that request from reaching Supabase (`interceptSignInEmail`) before it asks
 * `generateLink` for the code.
 */

import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { BASE_URL } from './paths';

/** Addresses the sign-up spec creates; the cleanup project deletes stale ones. */
export const SIGNUP_EMAIL_PREFIX = 'e2e-signup-';
const STALE_SIGNUP_AGE_MS = 30 * 60_000;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for e2e sign-in (.env.local; see e2e/README.md)`
    );
  }
  return value;
};

let admin: SupabaseClient | undefined;

const adminClient = (): SupabaseClient => {
  admin ??= createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return admin;
};

export type EmailSignInLink = { tokenHash: string; code: string };

/**
 * A sign-in link's token hash and code for `email`. A missing user is created unconfirmed and
 * confirmed by verifying either one.
 */
export async function generateSignInLink(
  email: string
): Promise<EmailSignInLink> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) {
    throw new Error(`generateLink failed: ${error.message}`);
  }
  return {
    tokenHash: data.properties.hashed_token,
    code: data.properties.email_otp,
  };
}

/** The email link's confirm page URL, as the email template builds it. */
export function confirmPageUrl(tokenHash: string, nextPath: string): string {
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: 'email',
    next: `${BASE_URL}${nextPath}`,
  });
  return `/auth/confirm?${params}`;
}

/** Signs `page` in as `email` through the email link's confirm page, landing on `nextPath`. */
export async function signInThroughEmailLink(
  page: Page,
  email: string,
  nextPath = '/admin'
): Promise<void> {
  const { tokenHash } = await generateSignInLink(email);
  await page.goto(confirmPageUrl(tokenHash, nextPath));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${BASE_URL}${nextPath}`);
}

export type CaughtSignInEmail = { url: URL; body: Record<string, unknown> };

/**
 * Answers the sign-in form's send request (`/auth/v1/otp`) in the browser so no email is sent
 * and no code is generated that would void `generateLink`'s. Returns the requests it caught.
 */
export async function interceptSignInEmail(
  page: Page
): Promise<CaughtSignInEmail[]> {
  const caught: CaughtSignInEmail[] = [];
  await page.route('**/auth/v1/otp*', async (route) => {
    caught.push({
      url: new URL(route.request().url()),
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({ status: 200, json: {} });
  });
  return caught;
}

/**
 * Signs `page` in as `email` through the sign-in form on the current `/login` page: sends the
 * form (intercepted) and types `generateLink`'s code on the waiting screen. Returns the caught
 * send requests.
 */
export async function signInWithCode(
  page: Page,
  email: string
): Promise<CaughtSignInEmail[]> {
  const caught = await interceptSignInEmail(page);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  // Enabled once the Turnstile widget (test key: always passes) hands over its token
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const { code } = await generateSignInLink(email);
  await page.getByRole('textbox', { name: 'Code' }).fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return caught;
}

/** A fresh address for one sign-up run. */
export function newSignupEmail(): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${SIGNUP_EMAIL_PREFIX}${stamp}@example.com`;
}

/** Deletes the auth user with `email` and the quizzes it owns, if there is one. */
export async function deleteUserByEmail(email: string): Promise<void> {
  const user = (await listUsers()).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (user) {
    await deleteUser(user.id);
  }
}

/**
 * Deletes sign-up users older than 30 minutes, left by crashed runs, with their quizzes (no other
 * sweep can see those: the quiz list is per owner). Returns how many users.
 */
export async function sweepSignupUsers(): Promise<number> {
  const cutoff = Date.now() - STALE_SIGNUP_AGE_MS;
  const stale = (await listUsers()).filter(
    (u) =>
      u.email?.startsWith(SIGNUP_EMAIL_PREFIX) &&
      Date.parse(u.created_at) < cutoff
  );
  for (const user of stale) {
    await deleteUser(user.id);
  }
  return stale.length;
}

type AuthUser = { id: string; email?: string; created_at: string };

async function listUsers(): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient().auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }
    users.push(...data.users);
    if (data.users.length < 200) {
      break;
    }
  }
  return users;
}

async function deleteUser(id: string): Promise<void> {
  // Questions, players and answers go with the quiz (onDelete: Cascade); a sign-up run uploads
  // no media
  const quizzes = await adminClient().from('Quiz').delete().eq('ownerId', id);
  if (quizzes.error) {
    throw new Error(
      `deleting the user's quizzes failed: ${quizzes.error.message}`
    );
  }
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`deleteUser failed: ${error.message}`);
  }
}
