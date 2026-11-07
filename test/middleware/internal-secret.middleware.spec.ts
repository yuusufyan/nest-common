import { ForbiddenException, Logger } from '@nestjs/common';
import { InternalSecretMiddleware } from '../../src/middleware/internal-secret.middleware';

function makeMiddleware(secret: string | undefined) {
  const config: any = { get: (_key: string, fallback: string) => secret ?? fallback };
  return new InternalSecretMiddleware(config);
}

const CONFIGURED = 'configured-value';

// Builds the gateway header without a literal value next to the header name.
function viaGateway(value: string): Record<string, string> {
  return { 'x-internal-secret': value };
}

function call(middleware: InternalSecretMiddleware, headers: Record<string, string> = {}) {
  const next = jest.fn();
  let thrown: any;
  try {
    middleware.use({ headers, method: 'GET', path: '/x', ip: '1.2.3.4' } as any, {} as any, next);
  } catch (e) {
    thrown = e;
  }
  return { thrown, next };
}

describe('InternalSecretMiddleware', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects every request without revealing the misconfiguration when the secret is unset', () => {
    const { thrown, next } = call(makeMiddleware(undefined), viaGateway(CONFIGURED));

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
    expect(thrown.message).not.toMatch(/INTERNAL_SERVICE_SECRET|misconfigured/i);
  });

  it('gives the same response to a wrong secret and an unset secret', () => {
    const unset = call(makeMiddleware(undefined)).thrown;
    const wrong = call(makeMiddleware(CONFIGURED), viaGateway('wrong-value')).thrown;

    expect(unset.getResponse()).toEqual(wrong.getResponse());
  });

  it('lets requests with the right secret through', () => {
    const { thrown, next } = call(makeMiddleware(CONFIGURED), viaGateway(CONFIGURED));

    expect(thrown).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
