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
exports.AuditTrail = exports.AuditAction = void 0;
const typeorm_1 = require("typeorm");
const uuid_1 = require("uuid");
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["VIEW"] = "VIEW";
    AuditAction["EXPORT"] = "EXPORT";
    AuditAction["IMPORT"] = "IMPORT";
    AuditAction["DOWNLOAD"] = "DOWNLOAD";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
let AuditTrail = class AuditTrail {
    generateId() {
        if (!this.id) {
            this.id = (0, uuid_1.v4)();
        }
    }
};
exports.AuditTrail = AuditTrail;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'varchar', length: 36 }),
    __metadata("design:type", String)
], AuditTrail.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.BeforeInsert)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuditTrail.prototype, "generateId", null);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 36, nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ length: 100 }),
    __metadata("design:type", String)
], AuditTrail.prototype, "table_name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "record_id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AuditAction,
    }),
    __metadata("design:type", String)
], AuditTrail.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "old_values", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "new_values", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 45, nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "ip_address", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "user_agent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], AuditTrail.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], AuditTrail.prototype, "created_at", void 0);
exports.AuditTrail = AuditTrail = __decorate([
    (0, typeorm_1.Entity)('audit_trail'),
    (0, typeorm_1.Index)(['user_id', 'created_at']),
    (0, typeorm_1.Index)(['table_name', 'record_id'])
], AuditTrail);
//# sourceMappingURL=audit-trail.entity.js.map