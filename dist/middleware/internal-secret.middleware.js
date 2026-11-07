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
var InternalSecretMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalSecretMiddleware = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let InternalSecretMiddleware = InternalSecretMiddleware_1 = class InternalSecretMiddleware {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(InternalSecretMiddleware_1.name);
        this.expectedSecret = this.configService.get('INTERNAL_SERVICE_SECRET', '');
        if (!this.expectedSecret) {
            this.logger.error('[InternalSecretMiddleware] INTERNAL_SERVICE_SECRET is not set — all requests will be rejected until it is configured to match the gateway.');
        }
    }
    use(req, res, next) {
        if (!this.expectedSecret) {
            throw new common_1.ForbiddenException('Direct access to this service is not allowed. Route through the API gateway.');
        }
        const incomingSecret = req.headers['x-internal-secret'];
        if (!incomingSecret || incomingSecret !== this.expectedSecret) {
            this.logger.warn(`[InternalSecretMiddleware] Blocked direct access attempt: ${req.method} ${req.path} from ${req.ip}`);
            throw new common_1.ForbiddenException('Direct access to this service is not allowed. Route through the API gateway.');
        }
        next();
    }
};
exports.InternalSecretMiddleware = InternalSecretMiddleware;
exports.InternalSecretMiddleware = InternalSecretMiddleware = InternalSecretMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], InternalSecretMiddleware);
//# sourceMappingURL=internal-secret.middleware.js.map