import { Client, Connection } from '@temporalio/client';
import { cancel, getState, submitNewOtp, submitOldOtp } from '../use-cases/change-email/signals';
import { CHANGE_EMAIL_TASK_QUEUE, changeEmailWorkflowId } from '../use-cases/change-email/types';
import { changeEmail } from '../use-cases/change-email/workflows';

const USAGE = `usage:
  client start [userId=user-1] [newEmail=new@example.com]
  client old <code> [userId]
  client new <code> [userId]
  client state [userId]
  client cancel [userId]
  client result [userId]`;

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });
  const handleFor = (userId = 'user-1') => client.workflow.getHandle(changeEmailWorkflowId(userId));

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
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
  await connection.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
