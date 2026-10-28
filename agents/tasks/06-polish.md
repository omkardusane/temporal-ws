# Task 06: polish

1. Rewrite the root `README.md`: one paragraph on what the repo is, a table of use cases (just change-email for now: what it demonstrates, link to `docs/change-email-flow.md`), and how to run: `npm install`, `npm test`. Remove all hello-world text; no Temporal server is needed since tests use `TestWorkflowEnvironment`.
2. Run `npm run format`, then `npm run lint`, then `npm run build`. Fix anything they report inside the files from tasks 01-05 only.
3. Check `docs/change-email-flow.md` still matches the code. Fix the doc if not.

## Done when

- `npm run format:check && npm run lint && npm run build && npm test` all pass.
