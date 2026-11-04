import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import assert from 'assert';
import { after, before, beforeEach, describe, it } from 'mocha';
import { MockEmailClient, SentEmail } from '../../../src/mocks/email-client';
import { MockUsersServiceClient } from '../../../src/mocks/users-service-client';
import { createActivities } from '../../../src/use-cases/forgot-password/activities';
import { hashPassword } from '../../../src/use-cases/forgot-password/password';
import { cancel, getState, resend, resetPassword } from '../../../src/use-cases/forgot-password/signals';
import {
  FORGOT_PASSWORD_TASK_QUEUE,
  forgotPasswordWorkflowId,
  ResetPasswordRequest,
} from '../../../src/use-cases/forgot-password/types';
import { forgotPassword } from '../../../src/use-cases/forgot-password/workflows';

const EMAIL = 'user@example.com';

const tokenFrom = (email: SentEmail): string => {
  const match = /token=([0-9a-f]{64})/.exec(email.body);
  assert.ok(match, 'no token in mail body');
  return match[1];
};

const waitForMails = async (emailClient: MockEmailClient, count: number): Promise<SentEmail> => {
  for (let i = 0; i < 250; i += 1) {
    const mails = emailClient.sent.filter((m) => m.to === EMAIL);
    if (mails.length >= count) {
      return mails[count - 1];
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`mail #${count} never arrived`);
};

const wrongToken = (token: string): string => (token.startsWith('0') ? `1${token.slice(1)}` : `0${token.slice(1)}`);

describe('forgot-password flow', function () {
  this.timeout(120_000);

  let testEnv: TestWorkflowEnvironment;
  let emailClient: MockEmailClient;
  let usersClient: MockUsersServiceClient;
  let worker: Worker;

  before(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  after(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    emailClient = new MockEmailClient();
    usersClient = new MockUsersServiceClient();
    usersClient.seed('user-1', EMAIL);
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: FORGOT_PASSWORD_TASK_QUEUE,
      workflowsPath: require.resolve('../../../src/use-cases/forgot-password/workflows'),
      activities: createActivities({ emailClient, usersClient }),
    });
  });

  const start = (email: string = EMAIL) =>
    testEnv.client.workflow.start(forgotPassword, {
      taskQueue: FORGOT_PASSWORD_TASK_QUEUE,
      workflowId: forgotPasswordWorkflowId(email),
      args: [{ email }],
    });

  const run = (scenario: () => Promise<void>) => worker.runUntil(scenario());

  it('resets the password, revokes sessions and notifies', () =>
    run(async () => {
      const handle = await start();
      const token = tokenFrom(await waitForMails(emailClient, 1));
      const passwordHash = hashPassword('correct horse battery staple');

      assert.deepEqual(await handle.executeUpdate(resetPassword, { args: [{ token, passwordHash }] }), { ok: true });
      assert.deepEqual(await handle.result(), { status: 'completed' });
      assert.equal(usersClient.get('user-1')?.passwordHash, passwordHash);
      assert.ok(usersClient.get('user-1')?.sessionsRevokedAt);
      assert.equal((await waitForMails(emailClient, 2)).subject, 'Your password was changed');
    }));

  it('sends no mail for an unknown address', () =>
    run(async () => {
      const handle = await start('nobody@example.com');
      assert.deepEqual(await handle.result(), { status: 'no-account' });
      assert.equal(emailClient.sent.length, 0);
    }));

  it('answers wrong tokens with attempts left, then gives up', () =>
    run(async () => {
      const handle = await start();
      const token = tokenFrom(await waitForMails(emailClient, 1));
      const passwordHash = hashPassword('pw');
      const bad = { args: [{ token: wrongToken(token), passwordHash }] as [ResetPasswordRequest] };

      assert.deepEqual(await handle.executeUpdate(resetPassword, bad), { ok: false, attemptsLeft: 2 });
      assert.deepEqual(await handle.executeUpdate(resetPassword, bad), { ok: false, attemptsLeft: 1 });
      assert.deepEqual(await handle.executeUpdate(resetPassword, bad), { ok: false, attemptsLeft: 0 });
      assert.deepEqual(await handle.result(), { status: 'too-many-attempts' });
      assert.equal(usersClient.get('user-1')?.passwordHash, undefined);
    }));

  it('rejects a plain-text password in the validator', () =>
    run(async () => {
      const handle = await start();
      const token = tokenFrom(await waitForMails(emailClient, 1));
      await assert.rejects(handle.executeUpdate(resetPassword, { args: [{ token, passwordHash: 'hunter2' }] }));
      assert.equal((await handle.query(getState)).attemptsLeft, 3);
      await handle.signal(cancel);
      assert.deepEqual(await handle.result(), { status: 'cancelled' });
    }));

  it('expires when the link is never used', () =>
    run(async () => {
      const handle = await start();
      await waitForMails(emailClient, 1);
      await testEnv.sleep('31 minutes');
      assert.deepEqual(await handle.result(), { status: 'expired' });
    }));

  it('resend issues a new token and kills the old one', () =>
    run(async () => {
      const handle = await start();
      const first = tokenFrom(await waitForMails(emailClient, 1));
      await handle.signal(resend);
      const second = tokenFrom(await waitForMails(emailClient, 2));
      assert.notEqual(first, second);
      assert.equal((await handle.query(getState)).resendsLeft, 1);

      const passwordHash = hashPassword('pw');
      assert.deepEqual(await handle.executeUpdate(resetPassword, { args: [{ token: first, passwordHash }] }), {
        ok: false,
        attemptsLeft: 2,
      });
      assert.deepEqual(await handle.executeUpdate(resetPassword, { args: [{ token: second, passwordHash }] }), {
        ok: true,
      });
      assert.deepEqual(await handle.result(), { status: 'completed' });
    }));

  it('survives transient mail failures through activity retries', () =>
    run(async () => {
      emailClient.failNext(2);
      const handle = await start();
      const token = tokenFrom(await waitForMails(emailClient, 1));
      await handle.executeUpdate(resetPassword, { args: [{ token, passwordHash: hashPassword('pw') }] });
      assert.deepEqual(await handle.result(), { status: 'completed' });
    }));
});
