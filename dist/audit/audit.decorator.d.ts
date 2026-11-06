import { AuditAction } from './audit-trail.entity';
export interface AuditOptions {
    tableName: string;
    action: AuditAction;
    description?: string;
}
export declare const AUDIT_METADATA_KEY = "audit_metadata";
export declare const Audit: (options: AuditOptions) => import("@nestjs/common").CustomDecorator<string>;
