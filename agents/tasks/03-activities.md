# Task 03: activities

Files to create:

- `src/use-cases/change-email/activities.ts`
- `src/use-cases/change-email/activities.test.ts`

## activities.ts

```ts
export function createActivities(deps: { emailClient: EmailClient; usersClient: UsersServiceClient }) {
  return { getCurrentEmail, assertEmailAvailable, sendOtp, verifyOtp, commitEmailChange, notifyEmailChanged };
}
export type ChangeEmailActivities = ReturnType<typeof createActivities>;
```

Behaviour (signatures in `docs/change-email-flow.md`):

- `getCurrentEmail(userId)`: `usersClient.getEmail(userId)`.
- `assertEmailAvailable(email)`: `!(await usersClient.isEmailTaken(email))`.
- `sendOtp({ to, purpose })`: generate a 6-digit code with `crypto.randomInt(0, 1_000_000)` zero-padded to 6 chars, mail it via `emailClient.send` (subject and body differ by `purpose`; the body must contain the code on its own line as `Your code: 123456`), return `{ otpHash }` where `otpHash` is the hex sha256 of the code. If `send` throws, let it propagate so Temporal retries.
- `verifyOtp({ otp, otpHash })`: compare sha256(otp) to `otpHash` with `crypto.timingSafeEqual`. Return false (not throw) on length mismatch.
- `commitEmailChange({ userId, newEmail, idempotencyKey })`: delegate to `usersClient.updateEmail`.
- `notifyEmailChanged({ to, newEmail })`: send a short mail saying the address was changed to `newEmail`.

Never log or return the plaintext code.

## activities.test.ts

Use `MockActivityEnvironment` from `@temporalio/testing` and the mocks. Cover:

1. `sendOtp` mails the code and `verifyOtp` accepts it with the returned hash (parse the code from `lastTo(...).body`).
2. `verifyOtp` rejects a wrong code.
3. `assertEmailAvailable` is false for a seeded email, true otherwise.
4. `commitEmailChange` called twice with the same key leaves the email set once.
5. `sendOtp` rejects when `failNext(1)` is set.

## Done when

- `npx mocha --require ts-node/register src/use-cases/change-email/activities.test.ts` passes.
- `npx eslint src/use-cases` passes.
