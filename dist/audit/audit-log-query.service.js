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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogQueryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const audit_trail_entity_1 = require("./audit-trail.entity");
const DEFAULT_WINDOW_DAYS = 30;
let AuditLogQueryService = class AuditLogQueryService {
    constructor(repository) {
        this.repository = repository;
    }
    async findAll(query) {
        const { from, to } = this.resolveRange(query.from, query.to);
        const where = {
            created_at: (0, typeorm_2.Between)(from, to),
        };
        if (query.user_id)
            where.user_id = query.user_id;
        if (query.username)
            where.username = (0, typeorm_2.ILike)(`%${query.username}%`);
        if (query.table_name)
            where.table_name = query.table_name;
        if (query.action)
            where.action = query.action;
        if (query.search)
            where.description = (0, typeorm_2.ILike)(`%${query.search}%`);
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const [data, totalItems] = await this.repository.findAndCount({
            where,
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            data,
            totalItems,
            total: totalItems,
            page,
            perPage: limit,
            limit,
            totalPages: Math.max(1, Math.ceil(totalItems / limit)),
        };
    }
    async findTableNames() {
        const rows = await this.repository
            .createQueryBuilder('a')
            .select('DISTINCT a.table_name', 'table_name')
            .orderBy('a.table_name', 'ASC')
            .getRawMany();
        return rows.map((r) => r.table_name);
    }
    resolveRange(from, to) {
        const toDate = to ? new Date(to) : new Date();
        if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
            toDate.setUTCHours(23, 59, 59, 999);
        }
        const fromDate = from
            ? new Date(from)
            : new Date(toDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        return { from: fromDate, to: toDate };
    }
};
exports.AuditLogQueryService = AuditLogQueryService;
exports.AuditLogQueryService = AuditLogQueryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(audit_trail_entity_1.AuditTrail)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AuditLogQueryService);
//# sourceMappingURL=audit-log-query.service.js.map