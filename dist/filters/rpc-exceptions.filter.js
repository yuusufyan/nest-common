"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AllRpcExceptionsFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllRpcExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const microservices_1 = require("@nestjs/microservices");
let AllRpcExceptionsFilter = AllRpcExceptionsFilter_1 = class AllRpcExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger(AllRpcExceptionsFilter_1.name);
    }
    catch(exception, host) {
        const error = exception instanceof microservices_1.RpcException ? exception.getError() : exception;
        const message = typeof error === 'object' ? error['message'] || exception.message : error || exception.message;
        this.logger.error(`gRPC Error: ${message}`, exception.stack);
        const rpcError = exception instanceof microservices_1.RpcException ? exception : new microservices_1.RpcException(error);
        return (0, rxjs_1.throwError)(() => rpcError.getError());
    }
};
exports.AllRpcExceptionsFilter = AllRpcExceptionsFilter;
exports.AllRpcExceptionsFilter = AllRpcExceptionsFilter = AllRpcExceptionsFilter_1 = __decorate([
    (0, common_1.Catch)()
], AllRpcExceptionsFilter);
//# sourceMappingURL=rpc-exceptions.filter.js.map