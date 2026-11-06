"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsMiddleware = void 0;
const common_1 = require("@nestjs/common");
const client = __importStar(require("prom-client"));
const metrics_constants_1 = require("./metrics.constants");
const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['service', 'method', 'path', 'status_code'],
});
const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'path', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
const httpRequestsInProgress = new client.Gauge({
    name: 'http_requests_in_progress_total',
    help: 'Number of HTTP requests currently in progress',
    labelNames: ['service', 'method'],
});
const SKIP_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);
let MetricsMiddleware = class MetricsMiddleware {
    constructor(serviceName) {
        this.serviceName = serviceName;
    }
    use(req, res, next) {
        if (SKIP_PATHS.has(req.path)) {
            return next();
        }
        const method = req.method;
        httpRequestsInProgress.inc({ service: this.serviceName, method });
        const startedAt = process.hrtime.bigint();
        res.on('finish', () => {
            httpRequestsInProgress.dec({ service: this.serviceName, method });
            const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
            const path = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.path;
            const labels = {
                service: this.serviceName,
                method,
                path,
                status_code: String(res.statusCode),
            };
            httpRequestsTotal.inc(labels);
            httpRequestDurationSeconds.observe(labels, durationSeconds);
        });
        next();
    }
};
exports.MetricsMiddleware = MetricsMiddleware;
exports.MetricsMiddleware = MetricsMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(metrics_constants_1.METRICS_SERVICE_NAME)),
    __metadata("design:paramtypes", [String])
], MetricsMiddleware);
//# sourceMappingURL=metrics.middleware.js.map