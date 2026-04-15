/**
 * Test utilities for Weldable integration packages.
 *
 * Import from '@weldable/integration-core/testing' in your test files:
 *
 *   import { createMockContext, MockHttpClient } from '@weldable/integration-core/testing'
 */
/**
 * A mock HttpClient implementation for testing integration actions.
 *
 * Records all requests for assertion. Supports configurable responses
 * via onGet(), onPost(), etc.
 */
export class MockHttpClient {
    requests = [];
    defaultResponse = { data: {}, status: 200 };
    handlers = new Map();
    makeResponse(path, body, options) {
        const key = path.split('?')[0];
        const handler = this.handlers.get(key);
        const result = handler ? handler(path, body, options) : this.defaultResponse;
        return {
            data: result.data,
            status: result.status,
            headers: result.headers ?? {},
        };
    }
    async get(path, options) {
        this.requests.push({ method: 'GET', path, options });
        return this.makeResponse(path, undefined, options);
    }
    async post(path, body, options) {
        this.requests.push({ method: 'POST', path, body, options });
        return this.makeResponse(path, body, options);
    }
    async put(path, body, options) {
        this.requests.push({ method: 'PUT', path, body, options });
        return this.makeResponse(path, body, options);
    }
    async patch(path, body, options) {
        this.requests.push({ method: 'PATCH', path, body, options });
        return this.makeResponse(path, body, options);
    }
    async delete(path, options) {
        this.requests.push({ method: 'DELETE', path, options });
        return this.makeResponse(path, undefined, options);
    }
    /** Configure a fixed response for a specific path */
    on(path, response) {
        this.handlers.set(path, () => response);
        return this;
    }
    /** Configure a dynamic response factory for a specific path */
    onPath(path, factory) {
        this.handlers.set(path, factory);
        return this;
    }
    /** Set the default response for paths without a configured handler */
    withDefaultResponse(response) {
        this.defaultResponse = response;
        return this;
    }
    /** Clear all recorded requests */
    clearRequests() {
        this.requests = [];
    }
}
/**
 * Creates a mock ActionContext for testing integration actions.
 *
 * Usage:
 *   const ctx = createMockContext({ token: 'xoxp-test-token' })
 *   const result = await action.execute({ channel: '#general', text: 'hello' }, ctx)
 *   expect(ctx.http.requests).toHaveLength(1)
 */
export function createMockContext(options = {}) {
    const token = options.token ?? 'test-token';
    const http = (options.http instanceof MockHttpClient
        ? options.http
        : new MockHttpClient());
    return {
        getCredentials: () => ({ token }),
        http,
        log: options.log ?? (() => { }),
    };
}
