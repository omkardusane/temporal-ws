import { allHandlersFinished, condition, proxyActivities, setHandler, workflowInfo } from '@temporalio/workflow';
import type { ForgotPasswordActivities } from './activities';
import { cancel, getState, resend, resetPassword } from './signals';
import type { ForgotPasswordInput, ForgotPasswordPhase, ForgotPasswordResult } from './types';

const TOKEN_TTL = '30 minutes';
const MAX_ATTEMPTS = 3;
const MAX_RESENDS = 2;

const { findUserByEmail, sendResetLink, verifyToken, commitPassword, revokeSessions, notifyPasswordChanged } =
  proxyActivities<ForgotPasswordActivities>({
    startToCloseTimeout: '30 seconds',
    retry: { maximumAttempts: 5, initialInterval: '1 second' },
  });

export async function forgotPassword(input: ForgotPasswordInput): Promise<ForgotPasswordResult> {
  let phase: ForgotPasswordPhase = 'looking-up';
  let attemptsLeft = MAX_ATTEMPTS;
  let resendsLeft = MAX_RESENDS;
  let resendRequested = false;
  let cancelled = false;
  let busy = false;
  let reset = false;
  let tokenHash = '';
  let userId = '';

  setHandler(resend, () => {
    if (resendsLeft > 0) {
      resendRequested = true;
    }
  });
  setHandler(cancel, () => {
    cancelled = true;
  });
  setHandler(getState, () => ({ phase, attemptsLeft, resendsLeft }));
  setHandler(
    resetPassword,
    async ({ token, passwordHash }) => {
      busy = true;
      try {
        if (!(await verifyToken({ token, tokenHash }))) {
          attemptsLeft -= 1;
          return { ok: false, attemptsLeft };
        }
        phase = 'committing';
        await commitPassword({ userId, passwordHash, idempotencyKey: workflowInfo().workflowId });
        reset = true;
        return { ok: true };
      } finally {
        busy = false;
      }
    },
    {
      // rejected updates never reach history, so junk and late calls cost nothing
      validator: ({ token, passwordHash }) => {
        if (phase !== 'awaiting-reset' || busy || attemptsLeft === 0 || cancelled) {
          throw new Error('no reset in progress');
        }
        if (!token || !passwordHash.startsWith('scrypt$')) {
          throw new Error('token and a hashed password are required');
        }
      },
    },
  );

  const found = await findUserByEmail(input.email);
  if (!found) {
    return { status: 'no-account' };
  }
  userId = found;

  phase = 'awaiting-reset';
  for (;;) {
    ({ tokenHash } = await sendResetLink({ to: input.email }));
    resendRequested = false;
    const woke = await condition(
      () => !busy && (reset || cancelled || attemptsLeft === 0 || resendRequested),
      TOKEN_TTL,
    );
    if (!woke) {
      // a reset that started before the deadline is allowed to finish
      await condition(() => !busy);
      if (!reset) {
        return { status: 'expired' };
      }
    }
    if (reset) {
      break;
    }
    if (cancelled) {
      return { status: 'cancelled' };
    }
    if (attemptsLeft === 0) {
      return { status: 'too-many-attempts' };
    }
    // resend: new token, old one stops working, attempts and TTL start over
    resendsLeft -= 1;
    attemptsLeft = MAX_ATTEMPTS;
  }

  await revokeSessions(userId);
  try {
    await notifyPasswordChanged({ to: input.email });
  } catch {
    // courtesy mail, best effort
  }

  phase = 'done';
  await condition(allHandlersFinished);
  return { status: 'completed' };
}
