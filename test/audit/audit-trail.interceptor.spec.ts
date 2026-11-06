jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import { Readable } from 'stream';
import { of, throwError, lastValueFrom } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import {
  AuditTrailInterceptor,
  isBinaryLike,
  maskAuditValue,
} from '../../src/audit/audit-trail.interceptor';
import { AuditAction } from '../../src/audit/audit-trail.entity';

function makeContext(opts: {
  method?: string;
  path?: string;
  params?: Record<string, unknown>;
  statusCode?: number;
  body?: unknown;
  user?: unknown;
}): { context: ExecutionContext; request: any; response: any } {
  const request: any = {
    method: opts.method || 'POST',
    path: opts.path || '/items',
    params: opts.params || {},
    body: opts.body,
    user: opts.user,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  };
  const response: any = { statusCode: opts.statusCode ?? 200 };
  const context = {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

function handlerReturning(data: unknown): CallHandler {
  return { handle: () => of(data) };
}

function handlerThrowing(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) };
}

function makeInterceptor(auditOptions: any) {
  const reflector = { get: jest.fn(() => auditOptions) };
  const auditTrailService = { log: jest.fn(async (row: any) => ({ id: 'audit-1', ...row })) };
  const interceptor = new AuditTrailInterceptor(reflector as any, auditTrailService as any);
  return { interceptor, reflector, auditTrailService };
}

const AUDIT_OPTIONS = { tableName: 'Widgets', action: AuditAction.CREATE, description: 'test' };

describe('maskAuditValue / isBinaryLike', () => {
  it('masks a sensitive key nested several levels deep', () => {
    const input = { profile: { security: { password: 'plaintext' }, name: 'ok' } };
    expect(maskAuditValue(input)).toEqual({
      profile: { security: { password: '********' }, name: 'ok' },
    });
  });

  it('masks each element of an array body without corrupting array shape', () => {
    const input = [{ name: 'a', password: 'x' }, { token: 'y' }];
    const result = maskAuditValue(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ name: 'a', password: '********' }, { token: '********' }]);
  });

  it('recognizes a Buffer nested inside an object before it would be spread', () => {
    const buf = Buffer.from('%PDF-1.4 fake pdf bytes');
    const input = { file: buf, name: 'report.pdf' };
    const result = maskAuditValue(input);
    expect(result).toEqual({ file: '[BINARY DATA - NOT LOGGED]', name: 'report.pdf' });
    // Must not have been byte-spread into an index-keyed object.
    expect(typeof result.file).toBe('string');
  });

  it('recognizes a Readable stream value as binary', () => {
    const stream = new Readable({ read() {} });
    expect(isBinaryLike(stream)).toBe(true);
    expect(maskAuditValue({ download: stream })).toEqual({
      download: '[BINARY DATA - NOT LOGGED]',
    });
  });

  it('masks PII fields (email, nik) using the shared field-naming convention', () => {
    const input = { email: 'user@example.com', nik: '3201010101010001', name: 'Budi' };
    expect(maskAuditValue(input)).toEqual({
      email: '********',
      nik: '********',
      name: 'Budi',
    });
  });

  it('masks account_number as a compound PII key', () => {
    expect(maskAuditValue({ account_number: '1234567890' })).toEqual({
      account_number: '********',
    });
  });

  it('masks account_no and accountNo (real @Audit-decorated column names)', () => {
    expect(maskAuditValue({ account_no: '1234567890' })).toEqual({
      account_no: '********',
    });
    expect(maskAuditValue({ accountNo: '1234567890' })).toEqual({
      accountNo: '********',
    });
  });

  it('does NOT mask false-positive-prone field names (passport_no, compass_heading, account_id, account_holder_name)', () => {
    const input = {
      passport_no: 'X1234567',
      compass_heading: 270,
      account_id: 'uuid-1',
      account_status: 'ACTIVE',
      account_holder_name: 'Budi',
    };
    expect(maskAuditValue(input)).toEqual(input);
  });

  it('still masks realistic camelCase password/token variants', () => {
    const input = {
      newPassword: 'a',
      confirmPassword: 'b',
      refreshToken: 'c',
      apiSecret: 'd',
    };
    expect(maskAuditValue(input)).toEqual({
      newPassword: '********',
      confirmPassword: '********',
      refreshToken: '********',
      apiSecret: '********',
    });
  });

  it('bounds recursion depth AND redacts the whole subtree past the cap -- must not leak the sensitive leaf in plaintext', () => {
    // Regression test for a real bypass: the depth guard used to do
    // `return value` (fail OPEN) once MAX_MASK_DEPTH was hit, so a
    // sensitive key nested past the cap came out completely unmasked. A
    // test that only asserts `not.toThrow()` (the old version of this
    // test) would pass on that broken code just as well as on the fix --
    // it never actually looked at what came out. This test inspects the
    // real output.
    let deep: any = { password: 'leaf-secret' };
    for (let i = 0; i < 30; i++) deep = { child: deep };

    expect(() => maskAuditValue(deep)).not.toThrow();

    const result = maskAuditValue(deep);
    const serialized = JSON.stringify(result);

    // The actual secret value must not appear ANYWHERE in the output, in
    // any form -- not just "not thrown".
    expect(serialized).not.toContain('leaf-secret');
    expect(serialized).not.toContain('"password":"leaf-secret"');

    // The subtree at/past the cap must be a redacted marker, not the raw
    // nested object (which would itself still contain the plaintext key).
    let cursor = result;
    for (let i = 0; i < 20; i++) {
      expect(cursor).toHaveProperty('child');
      cursor = cursor.child;
    }
    expect(cursor).toBe('[REDACTED - MAX DEPTH]');
  });

  it('leaves Dates untouched', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(maskAuditValue({ createdAt: date })).toEqual({ createdAt: date });
  });
});

describe('AuditTrailInterceptor', () => {
  it('records SUCCESS and masks sensitive fields in the write body', async () => {
    const { interceptor, auditTrailService } = makeInterceptor(AUDIT_OPTIONS);
    const { context } = makeContext({
      method: 'POST',
      body: { name: 'ok', password: 'plaintext' },
    });

    await lastValueFrom(interceptor.intercept(context, handlerReturning({ id: 42 })));

    expect(auditTrailService.log).toHaveBeenCalledTimes(1);
    const row = auditTrailService.log.mock.calls[0][0];
    expect(row.description).toBe('[SUCCESS] test');
    expect(row.record_id).toBe('42');
    expect(row.new_values).toEqual({ name: 'ok', password: '********' });
  });

  it('records FAILED when the handler throws', async () => {
    const { interceptor, auditTrailService } = makeInterceptor(AUDIT_OPTIONS);
    const { context } = makeContext({ method: 'DELETE', params: { id: '7' } });

    await expect(
      lastValueFrom(interceptor.intercept(context, handlerThrowing(new Error('boom')))),
    ).rejects.toThrow('boom');

    // catchError's logAudit call is fire-and-forget -- flush microtasks.
    await new Promise((r) => setImmediate(r));

    expect(auditTrailService.log).toHaveBeenCalledTimes(1);
    const row = auditTrailService.log.mock.calls[0][0];
    expect(row.description).toBe('[FAILED] test');
    expect(row.record_id).toBe('7');
  });

  it('records FAILED (not SUCCESS) for a @Res()-style handler that calls res.status(400) without throwing', async () => {
    // Simulates a controller using @Res() that manually sends an error
    // response (e.g. liquidity-service's master-cash-flow.controller.ts
    // pattern) instead of throwing an HttpException. No exception is
    // thrown, so RxJS's `tap` (not `catchError`) is what runs -- this is
    // exactly the path that always hard-coded 'SUCCESS' before the fix.
    const { interceptor, auditTrailService } = makeInterceptor(AUDIT_OPTIONS);
    const { context, response } = makeContext({ method: 'POST', body: { name: 'bad-input' } });
    response.statusCode = 400; // set by the handler via res.status(400).json(...)

    await lastValueFrom(interceptor.intercept(context, handlerReturning(undefined)));

    expect(auditTrailService.log).toHaveBeenCalledTimes(1);
    const row = auditTrailService.log.mock.calls[0][0];
    expect(row.description).toBe('[FAILED] test');
  });

  it('still records SUCCESS for a normal 2xx response', async () => {
    const { interceptor, auditTrailService } = makeInterceptor(AUDIT_OPTIONS);
    const { context, response } = makeContext({ method: 'POST', body: { name: 'ok' } });
    response.statusCode = 201;

    await lastValueFrom(interceptor.intercept(context, handlerReturning({ id: 1 })));

    const row = auditTrailService.log.mock.calls[0][0];
    expect(row.description).toBe('[SUCCESS] test');
  });

  it('skips auditing entirely when no @Audit() metadata is present', async () => {
    const { interceptor, auditTrailService, reflector } = makeInterceptor(undefined);
    const { context } = makeContext({});

    const result = await lastValueFrom(interceptor.intercept(context, handlerReturning({ id: 1 })));

    expect(result).toEqual({ id: 1 });
    expect(auditTrailService.log).not.toHaveBeenCalled();
    expect(reflector.get).toHaveBeenCalled();
  });

  it('masks an array request body without corrupting its shape end-to-end', async () => {
    const { interceptor, auditTrailService } = makeInterceptor(AUDIT_OPTIONS);
    const { context } = makeContext({
      method: 'POST',
      body: [{ name: 'a', password: 'x' }, { name: 'b', token: 'y' }],
    });

    await lastValueFrom(interceptor.intercept(context, handlerReturning({ id: 1 })));

    const row = auditTrailService.log.mock.calls[0][0];
    expect(Array.isArray(row.new_values)).toBe(true);
    expect(row.new_values).toEqual([
      { name: 'a', password: '********' },
      { name: 'b', token: '********' },
    ]);
  });

  it('never throws out of intercept when auditTrailService.log itself rejects', async () => {
    const reflector = { get: jest.fn(() => AUDIT_OPTIONS) };
    const auditTrailService = { log: jest.fn(async () => { throw new Error('db down'); }) };
    const interceptor = new AuditTrailInterceptor(reflector as any, auditTrailService as any);
    const { context } = makeContext({ method: 'POST', body: { name: 'ok' } });

    const result = await lastValueFrom(interceptor.intercept(context, handlerReturning({ id: 1 })));
    expect(result).toEqual({ id: 1 });
  });
});
