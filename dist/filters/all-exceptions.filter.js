"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
function exposesInternalErrors() {
    return ['development', 'test'].includes(process.env.NODE_ENV ?? '');
}
let AllExceptionsFilter = class AllExceptionsFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let details = null;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'object' && res !== null && 'message' in res) {
                message = Array.isArray(res.message) ? res.message.join(', ') : res.message;
                details = res.error || null;
            }
            else {
                message = typeof res === 'string' ? res : res.message || exception.message;
            }
        }
        else if (exception.name === 'QueryFailedError') {
            status = common_1.HttpStatus.BAD_REQUEST;
            message = 'Operation failed due to invalid data format or constraint violation.';
            details = exposesInternalErrors() ? exception.message : null;
        }
        else if (exception instanceof Error) {
            if (exposesInternalErrors())
                message = exception.message;
        }
        else if (typeof exception === 'string') {
            if (exposesInternalErrors())
                message = exception;
        }
        else {
            message = 'An unexpected error occurred';
        }
        if (status >= 500) {
            console.error(`[Exception] ${status} - ${message}`, exception);
        }
        const errorResponse = {
            code: status,
            status: 'error',
            message: Array.isArray(message)
                ? message.join(', ').substring(0, 1000)
                : (message?.toString() || '').substring(0, 1000),
            data: details,
        };
        response.status(status).json(errorResponse);
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map