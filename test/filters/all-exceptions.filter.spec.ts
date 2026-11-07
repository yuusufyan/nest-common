import {
  ArgumentsHost,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AllExceptionsFilter } from '../../src/filters/all-exceptions.filter';

const INTERNAL_HOST = '10.20.30.40:5432';

function connectionError(): Error {
  // Shape of a driver-level connection failure (not a TypeORM QueryFailedError).
  const err: any = new Error(`connect ECONNREFUSED ${INTERNAL_HOST}`);
  err.code = 'ECONNREFUSED';
  return err;
}

function queryFailedError(): Error {
  const err = new Error(`relation "users" does not exist (db at ${INTERNAL_HOST})`);
  err.name = 'QueryFailedError';
  return err;
}

function run(exception: unknown): { status: number; body: any } {
  const result: { status: number; body: any } = { status: 0, body: undefined };
  const response = {
    status(code: number) {
      result.status = code;
      return response;
    },
    json(body: any) {
      result.body = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return result;
}

describe('AllExceptionsFilter', () => {
  const originalEnv = process.env.NODE_ENV;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  describe.each([
    ['production', 'production'],
    ['NODE_ENV unset', undefined],
    ['an unrecognised NODE_ENV', 'staging'],
  ])('in %s', (_label, env) => {
    beforeEach(() => {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
    });

    it('does not expose raw error messages of unknown errors', () => {
      const { status, body } = run(connectionError());

      expect(status).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(body.data).toBeNull();
      expect(JSON.stringify(body)).not.toContain(INTERNAL_HOST);
    });

    it('does not expose thrown strings', () => {
      const { status, body } = run(`cannot reach ${INTERNAL_HOST}`);

      expect(status).toBe(500);
      expect(JSON.stringify(body)).not.toContain(INTERNAL_HOST);
    });

    it('does not expose QueryFailedError details', () => {
      const { status, body } = run(queryFailedError());

      expect(status).toBe(400);
      expect(body.data).toBeNull();
      expect(JSON.stringify(body)).not.toContain(INTERNAL_HOST);
    });

    it('still returns messages of HttpExceptions thrown on purpose', () => {
      const { status, body } = run(new NotFoundException('User not found'));

      expect(status).toBe(404);
      expect(body.message).toBe('User not found');
    });

    it.each([
      ['InternalServerErrorException', () => new InternalServerErrorException(`connect ECONNREFUSED ${INTERNAL_HOST}`)],
      ['ServiceUnavailableException', () => new ServiceUnavailableException(`redis at ${INTERNAL_HOST} is down`)],
    ])('does not expose messages of 5xx %s', (_name, make) => {
      const { status, body } = run(make());

      expect(status).toBeGreaterThanOrEqual(500);
      expect(body.message).toBe('Internal server error');
      expect(body.data).toBeNull();
      expect(JSON.stringify(body)).not.toContain(INTERNAL_HOST);
    });

    it('still logs the full error server-side', () => {
      const err = connectionError();
      run(err);

      expect(consoleError).toHaveBeenCalledWith(expect.any(String), err);
    });
  });

  describe.each(['development', 'test'])('in %s', (env) => {
    beforeEach(() => {
      process.env.NODE_ENV = env;
    });

    it('exposes raw error messages to ease debugging', () => {
      const { body } = run(connectionError());

      expect(body.message).toContain(INTERNAL_HOST);
    });

    it('exposes messages of 5xx HttpExceptions', () => {
      const { body } = run(new InternalServerErrorException(`connect ECONNREFUSED ${INTERNAL_HOST}`));

      expect(body.message).toContain(INTERNAL_HOST);
    });

    it('exposes QueryFailedError details', () => {
      const { body } = run(queryFailedError());

      expect(body.data).toContain(INTERNAL_HOST);
    });
  });
});
