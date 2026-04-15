import type { ActionHandler, HttpResponse } from './types.js';
/**
 * Integration-level REST config — set once per integration via createRestHandler().
 *
 * These are concerns shared across all of an integration's REST actions
 * (e.g., Slack always needs the `ok` field checked on every response).
 */
export interface RestConfig {
    /**
     * Check response data for API-level errors after each request.
     * Called even on 2xx responses.
     * Throw a structured error to signal failure.
     *
     * Example (Slack returns 200 for everything):
     *   checkError: (response) => {
     *     if (response.data?.ok === false) {
     *       throw new IntegrationApiError(response.data.error ?? 'Slack API error')
     *     }
     *   }
     */
    checkError?: (response: HttpResponse) => void;
    /**
     * Default body encoding for all actions created by this handler.
     * Individual RestSpec can override this.
     * Defaults to 'json'.
     */
    bodyFormat?: 'json' | 'form';
}
/**
 * Action-level REST spec — describes a single REST endpoint.
 */
export interface RestSpec {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** URL path relative to the integration's baseUrl (e.g., '/chat.postMessage' or '/{id}/values') */
    path: string;
    /**
     * Maps each input field name to where it appears in the request.
     * Fields not listed here default to 'body'.
     *
     * - 'path': substitutes {name} in the path template
     * - 'query': added as a URL query parameter
     * - 'body': included in the request body (JSON or form-encoded)
     * - 'header': added as a request header
     */
    paramMapping?: Record<string, 'path' | 'query' | 'body' | 'header'>;
    /** Override integration-level bodyFormat for this action */
    bodyFormat?: 'json' | 'form';
}
/**
 * Creates a scoped REST handler factory for an integration.
 *
 * The integration-level config (e.g., error checking) is applied to
 * every action created by the returned factory. This avoids repeating
 * integration-wide concerns on every action spec.
 *
 * Usage:
 *   const rest = createRestHandler({ checkError: (r) => { if (!r.data?.ok) throw ... } })
 *   // Then per action:
 *   execute: rest({ method: 'POST', path: '/chat.postMessage', paramMapping: { channel: 'body' } })
 */
export declare function createRestHandler(config?: RestConfig): (spec: RestSpec) => ActionHandler;
export { IntegrationApiError } from './errors.js';
//# sourceMappingURL=rest.d.ts.map