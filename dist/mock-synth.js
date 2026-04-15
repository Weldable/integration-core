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
// ---------------------------------------------------------------------------
// Seedable PRNG (mulberry32 — public domain, 20 lines, no runtime dependency)
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
// ---------------------------------------------------------------------------
// Per-field synthesis rules (keyed on type + name hints)
// ---------------------------------------------------------------------------
const NAMES = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'hans'];
const WORDS = ['alpha', 'bravo', 'delta', 'echo', 'foxtrot', 'hotel', 'india', 'juliet'];
function randInt(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
}
function randHex(rand, len) {
    let s = '';
    const chars = '0123456789abcdef';
    for (let i = 0; i < len; i++)
        s += chars[Math.floor(rand() * 16)];
    return s;
}
function randChoice(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
}
/**
 * Synthesize a single field value from its declared type and name.
 * The `rand` function is pre-seeded so the result is deterministic.
 */
function synthesizeField(field, rand) {
    const n = field.name.toLowerCase();
    switch (field.type) {
        case 'boolean':
            return rand() < 0.5;
        case 'number': {
            if (/count|size|total|num|length|estimate/.test(n))
                return randInt(rand, 1, 10);
            if (/page|offset|index/.test(n))
                return 0;
            return randInt(rand, 1, 1000);
        }
        case 'string': {
            if (/\bemail\b|_email/.test(n)) {
                return `${randChoice(rand, NAMES)}-${randInt(rand, 100, 999)}@example.com`;
            }
            if (/\burl\b|_url|link|href/.test(n)) {
                return `https://example.com/${randChoice(rand, WORDS)}-${randInt(rand, 100, 999)}`;
            }
            if (/\bid$|_id$/.test(n) || n === 'id') {
                return randHex(rand, 12);
            }
            if (/_at$|timestamp|created|updated|modified|sent|received/.test(n)) {
                // Produce a deterministic ISO timestamp offset from a fixed epoch
                const base = new Date('2025-01-01T00:00:00Z').getTime();
                const offset = Math.floor(rand() * 365 * 24 * 60 * 60 * 1000);
                return new Date(base + offset).toISOString();
            }
            if (n === 'ts') {
                // Slack message timestamp format: "unix.frac"
                const unix = 1700000000 + randInt(rand, 0, 9999999);
                const frac = randInt(rand, 100000, 999999);
                return `${unix}.${frac}`;
            }
            if (/\bname\b|_name$|^name/.test(n)) {
                return `${randChoice(rand, NAMES)}-${randInt(rand, 100, 999)}`;
            }
            if (/\btoken\b|cursor|page_token|next_page/.test(n)) {
                return `tok_${randHex(rand, 16)}`;
            }
            if (/status/.test(n)) {
                return randChoice(rand, ['active', 'pending', 'complete', 'failed']);
            }
            // Generic string fallback
            return `${field.name}-${randChoice(rand, WORDS)}-${randInt(rand, 100, 999)}`;
        }
        case 'object':
            return {};
        case 'array':
            return [];
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Synthesize a mock output record from an action's declared outputFields and
 * a deterministic seed string.
 */
export function synthesizeFromOutputFields(outputFields, seed) {
    if (!outputFields || outputFields.length === 0)
        return {};
    const rand = mulberry32(hash32(seed));
    const result = {};
    for (const field of outputFields) {
        result[field.name] = synthesizeField(field, rand);
    }
    return result;
}
/**
 * Build a default MockActionHandler from an action's declared outputFields.
 * The handler is deterministic: same args + same ctx.seed → same result.
 */
export function createDefaultMock(outputFields) {
    return async (_args, ctx) => {
        return synthesizeFromOutputFields(outputFields, ctx.seed);
    };
}
