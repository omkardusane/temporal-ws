# Forgot password flow

A user forgot their password. We mail a one-time reset link to the account's address; whoever can open that mail can set a new password.

## Sequence

```
start(email)                                     workflow id: forgot-password-<email>
  0. findUserByEmail(email)                      -> unknown: return no-account, send nothing
  1. sendResetLink(email)                        -> 32-byte token mailed, only its sha256 kept in state
  2. wait (30 min TTL) for:
       update resetPassword(token, passwordHash) -> verifyToken; wrong: { ok: false, attemptsLeft }
                                                    right: commitPassword (idempotent), { ok: true }
       signal resend                             -> back to 1 with a fresh token (max 2);
                                                    the old token stops working
       signal cancel
  3. revokeSessions(userId)                      -> log out everywhere
  4. notifyPasswordChanged(email)                -> courtesy mail, best effort
```

Results: `completed`, `no-account`, `expired`, `too-many-attempts` (3 wrong tokens), `cancelled`.

## Temporal features this shows

| Feature               | Where                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Updates               | `resetPassword` returns accepted/rejected to the reset page synchronously |
| Update validators     | malformed or late calls are rejected before they touch history            |
| Signals / queries     | `resend`, `cancel`, `getState`                                            |
| Timers                | `condition(..., ttl)`; a reset in flight at the deadline may finish       |
| Workflow id dedupe    | one live reset per address; a repeat request should `resend` instead      |
| Idempotency           | `commitPassword` keyed by workflow id                                     |
| `allHandlersFinished` | the workflow waits for the update handler before completing               |

## Security notes

- The plain password never enters history: the caller hashes it (`password.ts`, scrypt) and the validator refuses anything not shaped like a hash.
- Only the token's hash lives in workflow state; the token itself exists only in the mail.
- `no-account` is for logs. The API must answer "if that address exists, we sent a link" in every case.
