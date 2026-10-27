# Task 01: mock clients

Files to write (currently empty):

- `src/mocks/email-client.ts`
- `src/mocks/users-service-client.ts`

## email-client.ts

```ts
export interface EmailClient {
  send(to: string, subject: string, body: string): Promise<void>;
}
export type SentEmail = { to: string; subject: string; body: string };
```

`MockEmailClient implements EmailClient`:

- `sent: SentEmail[]`, appended to by `send`.
- `failNext(n: number)`: the next `n` calls to `send` throw `new Error('mock email send failed')` and are NOT recorded in `sent`.
- `lastTo(addr: string): SentEmail | undefined`: most recent sent email to `addr`.
- `clear()`: empties `sent` and resets the failure counter.

## users-service-client.ts

```ts
export interface UsersServiceClient {
  getEmail(userId: string): Promise<string>;
  isEmailTaken(email: string): Promise<boolean>;
  updateEmail(userId: string, newEmail: string, idempotencyKey: string): Promise<void>;
}
```

`MockUsersServiceClient implements UsersServiceClient`:

- `seed(userId, email)`: sets up a user.
- `getEmail`: throws if the user is unknown.
- `isEmailTaken`: true if any user has that email (case-insensitive).
- `updateEmail`: if `idempotencyKey` was already applied, do nothing. Otherwise set the email and remember the key. Throws if the user is unknown.

## Done when

- `npx tsc --noEmit` passes.
- `npx eslint src/mocks` passes.
