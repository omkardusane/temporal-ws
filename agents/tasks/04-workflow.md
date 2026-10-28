# Task 04: workflow

File to create: `src/use-cases/change-email/workflows.ts` (the name matters for the ESLint determinism rule).

Export `changeEmail(input: ChangeEmailInput): Promise<ChangeEmailResult>`.

## Setup

- `proxyActivities<ChangeEmailActivities>` (type import from `./activities`) with `startToCloseTimeout: '30 seconds'` and `retry: { maximumAttempts: 5, initialInterval: '1 second' }`.
- Constants at the top: `OTP_TTL = '10 minutes'`, `MAX_ATTEMPTS = 3`.
- Local state: `phase`, `attemptsLeft`, a `cancelled` flag, and one queue (array of strings) per OTP signal.
- Register handlers with `setHandler`: `submitOldOtp` / `submitNewOtp` push onto their queue, `cancel` sets the flag, `getState` returns `{ phase, attemptsLeft }`.

## Flow

1. `phase = 'validating'`. If `!(await assertEmailAvailable(newEmail))` return `{ status: 'email-taken' }`.
2. Call a local helper `runOtpStep(to, purpose, queue, phase)` for the old email, then again for the new email. The helper:
   - sets `phase`, resets `attemptsLeft = MAX_ATTEMPTS`
   - gets `{ otpHash }` from `sendOtp({ to, purpose })`
   - loop: `await condition(() => queue.length > 0 || cancelled, OTP_TTL)`
     - returns false (timeout) -> result `expired`
     - `cancelled` -> result `cancelled`
     - else shift one code, `verifyOtp`; on success return ok; on failure decrement `attemptsLeft`, and if 0 -> `too-many-attempts`
   - returns either `{ ok: true }` or the failing `ChangeEmailResult` (with `phase`).
3. If either step failed, return its result.
4. `phase = 'committing'`; `commitEmailChange({ userId, newEmail, idempotencyKey: workflowInfo().workflowId })`. No cancellation after this point.
5. Best effort: `notifyEmailChanged` for the old email inside try/catch (do not fail the workflow). Get the old email with `getCurrentEmail(userId)` as the very first call, before step 1.
6. `phase = 'done'`; return `{ status: 'completed' }`.

## Done when

- `npx tsc --noEmit` passes.
- `npx eslint src/use-cases` passes (no restricted imports in `workflows.ts`).
- Existing activity tests still pass.
