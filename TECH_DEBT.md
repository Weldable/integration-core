# Tech Debt — integration-core

## [2026-04-29] src/mock-synth.ts
`synthesizeField()` can't produce arrays of objects with nested fields, discriminated unions, or date ranges. Any integration needing realistic nested output must hand-write `mockExecute`, creating boilerplate and inconsistency. Fix: add an optional `mockRule?: (rand: () => number) => unknown` field to `OutputField` so complex types can opt in to custom synthesis.

## [2026-04-29] src/errors.ts
All error classes (`IntegrationAuthError`, `IntegrationApiError`, etc.) lack utility methods for attaching integration context (`withIntegration(slug)`) or serializing for logging (`toJSON()`). Callers must reconstruct context at every catch site. Add these methods to the base class or a shared mixin.

## [2026-04-29] src/ (general)
No unit tests for any core library function — `defineIntegration()`, `createRestHandler()`, error classes, mock-synth. Core is the highest-leverage place for tests since all 12 integrations depend on it. Even a small suite covering the happy path and error mapping would catch regressions.
