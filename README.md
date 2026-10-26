# Docs

- [change-email-flow.md](./docs/change-email-flow.md): sequence, contracts, mocks and test scenarios for the change-email use case.

## Repo layout

```
src/
  mocks/                      fake external clients (email, users service)
  use-cases/<name>/           workflows.ts, activities.ts, signals.ts, types.ts
tests/integration/<name>/     end-to-end tests: real Temporal test server + mocks
docs/                         design notes per use case
agents/                       task breakdown for a local LLM (opencode)
```

Rules of thumb:

- Mock the world, not Temporal. Tests run real workflows against `TestWorkflowEnvironment`.
- Activities receive their clients by injection (`createActivities({ ... })`).
- Workflow files are named `workflows.ts` so the ESLint node-builtin ban applies to them.
- Tests are `*.test.ts`, run by `npm test` (mocha).
