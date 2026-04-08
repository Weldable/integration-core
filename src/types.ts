// ---------------------------------------------------------------------------
// Core integration types for @weldable/integration-core
//
// Two distinct layers:
//   Author-facing (IntegrationDef / ActionDef) — what integration packages write.
//   Consumer-facing (Integration / Action)     — what defineIntegration() produces.
//
// defineIntegration() is the compilation step: it transforms ActionDef.actionId
// (local, e.g. 'post_message') into Action.id (composite, e.g. 'slack.post_message').
// ---------------------------------------------------------------------------

/** Lowercase snake_case identifier (e.g., 'slack', 'google_sheets') */
export type IntegrationId = string

/** A user-editable configuration field shown in the integration setup UI (e.g., API key input). */
export interface ConfigField {
  key: string
  label: string
  type: 'string' | 'secret'
  required: boolean
  placeholder?: string
}

/** Lowercase snake_case identifier within an integration (e.g., 'post_message') */
export type ActionId = string

/**
 * Author-facing action definition — what integration packages pass to defineIntegration().
 *
 * `actionId` is the local identifier (e.g. 'post_message'). defineIntegration()
 * compiles it into Action.id = `${integration.id}.${actionId}` (e.g. 'slack.post_message').
 *
 * Do NOT use Action in integration package source — use ActionDef.
 */
export interface ActionDef {
  /** Local action identifier, unique within this integration (e.g. 'post_message'). */
  actionId: ActionId
  name: string
  description: string
  /** Trigger phrases for BM25 catalog search intent matching (e.g. 'send a slack message') */
  intents?: string[]
  /** Preview template with {param} placeholders shown before execution */
  preview?: string
  inputFields: InputField[]
  outputFields?: OutputField[]
  /** Execution handler for this action. Required for REST/SDK actions. */
  execute?: ActionHandler
}

/**
 * Compiled action — produced by defineIntegration(), consumed by the Weldable runtime.
 *
 * `id` is the composite identifier set automatically by defineIntegration():
 * `${integration.id}.${actionDef.actionId}` (e.g. 'slack.post_message').
 * Do not set this field manually.
 */
export interface Action extends Omit<ActionDef, 'actionId'> {
  /** Composite action id: `${integration.id}.${actionId}` (e.g. 'slack.post_message'). Set by defineIntegration(). */
  id: string
}

export type ActionHandler = (
  args: Record<string, unknown>,
  ctx: ActionContext
) => Promise<Record<string, unknown>>

export interface ActionContext {
  /**
   * Opt-in access to raw credentials.
   * SDK-based integrations use this to initialize their SDK client.
   * REST integrations should use ctx.http instead (which handles auth injection automatically).
   */
  getCredentials: () => { token: string }
  /** Auth-aware HTTP client. Constructed by the runtime with the integration's config. */
  http: HttpClient
  /** Structured logging to the Weldable intent log */
  log: (message: string) => void
}

// ---------------------------------------------------------------------------
// HTTP client (auth-aware, provided by the runtime)
// ---------------------------------------------------------------------------

/**
 * Auth-aware HTTP client injected into ActionContext.
 *
 * The runtime implementation:
 * - Prepends baseUrl to relative paths
 * - Merges integration-level headers into every request
 * - Injects the auth header via authHeaderPattern
 * - Handles 401 retry with token refresh
 * - Parses JSON responses automatically
 */
export interface HttpClient {
  get(path: string, options?: RequestOptions): Promise<HttpResponse>
  post(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>
  put(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>
  patch(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>
  delete(path: string, options?: RequestOptions): Promise<HttpResponse>
}

export interface RequestOptions {
  headers?: Record<string, string>
  query?: Record<string, string>
  bodyFormat?: 'json' | 'form'
}

export interface HttpResponse {
  /** Parsed JSON body (or text body if non-JSON) */
  data: unknown
  status: number
  headers: Record<string, string>
}

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export interface InputField {
  name: string
  /**
   * - 'string': single-line text
   * - 'text': multiline text (textarea)
   * - 'number': numeric value
   * - 'boolean': true/false
   * - 'object': JSON object
   * - 'array': JSON array
   * - 'enum': select from static options (requires `options` field)
   */
  type: 'string' | 'text' | 'number' | 'boolean' | 'object' | 'array' | 'enum'
  required: boolean
  description: string
  default?: unknown
  /** Required when type is 'enum' */
  options?: Array<{ label: string; value: string }>
}

export interface OutputField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
}

// ---------------------------------------------------------------------------
// Auth config
// ---------------------------------------------------------------------------

export type AuthConfig =
  | OAuthConfig
  | ApiKeyConfig
  | NoAuthConfig

export interface OAuthConfig {
  type: 'oauth2'
  /**
   * Verify credentials work (e.g., call /auth.test on Slack).
   * Called when a user connects. Throw IntegrationAuthError if invalid.
   */
  test?: ActionHandler
  /**
   * Returns a display label for the connected account
   * (e.g., 'alice@company.com'). Shown in the integrations UI.
   */
  connectionLabel?: (credentials: { token: string }) => Promise<string>
  /** Optional description shown to users when connecting (e.g., required scopes or setup notes). */
  authDescription?: string
}

export interface ApiKeyConfig {
  type: 'api_key'
  test?: ActionHandler
  connectionLabel?: (credentials: { token: string }) => Promise<string>
  /** Optional description shown to users when connecting (e.g., where to find the API key). */
  authDescription?: string
}

export interface NoAuthConfig {
  type: 'none'
}

// ---------------------------------------------------------------------------
// Integration definition types (author-facing → consumer-facing)
// ---------------------------------------------------------------------------

/**
 * Author-facing integration definition — what integration packages pass to defineIntegration().
 *
 * `actions` is ActionDef[] here. defineIntegration() compiles it to Integration.actions (Action[]),
 * transforming each ActionDef.actionId into the composite Action.id.
 */
export interface IntegrationDef {
  /** Lowercase snake_case identifier (e.g., 'slack', 'google_sheets') */
  id: IntegrationId
  /** Schema version — allows the runtime to know what capabilities are declared */
  version: 1
  name: string
  description: string
  /** Icon identifier (used by Weldable UI to render the branded icon) */
  icon: string
  /** Example phrase showing what this integration does (e.g., 'Send a Slack message to #general') */
  exampleUsage: string
  auth: AuthConfig
  /** Base URL for REST actions (e.g., 'https://slack.com/api') */
  baseUrl?: string
  /** Default headers merged into every REST request (e.g., GitHub API version header) */
  headers?: Record<string, string>
  /**
   * Auth header pattern for REST actions. Defaults to 'Bearer {token}'.
   * Only override for non-standard patterns (e.g., 'Bot {token}' for Discord).
   */
  authHeaderPattern?: string
  /**
   * Platform only: env var for a shared app-level token (e.g., DISCORD_BOT_TOKEN).
   * When set, the runtime injects this env var as the auth token instead of user OAuth.
   * Community integrations should not use this.
   */
  botTokenEnvVar?: string
  actions: ActionDef[]
  /** Nango OAuth provider name. Defaults to the integration slug if omitted. */
  nangoProvider?: string
  /** Comma-separated OAuth scopes (required for OAuth integrations) */
  nangoScopes?: string
  /** Env var prefix for OAuth credentials (e.g., 'SLACK' → SLACK_CLIENT_ID/SLACK_CLIENT_SECRET) */
  nangoCredentialEnvPrefix?: string
  /** Extra Nango connection params (e.g., API version) */
  nangoConnectionParams?: Record<string, string>
  /** Extra params appended to the OAuth authorize URL (e.g., Discord bot permissions) */
  nangoAuthorizationParams?: Record<string, string>
  /**
   * User-editable configuration fields shown in the integration setup UI.
   * Used for API key integrations that require the user to enter their own credentials.
   */
  configSchema?: ConfigField[]
  /**
   * Test queries with expected action IDs for catalog search regression testing.
   * expectedAction must use the composite id (e.g. 'slack.post_message', not 'post_message').
   */
  searchTests?: Array<{ query: string; expectedAction: string }>
}

/**
 * Compiled integration — produced by defineIntegration(), consumed by the Weldable runtime.
 *
 * actions is Action[] with composite ids set by defineIntegration().
 * Do not construct this directly — use defineIntegration().
 */
export interface Integration extends Omit<IntegrationDef, 'actions'> {
  actions: Action[]
}
