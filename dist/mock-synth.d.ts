/**
 * Deterministic mock synthesizer for integration actions.
 *
 * Produces a synthetic output record from an action's declared outputFields
 * and a string seed. Same seed + same outputFields → identical output on every
 * call (safe for snapshot tests and workflow replay).
 *
 * Fidelity limits (by design):
 * - `type: 'object'` fields return `{}` — nested shape is not declared.
 * - `type: 'array'` fields return `[]` — item shape is not declared.
 * For actions where array/nested realism matters, provide a handwritten
 * `mockExecute` override on the ActionDef (e.g. Slack list_messages).
 *
 * When `outputFields` is undefined, returns `{}`.
 */
import type { MockActionHandler, OutputField } from './types.js';
/**
 * Synthesize a mock output record from an action's declared outputFields and
 * a deterministic seed string.
 */
export declare function synthesizeFromOutputFields(outputFields: OutputField[] | undefined, seed: string): Record<string, unknown>;
/**
 * Build a default MockActionHandler from an action's declared outputFields.
 * The handler is deterministic: same args + same ctx.seed → same result.
 */
export declare function createDefaultMock(outputFields: OutputField[] | undefined): MockActionHandler;
//# sourceMappingURL=mock-synth.d.ts.map