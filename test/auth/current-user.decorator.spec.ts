import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from '../../src/auth/current-user.decorator';

// Pulls the factory Nest would call at runtime out of the decorator metadata.
function resolve(data: string | undefined, user: unknown): unknown {
  class Controller {
    handler(@CurrentUser(data as any) _user: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Controller, 'handler');
  const { factory } = args[Object.keys(args)[0]];
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return factory(data, ctx);
}

describe('CurrentUser', () => {
  const user = { sub: 'user-1', email: 'a@example.com', roles: ['admin'] };

  it('returns the verified JWT payload', () => {
    expect(resolve(undefined, user)).toEqual(user);
  });

  it('returns a single claim when given a key', () => {
    expect(resolve('email', user)).toBe('a@example.com');
  });

  it('returns undefined when there is no authenticated user', () => {
    expect(resolve(undefined, undefined)).toBeUndefined();
    expect(resolve('email', undefined)).toBeUndefined();
  });
});
