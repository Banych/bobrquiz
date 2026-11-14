// No 'use client': it renders inside the client login page and takes its Supabase calls as props
import { useEffect, useRef, useState } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { signInErrorMessage } from '@/lib/sign-in-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** A Supabase auth call's outcome: done, or the error code to explain. */
export type AuthStepResult = { ok: true } | { ok: false; code?: string | null };

type SignInFormProps = {
  /** Emails a sign-in link and code; `captchaToken` is the Turnstile token, if the widget is on. */
  sendEmail: (email: string, captchaToken?: string) => Promise<AuthStepResult>;
  /** Signs this browser in with the emailed code (and navigates on success). */
  verifyCode: (email: string, code: string) => Promise<AuthStepResult>;
};

// Supabase lets an address ask for a new email once a minute
const RESEND_SECONDS = 60;
// Supabase's email code length is 6 by default and configurable up to 10 (dev sends 8)
const CODE_PATTERN = /^\d{6,10}$/;

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Email-only sign-in for new and returning hosts: one email field and the Turnstile check, then a
 * waiting screen where the emailed code signs this device in. The email's link signs in the
 * device it is opened on instead (`/auth/confirm`).
 */
export function SignInForm({ sendEmail, verifyCode }: SignInFormProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const [resendIn, setResendIn] = useState(0);
  const turnstile = useRef<TurnstileInstance | undefined>(undefined);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const needsCaptcha = Boolean(turnstileSiteKey) && !captchaToken;

  const send = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const result = await sendEmail(email.trim(), captchaToken);
      if (result.ok) {
        setStep('code');
        setCode('');
        setResendIn(RESEND_SECONDS);
      } else {
        setError(signInErrorMessage('send', result.code));
      }
    } catch {
      setError(signInErrorMessage('send', null));
    } finally {
      // A Turnstile token is single-use, sent or refused
      setCaptchaToken(undefined);
      turnstile.current?.reset();
      setIsBusy(false);
    }
  };

  const signIn = async () => {
    const token = code.replace(/\s/g, '');
    if (!CODE_PATTERN.test(token)) {
      setError('Enter the code from the email: digits only.');
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      const result = await verifyCode(email.trim(), token);
      if (result.ok) {
        // Stay busy while the page navigates away: a second press would resend a used code
        return;
      }
      setError(signInErrorMessage('code', result.code));
    } catch {
      setError(signInErrorMessage('code', null));
    }
    setIsBusy(false);
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {step === 'email' ? 'Sign in' : 'Check your email'}
          </CardTitle>
          <CardDescription>
            {step === 'email' ? (
              'Host quizzes with bobrquiz. New here? The same email signs you up.'
            ) : (
              <>
                We sent a link and a code to <strong>{email.trim()}</strong>.
                Open the link on any device, or type the code here.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'email' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isBusy}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isBusy || needsCaptcha}
              >
                {isBusy ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void signIn();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={isBusy}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isBusy}>
                {isBusy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {turnstileSiteKey && (
            <Turnstile
              ref={turnstile}
              siteKey={turnstileSiteKey}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken(undefined)}
              onError={() => setCaptchaToken(undefined)}
              options={{ size: 'flexible' }}
            />
          )}

          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {step === 'code' && (
            <div className="flex items-center justify-between text-sm">
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => void send()}
                disabled={isBusy || resendIn > 0 || needsCaptcha}
              >
                {resendIn > 0 ? `Resend (in ${resendIn} s)` : 'Resend email'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={changeEmail}
                disabled={isBusy}
              >
                Use another email
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
