import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from '../../src/interceptors/transform.interceptor';

function makeContext(path = '/items', statusCode = 200): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function handlerReturning(data: unknown): CallHandler {
  return { handle: () => of(data) };
}

async function run(data: unknown, path?: string): Promise<any> {
  const interceptor = new TransformInterceptor<any>();
  return lastValueFrom(
    interceptor.intercept(makeContext(path), handlerReturning(data)),
  );
}

async function runData(data: unknown): Promise<any> {
  return (await run(data)).data;
}

describe('TransformInterceptor', () => {
  describe('shared (non-circular) references', () => {
    it('keeps a lookup object shared by several array rows intact', async () => {
      const idr = { code: 'IDR', name: 'Rupiah' };
      const rows = [
        { id: 1, currency: idr },
        { id: 2, currency: idr },
      ];

      const result = await runData(rows);

      expect(result).toEqual([
        { id: 1, currency: { code: 'IDR', name: 'Rupiah' } },
        { id: 2, currency: { code: 'IDR', name: 'Rupiah' } },
      ]);
      expect(typeof result[1].currency).toBe('object');
    });

    it('keeps the rows.map(r => ({...r, x: lookup[k]})) pattern intact', async () => {
      const lookup: Record<string, { label: string }> = {
        A: { label: 'Alpha' },
        B: { label: 'Beta' },
      };
      const rows = ['A', 'B', 'A', 'A'].map((k, i) => ({ id: i, ref: lookup[k] }));

      const result = await runData(rows);

      expect(result.map((r: any) => r.ref.label)).toEqual([
        'Alpha',
        'Beta',
        'Alpha',
        'Alpha',
      ]);
    });

    it('keeps the same object used by two sibling keys of one object', async () => {
      const user = { id: 'u1', name: 'Budi' };
      const result = await runData({ createdBy: user, updatedBy: user });

      expect(result).toEqual({ createdBy: user, updatedBy: user });
    });

    it('keeps a shared object that re-appears after leaving a deep subtree', async () => {
      const shared = { v: 1, nested: { w: 2 } };
      const data = { a: { b: { c: shared } }, d: shared, e: [shared, { f: shared }] };

      const result = await runData(data);

      expect(result).toEqual({
        a: { b: { c: { v: 1, nested: { w: 2 } } } },
        d: { v: 1, nested: { w: 2 } },
        e: [{ v: 1, nested: { w: 2 } }, { f: { v: 1, nested: { w: 2 } } }],
      });
    });

    it('keeps a shared array referenced from multiple places', async () => {
      const tags = ['x', 'y'];
      const result = await runData([{ tags }, { tags }]);

      expect(result).toEqual([{ tags: ['x', 'y'] }, { tags: ['x', 'y'] }]);
    });

    it('keeps shared references inside a paginated envelope', async () => {
      const idr = { code: 'IDR' };
      const res = await run({
        data: [
          { id: 1, currency: idr },
          { id: 2, currency: idr },
        ],
        total: 2,
        page: 1,
        limit: 10,
      });

      expect(res.data[1].currency).toEqual({ code: 'IDR' });
      expect(res.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        total_pages: 1,
        total_results: 2,
      });
    });
  });

  describe('true circular references', () => {
    it('replaces a direct self-reference with "[Circular]"', async () => {
      const a: any = { id: 1 };
      a.self = a;

      const result = await runData(a);

      expect(result).toEqual({ id: 1, self: '[Circular]' });
    });

    it('replaces a deep back-reference to an ancestor with "[Circular]"', async () => {
      const root: any = { id: 'root', child: { id: 'child', grand: {} } };
      root.child.grand.back = root;
      root.child.grand.toChild = root.child;

      const result = await runData(root);

      expect(result).toEqual({
        id: 'root',
        child: {
          id: 'child',
          grand: { back: '[Circular]', toChild: '[Circular]' },
        },
      });
    });

    it('handles mutual references (parent <-> child, TypeORM-style)', async () => {
      const parent: any = { id: 'p', children: [] };
      const c1: any = { id: 'c1', parent };
      const c2: any = { id: 'c2', parent };
      parent.children.push(c1, c2);

      const result = await runData(parent);

      expect(result).toEqual({
        id: 'p',
        children: [
          { id: 'c1', parent: '[Circular]' },
          { id: 'c2', parent: '[Circular]' },
        ],
      });
    });

    it('handles an array that contains itself', async () => {
      const arr: any[] = [1, 2];
      arr.push(arr);

      const result = await runData({ arr });

      expect(result).toEqual({ arr: [1, 2, '[Circular]'] });
    });

    it('flags only the cyclic edge when an object is both shared and cyclic', async () => {
      const node: any = { id: 'n' };
      node.self = node;
      const result = await runData([{ node }, { node }]);

      expect(result).toEqual([
        { node: { id: 'n', self: '[Circular]' } },
        { node: { id: 'n', self: '[Circular]' } },
      ]);
    });
  });

  describe('BigInt combined with a genuine circular reference (regression)', () => {
    // Reviewer-reported blocking bug: toSafeJson() used to throw a plain
    // TypeError for a BigInt field (since the interceptor never passed
    // `bigint: 'string'`), which is NOT a SafeJsonLimitError, so safeData()
    // fell through its old `if (e instanceof SafeJsonLimitError)` check and
    // returned the RAW, never-safed payload -- self-reference and all. That
    // raw payload then reaches res.json()'s JSON.stringify OUTSIDE this
    // interceptor's try/catch and crashes unhandled. A TypeORM row with a
    // bigint id column and a parent<->child relation is exactly this shape.
    it('serializes the BigInt and marks the cycle, never returning the raw object', async () => {
      const obj: any = { id: BigInt(5) };
      obj.self = obj;

      const result = await runData(obj);

      expect(result).not.toBe(obj);
      expect(result).toEqual({ id: '5', self: '[Circular]' });
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('handles a BigInt id alongside a TypeORM-style parent<->child cycle', async () => {
      const parent: any = { id: BigInt(1), children: [] };
      const child: any = { id: BigInt(2), parent };
      parent.children.push(child);

      const result = await runData(parent);

      expect(result).toEqual({
        id: '1',
        children: [{ id: '2', parent: '[Circular]' }],
      });
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('never falls through to the raw payload on an unanticipated serialization error', async () => {
      // Defensive structural test for the catch block itself: whatever the
      // error type (not just SafeJsonLimitError, and not just BigInt's
      // TypeError), the fallback path must be taken and the raw object
      // with its live cycle must never come back untouched.
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      class Poison {
        get self() {
          return this;
        }
        toJSON() {
          throw new RangeError('unexpected poison during serialization');
        }
      }
      const poison = new Poison();

      const result = await runData(poison);

      expect(result).not.toBe(poison);
      expect(() => JSON.stringify(result)).not.toThrow();
      warn.mockRestore();
    });
  });

  describe('toJSON() cycles and non-circular blow-ups', () => {
    class TreeNode {
      parent: TreeNode | null = null;
      constructor(public id: string) {}
      toJSON() {
        return { id: this.id, parent: this.parent };
      }
    }

    function diamond(levels: number): any {
      let node: any = { v: 0 };
      for (let i = 0; i < levels; i++) node = { left: node, right: node };
      return node;
    }

    it('does not crash on a cycle hidden behind toJSON() returning fresh objects', async () => {
      const root = new TreeNode('root');
      const child = new TreeNode('child');
      root.parent = child;
      child.parent = root;

      const res = await run(root);

      expect(res.data).toEqual({
        id: 'root',
        parent: { id: 'child', parent: '[Circular]' },
      });
      // the envelope must be serializable by res.json()
      expect(() => JSON.stringify(res)).not.toThrow();
    });

    it('stays bounded on a 22-level diamond graph and warns', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const started = Date.now();

      const res = await run(diamond(22));

      const size = JSON.stringify(res).length;
      expect(Date.now() - started).toBeLessThan(3000);
      expect(size).toBeLessThan(5000);
      // legacy fallback: first occurrence kept, repeats marked
      expect(res.data.left.left).toBeDefined();
      expect(res.data.right).toBe('[Circular]');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('/items');
      warn.mockRestore();
    });

    it('expands a small diamond fully (shared, not circular)', async () => {
      const data = await runData(diamond(5));
      expect(data.right.right.right.right.right).toEqual({ v: 0 });
      expect(data.left.right.left.right.left).toEqual({ v: 0 });
    });

    it('keeps a securities-composition style DAG intact', async () => {
      const issuer = { id: 'iss-1', name: 'PT A' };
      const bond = { code: 'BOND01', issuer };
      const classes = ['A', 'B', 'C'].map((c) => ({ class: c, bond, issuer }));

      const data = await runData({ bond, classes });

      for (const c of data.classes) {
        expect(c.bond).toEqual({ code: 'BOND01', issuer: { id: 'iss-1', name: 'PT A' } });
        expect(c.issuer).toEqual({ id: 'iss-1', name: 'PT A' });
      }
    });

    it('keeps a deep (300-level) non-circular hierarchy intact', async () => {
      let deep: any = { leaf: true };
      for (let i = 0; i < 300; i++) deep = { id: i, child: deep };

      expect(await runData(deep)).toEqual(JSON.parse(JSON.stringify(deep)));
    });
  });

  describe('existing serialization behaviour (regression)', () => {
    it('serializes nested objects and arrays unchanged', async () => {
      const data = { a: 1, b: { c: [1, 2, { d: 'x' }], e: { f: { g: true } } } };
      expect(await runData(data)).toEqual(data);
    });

    it('returns a deep copy and never mutates the handler result', async () => {
      const inner = { v: 1 };
      const data = { inner, list: [inner] };

      const result = await runData(data);

      expect(result).not.toBe(data);
      expect(result.inner).not.toBe(inner);
      expect(data).toEqual({ inner: { v: 1 }, list: [{ v: 1 }] });
    });

    it('serializes Dates to ISO strings (JSON round-trip)', async () => {
      const d = new Date('2026-09-29T00:00:00.000Z');
      const result = await runData({ at: d, again: d });

      expect(result).toEqual({
        at: '2026-09-29T00:00:00.000Z',
        again: '2026-09-29T00:00:00.000Z',
      });
    });

    it('honours toJSON() on class instances', async () => {
      class Money {
        constructor(private readonly amount: number) {}
        toJSON() {
          return { amount: this.amount, currency: 'IDR' };
        }
      }
      const m = new Money(1000);
      const result = await runData({ price: m, total: m });

      expect(result).toEqual({
        price: { amount: 1000, currency: 'IDR' },
        total: { amount: 1000, currency: 'IDR' },
      });
    });

    it('drops undefined and function properties, keeps null', async () => {
      const result = await runData({ a: undefined, b: null, c: () => 1, d: 0 });

      expect(result).toEqual({ b: null, d: 0 });
      expect('a' in result).toBe(false);
    });

    it.each([
      ['string', 'hello'],
      ['number', 42],
      ['zero', 0],
      ['boolean true', true],
      ['boolean false', false],
      ['empty string', ''],
    ])('passes %s payloads through unchanged', async (_label, value) => {
      expect(await runData(value)).toBe(value);
    });

    it('passes null and undefined payloads through', async () => {
      expect(await runData(null)).toBeNull();
      expect(await runData(undefined)).toBeUndefined();
    });

    it('serializes empty objects and arrays', async () => {
      expect(await runData({})).toEqual({});
      expect(await runData([])).toEqual([]);
    });

    it('serializes BigInt fields to strings instead of throwing or returning raw data', async () => {
      const data = { big: BigInt(1) };
      const result = await runData(data);

      expect(result).not.toBe(data);
      expect(result).toEqual({ big: '1' });
    });

    it('wraps the payload in the standard envelope', async () => {
      const res = await run({ id: 1, message: 'Created' });

      expect(res).toEqual({
        code: 200,
        status: 'success',
        message: 'Created',
        data: { id: 1, message: 'Created' },
        meta: undefined,
      });
    });

    it('does not transform /metrics', async () => {
      const text = '# HELP x\nx 1';
      expect(await run(text, '/metrics')).toBe(text);
    });
  });

  describe('oversized strings', () => {
    it('truncates a single huge string nested in a response, instead of passing it through whole', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const hugeBlob = 'a'.repeat(2_000_000);
      const result = await runData({ id: 1, blob: hugeBlob });

      expect(result.id).toBe(1);
      expect(result.blob).toBe('[TruncatedString:originalLength=2000000]');
      expect(result.blob.length).toBeLessThan(100);
      expect(warn).toHaveBeenCalledTimes(0); // maxStringLength truncation is silent per-field, not a budget warning
      warn.mockRestore();
    });

    it('leaves a normal-sized string field unchanged', async () => {
      const result = await runData({ id: 1, name: 'Budi Santoso' });
      expect(result).toEqual({ id: 1, name: 'Budi Santoso' });
    });

    it('truncates a bare top-level huge string payload and logs a warning', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const hugeBlob = 'b'.repeat(2_000_000);
      const res = await run(hugeBlob);

      expect(res.data).toBe('[TruncatedString:originalLength=2000000]');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('/items');
      warn.mockRestore();
    });

    it('leaves a short top-level string payload unchanged (regression)', async () => {
      expect(await runData('hello')).toBe('hello');
    });
  });
});
