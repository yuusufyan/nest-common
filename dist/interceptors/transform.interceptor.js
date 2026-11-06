"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TransformInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransformInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const safe_json_1 = require("../shared/safe-json");
const SAFE_DATA_MAX_NODES = 500_000;
const SAFE_DATA_MAX_STRING_LENGTH = 1_000_000;
let TransformInterceptor = TransformInterceptor_1 = class TransformInterceptor {
    constructor() {
        this.logger = new common_1.Logger(TransformInterceptor_1.name);
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        if (request?.path === '/metrics') {
            return next.handle();
        }
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode || common_1.HttpStatus.OK;
        return next.handle().pipe((0, operators_1.map)((data) => {
            let meta;
            let payload = data;
            let message = data?.message || 'Request successful';
            if (data && typeof data === 'object') {
                if ('code' in data &&
                    'status' in data &&
                    'message' in data &&
                    (data.status === 'success' || data.status === 'error')) {
                    payload = data.data;
                    if ('total' in data) {
                        const total = data.total;
                        const limit = data.limit || 10;
                        const page = data.page || 1;
                        meta = {
                            total: total,
                            page: page,
                            limit: limit,
                            total_pages: Math.ceil(total / limit),
                            total_results: total,
                        };
                    }
                }
                else if ('meta' in data && 'data' in data && data.meta && 'total' in data.meta) {
                    const total = data.meta.total;
                    const limit = data.meta.limit || data.meta.per_page || 10;
                    const page = data.meta.page || 1;
                    meta = {
                        total: total,
                        page: page,
                        limit: limit,
                        total_pages: data.meta.last_page || Math.ceil(total / limit),
                        total_results: total,
                    };
                    payload = data.data;
                }
                else if ('total' in data && 'data' in data) {
                    const total = data.total;
                    const limit = data.limit || 10;
                    const page = data.page || 1;
                    meta = {
                        total: total,
                        page: page,
                        limit: limit,
                        total_pages: Math.ceil(total / limit),
                        total_results: total,
                    };
                    payload = data.data;
                }
                else if ('recordsTotal' in data && 'data' in data) {
                    const total = data.recordsTotal;
                    const limit = 10;
                    const page = 1;
                    meta = {
                        total: total,
                        page: page,
                        limit: limit,
                        total_pages: Math.ceil(total / limit),
                        total_results: total,
                    };
                    payload = data.data;
                }
                else if ('success' in data && 'data' in data) {
                    payload = data.data;
                }
            }
            return {
                code: statusCode,
                status: 'success',
                message: message,
                data: this.safeData(payload, request?.path),
                meta: meta,
            };
        }));
    }
    safeData(data, path) {
        if (typeof data === 'string' && data.length > SAFE_DATA_MAX_STRING_LENGTH) {
            this.logger.warn(`Response for ${path ?? 'unknown route'} was a ${data.length}-char string exceeding the ${SAFE_DATA_MAX_STRING_LENGTH}-char field limit; truncated`);
            return (0, safe_json_1.stringTruncatedMarker)(data.length);
        }
        if (!data || typeof data !== 'object')
            return data;
        const baseOptions = {
            maxNodes: SAFE_DATA_MAX_NODES,
            maxStringLength: SAFE_DATA_MAX_STRING_LENGTH,
            bigint: 'string',
        };
        try {
            return (0, safe_json_1.toSafeJson)(data, baseOptions);
        }
        catch (e) {
            if (e instanceof safe_json_1.SafeJsonLimitError) {
                this.logger.warn(`Response for ${path ?? 'unknown route'} exceeded ${SAFE_DATA_MAX_NODES} objects when serialized; repeated references were replaced with '[Circular]'`);
            }
            else {
                this.logger.warn(`Response for ${path ?? 'unknown route'} threw an unexpected error during safe serialization (${e?.name ?? 'Error'}: ${e?.message ?? e}); falling back to the legacy dedupe/truncate serializer`);
            }
            try {
                return (0, safe_json_1.toSafeJson)(data, {
                    ...baseOptions,
                    dedupeRepeated: true,
                    onNodeLimit: 'truncate',
                });
            }
            catch (e2) {
                this.logger.error(`Response for ${path ?? 'unknown route'} could not be safely serialized even by the fallback serializer (${e2?.message ?? e2}); replaced with a placeholder`);
                return safe_json_1.TRUNCATED_MARKER;
            }
        }
    }
};
exports.TransformInterceptor = TransformInterceptor;
exports.TransformInterceptor = TransformInterceptor = TransformInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], TransformInterceptor);
//# sourceMappingURL=transform.interceptor.js.map