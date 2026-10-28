import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import assert from 'assert';
import { after, before, beforeEach, describe, it } from 'mocha';
import { MockEmailClient, SentEmail } from '../../../src/mocks/email-client';
import { MockUsersServiceClient } from '../../../src/mocks/users-service-client';
import { createActivities } from '../../../src/use-cases/change-email/activities';
import { cancel, getState, submitNewOtp, submitOldOtp } from '../../../src/use-cases/change-email/signals';
import {
  CHANGE_EMAIL_TASK_QUEUE,
  ChangeEmailResult,
  changeEmailWorkflowId,
} from '../../../src/use-cases/change-email/types';
import { changeEmail } from '../../../src/use-cases/change-email/workflows';

const OLD = 'old@example.com';
const NEW = 'new@example.com';
const TAKEN = 'taken@example.com';

const otpFrom = (email: SentEmail): string => {
  const match = /Your code: (\d{6})/.exec(email.body);
  assert.ok(match, 'no code in mail body');
  return match[1];
};

const waitForMail = async (emailClient: MockEmailClient, addr: string, subject?: string): Promise<SentEmail> => {
  for (let i = 0; i < 250; i += 1) {
    const mail = emailClient.lastTo(addr);
    if (mail && (!subject || mail.subject === subject)) {
      return mail;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`no mail arrived for ${addr}`);
};

const wrongCode = (code: string): string => (code === '000000' ? '000001' : '000000');

describe('change-email flow', function () {
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
    usersClient.seed('user-1', OLD);
    usersClient.seed('user-2', TAKEN);
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: CHANGE_EMAIL_TASK_QUEUE,
      workflowsPath: require.resolve('../../../src/use-cases/change-email/workflows'),
      activities: createActivities({ emailClient, usersClient }),
    });
  });

  const start = (newEmail: string = NEW) =>
    testEnv.client.workflow.start(changeEmail, {
      taskQueue: CHANGE_EMAIL_TASK_QUEUE,
      workflowId: changeEmailWorkflowId('user-1'),
      args: [{ userId: 'user-1', newEmail }],
    });

  const run = (scenario: () => Promise<void>) => worker.runUntil(scenario());

  it('completes the happy path and flips the email', () =>
    run(async () => {
      const handle = await start();

      const oldMail = await waitForMail(emailClient, OLD);
      assert.equal((await handle.query(getState)).phase, 'awaiting-old-otp');
      await handle.signal(submitOldOtp, otpFrom(oldMail));

      const newMail = await waitForMail(emailClient, NEW);
      await handle.signal(submitNewOtp, otpFrom(newMail));

      const result: ChangeEmailResult = await handle.result();
      assert.deepEqual(result, { status: 'completed' });
      assert.equal(await usersClient.getEmail('user-1'), NEW);
      const notice = await waitForMail(emailClient, OLD, 'Your email was changed');
      assert.ok(notice.body.includes(NEW));
    }));

  it('gives up after three wrong old OTPs', () =>
    run(async () => {
      const handle = await start();
      const code = otpFrom(await waitForMail(emailClient, OLD));
      for (let i = 0; i < 3; i += 1) {
        await handle.signal(submitOldOtp, wrongCode(code));
      }

      const result = await handle.result();
      assert.deepEqual(result, { status: 'too-many-attempts', phase: 'awaiting-old-otp' });
      assert.equal(await usersClient.getEmail('user-1'), OLD);
      assert.equal(emailClient.lastTo(NEW), undefined);
    }));

  it('expires when the old OTP is never submitted', () =>
    run(async () => {
      const handle = await start();
      await waitForMail(emailClient, OLD);
      await testEnv.sleep('11 minutes');

      const result = await handle.result();
      assert.deepEqual(result, { status: 'expired', phase: 'awaiting-old-otp' });
      assert.equal(await usersClient.getEmail('user-1'), OLD);
    }));

  it('rejects a new email that is already taken', () =>
    run(async () => {
      const handle = await start(TAKEN);

      const result = await handle.result();
      assert.deepEqual(result, { status: 'email-taken' });
      assert.equal(emailClient.sent.length, 0);
    }));

  it('survives transient mail failures through activity retries', () =>
    run(async () => {
      emailClient.failNext(2);
      const handle = await start();
      const oldMail = await waitForMail(emailClient, OLD);
      await handle.signal(submitOldOtp, otpFrom(oldMail));
      const newMail = await waitForMail(emailClient, NEW);
      await handle.signal(submitNewOtp, otpFrom(newMail));

      const result = await handle.result();
      assert.deepEqual(result, { status: 'completed' });
      assert.equal(await usersClient.getEmail('user-1'), NEW);
    }));

  it('cancels while awaiting the new OTP', () =>
    run(async () => {
      const handle = await start();
      await handle.signal(submitOldOtp, otpFrom(await waitForMail(emailClient, OLD)));
      await waitForMail(emailClient, NEW);
      await handle.signal(cancel);

      const result = await handle.result();
      assert.deepEqual(result, { status: 'cancelled', phase: 'awaiting-new-otp' });
      assert.equal(await usersClient.getEmail('user-1'), OLD);
    }));
});
