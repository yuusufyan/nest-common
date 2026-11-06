"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeJsonLimitError = exports.stringTruncatedMarker = exports.TRUNCATED_MARKER = exports.MAX_DEPTH_MARKER = exports.CIRCULAR_MARKER = void 0;
exports.toSafeJson = toSafeJson;
exports.CIRCULAR_MARKER = '[Circular]';
exports.MAX_DEPTH_MARKER = '[MaxDepth]';
exports.TRUNCATED_MARKER = '[Truncated]';
const stringTruncatedMarker = (originalLength) => `[TruncatedString:originalLength=${originalLength}]`;
exports.stringTruncatedMarker = stringTruncatedMarker;
class SafeJsonLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SafeJsonLimitError';
    }
}
exports.SafeJsonLimitError = SafeJsonLimitError;
const OMIT = Symbol('omit');
function toSafeJson(value, options = {}) {
    const maxNodes = options.maxNodes ?? 500_000;
    const maxDepth = options.maxDepth ?? 1000;
    const maxStringLength = options.maxStringLength;
    const bigintMode = options.bigint ?? 'throw';
    const onNodeLimit = options.onNodeLimit ?? 'throw';
    const dedupe = options.dedupeRepeated ?? false;
    const ancestors = new Set();
    const seen = new Set();
    let nodes = 0;
    const walk = (holderKey, input, depth) => {
        nodes++;
        if (nodes > maxNodes) {
            if (onNodeLimit === 'truncate')
                return exports.TRUNCATED_MARKER;
            throw new SafeJsonLimitError(`object budget of ${maxNodes} exceeded`);
        }
        let val = input;
        const original = input;
        if (val !== null &&
            (typeof val === 'object' || typeof val === 'bigint') &&
            typeof val.toJSON === 'function') {
            if (typeof original === 'object' && (ancestors.has(original) || (dedupe && seen.has(original)))) {
                return exports.CIRCULAR_MARKER;
            }
            val = val.toJSON(holderKey);
        }
        if (val === null)
            return null;
        switch (typeof val) {
            case 'string':
                return maxStringLength !== undefined && val.length > maxStringLength
                    ? (0, exports.stringTruncatedMarker)(val.length)
                    : val;
            case 'boolean':
                return val;
            case 'number':
                return Number.isFinite(val) ? (val === 0 ? 0 : val) : null;
            case 'bigint':
                if (bigintMode === 'string')
                    return val.toString();
                throw new TypeError('Do not know how to serialize a BigInt');
            case 'undefined':
            case 'function':
            case 'symbol':
                return OMIT;
        }
        if (val instanceof Number)
            return Number.isFinite(+val) ? +val : null;
        if (val instanceof String) {
            const s = String(val);
            return maxStringLength !== undefined && s.length > maxStringLength
                ? (0, exports.stringTruncatedMarker)(s.length)
                : s;
        }
        if (val instanceof Boolean)
            return val.valueOf();
        if (ancestors.has(val) || (dedupe && seen.has(val)))
            return exports.CIRCULAR_MARKER;
        if (depth >= maxDepth)
            return exports.MAX_DEPTH_MARKER;
        const tracked = [val];
        if (typeof original === 'object' && original !== val)
            tracked.push(original);
        for (const t of tracked) {
            ancestors.add(t);
            if (dedupe)
                seen.add(t);
        }
        try {
            if (Array.isArray(val)) {
                const out = [];
                for (let i = 0; i < val.length; i++) {
                    const v = walk(String(i), val[i], depth + 1);
                    out.push(v === OMIT ? null : v);
                    if (nodes > maxNodes)
                        break;
                }
                return out;
            }
            const out = {};
            for (const k of Object.keys(val)) {
                const v = walk(k, val[k], depth + 1);
                if (v !== OMIT) {
                    Object.defineProperty(out, k, {
                        value: v,
                        enumerable: true,
                        writable: true,
                        configurable: true,
                    });
                }
                if (nodes > maxNodes)
                    break;
            }
            return out;
        }
        finally {
            for (const t of tracked)
                ancestors.delete(t);
        }
    };
    const result = walk('', value, 0);
    return result === OMIT ? undefined : result;
}
//# sourceMappingURL=safe-json.js.map