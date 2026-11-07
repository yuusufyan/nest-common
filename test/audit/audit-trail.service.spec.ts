import { AuditAction } from '../../src/audit/audit-trail.entity';
import { AuditTrailService } from '../../src/audit/audit-trail.service';
import { stringTruncatedMarker } from '../../src/shared/safe-json';

function makeService() {
  const repo = {
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => ({ id: 'audit-1', ...row })),
  };
  const service = new AuditTrailService(repo as any);
  return { service, repo };
}

async function logNewValues(newValues: any): Promise<string | null> {
  const { service, repo } = makeService();
  await service.log({ table_name: 't', action: AuditAction.CREATE, new_values: newValues });
  return repo.create.mock.calls[0][0].new_values;
}

function diamond(levels: number): any {
  let node: any = { v: 0 };
  for (let i = 0; i < levels; i++) node = { left: node, right: node };
  return node;
}

describe('AuditTrailService.log serialization', () => {
  it('keeps an object shared between branches of the body', async () => {
    const idr = { code: 'IDR' };
    const stored = await logNewValues([{ id: 1, currency: idr }, { id: 2, currency: idr }]);

    expect(JSON.parse(stored)).toEqual([
      { id: 1, currency: { code: 'IDR' } },
      { id: 2, currency: { code: 'IDR' } },
    ]);
  });

  it('still marks a true circular reference', async () => {
    const a: any = { id: 1 };
    a.self = a;
    expect(JSON.parse(await logNewValues(a))).toEqual({ id: 1, self: '[Circular]' });
  });

  it('stringifies BigInt values', async () => {
    expect(JSON.parse(await logNewValues({ n: BigInt(42) }))).toEqual({ n: '42' });
  });

  it('redacts payloads over 50,000 chars (many moderate fields, none individually oversized)', async () => {
    // Each field is well under maxStringLength (50,000) so none gets
    // per-field truncated -- the payload is only oversized in aggregate
    // (60 x 1000-char strings), which is exactly the shape maxStringLength
    // does NOT catch and the downstream str.length check must still.
    const bulky = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`f${i}`, 'x'.repeat(1000)]),
    );
    expect(await logNewValues(bulky)).toBe('[PAYLOAD TOO LARGE - REDACTED]');
  });

  it('truncates a single oversized string field instead of full-redacting the record', async () => {
    // Verified behavior change from adding maxStringLength: a lone huge
    // field (a pasted document/base64 attachment) no longer costs an
    // O(string length) JSON.stringify just to be discarded wholesale --
    // it's truncated to a short marker first, preserving the rest of the
    // record and the field's original length instead of losing everything
    // to '[PAYLOAD TOO LARGE - REDACTED]'.
    const stored = await logNewValues({ id: 1, blob: 'x'.repeat(50_001) });
    expect(stored).not.toBe('[PAYLOAD TOO LARGE - REDACTED]');
    expect(JSON.parse(stored as string)).toEqual({
      id: 1,
      blob: stringTruncatedMarker(50_001),
    });
  });

  it('redacts an exploding diamond graph quickly instead of expanding it', async () => {
    const started = Date.now();
    expect(await logNewValues(diamond(30))).toBe('[PAYLOAD TOO LARGE - REDACTED]');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('stores null for empty values', async () => {
    const { service, repo } = makeService();
    await service.log({ table_name: 't', action: AuditAction.CREATE });
    expect(repo.create.mock.calls[0][0].new_values).toBeNull();
    expect(repo.create.mock.calls[0][0].old_values).toBeNull();
  });

  it('reports serialization errors instead of throwing', async () => {
    const bad = { toJSON: () => { throw new Error('boom'); } };
    expect(await logNewValues(bad)).toBe('[SERIALIZATION ERROR]');
  });
});
