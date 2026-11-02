# temporal-use-cases

[![CI](https://github.com/omkardusane/temporal-ws/actions/workflows/ci.yml/badge.svg)](https://github.com/omkardusane/temporal-ws/actions/workflows/ci.yml)

Small, runnable examples of real-world Temporal workflows in TypeScript. Each use case has a workflow, activities that call mocked external services, and integration tests that run the real workflow against Temporal's test server.

## Use cases

| Use case                                    | Demonstrates                                                  |
| ------------------------------------------- | ------------------------------------------------------------- |
| [Change email](./docs/change-email-flow.md) | signals, queries, timers, activity retries, idempotent commit |

## Run

```bash
npm install
npm test
```

No Temporal server is needed: the tests use `TestWorkflowEnvironment`, which downloads a test server binary on first run.

## Try it against a dev server

Three terminals, with the [Temporal CLI](https://docs.temporal.io/cli) installed:

```bash
temporal server start-dev            # server + UI at http://localhost:8233
npm run dev:worker                   # worker; mails (OTPs) are printed here
npm run dev:client start             # starts the workflow for user-1
npm run dev:client state             # { phase: 'awaiting-old-otp', ... }
npm run dev:client old <code>        # code from the worker log
npm run dev:client new <code>        # code from the second mail
npm run dev:client result            # { status: 'completed' }
```

`cancel` and `result` also work; run `npm run dev:client` for usage. Watch the run in the UI while you go.

## Layout

```
src/
  dev/                        worker + CLI client for running against a dev server
  mocks/                      fake external clients (email, users service)
  use-cases/<name>/           workflows.ts, activities.ts, signals.ts, types.ts
tests/integration/<name>/     end-to-end tests: real Temporal test server + mocks
docs/                         design notes per use case
agents/                       task breakdown for a local LLM (opencode)
```

- Mock the world, not Temporal.
- Activities receive their clients by injection (`createActivities({ ... })`).
- Workflow files are named `workflows.ts` so the ESLint node-builtin ban applies to them.
