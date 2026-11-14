'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/infrastructure/auth/supabase-auth-client';
import { isConfirmedUser } from '@/infrastructure/auth/confirmed-user';
import { safeRedirectPath } from '@/lib/safe-redirect';
import {
  SignInForm,
  type AuthStepResult,
} from '@/components/auth/sign-in-form';

function SignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back to the page that sent the host here (same site only), or the admin dashboard; the
  // proxy checks the session again on arrival
  const redirectTo = safeRedirectPath(searchParams.get('redirect'));

  const sendEmail = async (
    email: string,
    captchaToken?: string
  ): Promise<AuthStepResult> => {
    const { error } = await createBrowserClient().auth.signInWithOtp({
      email,
      options: {
        captchaToken,
        // Rides in the email link as `next`; /auth/confirm keeps only its path
        emailRedirectTo: `${window.location.origin}${redirectTo}`,
      },
    });
    return error ? { ok: false, code: error.code } : { ok: true };
  };

  const verifyCode = async (
    email: string,
    token: string
  ): Promise<AuthStepResult> => {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) {
      return { ok: false, code: error.code };
    }
    // Verifying confirms the address; one left unconfirmed (the project's confirm-email setting
    // off) gets no session here, as the proxy would refuse it anyway
    if (!isConfirmedUser(data.user)) {
      await supabase.auth.signOut();
      return { ok: false, code: 'email_not_confirmed' };
    }
    router.push(redirectTo);
    router.refresh();
    return { ok: true };
  };

  return <SignInForm sendEmail={sendEmail} verifyCode={verifyCode} />;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <SignIn />
    </Suspense>
  );
}
