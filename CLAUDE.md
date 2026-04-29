# @weldable/integration-core — Contributor Guide

This is the canonical contributor guide for all Weldable integrations. It applies to `integration-core` and all 12 leaf integration packages (`@weldable/integration-slack`, `@weldable/integration-github`, etc.). Leaf integrations link here from their own `CLAUDE.md`.

## What is an integration?

A Weldable integration is a TypeScript package that exposes a set of **actions** — discrete, callable operations against an external service (e.g. "post a Slack message", "create a GitHub issue"). Each integration is a single `defineIntegration()` call exported from `src/index.ts`.

## Action anatomy

Every action is defined by an `ActionDef` object:

```ts
{
  actionId: 'post_message',             // snake_case, unique within the integration
  name: 'Post a message',               // user-facing label
  description: 'Post a message to a Slack channel.',
  intents: [                            // 8–12 BM25 search phrases for discoverability
    'post a message to slack',
    'send a slack message',
    'notify a channel',
    // ...
  ],
  preview: 'Post to #{channel}: {text}', // optional {param}-template shown before execution
  inputFields: [
    { name: 'channel', type: 'string', required: true, description: 'Channel ID or name.' },
    { name: 'text',    type: 'text',   required: true, description: 'Message text.' },
  ],
  outputFields: [
    { name: 'ts', type: 'string', description: 'Slack message timestamp.' },
  ],
  execute: rest({ method: 'POST', path: '/chat.postMessage' }),
  // mockExecute is optional — defineIntegration auto-generates one from outputFields
}
```

## Key APIs from `@weldable/integration-core`

- **`defineIntegration(def)`** — compiles an `IntegrationDef` into an `Integration`. Auto-builds composite action IDs (e.g. `slack.post_message`). Call this once and default-export the result.
- **`createRestHandler(config)`** — returns a `rest()` factory for REST API actions. Handles auth injection, HTTP error mapping (401→auth, 429→rate-limit, 4xx/5xx→api error), and a custom `checkError` for APIs that return errors with HTTP 200 (e.g. Slack's `ok: false`).
- **Error classes** (`IntegrationAuthError`, `IntegrationRateLimitError`, `IntegrationValidationError`, `IntegrationApiError`) — throw these for structured error handling by the runtime.
- **`ActionContext`** — passed to every `execute` handler: `ctx.http` (auth-injected HttpClient), `ctx.getCredentials()` (raw token for SDK use), `ctx.log()`.

See `src/types.ts` for the authoritative type definitions and `src/rest.ts` for REST handler internals.

## Layout

```
src/
  types.ts        — shared TypeScript types (IntegrationDef, ActionDef, ActionContext, …)
  define.ts       — defineIntegration() factory
  rest.ts         — createRestHandler() helper
  errors.ts       — structured error classes
  mock-helpers.ts — fake-data helpers (fakeEmail, fakeId, …) for tests
  mock-synth.ts   — deterministic synthesis used by mock-helpers
  testing.ts      — test utilities exported via @weldable/integration-core/testing
  index.ts        — public barrel
```

## Conventions

- Integration `id`: lowercase snake_case (e.g. `google_sheets`). URL slug uses kebab-case (`google-sheets`).
- Action `actionId`: lowercase snake_case (e.g. `create_spreadsheet`). Never set `id` directly — `defineIntegration()` builds the composite id.
- `intents`: write 8–12 natural-language phrasings covering different vocabularies. Include phrasings that don't mention the brand name. This is the primary discoverability mechanism.
- `mockExecute`: optional. If absent, `defineIntegration()` synthesizes one from `outputFields`. Write a custom one only when realistic array/nested output matters.
- No em dashes in any user-facing string (`name`, `description`, `preview`, field descriptions).

## Dev workflow

```bash
npm install
npm run build    # tsc → dist/
npm run dev      # watch mode
```

`dist/` is gitignored. Do not commit it. Always run `npm run build` cleanly before committing.

## Releasing

Bump `version` in `package.json`, commit to `main`, push. `publish.yml` detects the version change and handles build → npm publish (with provenance) → git tag → GitHub release. No manual `npm publish` needed.

Use the `/commit` skill for the full release flow — it analyzes the diff, proposes the correct semver bump, runs the build check, and prepares the push.

**Semver guide:**
- New action or optional field → **minor**
- Removed/renamed `actionId`, required `inputField` added, or breaking type change → **major**
- Bug fix, internal refactor → **patch**

## `integration-core` public API contract

All 12 leaf integrations and any third-party authors peer-depend on this package. Treat exported types and functions as a public API:
- Adding optional fields is backwards-compatible (minor or patch).
- Renaming or removing exports, or changing `defineIntegration` / `createRestHandler` call signatures, is **major**.
- Platform-only capabilities go in `@weldable/integration-core-internal` — never here.

A major version bump in `integration-core` requires all 11 leaf integrations to bump their peerDep range and republish.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development and PR workflow.
