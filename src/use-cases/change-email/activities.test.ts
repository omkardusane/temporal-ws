import { MockActivityEnvironment } from '@temporalio/testing';
import { beforeEach, describe, it } from 'mocha';
import assert from 'assert';
import { MockEmailClient } from '../../mocks/email-client';
import { MockUsersServiceClient } from '../../mocks/users-service-client';
import { createActivities } from './activities';

describe('change-email activities', () => {
  let emailClient: MockEmailClient;
  let usersClient: MockUsersServiceClient;
  let activities: ReturnType<typeof createActivities>;
  let env: MockActivityEnvironment;

  const codeFrom = (addr: string): string => {
    const mail = emailClient.lastTo(addr);
    assert.ok(mail, `no mail sent to ${addr}`);
    const match = /Your code: (\d{6})/.exec(mail.body);
    assert.ok(match, 'no code in mail body');
    return match[1];
  };

  const sendOldOtp = async (): Promise<{ otpHash: string }> =>
    (await env.run(activities.sendOtp, { to: 'old@example.com', purpose: 'old-email' as const })) as {
      otpHash: string;
    };

  beforeEach(() => {
    emailClient = new MockEmailClient();
    usersClient = new MockUsersServiceClient();
    usersClient.seed('user-1', 'old@example.com');
    activities = createActivities({ emailClient, usersClient });
    env = new MockActivityEnvironment();
  });

  it('sendOtp mails a code that verifyOtp accepts', async () => {
    const { otpHash } = await sendOldOtp();
    assert.equal(await env.run(activities.verifyOtp, { otp: codeFrom('old@example.com'), otpHash }), true);
  });

  it('verifyOtp rejects a wrong code', async () => {
    const { otpHash } = await sendOldOtp();
    const wrong = codeFrom('old@example.com') === '000000' ? '000001' : '000000';
    assert.equal(await env.run(activities.verifyOtp, { otp: wrong, otpHash }), false);
  });

  it('assertEmailAvailable is false for a taken email and true otherwise', async () => {
    assert.equal(await env.run(activities.assertEmailAvailable, 'OLD@example.com'), false);
    assert.equal(await env.run(activities.assertEmailAvailable, 'free@example.com'), true);
  });

  it('commitEmailChange is idempotent for the same key', async () => {
    const args = { userId: 'user-1', newEmail: 'new@example.com', idempotencyKey: 'k1' };
    await env.run(activities.commitEmailChange, args);
    await env.run(activities.commitEmailChange, args);
    assert.equal(await usersClient.getEmail('user-1'), 'new@example.com');
  });

  it('sendOtp rejects when the mail client fails', async () => {
    emailClient.failNext(1);
    await assert.rejects(env.run(activities.sendOtp, { to: 'old@example.com', purpose: 'old-email' as const }));
    assert.equal(emailClient.sent.length, 0);
  });

  it('getCurrentEmail rejects for an unknown user', async () => {
    await assert.rejects(env.run(activities.getCurrentEmail, 'nobody'));
  });
});
