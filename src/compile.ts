// ---------------------------------------------------------------------------
// compileSpec — turns a declarative IntegrationSpec (pure data) into the same
// Integration object defineIntegration() produces. The generated handlers are
// trusted interpreter code; the spec itself contains no code, only JSONata
// expressions evaluated under a time budget.
//
// Security posture: generated handlers never read credentials — auth is
// injected by the runtime's HTTP client according to the integration's
// declared authPlacement. The one exception is connectionLabel (its public
// signature receives credentials directly); it validates the target host
// against the spec's allowed hosts before fetching.
// ---------------------------------------------------------------------------

import jsonata from 'jsonata'
import type {
  ActionContext,
  ActionDef,
  ActionHandler,
  AuthConfig,
  AuthPlacement,
  HttpResponse,
  Integration,
  IntegrationDef,
  MockActionHandler,
  RequestOptions,
} from './types.js'
import {
  IntegrationApiError,
  IntegrationAuthError,
  IntegrationBillingError,
  IntegrationRateLimitError,
  IntegrationValidationError,
} from './errors.js'
import { defineIntegration } from './define.js'
import {
  parseSpec,
  TEMPLATE_SPAN_RE,
  type ActionSpec,
  type CheckErrorSpec,
  type IntegrationSpec,
  type SpecRequest,
  type SpecIssue,
} from './spec.js'

// ---------------------------------------------------------------------------
// JSONata evaluation with a time budget
// ---------------------------------------------------------------------------

const EVAL_TIMEOUT_MS = 1000
const DEFAULT_MAX_PAGES = 5

type JsonataExpression = ReturnType<typeof jsonata>

/** Per-compile cache so each expression source is compiled once. */
type ExprCache = Map<string, JsonataExpression>

function compileExpr(source: string, cache: ExprCache): JsonataExpression {
  let expr = cache.get(source)
  if (!expr) {
    expr = jsonata(source)
    cache.set(source, expr)
  }
  return expr
}

async function evaluateExpr(source: string, data: unknown, cache: ExprCache): Promise<unknown> {
  const expr = compileExpr(source, cache)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new IntegrationApiError(`JSONata evaluation timed out: ${source.slice(0, 80)}`)),
      EVAL_TIMEOUT_MS
    )
  })
  try {
    return await Promise.race([expr.evaluate(data), timeout])
  } catch (err) {
    if (err instanceof IntegrationApiError) throw err
    throw new IntegrationApiError(
      `JSONata evaluation failed (${source.slice(0, 80)}): ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    clearTimeout(timer)
  }
}

/** Context shape for all response-side expressions. */
function responseContext(response: HttpResponse): Record<string, unknown> {
  return { status: response.status, data: response.data, headers: response.headers }
}

// ---------------------------------------------------------------------------
// Template interpolation ({{ jsonata }} spans inside bodyTemplate strings,
// evaluated against the action's args)
// ---------------------------------------------------------------------------

async function interpolateString(
  value: string,
  args: Record<string, unknown>,
  cache: ExprCache
): Promise<unknown> {
  const matches = [...value.matchAll(TEMPLATE_SPAN_RE)]
  if (matches.length === 0) return value
  // A string that is exactly one span returns the raw evaluated value.
  if (matches.length === 1 && matches[0][0] === value) {
    return evaluateExpr(matches[0][1], args, cache)
  }
  let out = ''
  let last = 0
  for (const match of matches) {
    out += value.slice(last, match.index)
    const evaluated = await evaluateExpr(match[1], args, cache)
    out += evaluated === null || evaluated === undefined ? '' : String(evaluated)
    last = (match.index ?? 0) + match[0].length
  }
  out += value.slice(last)
  return out
}

async function interpolateValue(
  value: unknown,
  args: Record<string, unknown>,
  cache: ExprCache
): Promise<unknown> {
  if (typeof value === 'string') return interpolateString(value, args, cache)
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => interpolateValue(item, args, cache)))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = await interpolateValue(child, args, cache)
    }
    return out
  }
  return value
}

// ---------------------------------------------------------------------------
// Request preparation + dispatch
// ---------------------------------------------------------------------------

interface PreparedRequest {
  method: SpecRequest['method']
  path: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  bodyFormat: 'json' | 'form' | undefined
}

function joinBaseUrl(baseUrl: string, path: string): string {
  if (path.startsWith('https://')) return path
  return baseUrl.replace(/\/+$/, '') + path
}

async function prepareRequest(
  spec: IntegrationSpec,
  request: SpecRequest,
  actionBaseUrl: string | undefined,
  args: Record<string, unknown>,
  cache: ExprCache
): Promise<PreparedRequest> {
  const paramMapping = request.paramMapping ?? {}
  let path = request.path
  const query: Record<string, string> = {}
  const headers: Record<string, string> = {}
  const bodyParams: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) continue
    const location = paramMapping[key] ?? 'body'
    if (location === 'path') {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)))
    } else if (location === 'query') {
      query[key] = String(value)
    } else if (location === 'header') {
      headers[key] = String(value)
    } else {
      bodyParams[key] = value
    }
  }

  const unreplaced = path.match(/\{(\w+)\}/g)
  if (unreplaced) {
    throw new IntegrationValidationError(`Unresolved path parameters: ${unreplaced.join(', ')}`)
  }

  // Per-action base URL override produces an absolute path; the runtime's
  // HTTP client passes absolute URLs through and enforces host policy.
  if (actionBaseUrl) {
    path = joinBaseUrl(actionBaseUrl, path)
  }

  let body: unknown
  if (request.bodyTemplate !== undefined) {
    body = await interpolateValue(request.bodyTemplate, args, cache)
  } else if (Object.keys(bodyParams).length > 0) {
    body = bodyParams
  }

  return {
    method: request.method,
    path,
    query,
    headers,
    body,
    bodyFormat: request.bodyFormat ?? spec.bodyFormat,
  }
}

async function dispatchRequest(
  ctx: ActionContext,
  prepared: PreparedRequest,
  extraQuery: Record<string, string> = {},
  overridePath?: string
): Promise<HttpResponse> {
  const query = { ...prepared.query, ...extraQuery }
  const options: RequestOptions = {
    query: Object.keys(query).length > 0 ? query : undefined,
    headers: Object.keys(prepared.headers).length > 0 ? prepared.headers : undefined,
    bodyFormat: prepared.bodyFormat,
  }
  const path = overridePath ?? prepared.path

  switch (prepared.method) {
    case 'GET':
      return ctx.http.get(path, options)
    case 'POST':
      return ctx.http.post(path, prepared.body, options)
    case 'PUT':
      return ctx.http.put(path, prepared.body, options)
    case 'PATCH':
      return ctx.http.patch(path, prepared.body, options)
    case 'DELETE':
      return ctx.http.delete(path, options)
  }
}

// ---------------------------------------------------------------------------
// Response pipeline (HTTP status mapping mirrors rest.ts, then declarative
// checkError rules)
// ---------------------------------------------------------------------------

async function checkResponse(
  response: HttpResponse,
  checks: CheckErrorSpec[],
  billingUrl: string | undefined,
  cache: ExprCache
): Promise<void> {
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

  const ctx = responseContext(response)
  for (const check of checks) {
    const triggered = await evaluateExpr(check.when, ctx, cache)
    if (!triggered) continue
    let message: string
    try {
      const evaluated = await evaluateExpr(check.message, ctx, cache)
      message =
        evaluated === null || evaluated === undefined ? `API error (${check.error})` : String(evaluated)
    } catch {
      message = `API error (${check.error})`
    }
    switch (check.error) {
      case 'auth':
        throw new IntegrationAuthError(message)
      case 'rate_limit':
        throw new IntegrationRateLimitError(message)
      case 'validation':
        throw new IntegrationValidationError(message)
      case 'billing':
        throw new IntegrationBillingError(message, { billingUrl })
      case 'api':
        throw new IntegrationApiError(message, response.status, response.data)
    }
  }
}

function coerceToRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { result: value }
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function parseLinkHeaderNext(linkHeader: string | undefined): string | undefined {
  if (!linkHeader) return undefined
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/)
    if (match) return match[1]
  }
  return undefined
}

function coerceToArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

// ---------------------------------------------------------------------------
// Handler builders
// ---------------------------------------------------------------------------

function buildExecute(spec: IntegrationSpec, action: ActionSpec, cache: ExprCache): ActionHandler {
  const checks = spec.checkError ?? []

  return async function executeSpecAction(args, ctx) {
    const prepared = await prepareRequest(spec, action.request, action.baseUrl, args, cache)

    if (action.idempotencyHeader && ctx.idempotencyKey) {
      prepared.headers[action.idempotencyHeader] = ctx.idempotencyKey
    }

    const pagination = action.pagination
    if (!pagination) {
      const response = await dispatchRequest(ctx, prepared)
      await checkResponse(response, checks, spec.billingUrl, cache)
      let result: unknown = response.data
      if (action.select) {
        result = await evaluateExpr(action.select, responseContext(response), cache)
      }
      return coerceToRecord(result)
    }

    // Paginated: loop requests, accumulate itemsPath results.
    const maxPages = pagination.maxPages ?? DEFAULT_MAX_PAGES
    const items: unknown[] = []
    let cursor: string | undefined
    let pageNumber = 1
    let offset = 0
    let nextUrl: string | undefined
    let lastResponse: HttpResponse | undefined
    let pagesFetched = 0

    for (let i = 0; i < maxPages; i++) {
      const extraQuery: Record<string, string> = {}
      if (pagination.sizeParam && pagination.size !== undefined) {
        extraQuery[pagination.sizeParam] = String(pagination.size)
      }
      if (pagination.strategy === 'cursor' && cursor !== undefined) {
        extraQuery[pagination.param!] = cursor
      } else if (pagination.strategy === 'page') {
        extraQuery[pagination.param!] = String(pageNumber)
      } else if (pagination.strategy === 'offset') {
        extraQuery[pagination.param!] = String(offset)
      }

      const response =
        pagination.strategy === 'link_header' && nextUrl
          ? await dispatchRequest(ctx, prepared, {}, nextUrl)
          : await dispatchRequest(ctx, prepared, extraQuery)
      await checkResponse(response, checks, spec.billingUrl, cache)
      lastResponse = response
      pagesFetched += 1

      const pageItems = coerceToArray(
        await evaluateExpr(pagination.itemsPath, responseContext(response), cache)
      )
      items.push(...pageItems)

      // Advance or stop.
      if (pagination.strategy === 'cursor') {
        const next = await evaluateExpr(pagination.cursorPath!, responseContext(response), cache)
        if (next === null || next === undefined || next === '') break
        cursor = String(next)
      } else if (pagination.strategy === 'link_header') {
        nextUrl = parseLinkHeaderNext(response.headers['link'])
        if (!nextUrl) break
      } else {
        if (pageItems.length === 0) break
        pageNumber += 1
        offset += pageItems.length
      }
    }

    const aggregate: Record<string, unknown> = { items, page_count: pagesFetched }
    if (action.select && lastResponse) {
      const selectCtx = {
        status: lastResponse.status,
        data: aggregate,
        headers: lastResponse.headers,
      }
      return coerceToRecord(await evaluateExpr(action.select, selectCtx, cache))
    }
    return aggregate
  }
}

function buildMock(action: ActionSpec): MockActionHandler | undefined {
  if (!action.sampleOutput) return undefined
  const sample = action.sampleOutput
  return async () => structuredClone(sample)
}

function applyPlacement(
  placement: AuthPlacement | undefined,
  token: string,
  url: URL,
  headers: Record<string, string>
): void {
  const p: AuthPlacement = placement ?? { in: 'authorization' }
  switch (p.in) {
    case 'authorization':
      headers['Authorization'] = (p.pattern ?? 'Bearer {token}').replace('{token}', token)
      break
    case 'header':
      headers[p.name] = (p.pattern ?? '{token}').replace('{token}', token)
      break
    case 'query':
      url.searchParams.set(p.param, token)
      break
    case 'basic':
      headers['Authorization'] = `Basic ${Buffer.from(`${token}:`).toString('base64')}`
      break
  }
}

function buildAuthConfig(
  spec: IntegrationSpec,
  allowedHosts: string[],
  cache: ExprCache
): AuthConfig {
  if (spec.auth.type === 'none') return { type: 'none' }

  let test: ActionHandler | undefined
  if (spec.auth.test) {
    const testRequest = spec.auth.test
    test = async (args, ctx) => {
      const prepared = await prepareRequest(spec, testRequest, undefined, args, cache)
      const response = await dispatchRequest(ctx, prepared)
      await checkResponse(response, spec.checkError ?? [], spec.billingUrl, cache)
      return coerceToRecord(response.data)
    }
  }

  let connectionLabel: ((credentials: { token: string }) => Promise<string>) | undefined
  if (spec.auth.connectionLabel) {
    const labelSpec = spec.auth.connectionLabel
    connectionLabel = async (credentials) => {
      const prepared = await prepareRequest(spec, labelSpec.request, undefined, {}, cache)
      const base = spec.baseUrl
      const urlString = prepared.path.startsWith('https://')
        ? prepared.path
        : base
          ? joinBaseUrl(base, prepared.path)
          : undefined
      if (!urlString) throw new IntegrationApiError('connectionLabel request has no resolvable URL')
      const url = new URL(urlString)
      if (!allowedHosts.includes(url.hostname.toLowerCase())) {
        throw new IntegrationApiError(`connectionLabel host not allowed: ${url.hostname}`)
      }
      for (const [key, value] of Object.entries(prepared.query)) url.searchParams.set(key, value)
      const headers: Record<string, string> = { ...spec.headers, ...prepared.headers }
      applyPlacement(spec.auth.placement, credentials.token, url, headers)
      const response = await fetch(url, { method: prepared.method, headers, redirect: 'manual' })
      let data: unknown
      const text = await response.text()
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
      const label = await evaluateExpr(
        labelSpec.label,
        { status: response.status, data, headers: Object.fromEntries(response.headers.entries()) },
        cache
      )
      return label === null || label === undefined ? '' : String(label)
    }
  }

  const common = { test, connectionLabel, authDescription: spec.auth.authDescription }
  return spec.auth.type === 'oauth2' ? { type: 'oauth2', ...common } : { type: 'api_key', ...common }
}

// ---------------------------------------------------------------------------
// Host collection
// ---------------------------------------------------------------------------

function collectAllowedHosts(spec: IntegrationSpec): string[] {
  const hosts = new Set<string>()
  const add = (url: string | undefined) => {
    if (!url) return
    try {
      hosts.add(new URL(url).hostname.toLowerCase())
    } catch {
      /* parseSpec already rejected invalid URLs */
    }
  }
  add(spec.baseUrl)
  for (const action of spec.actions) {
    add(action.baseUrl)
    if (action.request.path.startsWith('https://')) add(action.request.path)
  }
  if (spec.auth.test?.path.startsWith('https://')) add(spec.auth.test.path)
  if (spec.auth.connectionLabel?.request.path.startsWith('https://')) {
    add(spec.auth.connectionLabel.request.path)
  }
  return [...hosts]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * An Integration compiled from a declarative spec. `allowedHosts` is the
 * complete set of hostnames the integration may reach (egress allow-list);
 * `spec` is the source document (for inspection surfaces and persistence).
 */
export interface CompiledSpecIntegration extends Integration {
  allowedHosts: string[]
  spec: IntegrationSpec
}

export class SpecCompileError extends Error {
  constructor(public readonly issues: SpecIssue[]) {
    super(
      `Invalid integration spec:\n${issues.map((i) => `  [${i.code}] ${i.path}: ${i.message}`).join('\n')}`
    )
    this.name = 'SpecCompileError'
  }
}

const DEFAULT_API_KEY_CONFIG_SCHEMA = [
  { key: 'api_key', label: 'API key', type: 'secret' as const, required: true },
]

/**
 * Compile a declarative spec (validated or raw document) into an Integration.
 * Throws SpecCompileError on an invalid document — use parseSpec() first when
 * issues should be reported instead of thrown.
 */
export function compileSpec(input: IntegrationSpec | unknown): CompiledSpecIntegration {
  const result = parseSpec(input)
  if (!result.ok) throw new SpecCompileError(result.issues)
  const spec = result.spec

  const cache: ExprCache = new Map()
  const allowedHosts = collectAllowedHosts(spec)

  const placement = spec.auth.placement
  const authHeaderPattern =
    placement === undefined || placement.in === 'authorization'
      ? (placement?.pattern ?? undefined)
      : undefined

  const def: IntegrationDef = {
    id: spec.id,
    version: 1,
    name: spec.name,
    description: spec.description,
    icon: spec.icon ?? spec.id,
    exampleUsage: spec.exampleUsage ?? `${spec.actions[0].name} via ${spec.name}`,
    auth: buildAuthConfig(spec, allowedHosts, cache),
    baseUrl: spec.baseUrl,
    headers: spec.headers,
    authHeaderPattern,
    authPlacement: placement,
    billingUrl: spec.billingUrl,
    configSchema:
      spec.configSchema ?? (spec.auth.type === 'api_key' ? DEFAULT_API_KEY_CONFIG_SCHEMA : undefined),
    actions: spec.actions.map(
      (action): ActionDef => ({
        actionId: action.actionId,
        name: action.name,
        description: action.description,
        intents: action.intents,
        preview: action.preview,
        inputFields: action.inputFields,
        outputFields: action.outputFields,
        execute: buildExecute(spec, action, cache),
        mockExecute: buildMock(action),
      })
    ),
  }

  const integration = defineIntegration(def)
  return Object.assign(integration, { allowedHosts, spec })
}
