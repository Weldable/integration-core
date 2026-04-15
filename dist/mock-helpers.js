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
// ---------------------------------------------------------------------------
// Internal PRNG (same algorithm as mock-synth.ts — kept local to avoid a
// dependency on the synthesizer's private exports)
// ---------------------------------------------------------------------------
function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (Math.imul(h, 0x01000193) | 0) >>> 0;
    }
    return h;
}
function mulberry32(seed) {
    let s = seed;
    return function () {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function rand(seed) {
    return mulberry32(hash32(seed));
}
function hex(rng, len) {
    const chars = '0123456789abcdef';
    return Array.from({ length: len }, () => chars[Math.floor(rng() * 16)]).join('');
}
function int(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
}
// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------
/** Combine a parent seed and an arbitrary salt to get a child seed. */
export function deriveSeed(parentSeed, salt) {
    return `${parentSeed}:${salt}`;
}
/** Plausible email address. */
export function fakeEmail(seed) {
    const r = rand(seed);
    const names = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'hans'];
    const domains = ['example.com', 'acme.org', 'test.io'];
    const name = names[Math.floor(r() * names.length)];
    const n = int(r, 100, 999);
    const domain = domains[Math.floor(r() * domains.length)];
    return `${name}-${n}@${domain}`;
}
/** Plausible HTTPS URL. */
export function fakeUrl(seed, path) {
    const r = rand(seed);
    const words = ['docs', 'items', 'users', 'records', 'files', 'events'];
    const word = words[Math.floor(r() * words.length)];
    const id = hex(r, 8);
    return `https://example.com/${path ?? `${word}/${id}`}`;
}
/** Hex ID string of given length (default 12). */
export function fakeId(seed, len = 12) {
    return hex(rand(seed), len);
}
/**
 * Slack message timestamp: "<unix>.<frac>".
 * Deterministic, but always looks like a valid Slack ts.
 */
export function fakeSlackTs(seed) {
    const r = rand(seed);
    const unix = 1700000000 + int(r, 0, 9999999);
    const frac = int(r, 100000, 999999);
    return `${unix}.${frac}`;
}
/**
 * ISO 8601 timestamp. `offsetMs` shifts from the 2025-01-01 base epoch.
 * Different seeds produce different dates; the range is within 2025.
 */
export function fakeIsoTimestamp(seed, opts) {
    const r = rand(seed);
    const base = new Date('2025-01-01T00:00:00Z').getTime();
    const jitter = opts?.offsetMs ?? Math.floor(r() * 365 * 24 * 60 * 60 * 1000);
    return new Date(base + jitter).toISOString();
}
/**
 * Build an array of `n` items using a callback that receives a per-item seed.
 * Per-item seeds are derived from the parent seed + the item index so they are
 * stable across different `n` values.
 *
 * @example
 *   fakeArray(ctx.seed, 3, (s) => ({ id: fakeId(s), name: `item-${s}` }))
 */
export function fakeArray(seed, n, fn) {
    return Array.from({ length: n }, (_, i) => fn(deriveSeed(seed, i)));
}
