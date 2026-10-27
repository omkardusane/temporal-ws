# Task 02: types, signals, query

Files to create:

- `src/use-cases/change-email/types.ts`
- `src/use-cases/change-email/signals.ts`

## types.ts

Export exactly the types in "Contracts" of `docs/change-email-flow.md`: `ChangeEmailInput`, `ChangeEmailPhase`, `ChangeEmailResult`. Also export `CHANGE_EMAIL_TASK_QUEUE = 'change-email'` and `changeEmailWorkflowId(userId: string): string` returning `` `change-email-${userId}` ``.

## signals.ts

Using `defineSignal` / `defineQuery` from `@temporalio/workflow`:

- `submitOldOtp = defineSignal<[string]>('submitOldOtp')`
- `submitNewOtp = defineSignal<[string]>('submitNewOtp')`
- `cancel = defineSignal('cancel')`
- `getState = defineQuery<{ phase: ChangeEmailPhase; attemptsLeft: number }>('getState')`

Import types with `import type`.

## Done when

- `npx tsc --noEmit` passes.
- `npx eslint src/use-cases` passes.
