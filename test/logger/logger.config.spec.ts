jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

import pino from 'pino';
import { getPinoConfig } from '../../src/logger/logger.config';

// Exercises the REAL pino redact engine (not a mock) against the paths
// produced by getPinoConfig, bypassing pino-http/transport (which spawns a
// worker thread for pino-pretty and would make this test slow/flaky) --
// only `redact` is under test here.
function loggerWithCapture() {
  const lines: any[] = [];
  const destination = {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  };
  const config: any = getPinoConfig('test-service');
  const logger = pino({ redact: config.pinoHttp.redact }, destination as any);
  return { logger, lines };
}

describe('getPinoConfig redact', () => {
  it('redacts a top-level password key in a real logger.info() call', () => {
    // This is the exact probe that previously proved the redaction config
    // was a complete no-op: the old paths were all invalid '**.*word' glob
    // syntax (fast-redact/@pinojs/redact silently treat that as matching
    // nothing), so `password` reached the log in plaintext.
    const { logger, lines } = loggerWithCapture();
    logger.info({ password: 'plaintext-secret', username: 'budi' });

    expect(lines[0].password).toBe('[REDACTED]');
    expect(lines[0].username).toBe('budi');
  });

  it('redacts a password nested a few levels deep', () => {
    const { logger, lines } = loggerWithCapture();
    logger.info({ user: { auth: { password: 'plaintext-secret' } } });

    expect(lines[0].user.auth.password).toBe('[REDACTED]');
  });

  it('redacts PII fields (email, nik, account_number) at the top level', () => {
    const { logger, lines } = loggerWithCapture();
    logger.info({ email: 'user@example.com', nik: '3201010101010001', account_number: '1234567890' });

    expect(lines[0].email).toBe('[REDACTED]');
    expect(lines[0].nik).toBe('[REDACTED]');
    expect(lines[0].account_number).toBe('[REDACTED]');
  });

  it('redacts account_no/accountNo -- kept in sync with audit-trail.interceptor.ts\'s word-pair masking', () => {
    const { logger, lines } = loggerWithCapture();
    logger.info({ account_no: '1234567890', accountNo: '9876543210' });

    expect(lines[0].account_no).toBe('[REDACTED]');
    expect(lines[0].accountNo).toBe('[REDACTED]');
  });

  it('redacts req.headers.authorization and cookie for pino-http-shaped logs', () => {
    const { logger, lines } = loggerWithCapture();
    logger.info({
      req: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' } },
    });

    expect(lines[0].req.headers.authorization).toBe('[REDACTED]');
    expect(lines[0].req.headers.cookie).toBe('[REDACTED]');
  });

  it('does not redact unrelated fields', () => {
    const { logger, lines } = loggerWithCapture();
    logger.info({ message: 'hello', orderId: 123 });

    expect(lines[0].message).toBe('hello');
    expect(lines[0].orderId).toBe(123);
  });
});
