/**
 * Sign-in error messages in words, keyed by Supabase Auth error code
 * (`@supabase/auth-js` `ErrorCode`). Used by the sign-in page and the email link's confirm page.
 */

type SignInStep = 'send' | 'code' | 'link';

const RATE_LIMITED = 'Too many requests. Wait a minute, then try again.';

const MESSAGES: Record<string, string> = {
  over_email_send_rate_limit: RATE_LIMITED,
  over_request_rate_limit: RATE_LIMITED,
  captcha_failed: 'The bot check failed. Complete it again, then retry.',
  email_address_invalid: 'That email address is not valid.',
  email_address_not_authorized:
    'Sign-in emails cannot be sent to this address yet.',
  email_not_confirmed:
    'This email address is not confirmed yet. Sign in with the newest email we sent.',
  signup_disabled: 'New accounts are not open yet.',
};

const EXPIRED: Record<SignInStep, string> = {
  send: 'Something went wrong. Try again.',
  code: 'That code is wrong or has expired. Check the newest email, or send a new one.',
  link: 'This sign-in link was already used or has expired. Ask for a new one.',
};

/** The message to show for a failed sign-in step, given Supabase's error code if any. */
export const signInErrorMessage = (
  step: SignInStep,
  code: string | null | undefined
): string => {
  if (code === 'otp_expired') {
    return EXPIRED[step];
  }
  if (code && MESSAGES[code]) {
    return MESSAGES[code];
  }
  return step === 'send'
    ? 'Could not send the email. Try again.'
    : step === 'code'
      ? 'Could not sign in with that code. Try again.'
      : 'Could not sign in with this link. Ask for a new one.';
};
