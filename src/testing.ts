/**
 * Test utilities for Weldable integration packages.
 *
 * Import from '@weldable/integration-core/testing' in your test files:
 *
 *   import { createMockContext, MockHttpClient } from '@weldable/integration-core/testing'
 */

import type { ActionContext, HttpClient, HttpResponse, RequestOptions } from './types.js'

// ---------------------------------------------------------------------------
// MockHttpClient
// ---------------------------------------------------------------------------

interface MockRequest {
  method: string
  path: string
  body?: unknown
  options?: RequestOptions
}

interface MockResponse {
  data: unknown
  status: number
  headers?: Record<string, string>
}

type ResponseFactory = (path: string, body?: unknown, options?: RequestOptions) => MockResponse

/**
 * A mock HttpClient implementation for testing integration actions.
 *
 * Records all requests for assertion. Supports configurable responses
 * via onGet(), onPost(), etc.
 */
export class MockHttpClient implements HttpClient {
  requests: MockRequest[] = []
  private defaultResponse: MockResponse = { data: {}, status: 200 }
  private handlers = new Map<string, ResponseFactory>()

  private makeResponse(path: string, body?: unknown, options?: RequestOptions): HttpResponse {
    const key = path.split('?')[0]
    const handler = this.handlers.get(key)
    const result = handler ? handler(path, body, options) : this.defaultResponse
    return {
      data: result.data,
      status: result.status,
      headers: result.headers ?? {},
    }
  }

  async get(path: string, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method: 'GET', path, options })
    return this.makeResponse(path, undefined, options)
  }

  async post(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method: 'POST', path, body, options })
    return this.makeResponse(path, body, options)
  }

  async put(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method: 'PUT', path, body, options })
    return this.makeResponse(path, body, options)
  }

  async patch(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method: 'PATCH', path, body, options })
    return this.makeResponse(path, body, options)
  }

  async delete(path: string, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method: 'DELETE', path, options })
    return this.makeResponse(path, undefined, options)
  }

  /** Configure a fixed response for a specific path */
  on(path: string, response: MockResponse): this {
    this.handlers.set(path, () => response)
    return this
  }

  /** Configure a dynamic response factory for a specific path */
  onPath(path: string, factory: ResponseFactory): this {
    this.handlers.set(path, factory)
    return this
  }

  /** Set the default response for paths without a configured handler */
  withDefaultResponse(response: MockResponse): this {
    this.defaultResponse = response
    return this
  }

  /** Clear all recorded requests */
  clearRequests(): void {
    this.requests = []
  }
}

// ---------------------------------------------------------------------------
// createMockContext
// ---------------------------------------------------------------------------

interface MockContextOptions {
  token?: string
  http?: HttpClient
  log?: (message: string) => void
}

/**
 * Creates a mock ActionContext for testing integration actions.
 *
 * Usage:
 *   const ctx = createMockContext({ token: 'xoxp-test-token' })
 *   const result = await action.execute({ channel: '#general', text: 'hello' }, ctx)
 *   expect(ctx.http.requests).toHaveLength(1)
 */
export function createMockContext(options: MockContextOptions = {}): ActionContext & { http: MockHttpClient } {
  const token = options.token ?? 'test-token'
  const http = (options.http instanceof MockHttpClient
    ? options.http
    : new MockHttpClient()) as MockHttpClient

  return {
    getCredentials: () => ({ token }),
    http,
    log: options.log ?? (() => {}),
  }
}
