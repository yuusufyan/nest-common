import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';

function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('allows requests whose token was verified by JwtDecoderMiddleware', () => {
    expect(guard.canActivate(contextWithUser({ sub: 'user-1' }))).toBe(true);
  });

  it.each([
    ['no token / invalid token (req.user unset)', undefined],
    ['null user', null],
  ])('rejects with 401 on %s', (_label, user) => {
    expect(() => guard.canActivate(contextWithUser(user))).toThrow(UnauthorizedException);
  });
});
