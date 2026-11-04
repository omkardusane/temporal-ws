import { Client, Connection } from '@temporalio/client';
import { cancel, getState, submitNewOtp, submitOldOtp } from '../use-cases/change-email/signals';
import { CHANGE_EMAIL_TASK_QUEUE, changeEmailWorkflowId } from '../use-cases/change-email/types';
import { changeEmail } from '../use-cases/change-email/workflows';
import { hashPassword } from '../use-cases/forgot-password/password';
import * as fp from '../use-cases/forgot-password/signals';
import { FORGOT_PASSWORD_TASK_QUEUE, forgotPasswordWorkflowId } from '../use-cases/forgot-password/types';
import { forgotPassword } from '../use-cases/forgot-password/workflows';

const USAGE = `usage:
  client start [userId=user-1] [newEmail=new@example.com]
  client old <code> [userId]
  client new <code> [userId]
  client state [userId]
  client cancel [userId]
  client result [userId]
  client users [userId]      current emails in the worker's mock users service

  client forgot [email=old@example.com]          start a password reset
  client reset <token> <password> [email]        submit the token from the mail (an Update)
  client resend [email] | forgot-state [email] | forgot-cancel [email] | forgot-result [email]`;

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'users') {
    const res = await fetch(`http://127.0.0.1:${process.env.DEV_USERS_PORT ?? 7300}`);
    const users = (await res.json()) as { userId: string; email: string }[];
    console.table(args[0] ? users.filter((u) => u.userId === args[0]) : users);
    return;
  }
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });
  const handleFor = (userId = 'user-1') => client.workflow.getHandle(changeEmailWorkflowId(userId));
  const forgotHandleFor = (email = 'old@example.com') => client.workflow.getHandle(forgotPasswordWorkflowId(email));

  switch (command) {
    case 'start': {
      const [userId = 'user-1', newEmail = 'new@example.com'] = args;
      const handle = await client.workflow.start(changeEmail, {
        taskQueue: CHANGE_EMAIL_TASK_QUEUE,
        workflowId: changeEmailWorkflowId(userId),
        args: [{ userId, newEmail }],
      });
      console.log(`started ${handle.workflowId}; the old-email OTP is in the worker log`);
      break;
    }
    case 'old':
      await handleFor(args[1]).signal(submitOldOtp, args[0]);
      console.log('sent old-email OTP');
      break;
    case 'new':
      await handleFor(args[1]).signal(submitNewOtp, args[0]);
      console.log('sent new-email OTP');
      break;
    case 'state':
      console.log(await handleFor(args[0]).query(getState));
      break;
    case 'cancel':
      await handleFor(args[0]).signal(cancel);
      console.log('cancel sent');
      break;
    case 'result':
      console.log(await handleFor(args[0]).result());
      break;
    case 'forgot': {
      const [email = 'old@example.com'] = args;
      const handle = await client.workflow.start(forgotPassword, {
        taskQueue: FORGOT_PASSWORD_TASK_QUEUE,
        workflowId: forgotPasswordWorkflowId(email),
        args: [{ email }],
      });
      console.log(`started ${handle.workflowId}; the reset link is in the worker log`);
      break;
    }
    case 'reset':
      console.log(
        await forgotHandleFor(args[2]).executeUpdate(fp.resetPassword, {
          args: [{ token: args[0], passwordHash: hashPassword(args[1]) }],
        }),
      );
      break;
    case 'resend':
      await forgotHandleFor(args[0]).signal(fp.resend);
      console.log('resend sent');
      break;
    case 'forgot-state':
      console.log(await forgotHandleFor(args[0]).query(fp.getState));
      break;
    case 'forgot-cancel':
      await forgotHandleFor(args[0]).signal(fp.cancel);
      console.log('cancel sent');
      break;
    case 'forgot-result':
      console.log(await forgotHandleFor(args[0]).result());
      break;
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
  await connection.close();
}

const rootMessage = (err: unknown): string => {
  let current = err;
  while (typeof current === 'object' && current !== null && 'cause' in current && current.cause) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
};

main().catch((err: unknown) => {
  console.error(rootMessage(err));
  process.exit(1);
});
