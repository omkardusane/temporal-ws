# Agent help: mistakes to avoid

Read this before any task. Every item below happened in a real run.

## 0. Prove your work, don't claim it

A task is not done until these commands print no errors. Run them and paste the output:

```bash
npx tsc --noEmit
npx eslint .
npx prettier --write src tests && npx prettier --check src tests
npm test
```

If a command fails, fix it. If you cannot, stop and say which one failed. Never write "done" without the output.

## 1. Always `await` promises in activities

Wrong (error is lost, Temporal never retries, work may not finish):

```ts
sendOtp({ to }) {
  deps.emailClient.send(to, 'subject', 'body');   // floating promise
  return { otpHash };
}
commitEmailChange(args) {
  void deps.usersClient.updateEmail(...);          // `void` hides the promise
}
```

Right:

```ts
async sendOtp({ to, purpose }) {
  await deps.emailClient.send(to, subject, body);
  return { otpHash };
}
async commitEmailChange({ userId, newEmail, idempotencyKey }) {
  await deps.usersClient.updateEmail(userId, newEmail, idempotencyKey);
}
```

Rules: every activity is `async`. Never use `void somePromise()`. If an activity must fail so Temporal retries it, let the error propagate; do not catch it.

## 2. Never negate a Promise

`!deps.usersClient.isEmailTaken(email)` is always `false`, because a Promise is truthy. Await first:

```ts
async assertEmailAvailable(email) {
  return !(await deps.usersClient.isEmailTaken(email));
}
```

## 3. Hash before comparing OTPs

`sendOtp` returns the sha256 hex of the code. `verifyOtp` receives the plain code the user typed, so it must hash it first, then compare the two hashes:

```ts
const sha256 = (s: string) => createHash('sha256').update(s).digest();

async verifyOtp({ otp, otpHash }) {
  const actual = sha256(otp);                       // 32 bytes
  const expected = Buffer.from(otpHash, 'hex');     // 32 bytes
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

Comparing `otp` (6 chars) with `otpHash` (64 chars) directly is always false.

## 4. Match the declared types

`createActivities` should return the object itself, typed by inference:

```ts
export function createActivities(deps: { emailClient: EmailClient; usersClient: UsersServiceClient }) {
  return { getCurrentEmail, assertEmailAvailable, sendOtp, verifyOtp, commitEmailChange, notifyEmailChanged };
}
export type ChangeEmailActivities = ReturnType<typeof createActivities>;
```

Define each function as `async` inside (or as a const above the return). A sync function does not satisfy a `Promise<...>` type: that was the cause of five `tsc` errors.

## 5. Mock methods return rejected promises, they do not throw

In `src/mocks/users-service-client.ts`, `getEmail` must behave like `updateEmail`:

```ts
return Promise.reject(new Error(`unknown user: ${userId}`));
```

## 6. Write the test file the task asks for

Task 03 requires `activities.test.ts`. Without it nothing proves the activities work, and the bugs above would have been caught by it. Parse the code out of the mock mail like this:

```ts
const code = /Your code: (\d{6})/.exec(emailClient.lastTo('a@x.com')!.body)![1];
```

Use `MockActivityEnvironment`:

```ts
const env = new MockActivityEnvironment();
const { otpHash } = await env.run(activities.sendOtp, { to: 'a@x.com', purpose: 'old-email' });
assert.equal(await env.run(activities.verifyOtp, { otp: code, otpHash }), true);
```

## 7. Workflow code rules (task 04)

- File must be `workflows.ts`. Import only from `@temporalio/workflow`, plus `import type` from `./activities` and plain imports of `./signals` and `./types`.
- No `node:*` imports, `Math.random`, `Date.now`, `new Date()`, or `crypto` in workflow files.
- Signal handlers must only mutate local variables (push onto an array, set a flag). All waiting is `await condition(() => ..., timeout)`; it returns `false` on timeout.
- Take `workflowInfo().workflowId` as the idempotency key.

## 8. Integration test tips (task 05)

- Start the workflow, then poll the mock mailbox for the OTP mail. Do not hard-code codes.
- Time skipping: `await testEnv.sleep('11 minutes')` moves the clock past the OTP TTL.
- Run everything inside `worker.runUntil(async () => { ... })` so the worker is shut down when the test ends.
- Each test gets fresh mocks and a unique `workflowId` (or a fresh `TestWorkflowEnvironment`).

## 9. Stay in scope

Only touch files listed in the task. Do not rename exports from `docs/change-email-flow.md`. Do not add dependencies. Do not "improve" files from earlier tasks unless the task says so, except for the `getEmail` fix in item 5.
