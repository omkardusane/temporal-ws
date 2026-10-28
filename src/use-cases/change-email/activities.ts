import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { EmailClient } from '../../mocks/email-client';
import type { UsersServiceClient } from '../../mocks/users-service-client';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export function createActivities(deps: { emailClient: EmailClient; usersClient: UsersServiceClient }) {
  return {
    async getCurrentEmail(userId: string): Promise<string> {
      return deps.usersClient.getEmail(userId);
    },

    async assertEmailAvailable(email: string): Promise<boolean> {
      return !(await deps.usersClient.isEmailTaken(email));
    },

    async sendOtp({ to, purpose }: { to: string; purpose: 'old-email' | 'new-email' }): Promise<{ otpHash: string }> {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const subject = purpose === 'old-email' ? 'Confirm your current email' : 'Confirm your new email';
      await deps.emailClient.send(to, subject, `Use this code to continue:\nYour code: ${code}`);
      return { otpHash: sha256(code).toString('hex') };
    },

    async verifyOtp({ otp, otpHash }: { otp: string; otpHash: string }): Promise<boolean> {
      const actual = sha256(otp);
      const expected = Buffer.from(otpHash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },

    async commitEmailChange(args: { userId: string; newEmail: string; idempotencyKey: string }): Promise<void> {
      await deps.usersClient.updateEmail(args.userId, args.newEmail, args.idempotencyKey);
    },

    async notifyEmailChanged({ to, newEmail }: { to: string; newEmail: string }): Promise<void> {
      await deps.emailClient.send(to, 'Your email was changed', `Your account email is now ${newEmail}.`);
    },
  };
}

export type ChangeEmailActivities = ReturnType<typeof createActivities>;
