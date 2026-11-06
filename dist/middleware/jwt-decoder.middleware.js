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
var JwtDecoderMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtDecoderMiddleware = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
let JwtDecoderMiddleware = JwtDecoderMiddleware_1 = class JwtDecoderMiddleware {
    constructor(jwtService) {
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(JwtDecoderMiddleware_1.name);
    }
    async use(req, res, next) {
        const rawAuthHeader = req.headers['authorization'];
        const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const decoded = await this.jwtService.verifyAsync(token).catch(() => null);
                if (decoded && typeof decoded === 'object') {
                    req['user'] = decoded;
                    const userId = decoded.id || decoded.sub;
                    if (userId) {
                        req.headers['x-user-id'] = userId.toString();
                        req['pino-http']?.logger.assign({ user_id: userId, email: decoded.email });
                    }
                    if (decoded.email)
                        req.headers['x-user-email'] = decoded.email;
                    const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
                    if (roles.length > 0) {
                        req.headers['x-user-role'] = Array.isArray(roles)
                            ? roles.join(',')
                            : roles;
                    }
                }
            }
            catch (error) {
                const errorMessage = error.message;
                const truncatedMessage = Array.isArray(errorMessage)
                    ? errorMessage.join(', ').substring(0, 1000)
                    : (errorMessage?.toString() || '').substring(0, 1000);
                this.logger.warn(`Failed to decode token: ${truncatedMessage}`);
            }
        }
        next();
    }
};
exports.JwtDecoderMiddleware = JwtDecoderMiddleware;
exports.JwtDecoderMiddleware = JwtDecoderMiddleware = JwtDecoderMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], JwtDecoderMiddleware);
//# sourceMappingURL=jwt-decoder.middleware.js.map