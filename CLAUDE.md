# @weldable/integration-core

Core types, factory function, REST helpers, and test utilities for the Weldable integration ecosystem.

## Layout

```
src/
  types.ts        — shared TypeScript types (IntegrationDef, ActionDef, FieldDef, ActionContext, …)
  define.ts       — defineIntegration() factory
  rest.ts         — createRestHandler() helper
  errors.ts       — IntegrationError and subclasses
  mock-helpers.ts — fake-data helpers (fakeEmail, fakeId, …) for tests
  mock-synth.ts   — deterministic synthesis used by mock-helpers
  testing.ts      — test utilities exported via @weldable/integration-core/testing
  index.ts        — public barrel
```

## Dev workflow

```bash
npm install
npm run build   # tsc → dist/
npm run dev     # watch mode
```

`dist/` is gitignored and built by CI before publishing — do not commit it.

## Releasing

Bump `version` in `package.json`, commit to `main`, push. `publish.yml` detects the version change and publishes to npm, creates a git tag, and opens a GitHub release. No manual `npm publish`.

Use the `/commit` skill to handle this end-to-end (it handles the version bump, build check, and pushing).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development and release workflow.

All leaf integrations (`@weldable/integration-*`) peer-depend on this package. Breaking changes require a major version bump and coordinated updates to leaf packages.
