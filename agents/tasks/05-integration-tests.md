# Task 05: integration tests

File to fill (currently empty): `tests/integration/change-email-flow/change-email-flow.test.ts`

## Harness

- mocha `describe` / `it`, `assert` from Node, like the other tests.
- `TestWorkflowEnvironment.createTimeSkipping()` in `before`, `teardown()` in `after`.
- Per test: fresh `MockEmailClient`, `MockUsersServiceClient` (seed `user-1` with `old@example.com`, and `taken@example.com` for another user), a `Worker.create` on `CHANGE_EMAIL_TASK_QUEUE` with `workflowsPath: require.resolve('../../../src/use-cases/change-email/workflows')` and `activities: createActivities({ emailClient, usersClient })`.
- Start with `client.workflow.start(changeEmail, { taskQueue, workflowId: changeEmailWorkflowId('user-1'), args: [{ userId: 'user-1', newEmail: 'new@example.com' }] })`.
- Run the whole scenario inside `worker.runUntil(async () => { ... })`.
- Helper `otpFrom(email: SentEmail): string` parses `Your code: (\d{6})` from the body.
- Helper `waitForMail(emailClient, addr)`: poll `lastTo(addr)` (short real sleeps, e.g. 20 ms, up to ~5 s) until a mail arrives. Do not use fixed sleeps elsewhere.

## Scenarios (see docs/change-email-flow.md)

1. Happy path: read OTP from old mail, `submitOldOtp`; read OTP from new mail, `submitNewOtp`; result `completed`; `usersClient.getEmail('user-1') === 'new@example.com'`; old address received a change notification.
2. Wrong old OTP three times: `too-many-attempts`, email unchanged, no mail to the new address.
3. Old OTP never submitted: `await testEnv.sleep('11 minutes')`, result `expired`, email unchanged.
4. New email already taken (`taken@example.com`): `email-taken`, `emailClient.sent` is empty.
5. `emailClient.failNext(2)` before starting: workflow still completes via activity retries.
6. `cancel` signal while awaiting the new OTP: `cancelled`, email unchanged.

Also assert the `getState` query returns `awaiting-old-otp` right after the first mail arrives in scenario 1.

## Done when

- `npm test` passes, all six scenarios green.
- `npx eslint tests` passes.
