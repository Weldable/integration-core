/**
 * Seeded fixture helpers for writing handwritten mockExecute overrides.
 *
 * Every function accepts a string seed and returns a deterministic value.
 * Use deriveSeed() to produce per-item seeds for nested/iterated structures.
 *
 * IMPORTANT: Never use Math.random() in mockExecute handlers. All randomness
 * must flow through these helpers so mocks remain deterministic.
 *
 * Usage in a mockExecute:
 *
 *   mockExecute: async (args, ctx) => ({
 *     ts: fakeSlackTs(ctx.seed),
 *     channel: String(args.channel ?? '#general'),
 *   }),
 */
/** Combine a parent seed and an arbitrary salt to get a child seed. */
export declare function deriveSeed(parentSeed: string, salt: string | number): string;
/** Plausible email address. */
export declare function fakeEmail(seed: string): string;
/** Plausible HTTPS URL. */
export declare function fakeUrl(seed: string, path?: string): string;
/** Hex ID string of given length (default 12). */
export declare function fakeId(seed: string, len?: number): string;
/**
 * Slack message timestamp: "<unix>.<frac>".
 * Deterministic, but always looks like a valid Slack ts.
 */
export declare function fakeSlackTs(seed: string): string;
/**
 * ISO 8601 timestamp. `offsetMs` shifts from the 2025-01-01 base epoch.
 * Different seeds produce different dates; the range is within 2025.
 */
export declare function fakeIsoTimestamp(seed: string, opts?: {
    offsetMs?: number;
}): string;
/**
 * Build an array of `n` items using a callback that receives a per-item seed.
 * Per-item seeds are derived from the parent seed + the item index so they are
 * stable across different `n` values.
 *
 * @example
 *   fakeArray(ctx.seed, 3, (s) => ({ id: fakeId(s), name: `item-${s}` }))
 */
export declare function fakeArray<T>(seed: string, n: number, fn: (itemSeed: string) => T): T[];
//# sourceMappingURL=mock-helpers.d.ts.map