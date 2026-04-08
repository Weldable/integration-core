import type { ActionHandler, HttpResponse } from './types'
import { IntegrationAuthError, IntegrationRateLimitError, IntegrationValidationError, IntegrationApiError } from './errors'

// ---------------------------------------------------------------------------
// REST helper types
// ---------------------------------------------------------------------------

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
  checkError?: (response: HttpResponse) => void
  /**
   * Default body encoding for all actions created by this handler.
   * Individual RestSpec can override this.
   * Defaults to 'json'.
   */
  bodyFormat?: 'json' | 'form'
}

/**
 * Action-level REST spec — describes a single REST endpoint.
 */
export interface RestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** URL path relative to the integration's baseUrl (e.g., '/chat.postMessage' or '/{id}/values') */
  path: string
  /**
   * Maps each input field name to where it appears in the request.
   * Fields not listed here default to 'body'.
   *
   * - 'path': substitutes {name} in the path template
   * - 'query': added as a URL query parameter
   * - 'body': included in the request body (JSON or form-encoded)
   * - 'header': added as a request header
   */
  paramMapping?: Record<string, 'path' | 'query' | 'body' | 'header'>
  /** Override integration-level bodyFormat for this action */
  bodyFormat?: 'json' | 'form'
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

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
export function createRestHandler(config: RestConfig = {}): (spec: RestSpec) => ActionHandler {
  return function restHandler(spec: RestSpec): ActionHandler {
    return async function executeRestSpec(args, ctx) {
      const paramMapping = spec.paramMapping ?? {}
      const bodyFormat = spec.bodyFormat ?? config.bodyFormat ?? 'json'

      let path = spec.path
      const queryParams: Record<string, string> = {}
      const bodyParams: Record<string, unknown> = {}
      const extraHeaders: Record<string, string> = {}

      for (const [key, value] of Object.entries(args)) {
        if (value === null || value === undefined) continue
        const location = paramMapping[key] ?? 'body'
        if (location === 'path') {
          path = path.replace(`{${key}}`, String(value))
        } else if (location === 'query') {
          queryParams[key] = String(value)
        } else if (location === 'header') {
          extraHeaders[key] = String(value)
        } else {
          bodyParams[key] = value
        }
      }

      const unreplaced = path.match(/\{(\w+)\}/g)
      if (unreplaced) {
        throw new IntegrationValidationError(
          `Unresolved path parameters: ${unreplaced.join(', ')}`
        )
      }

      const options = {
        query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        headers: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
        bodyFormat,
      }

      let response: HttpResponse
      const hasBody = Object.keys(bodyParams).length > 0
      const body = hasBody ? bodyParams : undefined

      switch (spec.method) {
        case 'GET':
          response = await ctx.http.get(path, options)
          break
        case 'POST':
          response = await ctx.http.post(path, body, options)
          break
        case 'PUT':
          response = await ctx.http.put(path, body, options)
          break
        case 'PATCH':
          response = await ctx.http.patch(path, body, options)
          break
        case 'DELETE':
          response = await ctx.http.delete(path, options)
          break
        default:
          throw new Error(`Unsupported HTTP method: ${spec.method}`)
      }

      // HTTP-level error handling
      if (response.status === 401 || response.status === 403) {
        throw new IntegrationAuthError(`HTTP ${response.status}: Authentication failed`)
      }
      if (response.status === 429) {
        const retryAfter = response.headers['retry-after']
          ? parseInt(response.headers['retry-after'], 10)
          : undefined
        throw new IntegrationRateLimitError('Rate limited', retryAfter)
      }
      if (response.status >= 400) {
        const data = response.data as Record<string, unknown> | null
        const msg = data?.error ?? data?.message ?? `HTTP ${response.status}`
        throw new IntegrationApiError(String(msg), response.status, response.data)
      }

      // Integration-level error checking (e.g., Slack's ok field)
      if (config.checkError) {
        config.checkError(response)
      }

      return response.data as Record<string, unknown>
    }
  }
}

// Re-export for convenience in integration packages
export { IntegrationApiError } from './errors'
