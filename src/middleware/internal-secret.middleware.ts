import {
    Injectable,
    NestMiddleware,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

/**
 * InternalSecretMiddleware
 *
 * Guards NestJS service endpoints from direct access that bypasses the API
 * gateway. The gateway injects `X-Internal-Secret` on every downstream request.
 * Services that should only be called internally should apply this middleware.
 *
 * Usage in AppModule:
 *   consumer
 *     .apply(InternalSecretMiddleware)
 *     .exclude({ path: 'health', method: RequestMethod.GET })
 *     .forRoutes({ path: '*', method: RequestMethod.ALL });
 *
 * Required ENV: INTERNAL_SERVICE_SECRET (must match the gateway's INTERNAL_SERVICE_SECRET)
 *
 * Fails CLOSED when INTERNAL_SERVICE_SECRET is unset: every request is rejected
 * with 403 rather than silently letting all traffic through. A misconfigured
 * service should be loud and broken, not quietly unprotected.
 */
@Injectable()
export class InternalSecretMiddleware implements NestMiddleware {
    private readonly logger = new Logger(InternalSecretMiddleware.name);
    private readonly expectedSecret: string;

    constructor(private readonly configService: ConfigService) {
        this.expectedSecret = this.configService.get<string>('INTERNAL_SERVICE_SECRET', '');
        if (!this.expectedSecret) {
            this.logger.error('[InternalSecretMiddleware] INTERNAL_SERVICE_SECRET is not set — all requests will be rejected until it is configured to match the gateway.');
        }
    }

    use(req: Request, res: Response, next: NextFunction) {
        if (!this.expectedSecret) {
            throw new ForbiddenException('Service misconfigured: INTERNAL_SERVICE_SECRET is not set.');
        }

        const incomingSecret = req.headers['x-internal-secret'] as string;

        if (!incomingSecret || incomingSecret !== this.expectedSecret) {
            this.logger.warn(
                `[InternalSecretMiddleware] Blocked direct access attempt: ${req.method} ${req.path} from ${req.ip}`,
            );
            throw new ForbiddenException('Direct access to this service is not allowed. Route through the API gateway.');
        }

        next();
    }
}
