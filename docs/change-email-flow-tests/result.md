# Manual test summary: change-email against a dev server

Run by hand on 2026-11-02 with `temporal server start-dev`, `npm run dev:worker` and `npm run dev:client`. Mails (OTPs) were read from the worker log. Users `u23` and `u24` were seeded in `src/dev/worker.ts`.

## What was run

| #   | Scenario                                                                 | Outcome                                                      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | `u23` to `new2@example.com`, wrong new OTPs, then the correct one        | `completed` (screenshot 1)                                   |
| 2   | `u23` to `new3@example.com`, correct OTPs                                | `completed` in 1m 17s (screenshot 2)                         |
| 3   | `u23` and `u24` started back to back, signals interleaved (terminal log) | both started in parallel; final result of `u24` not captured |

## Screenshot 1: wrong codes use up attempts

![Event history of change-email-u23, first run](<Screenshot 2026-11-02 at 16.49.56.png>)

Read bottom to top:

- `getCurrentEmail` returns `u23@example.com`, `assertEmailAvailable` is `true`, then `sendOtp` and a 10 minute timer for the old-email step.
- `submitOldOtp 388933`, then `verifyOtp` is `true`. The workflow moves on: `sendOtp` for the new address and a new timer.
- Five more `submitOldOtp 388933` signals arrive after the old step is over. They are recorded in history and ignored.
- `submitNewOtp 388933` (the old code) gives `verifyOtp` `false`, twice. Each one costs an attempt, and each wait gets its own timer.
- `submitNewOtp 687564` gives `verifyOtp` `true`. Then `commitEmailChange`, `notifyEmailChanged`, and the result is `completed`.

Two wrong codes plus one right code is within the limit of 3 attempts. A third wrong code would have ended the run as `too-many-attempts`.

## Screenshot 2: clean run, and the mock remembers earlier runs

![Event history of change-email-u23, second run](<Screenshot 2026-11-02 at 17.06.38.png>)

- Input is `u23` to `new3@example.com`. Old OTP `195615` is accepted, then new OTP `443039` is accepted, and the result is `completed`.
- `getCurrentEmail` returned `new2@example.com`, not `u23@example.com`. The first run had already changed the email, and the mock users client keeps its state while the worker process is alive. The "email changed" notice therefore went to `new2@example.com`.
- The same workflow ID `change-email-u23` was reused after the first run had finished. Temporal allows that. Only one run per ID can be running at a time.

## Scenario 3: two users in parallel (terminal log)

`u23` and `u24` were started one after the other and both ran at once, as expected, because the workflow IDs differ.

OTP `443039` was sent to `u24` first as its new-email code, which looks like a mix-up, and later to `u23`, where it was accepted (screenshot 2). I inferred the rest from the workflow code and did not observe it in the UI:

- `u24`'s early `submitNewOtp 443039` was queued before its old-email step had finished.
- Once the new-email step started, that stale code was probably checked first and failed, using one of the 3 attempts.
- `u24`'s later `submitNewOtp 361966` then had two attempts left to succeed.

The `u24` result was not captured, so check its history in the UI to confirm.

## Findings

1. The happy path, wrong-code attempts and idempotent reuse of a workflow ID work against a real server.
2. Signals are buffered per step. A code sent for a step that has already passed (old OTP after the old step, new OTP before the new step) stays in its queue. A code sent early for the new step is checked as the first attempt of that step and can use up an attempt. This is harmless but surprising. Options if it matters: clear the queue when a step starts, or only count signals received during the step.
3. The mock users client is in memory, so state carries across runs until the worker restarts. Restart the worker to reset the seeded emails.
4. Not run by hand: expiry after 10 minutes (covered by the time-skipping integration test), `cancel`, and the `email-taken` path.
