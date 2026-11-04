import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EmailClient } from '../../mocks/email-client';
import { ApplicationFailure } from '@temporalio/activity';
import { UnknownUserError, type UsersServiceClient } from '../../mocks/users-service-client';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export const RESET_URL = 'https://example.com/reset-password';

export function createActivities(deps: { emailClient: EmailClient; usersClient: UsersServiceClient }) {
  return {
    async findUserByEmail(email: string): Promise<string | null> {
      return (await deps.usersClient.findUserIdByEmail(email)) ?? null;
    },

    async sendResetLink({ to }: { to: string }): Promise<{ tokenHash: string }> {
      const token = randomBytes(32).toString('hex');
      await deps.emailClient.send(
        to,
        'Reset your password',
        `Someone asked to reset your password. If it was you, open:\n${RESET_URL}?token=${token}\nIgnore this mail otherwise.`,
      );
      return { tokenHash: sha256(token).toString('hex') };
    },

    async verifyToken({ token, tokenHash }: { token: string; tokenHash: string }): Promise<boolean> {
      const actual = sha256(token);
      const expected = Buffer.from(tokenHash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },

    async commitPassword(args: { userId: string; passwordHash: string; idempotencyKey: string }): Promise<void> {
      try {
        await deps.usersClient.setPasswordHash(args.userId, args.passwordHash, args.idempotencyKey);
      } catch (err) {
        if (err instanceof UnknownUserError) {
          throw ApplicationFailure.nonRetryable(err.message, 'UnknownUser');
        }
        throw err;
      }
    },

    async revokeSessions(userId: string): Promise<void> {
      await deps.usersClient.revokeSessions(userId);
    },

    async notifyPasswordChanged({ to }: { to: string }): Promise<void> {
      await deps.emailClient.send(to, 'Your password was changed', 'If this was not you, contact support right away.');
    },
  };
}

export type ForgotPasswordActivities = ReturnType<typeof createActivities>;
