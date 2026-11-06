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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetAuditLogDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const audit_trail_entity_1 = require("./audit-trail.entity");
class GetAuditLogDto {
    constructor() {
        this.page = 1;
        this.limit = 20;
    }
}
exports.GetAuditLogDto = GetAuditLogDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetAuditLogDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], GetAuditLogDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Filter to one actor by their user id (UUID).' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "user_id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Case-insensitive partial match on username/email as recorded at the time of the action.',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Exact match on the audited resource (the tableName each @Audit() call was given). See the table-names endpoint for the live list.',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "table_name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: audit_trail_entity_1.AuditAction }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(audit_trail_entity_1.AuditAction),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "action", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO 8601. Inclusive lower bound on created_at. Defaults to 30 days before "to".',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'ISO 8601. Inclusive upper bound on created_at (a date-only value is bumped to 23:59:59.999 of that day). Defaults to now.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Case-insensitive partial match against the free-text description field.',
    }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], GetAuditLogDto.prototype, "search", void 0);
//# sourceMappingURL=audit-log-query.dto.js.map