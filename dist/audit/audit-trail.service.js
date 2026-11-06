"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuditTrailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditTrailService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_trail_entity_1 = require("./audit-trail.entity");
const rabbitmq_service_1 = require("../rabbitmq/rabbitmq.service");
const audit_service_name_token_1 = require("./audit-service-name.token");
const safe_json_1 = require("../shared/safe-json");
const AUDIT_EVENTS_QUEUE = 'audit.events';
const AUDIT_PAYLOAD_MAX_CHARS = 50000;
const PAYLOAD_TOO_LARGE = '[PAYLOAD TOO LARGE - REDACTED]';
let AuditTrailService = AuditTrailService_1 = class AuditTrailService {
    constructor(auditTrailRepository, rabbitMQService, serviceName) {
        this.auditTrailRepository = auditTrailRepository;
        this.rabbitMQService = rabbitMQService;
        this.serviceName = serviceName;
        this.logger = new common_1.Logger(AuditTrailService_1.name);
    }
    async log(data) {
        const stringifyWithLimit = (val) => {
            if (!val)
                return null;
            try {
                const str = JSON.stringify((0, safe_json_1.toSafeJson)(val, {
                    bigint: 'string',
                    maxNodes: AUDIT_PAYLOAD_MAX_CHARS / 2,
                    maxStringLength: AUDIT_PAYLOAD_MAX_CHARS,
                }));
                return str.length > AUDIT_PAYLOAD_MAX_CHARS ? PAYLOAD_TOO_LARGE : str;
            }
            catch (e) {
                if (e instanceof safe_json_1.SafeJsonLimitError)
                    return PAYLOAD_TOO_LARGE;
                return '[SERIALIZATION ERROR]';
            }
        };
        const audit = this.auditTrailRepository.create({
            ...data,
            old_values: stringifyWithLimit(data.old_values),
            new_values: stringifyWithLimit(data.new_values),
        });
        const saved = await this.auditTrailRepository.save(audit);
        if (this.rabbitMQService && this.serviceName) {
            void this.rabbitMQService
                .publish(AUDIT_EVENTS_QUEUE, { ...saved, service_name: this.serviceName })
                .catch((err) => this.logger.error(`Failed to publish audit event: ${err.message}`));
        }
        return saved;
    }
};
exports.AuditTrailService = AuditTrailService;
exports.AuditTrailService = AuditTrailService = AuditTrailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_trail_entity_1.AuditTrail)),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)(audit_service_name_token_1.AUDIT_SERVICE_NAME)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        rabbitmq_service_1.RabbitMQService, String])
], AuditTrailService);
//# sourceMappingURL=audit-trail.service.js.map