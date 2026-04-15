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
    code = 'AUTH_ERROR';
    integrationSlug;
    constructor(message = 'Authentication failed or expired', opts = {}) {
        super(message);
        this.name = 'IntegrationAuthError';
        this.integrationSlug = opts.integrationSlug;
    }
}
export class IntegrationBillingError extends Error {
    code = 'BILLING_ERROR';
    integrationSlug;
    billingUrl;
    constructor(message, opts = {}) {
        super(message);
        this.name = 'IntegrationBillingError';
        this.integrationSlug = opts.integrationSlug;
        this.billingUrl = opts.billingUrl;
    }
}
export class IntegrationRateLimitError extends Error {
    code = 'RATE_LIMIT';
    retryAfter;
    constructor(message = 'Rate limited', retryAfter) {
        super(message);
        this.name = 'IntegrationRateLimitError';
        this.retryAfter = retryAfter;
    }
}
export class IntegrationValidationError extends Error {
    code = 'VALIDATION_ERROR';
    field;
    constructor(message, field) {
        super(message);
        this.name = 'IntegrationValidationError';
        this.field = field;
    }
}
export class IntegrationApiError extends Error {
    code = 'API_ERROR';
    status;
    response;
    constructor(message, status, response) {
        super(message);
        this.name = 'IntegrationApiError';
        this.status = status;
        this.response = response;
    }
}
