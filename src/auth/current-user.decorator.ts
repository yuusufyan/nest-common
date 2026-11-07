import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser
 *
 * Injects the JWT payload verified by JwtDecoderMiddleware (`req.user`), or a
 * single claim of it when a key is given. Resolves to undefined when the
 * request is not authenticated, so pair it with JwtAuthGuard on routes that
 * require a user.
 *
 * Usage:
 *   getProfile(@CurrentUser() user)
 *   getProfile(@CurrentUser('sub') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (key: string | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest().user;
    return key ? user?.[key] : user;
  },
);
