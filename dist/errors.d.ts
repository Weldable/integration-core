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
export declare class IntegrationAuthError extends Error {
    readonly code: "AUTH_ERROR";
    readonly integrationSlug?: string;
    constructor(message?: string, opts?: {
        integrationSlug?: string;
    });
}
export declare class IntegrationBillingError extends Error {
    readonly code: "BILLING_ERROR";
    readonly integrationSlug?: string;
    readonly billingUrl?: string;
    constructor(message: string, opts?: {
        integrationSlug?: string;
        billingUrl?: string;
    });
}
export declare class IntegrationRateLimitError extends Error {
    readonly code: "RATE_LIMIT";
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number);
}
export declare class IntegrationValidationError extends Error {
    readonly code: "VALIDATION_ERROR";
    readonly field?: string;
    constructor(message: string, field?: string);
}
export declare class IntegrationApiError extends Error {
    readonly code: "API_ERROR";
    readonly status?: number;
    readonly response?: unknown;
    constructor(message: string, status?: number, response?: unknown);
}
//# sourceMappingURL=errors.d.ts.map