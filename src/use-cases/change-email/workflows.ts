import { condition, proxyActivities, setHandler, workflowInfo } from '@temporalio/workflow';
import type { ChangeEmailActivities } from './activities';
import { cancel, getState, submitNewOtp, submitOldOtp } from './signals';
import type { ChangeEmailInput, ChangeEmailPhase, ChangeEmailResult } from './types';

const OTP_TTL = '10 minutes';
const MAX_ATTEMPTS = 3;

const { getCurrentEmail, assertEmailAvailable, sendOtp, verifyOtp, commitEmailChange, notifyEmailChanged } =
  proxyActivities<ChangeEmailActivities>({
    startToCloseTimeout: '30 seconds',
    retry: { maximumAttempts: 5, initialInterval: '1 second' },
  });

export async function changeEmail(input: ChangeEmailInput): Promise<ChangeEmailResult> {
  let phase: ChangeEmailPhase = 'validating';
  let attemptsLeft = MAX_ATTEMPTS;
  let cancelled = false;
  const oldOtps: string[] = [];
  const newOtps: string[] = [];

  setHandler(submitOldOtp, (code) => {
    oldOtps.push(code);
  });
  setHandler(submitNewOtp, (code) => {
    newOtps.push(code);
  });
  setHandler(cancel, () => {
    cancelled = true;
  });
  setHandler(getState, () => ({ phase, attemptsLeft }));

  const runOtpStep = async (
    to: string,
    purpose: 'old-email' | 'new-email',
    queue: string[],
    stepPhase: ChangeEmailPhase,
  ): Promise<{ ok: true } | ChangeEmailResult> => {
    phase = stepPhase;
    attemptsLeft = MAX_ATTEMPTS;
    const { otpHash } = await sendOtp({ to, purpose });

    for (;;) {
      const signalled = await condition(() => queue.length > 0 || cancelled, OTP_TTL);
      if (!signalled) {
        return { status: 'expired', phase };
      }
      if (cancelled) {
        return { status: 'cancelled', phase };
      }
      const code = queue.shift() as string;
      if (await verifyOtp({ otp: code, otpHash })) {
        return { ok: true };
      }
      attemptsLeft -= 1;
      if (attemptsLeft === 0) {
        return { status: 'too-many-attempts', phase };
      }
    }
  };

  const oldEmail = await getCurrentEmail(input.userId);

  if (!(await assertEmailAvailable(input.newEmail))) {
    return { status: 'email-taken' };
  }

  const oldStep = await runOtpStep(oldEmail, 'old-email', oldOtps, 'awaiting-old-otp');
  if (!('ok' in oldStep)) {
    return oldStep;
  }
  const newStep = await runOtpStep(input.newEmail, 'new-email', newOtps, 'awaiting-new-otp');
  if (!('ok' in newStep)) {
    return newStep;
  }

  phase = 'committing';
  await commitEmailChange({
    userId: input.userId,
    newEmail: input.newEmail,
    idempotencyKey: workflowInfo().workflowId,
  });

  try {
    await notifyEmailChanged({ to: oldEmail, newEmail: input.newEmail });
  } catch {
    // courtesy mail, best effort
  }

  phase = 'done';
  return { status: 'completed' };
}
