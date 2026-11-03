import { createServer } from 'node:http';
import { NativeConnection, Worker } from '@temporalio/worker';
import { MockEmailClient } from '../mocks/email-client';
import { MockUsersServiceClient } from '../mocks/users-service-client';
import { createActivities } from '../use-cases/change-email/activities';
import { CHANGE_EMAIL_TASK_QUEUE } from '../use-cases/change-email/types';

// Dev only: the "mailbox" is this terminal, so the OTP shows up in the worker log.
class ConsoleEmailClient extends MockEmailClient {
  public override async send(to: string, subject: string, body: string): Promise<void> {
    await super.send(to, subject, body);
    console.log(`\n--- mail to ${to}: ${subject}\n${body}\n`);
  }
}

async function main(): Promise<void> {
  const usersClient = new MockUsersServiceClient();
  usersClient.seed('user-1', 'old@example.com');
  usersClient.seed('user-2', 'taken@example.com');

  const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const worker = await Worker.create({
    connection,
    taskQueue: CHANGE_EMAIL_TASK_QUEUE,
    workflowsPath: require.resolve('../use-cases/change-email/workflows'),
    activities: createActivities({ emailClient: new ConsoleEmailClient(), usersClient }),
  });
  // Dev only: read-only view of the in-memory users, used by `client users`.
  const usersPort = Number(process.env.DEV_USERS_PORT ?? 7300);
  createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(usersClient.list()));
  }).listen(usersPort, '127.0.0.1');
  console.log(`users snapshot at http://127.0.0.1:${usersPort}`);
  console.log(`worker listening on task queue "${CHANGE_EMAIL_TASK_QUEUE}"`);
  await worker.run();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
