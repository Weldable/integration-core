// Errors
export { IntegrationAuthError, IntegrationBillingError, IntegrationRateLimitError, IntegrationValidationError, IntegrationApiError, } from './errors.js';
// REST helper
export { createRestHandler } from './rest.js';
// Factory
export { defineIntegration } from './define.js';
// Mock synthesis (for use in defineIntegration internals and integration packages)
export { synthesizeFromOutputFields, createDefaultMock } from './mock-synth.js';
// Mock fixture helpers (for handwritten mockExecute overrides)
export { deriveSeed, fakeEmail, fakeUrl, fakeId, fakeSlackTs, fakeIsoTimestamp, fakeArray, } from './mock-helpers.js';
