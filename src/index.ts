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
  HttpClient,
  HttpResponse,
  RequestOptions,
  InputField,
  OutputField,
  AuthConfig,
  OAuthConfig,
  ApiKeyConfig,
  NoAuthConfig,
  ConfigField,
} from './types'

// Errors
export {
  IntegrationAuthError,
  IntegrationBillingError,
  IntegrationRateLimitError,
  IntegrationValidationError,
  IntegrationApiError,
} from './errors'

// REST helper
export { createRestHandler } from './rest'
export type { RestConfig, RestSpec } from './rest'

// Factory
export { defineIntegration } from './define'
