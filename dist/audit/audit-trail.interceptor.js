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
exports.AuditTrailInterceptor = exports.MAX_MASK_DEPTH_MARKER = void 0;
exports.isBinaryLike = isBinaryLike;
exports.maskAuditValue = maskAuditValue;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const core_1 = require("@nestjs/core");
const audit_decorator_1 = require("./audit.decorator");
const audit_trail_service_1 = require("./audit-trail.service");
const SENSITIVE_WORDS = new Set([
    'password',
    'passwd',
    'pwd',
    'pass',
    'secret',
    'token',
    'credential',
    'credentials',
]);
const PII_WORDS = new Set([
    'email',
    'phone',
    'hp',
    'telp',
    'nik',
    'npwp',
    'rekening',
    'alamat',
]);
const ACCOUNT_WORDS = new Set(['account']);
const NUMBER_WORDS = new Set(['no', 'num', 'number']);
function hasSensitiveWordPair(words) {
    const hasAccountWord = words.some((w) => ACCOUNT_WORDS.has(w));
    const hasNumberWord = words.some((w) => NUMBER_WORDS.has(w));
    return hasAccountWord && hasNumberWord;
}
const MAX_MASK_DEPTH = 20;
exports.MAX_MASK_DEPTH_MARKER = '[REDACTED - MAX DEPTH]';
function toWords(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}
function isSensitiveKey(key) {
    const words = toWords(key);
    if (hasSensitiveWordPair(words))
        return true;
    return words.some((w) => SENSITIVE_WORDS.has(w) || PII_WORDS.has(w));
}
function isBinaryLike(value) {
    return (Buffer.isBuffer(value) ||
        ArrayBuffer.isView(value) ||
        value instanceof ArrayBuffer ||
        (!!value &&
            typeof value === 'object' &&
            typeof value.pipe === 'function'));
}
function maskAuditValue(value, depth = 0) {
    if (isBinaryLike(value)) {
        return '[BINARY DATA - NOT LOGGED]';
    }
    if (depth >= MAX_MASK_DEPTH)
        return exports.MAX_MASK_DEPTH_MARKER;
    if (Array.isArray(value)) {
        return value.map((item) => maskAuditValue(item, depth + 1));
    }
    if (value instanceof Date)
        return value;
    if (value && typeof value === 'object') {
        const masked = {};
        for (const key of Object.keys(value)) {
            masked[key] = isSensitiveKey(key)
                ? '********'
                : maskAuditValue(value[key], depth + 1);
        }
        return masked;
    }
    return value;
}
let AuditTrailInterceptor = class AuditTrailInterceptor {
    constructor(reflector, auditTrailService) {
        this.reflector = reflector;
        this.auditTrailService = auditTrailService;
    }
    intercept(context, next) {
        const auditOptions = this.reflector.get(audit_decorator_1.AUDIT_METADATA_KEY, context.getHandler());
        if (!auditOptions) {
            return next.handle();
        }
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        return next.handle().pipe((0, operators_1.tap)(async (data) => {
            const response = context.switchToHttp().getResponse();
            const status = response?.statusCode >= 400 ? 'FAILED' : 'SUCCESS';
            await this.logAudit(user, request, auditOptions, data, status);
        }), (0, operators_1.catchError)((err) => {
            this.logAudit(user, request, auditOptions, err, 'FAILED').catch(e => console.error(e));
            return (0, rxjs_1.throwError)(() => err);
        }));
    }
    extractRecordId(request, data, status) {
        const paramValues = Object.values(request.params || {});
        if (paramValues.length > 0) {
            const last = paramValues[paramValues.length - 1];
            if (typeof last === 'string' || typeof last === 'number') {
                return String(last);
            }
        }
        if (status === 'SUCCESS' && data && typeof data === 'object') {
            const entity = 'data' in data ? data.data : data;
            if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
                const id = entity.id;
                if (typeof id === 'string' || typeof id === 'number') {
                    return String(id);
                }
            }
        }
        return undefined;
    }
    async logAudit(user, request, options, data, status) {
        try {
            const recordId = this.extractRecordId(request, data, status);
            const isWriteOp = ['POST', 'PUT', 'PATCH'].includes(request.method);
            let auditData = isWriteOp ? request.body : data;
            auditData = maskAuditValue(auditData);
            await this.auditTrailService.log({
                user_id: user?.id,
                username: user?.username || user?.email,
                table_name: options.tableName.toLowerCase(),
                record_id: recordId,
                action: options.action,
                description: `[${status}] ${options.description || ''}`,
                ip_address: request.ip,
                user_agent: request.headers['user-agent'],
                new_values: auditData,
            });
        }
        catch (error) {
            console.error('Failed to save audit trail:', error);
        }
    }
};
exports.AuditTrailInterceptor = AuditTrailInterceptor;
exports.AuditTrailInterceptor = AuditTrailInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        audit_trail_service_1.AuditTrailService])
], AuditTrailInterceptor);
//# sourceMappingURL=audit-trail.interceptor.js.map