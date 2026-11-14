import { describe, it, expect } from 'vitest';
import { signInErrorMessage } from '@lib/sign-in-errors';

describe('signInErrorMessage', () => {
  it('explains an expired code and an expired link differently', () => {
    expect(signInErrorMessage('code', 'otp_expired')).toMatch(
      /code is wrong or has expired/
    );
    expect(signInErrorMessage('link', 'otp_expired')).toMatch(
      /already used or has expired/
    );
  });

  it.each([
    ['over_email_send_rate_limit', /wait a minute/i],
    ['over_request_rate_limit', /wait a minute/i],
    ['captcha_failed', /bot check failed/i],
    ['email_not_confirmed', /not confirmed/i],
    ['signup_disabled', /not open yet/i],
    ['email_address_invalid', /not valid/i],
  ])('explains %s the same way on every step', (code, message) => {
    for (const step of ['send', 'code', 'link'] as const) {
      expect(signInErrorMessage(step, code)).toMatch(message);
    }
  });

  it.each([
    ['send', /could not send/i],
    ['code', /could not sign in with that code/i],
    ['link', /could not sign in with this link/i],
  ] as const)(
    'falls back to a %s message for an unknown code',
    (step, message) => {
      expect(signInErrorMessage(step, 'something_new')).toMatch(message);
      expect(signInErrorMessage(step, null)).toMatch(message);
    }
  );

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'falls back for the inherited property name %s',
    (code) => {
      expect(signInErrorMessage('link', code)).toMatch(
        /could not sign in with this link/i
      );
    }
  );

  it('never shows a raw code from the query string', () => {
    expect(
      signInErrorMessage('link', '<script>alert(1)</script>')
    ).not.toContain('script');
  });
});
