# Change email flow

A user wants to change the email on their account. We prove they own both the old and the new address with one OTP each, and only then flip the email.

## Sequence

```
start(userId, newEmail)
  0. getCurrentEmail(userId)                   -> old email, needed for steps 2 and 7
  1. assertEmailAvailable(newEmail)            -> fail fast if taken
  2. sendOtp(old email)                        -> OTP #1 mailed, hash kept in workflow state
  3. wait for signal submitOldOtp(code)        -> verifyOtp; max 3 attempts, 10 min TTL
  4. sendOtp(new email)                        -> OTP #2 mailed
  5. wait for signal submitNewOtp(code)        -> verifyOtp; max 3 attempts, 10 min TTL
  6. commitEmailChange(userId, newEmail)       -> the "flip", idempotent
  7. notifyEmailChanged(old email)             -> courtesy mail, best effort
```

Signal `cancel` is accepted at any point before step 6.

## Temporal features this shows

| Feature              | Where                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| Signals              | `submitOldOtp`, `submitNewOtp`, `cancel`                                |
| Queries              | `getState` returns the current phase                                    |
| Timers / timeouts    | `condition(..., ttl)` per OTP step                                      |
| Activity retries     | mail send fails transiently and is retried (`MockEmailClient.failNext`) |
| Idempotency          | `commitEmailChange` keyed by workflow id, safe to retry                 |
| Business workflow id | `change-email-${userId}`: one in-flight change per user                 |
| Determinism          | OTP generated and verified in activities, never in workflow code        |

## Contracts

Task queue: `change-email`.

```ts
// types.ts
type ChangeEmailInput = { userId: string; newEmail: string };
type ChangeEmailPhase = 'validating' | 'awaiting-old-otp' | 'awaiting-new-otp' | 'committing' | 'done';
type ChangeEmailResult =
  | { status: 'completed' }
  | { status: 'email-taken' }
  | { status: 'expired'; phase: ChangeEmailPhase }
  | { status: 'too-many-attempts'; phase: ChangeEmailPhase }
  | { status: 'cancelled'; phase: ChangeEmailPhase };
```

Signals and query (`signals.ts`): `submitOldOtp(code: string)`, `submitNewOtp(code: string)`, `cancel()`, query `getState(): { phase: ChangeEmailPhase; attemptsLeft: number }`.

Activities (`createActivities({ emailClient, usersClient })`):

| Activity                                                  | Returns                      |
| --------------------------------------------------------- | ---------------------------- |
| `getCurrentEmail(userId)`                                 | `string`                     |
| `assertEmailAvailable(email)`                             | `boolean` (true = available) |
| `sendOtp({ to, purpose })`                                | `{ otpHash: string }`        |
| `verifyOtp({ otp, otpHash })`                             | `boolean`                    |
| `commitEmailChange({ userId, newEmail, idempotencyKey })` | `void`                       |
| `notifyEmailChanged({ to, newEmail })`                    | `void`                       |

`purpose` is `'old-email' | 'new-email'` and only affects the mail subject/body. The plaintext OTP exists only inside `sendOtp` and in the mailed message; the workflow only ever holds the hash.

Workflow settings (`workflows.ts`): activities use `startToCloseTimeout` 30 seconds and retry up to 5 attempts starting at 1 second. Each OTP step waits at most 10 minutes (`OTP_TTL`) and allows 3 wrong codes (`MAX_ATTEMPTS`). Attempts reset between the old and new OTP steps.

## Mocks

- `MockEmailClient`: `send(to, subject, body)`, `sent[]`, `lastTo(addr)`, `failNext(n)`, `clear()`.
- `MockUsersServiceClient`: `seed(userId, email)`, `getEmail(userId)`, `isEmailTaken(email)`, `updateEmail(userId, newEmail, idempotencyKey)`.

Both implement an interface (`EmailClient`, `UsersServiceClient`) that a real client could satisfy.

## Test scenarios (`tests/integration/change-email-flow`)

1. Happy path: email flipped, old address got a notification.
2. Wrong old OTP three times: `too-many-attempts`, email unchanged.
3. Old OTP never submitted: `expired` (time-skipping).
4. New email already taken: `email-taken`, no mail sent.
5. Mail client fails twice then succeeds: still completes.
6. `cancel` while awaiting the new OTP: `cancelled`, email unchanged.
