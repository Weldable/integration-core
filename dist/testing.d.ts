/**
 * Test utilities for Weldable integration packages.
 *
 * Import from '@weldable/integration-core/testing' in your test files:
 *
 *   import { createMockContext, MockHttpClient } from '@weldable/integration-core/testing'
 */
import type { ActionContext, HttpClient, HttpResponse, RequestOptions } from './types.js';
interface MockRequest {
    method: string;
    path: string;
    body?: unknown;
    options?: RequestOptions;
}
interface MockResponse {
    data: unknown;
    status: number;
    headers?: Record<string, string>;
}
type ResponseFactory = (path: string, body?: unknown, options?: RequestOptions) => MockResponse;
/**
 * A mock HttpClient implementation for testing integration actions.
 *
 * Records all requests for assertion. Supports configurable responses
 * via onGet(), onPost(), etc.
 */
export declare class MockHttpClient implements HttpClient {
    requests: MockRequest[];
    private defaultResponse;
    private handlers;
    private makeResponse;
    get(path: string, options?: RequestOptions): Promise<HttpResponse>;
    post(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
    put(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
    patch(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
    delete(path: string, options?: RequestOptions): Promise<HttpResponse>;
    /** Configure a fixed response for a specific path */
    on(path: string, response: MockResponse): this;
    /** Configure a dynamic response factory for a specific path */
    onPath(path: string, factory: ResponseFactory): this;
    /** Set the default response for paths without a configured handler */
    withDefaultResponse(response: MockResponse): this;
    /** Clear all recorded requests */
    clearRequests(): void;
}
interface MockContextOptions {
    token?: string;
    http?: HttpClient;
    log?: (message: string) => void;
}
/**
 * Creates a mock ActionContext for testing integration actions.
 *
 * Usage:
 *   const ctx = createMockContext({ token: 'xoxp-test-token' })
 *   const result = await action.execute({ channel: '#general', text: 'hello' }, ctx)
 *   expect(ctx.http.requests).toHaveLength(1)
 */
export declare function createMockContext(options?: MockContextOptions): ActionContext & {
    http: MockHttpClient;
};
export {};
//# sourceMappingURL=testing.d.ts.map