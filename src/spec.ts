// ---------------------------------------------------------------------------
// Declarative integration spec for @weldable/integration-core
//
// An IntegrationSpec is a pure-data document (JSON-serializable, no code)
// describing an integration: its auth, its actions, and how each action maps
// onto an HTTP request and reshapes the response. compileSpec() (compile.ts)
// turns a spec into the same Integration object defineIntegration() produces,
// so spec-defined integrations are indistinguishable from package-defined
// ones at the runtime boundary.
//
// Expression language: JSONata, and only JSONata.
// - Request side (bodyTemplate strings): `{{ expr }}` spans evaluated against
//   the action's args object. A string that is exactly one span returns the
//   raw value; mixed text coerces to string.
// - Response side (checkError.when/message, select, pagination paths,
//   connectionLabel.label): bare JSONata expressions evaluated against
//   `{ status, data, headers }`.
// ---------------------------------------------------------------------------

import { z } from 'zod'
import jsonata from 'jsonata'

// ---------------------------------------------------------------------------
// Identifier + template-span helpers (shared with compile.ts)
// ---------------------------------------------------------------------------

/** snake_case identifier rule shared by integration and action ids. */
export const SPEC_ID_RE = /^[a-z][a-z0-9_]*$/

/** `{{ expr }}` template spans inside bodyTemplate strings. */
export const TEMPLATE_SPAN_RE = /\{\{\s*([\s\S]+?)\s*\}\}/g

/** Extract the JSONata sources of every `{{ }}` span in a string. */
export function extractTemplateSpans(value: string): string[] {
  const spans: string[] = []
  for (const match of value.matchAll(TEMPLATE_SPAN_RE)) {
    spans.push(match[1])
  }
  return spans
}

// ---------------------------------------------------------------------------
// Zod schemas (input validation for untrusted spec documents)
// ---------------------------------------------------------------------------

const SpecIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SPEC_ID_RE, 'must be lowercase snake_case starting with a letter')

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https:// URL')

const InputFieldSpecSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'text', 'number', 'boolean', 'object', 'array', 'enum']),
  required: z.boolean(),
  description: z.string().min(1),
  default: z.unknown().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
})

const OutputFieldSpecSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().min(1),
})

const RequestSpecSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  /** Path relative to the effective base URL ('/v1/things/{id}') or an absolute https:// URL. */
  path: z
    .string()
    .min(1)
    .refine(
      (p) => p.startsWith('/') || p.startsWith('https://'),
      'must start with "/" or be an absolute https:// URL'
    ),
  /**
   * Maps input field names to request locations. Fields not listed default
   * to 'body' (matching RestSpec semantics).
   */
  paramMapping: z.record(z.string(), z.enum(['path', 'query', 'body', 'header'])).optional(),
  /**
   * JSON value used as the request body. Strings may contain `{{ jsonata }}`
   * spans evaluated against args. When present, body-mapped params are NOT
   * auto-included — the template is the entire body.
   */
  bodyTemplate: z.unknown().optional(),
  bodyFormat: z.enum(['json', 'form']).optional(),
})

const CheckErrorSpecSchema = z.object({
  /** JSONata predicate over { status, data, headers }; truthy → throw. */
  when: z.string().min(1),
  error: z.enum(['api', 'auth', 'rate_limit', 'validation', 'billing']),
  /** JSONata over { status, data, headers } producing the error message. */
  message: z.string().min(1),
})

const PaginationSpecSchema = z.object({
  strategy: z.enum(['cursor', 'page', 'offset', 'link_header']),
  /** Query param that carries the cursor / page number / offset. */
  param: z.string().min(1).optional(),
  /** Optional page-size query param name + value. */
  sizeParam: z.string().min(1).optional(),
  size: z.number().int().positive().max(1000).optional(),
  /** JSONata over { status, data, headers } yielding each page's items array. */
  itemsPath: z.string().min(1),
  /** cursor strategy: JSONata yielding the next cursor (absent/null → stop). */
  cursorPath: z.string().min(1).optional(),
  /** Page cap. Default 5, hard cap 25. */
  maxPages: z.number().int().positive().max(25).optional(),
})

const AuthPlacementSchema = z.discriminatedUnion('in', [
  z.object({ in: z.literal('authorization'), pattern: z.string().includes('{token}').optional() }),
  z.object({
    in: z.literal('header'),
    name: z.string().min(1),
    pattern: z.string().includes('{token}').optional(),
  }),
  z.object({ in: z.literal('query'), param: z.string().min(1) }),
  z.object({ in: z.literal('basic') }),
])

const ConnectionLabelSpecSchema = z.object({
  request: RequestSpecSchema,
  /** JSONata over { status, data, headers } producing the display label. */
  label: z.string().min(1),
})

const SpecAuthSchema = z.object({
  type: z.enum(['oauth2', 'api_key', 'none']),
  placement: AuthPlacementSchema.optional(),
  /** Declarative connectivity check, run when a user connects. */
  test: RequestSpecSchema.optional(),
  connectionLabel: ConnectionLabelSpecSchema.optional(),
  authDescription: z.string().optional(),
})

const ConfigFieldSpecSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'secret']),
  required: z.boolean(),
  placeholder: z.string().optional(),
})

const ActionSpecSchema = z
  .object({
    actionId: SpecIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    /** BM25 search phrases — the only discovery path for spec integrations. */
    intents: z.array(z.string().min(1)).min(3),
    preview: z.string().optional(),
    inputFields: z.array(InputFieldSpecSchema),
    outputFields: z.array(OutputFieldSpecSchema).optional(),
    request: RequestSpecSchema,
    /** Per-action base URL override (e.g. a sibling API host). */
    baseUrl: HttpsUrlSchema.optional(),
    /** JSONata over { status, data, headers } reshaping the action output. */
    select: z.string().min(1).optional(),
    pagination: PaginationSpecSchema.optional(),
    /** Header to carry the runtime-provided idempotency key (e.g. 'Idempotency-Key'). */
    idempotencyHeader: z.string().min(1).optional(),
    /** Canned mock output returned verbatim by mockExecute. */
    sampleOutput: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((action, ctx) => {
    if (action.request.bodyTemplate !== undefined && action.request.method === 'GET') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['request', 'bodyTemplate'],
        message: 'GET requests cannot have a bodyTemplate',
      })
    }
    const pagination = action.pagination
    if (pagination) {
      if (pagination.strategy !== 'link_header' && !pagination.param) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pagination', 'param'],
          message: `pagination strategy '${pagination.strategy}' requires 'param'`,
        })
      }
      if (pagination.strategy === 'cursor' && !pagination.cursorPath) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pagination', 'cursorPath'],
          message: "pagination strategy 'cursor' requires 'cursorPath'",
        })
      }
      if (pagination.strategy === 'link_header' && action.request.method !== 'GET') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pagination', 'strategy'],
          message: "pagination strategy 'link_header' requires a GET request",
        })
      }
    }
  })

export const IntegrationSpecSchema = z
  .object({
    specVersion: z.literal(1),
    id: SpecIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    icon: z.string().optional(),
    exampleUsage: z.string().optional(),
    baseUrl: HttpsUrlSchema.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    auth: SpecAuthSchema,
    configSchema: z.array(ConfigFieldSpecSchema).optional(),
    /** Integration-wide API-level error checks, evaluated on every 2xx response. */
    checkError: z.array(CheckErrorSpecSchema).optional(),
    bodyFormat: z.enum(['json', 'form']).optional(),
    billingUrl: HttpsUrlSchema.optional(),
    actions: z.array(ActionSpecSchema).min(1),
  })
  .superRefine((spec, ctx) => {
    if (!spec.baseUrl) {
      spec.actions.forEach((action, i) => {
        if (!action.baseUrl && !action.request.path.startsWith('https://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['actions', i, 'baseUrl'],
            message: 'integration has no baseUrl, so this action needs its own baseUrl or an absolute request path',
          })
        }
      })
    }
  })

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type IntegrationSpec = z.infer<typeof IntegrationSpecSchema>
export type ActionSpec = z.infer<typeof ActionSpecSchema>
export type SpecRequest = z.infer<typeof RequestSpecSchema>
export type PaginationSpec = z.infer<typeof PaginationSpecSchema>
export type CheckErrorSpec = z.infer<typeof CheckErrorSpecSchema>
export type SpecAuth = z.infer<typeof SpecAuthSchema>

// ---------------------------------------------------------------------------
// parseSpec — validation with stable issue codes (drives AI self-heal loops)
// ---------------------------------------------------------------------------

export type SpecIssueCode =
  | 'spec-schema'
  | 'spec-jsonata-syntax'
  | 'spec-duplicate-action'
  | 'spec-host'

export interface SpecIssue {
  code: SpecIssueCode
  /** Dot path into the spec document (e.g. 'actions.0.select'). */
  path: string
  message: string
}

export type SpecParseResult =
  | { ok: true; spec: IntegrationSpec }
  | { ok: false; issues: SpecIssue[] }

function checkJsonata(source: string, path: string, issues: SpecIssue[]): void {
  try {
    jsonata(source)
  } catch (err) {
    issues.push({
      code: 'spec-jsonata-syntax',
      path,
      message: `invalid JSONata: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

function checkTemplateValue(value: unknown, path: string, issues: SpecIssue[]): void {
  if (typeof value === 'string') {
    for (const span of extractTemplateSpans(value)) {
      checkJsonata(span, path, issues)
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => checkTemplateValue(item, `${path}.${i}`, issues))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      checkTemplateValue(child, `${path}.${key}`, issues)
    }
  }
}

function checkHost(url: string, path: string, issues: SpecIssue[]): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    issues.push({ code: 'spec-host', path, message: `not a valid URL: ${url}` })
    return
  }
  if (parsed.username || parsed.password) {
    issues.push({ code: 'spec-host', path, message: 'URLs must not contain userinfo' })
  }
  // IP-literal hosts are rejected: specs must name their hosts.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.startsWith('[')) {
    issues.push({ code: 'spec-host', path, message: 'IP-literal hosts are not allowed' })
  }
}

/**
 * Validate an untrusted spec document. Returns the parsed spec or a list of
 * issues with stable codes (spec-schema, spec-jsonata-syntax,
 * spec-duplicate-action, spec-host) suitable for AI self-heal loops.
 */
export function parseSpec(input: unknown): SpecParseResult {
  const parsed = IntegrationSpecSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'spec-schema' as const,
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }
  }
  const spec = parsed.data
  const issues: SpecIssue[] = []

  // Duplicate action ids
  const seen = new Set<string>()
  spec.actions.forEach((action, i) => {
    if (seen.has(action.actionId)) {
      issues.push({
        code: 'spec-duplicate-action',
        path: `actions.${i}.actionId`,
        message: `duplicate actionId '${action.actionId}'`,
      })
    }
    seen.add(action.actionId)
  })

  // Host checks
  if (spec.baseUrl) checkHost(spec.baseUrl, 'baseUrl', issues)
  spec.actions.forEach((action, i) => {
    if (action.baseUrl) checkHost(action.baseUrl, `actions.${i}.baseUrl`, issues)
    if (action.request.path.startsWith('https://')) {
      checkHost(action.request.path, `actions.${i}.request.path`, issues)
    }
  })

  // JSONata syntax checks across every expression position
  spec.checkError?.forEach((check, i) => {
    checkJsonata(check.when, `checkError.${i}.when`, issues)
    checkJsonata(check.message, `checkError.${i}.message`, issues)
  })
  if (spec.auth.connectionLabel) {
    checkJsonata(spec.auth.connectionLabel.label, 'auth.connectionLabel.label', issues)
    checkTemplateValue(
      spec.auth.connectionLabel.request.bodyTemplate,
      'auth.connectionLabel.request.bodyTemplate',
      issues
    )
  }
  checkTemplateValue(spec.auth.test?.bodyTemplate, 'auth.test.bodyTemplate', issues)
  spec.actions.forEach((action, i) => {
    const base = `actions.${i}`
    if (action.select) checkJsonata(action.select, `${base}.select`, issues)
    if (action.pagination) {
      checkJsonata(action.pagination.itemsPath, `${base}.pagination.itemsPath`, issues)
      if (action.pagination.cursorPath) {
        checkJsonata(action.pagination.cursorPath, `${base}.pagination.cursorPath`, issues)
      }
    }
    checkTemplateValue(action.request.bodyTemplate, `${base}.request.bodyTemplate`, issues)
  })

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, spec }
}
