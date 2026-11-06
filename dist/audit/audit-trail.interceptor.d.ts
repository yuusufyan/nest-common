import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuditTrailService } from './audit-trail.service';
export declare const MAX_MASK_DEPTH_MARKER = "[REDACTED - MAX DEPTH]";
export declare function isBinaryLike(value: unknown): boolean;
export declare function maskAuditValue(value: any, depth?: number): any;
export declare class AuditTrailInterceptor implements NestInterceptor {
    private reflector;
    private auditTrailService;
    constructor(reflector: Reflector, auditTrailService: AuditTrailService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
    private extractRecordId;
    private logAudit;
}
