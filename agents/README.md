# Agent plan: change-email use case

Work is split into small tasks for a local LLM run through opencode. Do them in order, one per session, and check the "done when" commands before moving on.

## How to invoke

```bash
opencode run "Read agents/README.md and agents/tasks/01-mocks.md, then do exactly that task and nothing else."
```

Repeat with `02-...`, `03-...` and so on. Review the diff between tasks.

## Ground rules (include in every session)

1. Read `docs/change-email-flow.md` first. It is the source of truth for names, signatures and behaviour. Do not rename anything.
2. Do only the task in the task file. Do not touch files it does not list.
3. Match the existing style: prettier (`npm run format`), strict TypeScript, no `any`.
4. Workflow code (`workflows.ts`, `signals.ts`) must be deterministic: no `Math.random`, `Date.now`, `crypto`, or Node built-ins. Only `@temporalio/workflow` imports plus `import type` from activities.
5. Do not add dependencies.
6. Finish by running the task's "done when" commands and reporting their output. If something fails and you cannot fix it inside the task scope, stop and say so.

## Tasks

| #   | File                                                 | Output                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------- |
| 01  | [tasks/01-mocks.md](tasks/01-mocks.md)               | mock email + users clients                      |
| 02  | [tasks/02-types-signals.md](tasks/02-types-signals.md) | types, signals, query definitions             |
| 03  | [tasks/03-activities.md](tasks/03-activities.md)     | `createActivities` + activity unit tests        |
| 04  | [tasks/04-workflow.md](tasks/04-workflow.md)         | `changeEmail` workflow                          |
| 05  | [tasks/05-integration-tests.md](tasks/05-integration-tests.md) | six integration scenarios            |
| 06  | [tasks/06-polish.md](tasks/06-polish.md)             | README, lint, format, final check               |
