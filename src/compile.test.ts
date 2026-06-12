import { describe, expect, it } from 'vitest'
import type { ActionContext, HttpClient, HttpResponse, RequestOptions } from './types.js'
import { parseSpec, type IntegrationSpec } from './spec.js'
import { compileSpec, SpecCompileError } from './compile.js'
import {
  IntegrationApiError,
  IntegrationAuthError,
  IntegrationBillingError,
  IntegrationRateLimitError,
} from './errors.js'

// ---------------------------------------------------------------------------
// Test harness: a scripted HttpClient that records every request
// ---------------------------------------------------------------------------

interface RecordedRequest {
  method: string
  path: string
  body?: unknown
  options?: RequestOptions
}

function response(data: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse {
  return { data, status, headers }
}

class MockHttpClient implements HttpClient {
  requests: RecordedRequest[] = []
  private queue: HttpResponse[]

  constructor(...responses: HttpResponse[]) {
    this.queue = responses
  }

  private next(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse> {
    this.requests.push({ method, path, body, options })
    const res = this.queue.shift()
    if (!res) throw new Error(`MockHttpClient: no scripted response for ${method} ${path}`)
    return Promise.resolve(res)
  }

  get(path: string, options?: RequestOptions) {
    return this.next('GET', path, undefined, options)
  }
  post(path: string, body?: unknown, options?: RequestOptions) {
    return this.next('POST', path, body, options)
  }
  put(path: string, body?: unknown, options?: RequestOptions) {
    return this.next('PUT', path, body, options)
  }
  patch(path: string, body?: unknown, options?: RequestOptions) {
    return this.next('PATCH', path, body, options)
  }
  delete(path: string, options?: RequestOptions) {
    return this.next('DELETE', path, undefined, options)
  }
}

function makeCtx(http: HttpClient, idempotencyKey?: string): ActionContext {
  return {
    getCredentials: () => ({ token: 'test-token' }),
    http,
    log: () => {},
    idempotencyKey,
  }
}

// ---------------------------------------------------------------------------
// Fixture spec
// ---------------------------------------------------------------------------

function fixtureSpec(overrides: Partial<IntegrationSpec> = {}): IntegrationSpec {
  return {
    specVersion: 1,
    id: 'fooberry',
    name: 'Fooberry',
    description: 'Order management for the Fooberry marketplace.',
    baseUrl: 'https://api.fooberry.com',
    auth: { type: 'api_key' },
    actions: [
      {
        actionId: 'get_order',
        name: 'Get order',
        description: 'Fetch a single order by id.',
        intents: ['get a fooberry order', 'look up an order', 'fetch order details'],
        inputFields: [
          { name: 'order_id', type: 'string', required: true, description: 'The order id.' },
          { name: 'expand', type: 'string', required: false, description: 'Relations to expand.' },
        ],
        outputFields: [
          { name: 'id', type: 'string', description: 'Order id.' },
          { name: 'status', type: 'string', description: 'Order status.' },
        ],
        request: {
          method: 'GET',
          path: '/v1/orders/{order_id}',
          paramMapping: { order_id: 'path', expand: 'query' },
        },
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// parseSpec — issue codes
// ---------------------------------------------------------------------------

describe('parseSpec', () => {
  it('accepts a valid spec', () => {
    const result = parseSpec(fixtureSpec())
    expect(result.ok).toBe(true)
  })

  it('rejects bad ids and missing intents with spec-schema', () => {
    const result = parseSpec(
      fixtureSpec({
        id: 'Foo-Berry',
        actions: [
          {
            ...fixtureSpec().actions[0],
            intents: ['only one'],
          },
        ],
      })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    const codes = result.issues.map((i) => i.code)
    expect(codes).toContain('spec-schema')
    expect(result.issues.some((i) => i.path === 'id')).toBe(true)
    expect(result.issues.some((i) => i.path.includes('intents'))).toBe(true)
  })

  it('rejects GET with bodyTemplate', () => {
    const spec = fixtureSpec()
    spec.actions[0].request.bodyTemplate = { q: '{{ expand }}' }
    const result = parseSpec(spec)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes('GET requests cannot'))).toBe(true)
  })

  it('flags invalid JSONata with spec-jsonata-syntax', () => {
    const spec = fixtureSpec()
    spec.actions[0].select = 'data.items[' // unbalanced
    const result = parseSpec(spec)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0].code).toBe('spec-jsonata-syntax')
    expect(result.issues[0].path).toBe('actions.0.select')
  })

  it('flags duplicate action ids with spec-duplicate-action', () => {
    const spec = fixtureSpec()
    spec.actions = [spec.actions[0], { ...spec.actions[0] }]
    const result = parseSpec(spec)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0].code).toBe('spec-duplicate-action')
  })

  it('flags userinfo and IP-literal hosts with spec-host', () => {
    const withUserinfo = parseSpec(fixtureSpec({ baseUrl: 'https://user:pw@api.fooberry.com' }))
    expect(withUserinfo.ok).toBe(false)
    if (!withUserinfo.ok) expect(withUserinfo.issues[0].code).toBe('spec-host')

    const withIp = parseSpec(fixtureSpec({ baseUrl: 'https://10.0.0.1' }))
    expect(withIp.ok).toBe(false)
    if (!withIp.ok) expect(withIp.issues[0].code).toBe('spec-host')
  })

  it('requires a base URL from somewhere', () => {
    const spec = fixtureSpec({ baseUrl: undefined })
    const result = parseSpec(spec)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes('needs its own baseUrl'))).toBe(true)
  })

  it('enforces pagination invariants', () => {
    const spec = fixtureSpec()
    spec.actions[0].pagination = { strategy: 'cursor', itemsPath: 'data.items' }
    const result = parseSpec(spec)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((i) => i.message.includes("requires 'cursorPath'"))).toBe(true)
    expect(result.issues.some((i) => i.message.includes("requires 'param'"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// compileSpec — compilation surface
// ---------------------------------------------------------------------------

describe('compileSpec', () => {
  it('throws SpecCompileError on invalid input', () => {
    expect(() => compileSpec({ nope: true })).toThrow(SpecCompileError)
  })

  it('produces composite action ids and a guaranteed mock', async () => {
    const compiled = compileSpec(fixtureSpec())
    expect(compiled.actions[0].id).toBe('fooberry.get_order')
    expect(compiled.actions[0].mockExecute).toBeTruthy()
    const mock = await compiled.actions[0].mockExecute({}, { seed: 'seed-1', log: () => {} })
    expect(typeof mock.id).toBe('string')
  })

  it('collects allowedHosts from base and per-action URLs', () => {
    const spec = fixtureSpec()
    spec.actions[0].baseUrl = 'https://files.fooberry.com'
    spec.actions.push({
      ...fixtureSpec().actions[0],
      actionId: 'absolute_action',
      request: { method: 'GET', path: 'https://other.example.com/v1/things' },
    })
    const compiled = compileSpec(spec)
    expect(compiled.allowedHosts.sort()).toEqual([
      'api.fooberry.com',
      'files.fooberry.com',
      'other.example.com',
    ])
  })

  it('defaults configSchema for api_key auth and maps auth placement', () => {
    const compiled = compileSpec(fixtureSpec())
    expect(compiled.configSchema).toEqual([
      { key: 'api_key', label: 'API key', type: 'secret', required: true },
    ])

    const withHeader = compileSpec(
      fixtureSpec({ auth: { type: 'api_key', placement: { in: 'header', name: 'X-Api-Key' } } })
    )
    expect(withHeader.authPlacement).toEqual({ in: 'header', name: 'X-Api-Key' })
    expect(withHeader.authHeaderPattern).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Execution — request construction
// ---------------------------------------------------------------------------

describe('spec execution', () => {
  it('builds path/query params with encoding and passes the response through', async () => {
    const client = new MockHttpClient(response({ id: 'ord 1', status: 'open' }))
    const compiled = compileSpec(fixtureSpec())
    const result = await compiled.actions[0].execute!(
      { order_id: 'ord/1', expand: 'items' },
      makeCtx(client)
    )
    expect(client.requests[0]).toMatchObject({
      method: 'GET',
      path: '/v1/orders/ord%2F1',
      options: { query: { expand: 'items' } },
    })
    expect(result).toEqual({ id: 'ord 1', status: 'open' })
  })

  it('interpolates bodyTemplate spans against args (raw single-span, coerced mixed)', async () => {
    const client = new MockHttpClient(response({ ok: true }))
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      actionId: 'create_order',
      request: {
        method: 'POST',
        path: '/v1/orders',
        bodyTemplate: {
          quantity: '{{ qty }}',
          note: 'Order of {{ qty }} units',
          nested: { tags: ['{{ tag }}'] },
        },
      },
    }
    const compiled = compileSpec(spec)
    await compiled.actions[0].execute!({ qty: 3, tag: 'rush' }, makeCtx(client))
    expect(client.requests[0].body).toEqual({
      quantity: 3,
      note: 'Order of 3 units',
      nested: { tags: ['rush'] },
    })
  })

  it('sends body-mapped args only when no bodyTemplate is present', async () => {
    const client = new MockHttpClient(response({ ok: true }))
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      actionId: 'create_order',
      request: { method: 'POST', path: '/v1/orders' },
    }
    const compiled = compileSpec(spec)
    await compiled.actions[0].execute!({ sku: 'abc', qty: 2 }, makeCtx(client))
    expect(client.requests[0].body).toEqual({ sku: 'abc', qty: 2 })
  })

  it('prefixes per-action baseUrl as an absolute path', async () => {
    const client = new MockHttpClient(response({ ok: true }))
    const spec = fixtureSpec()
    spec.actions[0].baseUrl = 'https://files.fooberry.com'
    const compiled = compileSpec(spec)
    await compiled.actions[0].execute!({ order_id: '1' }, makeCtx(client))
    expect(client.requests[0].path).toBe('https://files.fooberry.com/v1/orders/1')
  })

  it('injects the declared idempotency header when the runtime provides a key', async () => {
    const client = new MockHttpClient(response({ ok: true }))
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      actionId: 'create_order',
      request: { method: 'POST', path: '/v1/orders' },
      idempotencyHeader: 'Idempotency-Key',
    }
    const compiled = compileSpec(spec)
    await compiled.actions[0].execute!({ sku: 'abc' }, makeCtx(client, 'idem-123'))
    expect(client.requests[0].options?.headers).toMatchObject({ 'Idempotency-Key': 'idem-123' })
  })

  it('wraps non-object results', async () => {
    const client = new MockHttpClient(response([1, 2, 3]))
    const compiled = compileSpec(fixtureSpec())
    const result = await compiled.actions[0].execute!({ order_id: '1' }, makeCtx(client))
    expect(result).toEqual({ result: [1, 2, 3] })
  })
})

// ---------------------------------------------------------------------------
// Execution — errors
// ---------------------------------------------------------------------------

describe('error mapping', () => {
  it('maps HTTP statuses like rest.ts', async () => {
    const compiled = compileSpec(fixtureSpec())
    const run = (res: HttpResponse) =>
      compiled.actions[0].execute!({ order_id: '1' }, makeCtx(new MockHttpClient(res)))

    await expect(run(response({}, 401))).rejects.toBeInstanceOf(IntegrationAuthError)
    await expect(run(response({}, 429, { 'retry-after': '7' }))).rejects.toMatchObject({
      name: 'IntegrationRateLimitError',
      retryAfter: 7,
    })
    await expect(run(response({ error: 'boom' }, 500))).rejects.toMatchObject({
      name: 'IntegrationApiError',
      message: 'boom',
      status: 500,
    })
  })

  it('evaluates declarative checkError rules on 2xx responses', async () => {
    const spec = fixtureSpec({
      checkError: [
        { when: 'data.ok = false and data.error = "payment_required"', error: 'billing', message: 'data.error' },
        { when: 'data.ok = false', error: 'api', message: '"API said: " & data.error' },
      ],
      billingUrl: 'https://fooberry.com/billing',
    })
    const compiled = compileSpec(spec)
    const run = (data: unknown) =>
      compiled.actions[0].execute!({ order_id: '1' }, makeCtx(new MockHttpClient(response(data))))

    await expect(run({ ok: false, error: 'payment_required' })).rejects.toMatchObject({
      name: 'IntegrationBillingError',
      message: 'payment_required',
      billingUrl: 'https://fooberry.com/billing',
    })
    await expect(run({ ok: false, error: 'bad_channel' })).rejects.toMatchObject({
      name: 'IntegrationApiError',
      message: 'API said: bad_channel',
    })
    await expect(run({ ok: true, items: [] })).resolves.toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Execution — select + pagination
// ---------------------------------------------------------------------------

describe('select and pagination', () => {
  it('reshapes output with select over { status, data, headers }', async () => {
    const client = new MockHttpClient(
      response({ payload: { orders: [{ id: 'a' }, { id: 'b' }] } }, 200, { 'x-total': '2' })
    )
    const spec = fixtureSpec()
    spec.actions[0].select = '{ "orders": data.payload.orders, "total": $number(headers."x-total") }'
    const compiled = compileSpec(spec)
    const result = await compiled.actions[0].execute!({ order_id: '1' }, makeCtx(client))
    expect(result).toEqual({ orders: [{ id: 'a' }, { id: 'b' }], total: 2 })
  })

  it('follows cursor pagination until the cursor runs out', async () => {
    const client = new MockHttpClient(
      response({ items: [1, 2], next: 'cur-2' }),
      response({ items: [3], next: null })
    )
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      request: { method: 'GET', path: '/v1/orders' },
      inputFields: [],
      pagination: {
        strategy: 'cursor',
        param: 'cursor',
        itemsPath: 'data.items',
        cursorPath: 'data.next',
      },
    }
    const compiled = compileSpec(spec)
    const result = await compiled.actions[0].execute!({}, makeCtx(client))
    expect(result).toEqual({ items: [1, 2, 3], page_count: 2 })
    expect(client.requests[0].options?.query).toBeUndefined()
    expect(client.requests[1].options?.query).toEqual({ cursor: 'cur-2' })
  })

  it('stops page pagination on an empty page and respects maxPages', async () => {
    const client = new MockHttpClient(
      response({ items: [1] }),
      response({ items: [2] }),
      response({ items: [3] })
    )
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      request: { method: 'GET', path: '/v1/orders' },
      inputFields: [],
      pagination: {
        strategy: 'page',
        param: 'page',
        sizeParam: 'per_page',
        size: 50,
        itemsPath: 'data.items',
        maxPages: 2,
      },
    }
    const compiled = compileSpec(spec)
    const result = await compiled.actions[0].execute!({}, makeCtx(client))
    expect(result).toEqual({ items: [1, 2], page_count: 2 })
    expect(client.requests).toHaveLength(2)
    expect(client.requests[0].options?.query).toEqual({ page: '1', per_page: '50' })
    expect(client.requests[1].options?.query).toEqual({ page: '2', per_page: '50' })
  })

  it('follows link-header pagination across absolute URLs', async () => {
    const client = new MockHttpClient(
      response({ items: [1] }, 200, {
        link: '<https://api.fooberry.com/v1/orders?page=2>; rel="next"',
      }),
      response({ items: [2] }, 200, {})
    )
    const spec = fixtureSpec()
    spec.actions[0] = {
      ...spec.actions[0],
      request: { method: 'GET', path: '/v1/orders' },
      inputFields: [],
      pagination: { strategy: 'link_header', itemsPath: 'data.items' },
    }
    const compiled = compileSpec(spec)
    const result = await compiled.actions[0].execute!({}, makeCtx(client))
    expect(result).toEqual({ items: [1, 2], page_count: 2 })
    expect(client.requests[1].path).toBe('https://api.fooberry.com/v1/orders?page=2')
  })
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

describe('mocks', () => {
  it('returns sampleOutput verbatim and protects it from mutation', async () => {
    const spec = fixtureSpec()
    spec.actions[0].sampleOutput = { id: 'ord-1', status: 'open', items: [{ sku: 'a' }] }
    const compiled = compileSpec(spec)
    const first = await compiled.actions[0].mockExecute({}, { seed: 's', log: () => {} })
    expect(first).toEqual({ id: 'ord-1', status: 'open', items: [{ sku: 'a' }] })
    ;(first.items as unknown[]).push('mutated')
    const second = await compiled.actions[0].mockExecute({}, { seed: 's', log: () => {} })
    expect(second.items).toEqual([{ sku: 'a' }])
  })
})
