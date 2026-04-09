/**
 * Structured error types for Weldable integrations.
 *
 * The Weldable runtime catches these specific error types to determine
 * the correct response behavior:
 *
 *   IntegrationAuthError       → return not_connected + connect_url
 *   IntegrationRateLimitError  → return error with retryAfter hint
 *   IntegrationValidationError → return error (bad input, do not retry)
 *   IntegrationApiError        → return error (upstream API failure)
 *
 * Integration code should throw these instead of generic Error objects
 * so the runtime can handle them appropriately.
 */

export class IntegrationAuthError extends Error {
  readonly code = 'AUTH_ERROR' as const
  readonly integrationSlug?: string

  constructor(message = 'Authentication failed or expired', opts: { integrationSlug?: string } = {}) {
    super(message)
    this.name = 'IntegrationAuthError'
    this.integrationSlug = opts.integrationSlug
  }
}

export class IntegrationBillingError extends Error {
  readonly code = 'BILLING_ERROR' as const
  readonly integrationSlug?: string
  readonly billingUrl?: string

  constructor(message: string, opts: { integrationSlug?: string; billingUrl?: string } = {}) {
    super(message)
    this.name = 'IntegrationBillingError'
    this.integrationSlug = opts.integrationSlug
    this.billingUrl = opts.billingUrl
  }
}

export class IntegrationRateLimitError extends Error {
  readonly code = 'RATE_LIMIT' as const
  readonly retryAfter?: number

  constructor(message = 'Rate limited', retryAfter?: number) {
    super(message)
    this.name = 'IntegrationRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class IntegrationValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'IntegrationValidationError'
    this.field = field
  }
}

export class IntegrationApiError extends Error {
  readonly code = 'API_ERROR' as const
  readonly status?: number
  readonly response?: unknown

  constructor(message: string, status?: number, response?: unknown) {
    super(message)
    this.name = 'IntegrationApiError'
    this.status = status
    this.response = response
  }
}
