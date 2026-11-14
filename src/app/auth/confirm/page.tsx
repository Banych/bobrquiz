import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmSignIn } from './actions';
import { signInErrorMessage } from '@/lib/sign-in-errors';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

type ConfirmPageProps = { searchParams: Promise<SearchParams> };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Where a sign-in email's link lands. Rendering verifies nothing, so a mail scanner that opens
 * the link cannot use it up; the Continue button posts to `confirmSignIn`.
 */
export default async function ConfirmPage({ searchParams }: ConfirmPageProps) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const next = first(params.next) ?? '';
  const error = first(params.error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to bobrquiz</CardTitle>
          {!error && tokenHash && (
            <CardDescription>
              Press Continue to finish signing in on this device.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error || !tokenHash ? (
            <>
              <p
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {signInErrorMessage('link', error)}
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </>
          ) : (
            <form action={confirmSignIn}>
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
