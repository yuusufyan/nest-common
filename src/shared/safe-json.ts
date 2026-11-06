// Internal helper (not exported from index.ts): produces the same plain,
// JSON-compatible value as JSON.parse(JSON.stringify(value)) -- Date -> ISO
// string, toJSON() honoured, undefined/functions/symbols dropped (null inside
// arrays), non-finite numbers -> null -- but with three guards that a
// JSON.stringify replacer cannot provide:
//
// 1. Circularity is tracked by ANCESTOR PATH, not a flat "seen" set. An object
//    reached twice through different branches (rows.map(r => ({...r,
//    currency: lookup[k]}))) is shared, not circular, and is kept intact.
// 2. The ancestor check uses the ORIGINAL object as well as its toJSON()
//    result. A class whose toJSON() builds a fresh object on every call would
//    otherwise hide a real cycle (each ancestor is a new object) and recurse
//    until RangeError.
// 3. Depth and total-object budgets. A "diamond" graph (a.left = a.right = b,
//    b.left = b.right = c, ...) is not circular but expands exponentially;
//    maxNodes stops it before it eats memory/CPU.

export const CIRCULAR_MARKER = '[Circular]';
export const MAX_DEPTH_MARKER = '[MaxDepth]';
export const TRUNCATED_MARKER = '[Truncated]';
// Distinct from TRUNCATED_MARKER (which replaces an entire node once the
// object budget is spent): this replaces one oversized STRING value in place,
// regardless of the node budget, so a single huge string can't slip through
// untouched just because it only ever costs 1 node.
export const stringTruncatedMarker = (originalLength: number): string =>
  `[TruncatedString:originalLength=${originalLength}]`;

export class SafeJsonLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeJsonLimitError';
  }
}

export interface SafeJsonOptions {
  /** Max number of objects/arrays emitted. Default 500_000. */
  maxNodes?: number;
  /** Max nesting depth; deeper values become MAX_DEPTH_MARKER. Default 1000. */
  maxDepth?: number;
  /**
   * Max character length for any single string value (direct, boxed String,
   * or produced by a toJSON()). A string longer than this is replaced with a
   * stringTruncatedMarker() sentinel. Unset (default) = no limit, matching
   * this option's previous nonexistence for every current caller that
   * doesn't opt in. A wide array/object of primitives is bounded by
   * maxNodes because each element costs a node -- but ONE giant string is
   * still only 1 node no matter its length, so maxNodes alone never bounds
   * it; this option exists specifically to close that gap.
   */
  maxStringLength?: number;
  /** 'throw' (JSON.stringify's behaviour, default) or 'string'. */
  bigint?: 'throw' | 'string';
  /**
   * What to do when maxNodes is exceeded: 'throw' a SafeJsonLimitError
   * (default) or 'truncate' (remaining objects become TRUNCATED_MARKER).
   */
  onNodeLimit?: 'throw' | 'truncate';
  /**
   * Legacy mode: ANY object already emitted anywhere becomes
   * CIRCULAR_MARKER (the old flat-set behaviour). Output size is bounded by
   * the number of distinct objects, so it is only meant as a fallback for
   * graphs that blow the node budget.
   */
  dedupeRepeated?: boolean;
}

const OMIT = Symbol('omit');

export function toSafeJson(value: any, options: SafeJsonOptions = {}): any {
  const maxNodes = options.maxNodes ?? 500_000;
  const maxDepth = options.maxDepth ?? 1000;
  const maxStringLength = options.maxStringLength;
  const bigintMode = options.bigint ?? 'throw';
  const onNodeLimit = options.onNodeLimit ?? 'throw';
  const dedupe = options.dedupeRepeated ?? false;

  const ancestors = new Set<object>();
  const seen = new Set<object>(); // only used in dedupe mode
  let nodes = 0;

  const walk = (holderKey: string, input: any, depth: number): any => {
    // Every value walked -- container OR primitive -- costs one node.
    // Checked first, before any other work, so a wide array/object of
    // plain strings/numbers/etc. is capped just as reliably as a deeply
    // nested container graph: without this, only object/array containers
    // counted, so `{ ids: [5_000_000 numbers] }` incremented `nodes` by
    // ~2 while still fully materializing all 5,000,000 entries -- the one
    // realistic payload shape (a flat list of ids/amounts/timestamps) the
    // budget most needed to bound.
    nodes++;
    if (nodes > maxNodes) {
      if (onNodeLimit === 'truncate') return TRUNCATED_MARKER;
      throw new SafeJsonLimitError(`object budget of ${maxNodes} exceeded`);
    }

    let val = input;
    const original = input;

    if (
      val !== null &&
      (typeof val === 'object' || typeof val === 'bigint') &&
      typeof val.toJSON === 'function'
    ) {
      if (typeof original === 'object' && (ancestors.has(original) || (dedupe && seen.has(original)))) {
        return CIRCULAR_MARKER;
      }
      val = val.toJSON(holderKey);
    }

    if (val === null) return null;

    switch (typeof val) {
      case 'string':
        return maxStringLength !== undefined && val.length > maxStringLength
          ? stringTruncatedMarker(val.length)
          : val;
      case 'boolean':
        return val;
      case 'number':
        // -0 serializes as 0; NaN/Infinity as null.
        return Number.isFinite(val) ? (val === 0 ? 0 : val) : null;
      case 'bigint':
        if (bigintMode === 'string') return val.toString();
        throw new TypeError('Do not know how to serialize a BigInt');
      case 'undefined':
      case 'function':
      case 'symbol':
        return OMIT;
    }

    // Boxed primitives serialize as their primitive value.
    if (val instanceof Number) return Number.isFinite(+val) ? +val : null;
    if (val instanceof String) {
      const s = String(val);
      return maxStringLength !== undefined && s.length > maxStringLength
        ? stringTruncatedMarker(s.length)
        : s;
    }
    if (val instanceof Boolean) return val.valueOf();

    if (ancestors.has(val) || (dedupe && seen.has(val))) return CIRCULAR_MARKER;
    if (depth >= maxDepth) return MAX_DEPTH_MARKER;

    // Track both the original and its toJSON() result on the current path.
    const tracked: object[] = [val];
    if (typeof original === 'object' && original !== val) tracked.push(original);
    for (const t of tracked) {
      ancestors.add(t);
      if (dedupe) seen.add(t);
    }

    try {
      if (Array.isArray(val)) {
        // Built with push (not `new Array(val.length)` + index assignment)
        // so a wide array that trips the budget partway through stops with
        // a short output, instead of a pre-sized 5,000,000-slot array that
        // just has holes past the truncation point.
        const out: any[] = [];
        for (let i = 0; i < val.length; i++) {
          const v = walk(String(i), val[i], depth + 1);
          out.push(v === OMIT ? null : v);
          // Stop iterating entirely once the budget is spent, rather than
          // keep calling walk() (even cheaply) for every remaining
          // element -- that's still O(input size), which is exactly what
          // the budget exists to avoid. In 'throw' mode walk() has already
          // thrown by this point, so this only matters for 'truncate'.
          if (nodes > maxNodes) break;
        }
        return out;
      }
      // Object.keys(val) is an unavoidable O(number-of-keys) allocation
      // that happens BEFORE this loop's own `nodes > maxNodes` break can run
      // even once, unlike the array branch above (whose `.length` check is
      // O(1) and whose output is built incrementally). This was measured,
      // not assumed: a plain object with 5,000,000 own keys costs ~700ms
      // just to enumerate via Object.keys() on this runtime, and a
      // `for...in` loop that breaks after the first 1000 iterations costs
      // essentially the same (~690ms) -- V8 must still build the full
      // enumeration order for either construct, so switching does not avoid
      // the up-front cost. `for...in` would also change behaviour: it walks
      // the prototype chain too, so it can surface inherited enumerable
      // properties that Object.keys() (correctly) does not -- a correctness
      // regression, not just a missed optimization. Object.keys() is kept
      // for both reasons. What IS fully bounded by maxNodes is everything
      // this loop does with each key once enumeration is done: the
      // recursive walk() call below immediately throws/returns
      // TRUNCATED_MARKER once the budget is spent (nodes is checked first
      // thing inside walk()), and the `if (nodes > maxNodes) break` just
      // below stops the loop itself on the very next iteration in
      // 'truncate' mode -- so the residual, unavoidable cost of a wide
      // object is the single native enumeration pass, not a second
      // O(number-of-keys) JS-level walk on top of it.
      const out: Record<string, any> = {};
      for (const k of Object.keys(val)) {
        const v = walk(k, val[k], depth + 1);
        if (v !== OMIT) {
          // defineProperty so a "__proto__" key stays an own property (as
          // JSON.parse does) instead of replacing the prototype.
          Object.defineProperty(out, k, {
            value: v,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        if (nodes > maxNodes) break;
      }
      return out;
    } finally {
      for (const t of tracked) ancestors.delete(t);
    }
  };

  const result = walk('', value, 0);
  return result === OMIT ? undefined : result;
}
