import { Repository } from 'typeorm';
import { AuditTrail, AuditAction } from './audit-trail.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
export declare class AuditTrailService {
    private auditTrailRepository;
    private readonly rabbitMQService?;
    private readonly serviceName?;
    private readonly logger;
    constructor(auditTrailRepository: Repository<AuditTrail>, rabbitMQService?: RabbitMQService, serviceName?: string);
    log(data: {
        user_id?: string;
        username?: string;
        table_name: string;
        record_id?: string;
        action: AuditAction;
        old_values?: any;
        new_values?: any;
        ip_address?: string;
        user_agent?: string;
        description?: string;
    }): Promise<AuditTrail>;
}
