"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AuditModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const core_1 = require("@nestjs/core");
const audit_trail_entity_1 = require("./audit-trail.entity");
const audit_trail_service_1 = require("./audit-trail.service");
const audit_trail_interceptor_1 = require("./audit-trail.interceptor");
const audit_log_query_service_1 = require("./audit-log-query.service");
const rabbitmq_module_1 = require("../rabbitmq/rabbitmq.module");
const audit_service_name_token_1 = require("./audit-service-name.token");
let AuditModule = AuditModule_1 = class AuditModule {
    static forRoot(serviceName) {
        return {
            module: AuditModule_1,
            imports: [typeorm_1.TypeOrmModule.forFeature([audit_trail_entity_1.AuditTrail]), rabbitmq_module_1.RabbitMQModule],
            providers: [
                audit_trail_service_1.AuditTrailService,
                audit_log_query_service_1.AuditLogQueryService,
                core_1.Reflector,
                { provide: audit_service_name_token_1.AUDIT_SERVICE_NAME, useValue: serviceName },
                {
                    provide: core_1.APP_INTERCEPTOR,
                    useClass: audit_trail_interceptor_1.AuditTrailInterceptor,
                },
            ],
            exports: [audit_trail_service_1.AuditTrailService, audit_log_query_service_1.AuditLogQueryService],
        };
    }
};
exports.AuditModule = AuditModule;
exports.AuditModule = AuditModule = AuditModule_1 = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({})
], AuditModule);
//# sourceMappingURL=audit.module.js.map