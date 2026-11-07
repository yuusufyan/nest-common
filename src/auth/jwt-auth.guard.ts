import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * JwtAuthGuard
 *
 * Rejects requests that do not carry a verified JWT. JwtDecoderMiddleware
 * only decodes the token and always calls next(), so on its own a missing or
 * invalid token simply leaves `req.user` unset; this guard turns that into a
 * 401 for the routes that require a logged-in user.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard)
 *   @Get('profile')
 *   getProfile(@CurrentUser() user) { ... }
 *
 * Requires JwtDecoderMiddleware to run on the same routes; without it every
 * request is rejected.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required.');
    }
    return true;
  }
}
