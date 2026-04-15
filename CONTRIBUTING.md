# Contributing

## Development

Clone the repo and install dependencies:

```bash
npm install
npm run build
```

The TypeScript compiler writes output to `dist/`. Use `npm run dev` to watch for changes.

## Releasing a new version

Every integration repo (this one and all leaf packages) uses the same auto-publish workflow (`.github/workflows/publish.yml`).

**How it works:** on every push to `main`, the workflow compares the `version` field in `package.json` to the previous commit. If it changed, it builds, publishes to npm, creates a git tag, and opens a GitHub release. If it didn't change, the workflow exits without publishing.

**To cut a release:**

1. Open a PR that bumps `version` in `package.json` to the new semver (e.g. `1.0.0` to `1.1.0`).
2. Merge the PR.
3. The workflow publishes automatically within ~1 minute.

That's it — no manual `npm publish`, no manual tagging.

## npm token

Publishing uses the `NPM_TOKEN` secret set at the organization level in GitHub (`github.com/organizations/weldable/settings/secrets/actions`). It is scoped to all public repositories, so new integration repos inherit it automatically.

To rotate the token: create a new granular npm access token with publish permission on the `@weldable` scope, then update the org secret.

## Peer dependency policy

All leaf integrations (`@weldable/integration-*`) peer-depend on `@weldable/integration-core` at `^1.x`. When `integration-core` releases a new minor, leaf packages should update their peer range in a follow-up PR.

Breaking changes to `integration-core` (major version bump) require coordinated updates to all leaf packages.

## Creating a new integration

1. Create a new repo under the `weldable` org: `integration-<name>`.
2. Use an existing leaf package as a template.
3. Implement using `defineIntegration` from `@weldable/integration-core`.
4. Ship only `dist/` (set `"files": ["dist"]` in `package.json`).
5. Use the same `tsconfig.json` as the other packages (`target: ES2022`, `module: NodeNext`).
6. Copy `.github/workflows/publish.yml` from any existing integration repo — it works as-is.
7. Add a row to the integration table in `@weldable/integration-core`'s README.
