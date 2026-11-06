import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
export declare class MetricsMiddleware implements NestMiddleware {
    private readonly serviceName;
    constructor(serviceName: string);
    use(req: Request, res: Response, next: NextFunction): void;
}
