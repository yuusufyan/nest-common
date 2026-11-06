import { AuditAction } from './audit-trail.entity';
export declare class GetAuditLogDto {
    page: number;
    limit: number;
    user_id?: string;
    username?: string;
    table_name?: string;
    action?: AuditAction;
    from?: string;
    to?: string;
    search?: string;
}
