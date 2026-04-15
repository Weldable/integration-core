import { createDefaultMock } from './mock-synth.js';
/**
 * Type-safe factory for defining a Weldable integration.
 *
 * Compiles author-facing ActionDef (with actionId) into runtime Action (with composite id).
 * e.g. integration id 'slack' + actionId 'post_message' → action id 'slack.post_message'.
 *
 * Also ensures every compiled Action has a non-null mockExecute: if the ActionDef
 * omits mockExecute, defineIntegration() attaches a deterministic synthesizer derived
 * from the action's outputFields.
 *
 * Throws on duplicate actionId values within an integration (fail-fast, caught at startup).
 *
 * Usage:
 *   export default defineIntegration({
 *     id: 'slack',
 *     version: 1,
 *     name: 'Slack',
 *     actions: [
 *       { actionId: 'post_message', name: 'Send message', ... },
 *     ],
 *   })
 */
export function defineIntegration(def) {
    const seen = new Set();
    for (const action of def.actions) {
        if (seen.has(action.actionId)) {
            throw new Error(`[defineIntegration] Duplicate actionId '${action.actionId}' in integration '${def.id}'. ` +
                `Each action must have a unique actionId.`);
        }
        seen.add(action.actionId);
    }
    return {
        ...def,
        actions: def.actions.map(({ actionId, ...rest }) => ({
            ...rest,
            id: `${def.id}.${actionId}`,
            mockExecute: rest.mockExecute ?? createDefaultMock(rest.outputFields),
        })),
    };
}
