import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
export declare class InternalSecretMiddleware implements NestMiddleware {
    private readonly configService;
    private readonly logger;
    private readonly expectedSecret;
    constructor(configService: ConfigService);
    use(req: Request, res: Response, next: NextFunction): void;
}
