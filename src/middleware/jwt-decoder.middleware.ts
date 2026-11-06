import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtDecoderMiddleware implements NestMiddleware {
    private readonly logger = new Logger(JwtDecoderMiddleware.name);

    constructor(private readonly jwtService: JwtService) { }

    async use(req: Request, res: Response, next: NextFunction) {
        // Silent Bug Fix: Handle multiple authorization headers (array)
        const rawAuthHeader = req.headers['authorization'];
        const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                // Security Fix: Use verifyAsync instead of decode to validate signature
                const decoded: any = await this.jwtService.verifyAsync(token).catch(() => null);
                
                if (decoded && typeof decoded === 'object') {
                    // Hydrate NestJS request user object
                    req['user'] = decoded;

                    // Propagate identity to headers for downstream Go services
                    const userId = decoded.id || decoded.sub;
                    if (userId) {
                        req.headers['x-user-id'] = userId.toString();
                        // Enrich Logger context with user identity
                        req['pino-http']?.logger.assign({ user_id: userId, email: decoded.email });
                    }
                    if (decoded.email) req.headers['x-user-email'] = decoded.email;
                    // Fix: identity service produces "roles" (array), not "role" (singular)
                    const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
                    if (roles.length > 0) {
                        req.headers['x-user-role'] = Array.isArray(roles)
                            ? roles.join(',')
                            : roles;
                    }
                }
            } catch (error) {
                // Silent Bug Fix: Truncate massive error messages to prevent log bloat
                const errorMessage = error.message;
                const truncatedMessage = Array.isArray(errorMessage) 
                    ? errorMessage.join(', ').substring(0, 1000) 
                    : (errorMessage?.toString() || '').substring(0, 1000);
                this.logger.warn(`Failed to decode token: ${truncatedMessage}`);
            }
        }
        next();
    }
}
