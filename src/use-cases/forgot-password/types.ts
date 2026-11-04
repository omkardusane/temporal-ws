export const FORGOT_PASSWORD_TASK_QUEUE = 'forgot-password';

// one live reset per address; a second request should signal `resend` instead
export function forgotPasswordWorkflowId(email: string): string {
  return `forgot-password-${email.toLowerCase()}`;
}

export type ForgotPasswordInput = { email: string };

export type ForgotPasswordPhase = 'looking-up' | 'awaiting-reset' | 'committing' | 'done';

// `no-account` is for the caller's logs only; the UI must show the same message either way
export type ForgotPasswordResult =
  | { status: 'completed' }
  | { status: 'no-account' }
  | { status: 'expired' }
  | { status: 'too-many-attempts' }
  | { status: 'cancelled' };

export type ResetPasswordRequest = { token: string; passwordHash: string };

export type ResetPasswordResponse = { ok: true } | { ok: false; attemptsLeft: number };
