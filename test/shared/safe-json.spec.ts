import {
  CIRCULAR_MARKER,
  MAX_DEPTH_MARKER,
  SafeJsonLimitError,
  TRUNCATED_MARKER,
  stringTruncatedMarker,
  toSafeJson,
} from '../../src/shared/safe-json';

const roundTrip = (v: unknown) => JSON.parse(JSON.stringify(v));

function diamond(levels: number): any {
  let node: any = { v: 0 };
  for (let i = 0; i < levels; i++) node = { left: node, right: node };
  return node;
}

class Node {
  parent: Node | null = null;
  constructor(public id: string) {}
  toJSON() {
    // fresh object on every call -- defeats identity-based checks on the result
    return { id: this.id, parent: this.parent };
  }
}

describe('toSafeJson', () => {
  describe('parity with JSON.parse(JSON.stringify(x)) for acyclic data', () => {
    const date = new Date('2026-09-29T01:02:03.004Z');
    const cases: Array<[string, unknown]> = [
      ['nested objects/arrays', { a: 1, b: { c: [1, 'x', { d: true }] }, e: [] }],
      ['undefined/function/symbol in object', { a: undefined, b: () => 1, c: Symbol('s'), d: 1 }],
      ['undefined/function/symbol in array', [undefined, () => 1, Symbol('s'), 2]],
      ['sparse array', [1, , 3]], // eslint-disable-line no-sparse-arrays
      ['non-finite numbers', { a: NaN, b: Infinity, c: -Infinity, d: -0 }],
      ['Date', { at: date, list: [date] }],
      ['boxed primitives', { n: new Number(5), s: new String('x'), b: new Boolean(false) }],
      ['Map/Set become {}', { m: new Map([[1, 2]]), s: new Set([1]) }],
      ['Buffer via toJSON', { buf: Buffer.from('ab') }],
      ['nulls', { a: null, b: [null] }],
      ['class instance (own enumerable props only)', new (class { x = 1; get y() { return 2; } })()],
      ['toJSON with key argument', { k: { toJSON: (key: string) => `key=${key}` } }],
      ['toJSON returning undefined', { a: { toJSON: () => undefined }, b: 1 }],
      ['unicode keys and values', { 'é': 'ü', 'nama lengkap': 'Budi' }],
    ];

    it.each(cases)('%s', (_label, value) => {
      expect(toSafeJson(value)).toEqual(roundTrip(value));
    });

    it('keeps a "__proto__" key as an own property, like JSON.parse', () => {
      const input = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
      const out = toSafeJson(input);

      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(({} as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
      expect(JSON.stringify(out)).toBe(JSON.stringify(input));
    });

    it('returns undefined for a top-level undefined/function', () => {
      expect(toSafeJson(undefined)).toBeUndefined();
      expect(toSafeJson(() => 1)).toBeUndefined();
    });
  });

  describe('shared vs circular', () => {
    it('keeps an object shared between branches', () => {
      const s = { id: 's' };
      expect(toSafeJson({ a: s, b: [s, { c: s }] })).toEqual({
        a: { id: 's' },
        b: [{ id: 's' }, { c: { id: 's' } }],
      });
    });

    it('marks a real cycle', () => {
      const a: any = { id: 1 };
      a.self = a;
      expect(toSafeJson(a)).toEqual({ id: 1, self: CIRCULAR_MARKER });
    });

    it('detects a cycle hidden behind toJSON() that returns fresh objects', () => {
      const root = new Node('root');
      const child = new Node('child');
      root.parent = child;
      child.parent = root;

      expect(() => JSON.stringify(root)).toThrow(RangeError); // the crash being guarded
      expect(toSafeJson(root)).toEqual({
        id: 'root',
        parent: { id: 'child', parent: CIRCULAR_MARKER },
      });
    });

    it('keeps a toJSON() class instance that is shared, not cyclic', () => {
      const shared = new Node('s');
      expect(toSafeJson([{ n: shared }, { n: shared }])).toEqual([
        { n: { id: 's', parent: null } },
        { n: { id: 's', parent: null } },
      ]);
    });

    it('dedupeRepeated reproduces the legacy flat-set output', () => {
      const s = { id: 's' };
      expect(toSafeJson([{ s }, { s }], { dedupeRepeated: true })).toEqual([
        { s: { id: 's' } },
        { s: CIRCULAR_MARKER },
      ]);
    });
  });

  describe('limits', () => {
    it('throws SafeJsonLimitError when a diamond graph exceeds maxNodes', () => {
      const started = Date.now();
      expect(() => toSafeJson(diamond(30), { maxNodes: 10_000 })).toThrow(SafeJsonLimitError);
      expect(Date.now() - started).toBeLessThan(1000);
    });

    it('expands a small diamond fully (it is not circular)', () => {
      const out = toSafeJson(diamond(3));
      expect(out.left.left.left).toEqual({ v: 0 });
      expect(out.right.right.right).toEqual({ v: 0 });
    });

    it('truncates instead of throwing when onNodeLimit is "truncate"', () => {
      // Every value now costs a node, not just containers: the array (1) +
      // 2 full objects (2, 4) + their 2 primitive values (3, 5) = 5 nodes
      // before the 3rd object would be visited.
      const out = toSafeJson([{ a: 1 }, { b: 2 }, { c: 3 }], {
        maxNodes: 5,
        onNodeLimit: 'truncate',
      });
      expect(out).toEqual([{ a: 1 }, { b: 2 }, TRUNCATED_MARKER]);
    });

    it('bounds a wide array of primitives, not just nested containers', () => {
      // This is the gap being closed: before, only container (object/array)
      // visits incremented `nodes`, so a wide flat array of primitives -- a
      // very realistic response shape (a list of ids/amounts/timestamps) --
      // sailed straight through the budget: `{ ids: [...] }` only cost ~2
      // nodes (the outer object + the array) no matter how many numbers
      // were inside, so all of them were always walked in full.
      const WIDE = 250_000; // well past a small maxNodes; old counter would have processed all of it
      const ids = Array.from({ length: WIDE }, (_, i) => i);

      const started = Date.now();
      const out = toSafeJson(
        { ids },
        { maxNodes: 1000, onNodeLimit: 'truncate' },
      );
      const elapsed = Date.now() - started;

      // The fallback must actually have kicked in -- the array must NOT
      // contain anywhere near all 250,000 numbers.
      expect(Array.isArray(out.ids)).toBe(true);
      expect(out.ids.length).toBeLessThan(1100);
      expect(out.ids[out.ids.length - 1]).toBe(TRUNCATED_MARKER);
      // And it must have stopped early rather than looping over the full
      // array (even cheaply) -- bounded by maxNodes, not by WIDE.
      expect(elapsed).toBeLessThan(500);
    });

    it('throws for a wide array of primitives when onNodeLimit is "throw" (default)', () => {
      const ids = Array.from({ length: 250_000 }, (_, i) => i);
      expect(() => toSafeJson({ ids }, { maxNodes: 1000 })).toThrow(SafeJsonLimitError);
    });

    it('bounds a wide OBJECT of primitives similarly to the wide array case', () => {
      // Unlike an array, Object.keys() must enumerate every own key up
      // front before this loop's own `nodes > maxNodes` break can run even
      // once -- see the comment above the object branch in safe-json.ts.
      // That enumeration pass is native, unavoidable, and measured at
      // ~700ms for 5,000,000 keys on this runtime (see the throwaway probe
      // referenced in the PR); what this test asserts is that everything
      // AFTER enumeration -- the actual recursive walk of each key's value
      // -- stays bounded by maxNodes rather than by the object's real size,
      // and that the whole call finishes in a small, bounded time overall
      // (not the multi-second-plus blowup a fully unbounded walk over
      // 5,000,000 keys with real per-key overhead would cause).
      const WIDE = 5_000_000;
      const wideObject: Record<string, number> = {};
      for (let i = 0; i < WIDE; i++) wideObject['k' + i] = i;

      const started = Date.now();
      const out = toSafeJson(
        { wideObject },
        { maxNodes: 1000, onNodeLimit: 'truncate' },
      );
      const elapsed = Date.now() - started;

      const keys = Object.keys(out.wideObject);
      expect(keys.length).toBeLessThan(1100);
      expect(keys.length).toBeGreaterThan(0);
      // Bounded by the enumeration cost (native, linear, ~1s budget here)
      // plus a small constant for the walk -- NOT by a second O(WIDE)
      // JS-level pass with per-key recursion/Set/defineProperty overhead,
      // which would take substantially longer.
      expect(elapsed).toBeLessThan(3000);
    }, 10_000);

    it('throws for a wide object of primitives when onNodeLimit is "throw" (default)', () => {
      const wideObject: Record<string, number> = {};
      for (let i = 0; i < 250_000; i++) wideObject['k' + i] = i;
      expect(() => toSafeJson({ wideObject }, { maxNodes: 1000 })).toThrow(SafeJsonLimitError);
    });

    it('dedupe mode keeps a huge diamond small', () => {
      const out = toSafeJson(diamond(40), { dedupeRepeated: true });
      expect(JSON.stringify(out).length).toBeLessThan(2000);
    });

    it('keeps deep (non-cyclic) nesting intact up to maxDepth', () => {
      let deep: any = { leaf: true };
      for (let i = 0; i < 300; i++) deep = { next: deep };
      expect(toSafeJson(deep)).toEqual(roundTrip(deep));
    });

    it('marks values beyond maxDepth', () => {
      expect(toSafeJson({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({
        a: { b: MAX_DEPTH_MARKER },
      });
    });

    it('stops an infinite toJSON() generator via maxDepth', () => {
      class Gen {
        toJSON() {
          return { next: new Gen() };
        }
      }
      expect(() => toSafeJson(new Gen())).not.toThrow();
    });
  });

  describe('BigInt', () => {
    it('throws like JSON.stringify by default', () => {
      expect(() => toSafeJson({ n: BigInt(1) })).toThrow(TypeError);
    });

    it('stringifies when bigint: "string"', () => {
      expect(toSafeJson({ n: BigInt('9007199254740993') }, { bigint: 'string' })).toEqual({
        n: '9007199254740993',
      });
    });
  });

  describe('maxStringLength', () => {
    // A single huge string only ever costs 1 node, so maxNodes alone never
    // bounds it -- this is a separate budget for exactly that shape.
    it('leaves strings untouched when maxStringLength is unset (default)', () => {
      const big = 'x'.repeat(2_000_000);
      expect(toSafeJson({ s: big })).toEqual({ s: big });
    });

    it('replaces a string over the limit with a stringTruncatedMarker', () => {
      const big = 'x'.repeat(1000);
      expect(toSafeJson({ s: big }, { maxStringLength: 100 })).toEqual({
        s: stringTruncatedMarker(1000),
      });
    });

    it('leaves a string at or under the limit untouched', () => {
      const s = 'x'.repeat(100);
      expect(toSafeJson({ s }, { maxStringLength: 100 })).toEqual({ s });
    });

    it('applies the limit to a boxed String', () => {
      // eslint-disable-next-line no-new-wrappers
      const boxed = new String('x'.repeat(1000));
      expect(toSafeJson({ s: boxed }, { maxStringLength: 100 })).toEqual({
        s: stringTruncatedMarker(1000),
      });
    });

    it('applies the limit to a string produced by toJSON()', () => {
      const huge = 'y'.repeat(1000);
      const val = { toJSON: () => huge };
      expect(toSafeJson({ v: val }, { maxStringLength: 100 })).toEqual({
        v: stringTruncatedMarker(1000),
      });
    });

    it('bounds a single huge string inside an otherwise small payload', () => {
      // The scenario the interceptor gap allowed through: a response with
      // one enormous string value (a base64/HTML blob) and nothing else
      // large enough to trip maxNodes.
      const hugeBlob = 'a'.repeat(5_000_000);
      const started = Date.now();
      const out = toSafeJson(
        { id: 1, blob: hugeBlob },
        { maxStringLength: 1_000_000 },
      );
      const elapsed = Date.now() - started;

      expect(out).toEqual({ id: 1, blob: stringTruncatedMarker(5_000_000) });
      // Output is small regardless of the input blob's size.
      expect(JSON.stringify(out).length).toBeLessThan(200);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
