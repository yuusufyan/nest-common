import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
export declare class JwtDecoderMiddleware implements NestMiddleware {
    private readonly jwtService;
    private readonly logger;
    constructor(jwtService: JwtService);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
}
