import { Repository } from 'typeorm';
import { AuditTrail } from './audit-trail.entity';
import { GetAuditLogDto } from './audit-log-query.dto';
import { ResultTable } from '../shared/types';
export declare class AuditLogQueryService {
    private readonly repository;
    constructor(repository: Repository<AuditTrail>);
    findAll(query: GetAuditLogDto): Promise<ResultTable>;
    findTableNames(): Promise<string[]>;
    private resolveRange;
}
