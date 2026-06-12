// Types
export type {
  IntegrationDef,
  Integration,
  IntegrationId,
  ActionDef,
  Action,
  ActionId,
  ActionHandler,
  ActionContext,
  MockActionContext,
  MockActionHandler,
  HttpClient,
  HttpResponse,
  RequestOptions,
  InputField,
  DynamicFieldSource,
  OutputField,
  AuthConfig,
  AuthPlacement,
  OAuthConfig,
  ApiKeyConfig,
  NoAuthConfig,
  ConfigField,
} from './types.js'

// Declarative integration specs
export {
  IntegrationSpecSchema,
  parseSpec,
  SPEC_ID_RE,
} from './spec.js'
export type {
  IntegrationSpec,
  ActionSpec,
  SpecRequest,
  PaginationSpec,
  CheckErrorSpec,
  SpecAuth,
  SpecIssue,
  SpecIssueCode,
  SpecParseResult,
} from './spec.js'
export { compileSpec, SpecCompileError } from './compile.js'
export type { CompiledSpecIntegration } from './compile.js'

// Errors
export {
  IntegrationAuthError,
  IntegrationBillingError,
  IntegrationRateLimitError,
  IntegrationValidationError,
  IntegrationApiError,
} from './errors.js'

// REST helper
export { createRestHandler } from './rest.js'
export type { RestConfig, RestSpec } from './rest.js'

// Factory
export { defineIntegration } from './define.js'

// Mock synthesis (for use in defineIntegration internals and integration packages)
export { synthesizeFromOutputFields, createDefaultMock } from './mock-synth.js'

// Mock fixture helpers (for handwritten mockExecute overrides)
export {
  deriveSeed,
  fakeEmail,
  fakeUrl,
  fakeId,
  fakeSlackTs,
  fakeIsoTimestamp,
  fakeArray,
} from './mock-helpers.js'
