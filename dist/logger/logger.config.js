"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPinoConfig = void 0;
const uuid_1 = require("uuid");
const REDACT_KEY_NAMES = [
    'password',
    'newPassword',
    'oldPassword',
    'confirmPassword',
    'currentPassword',
    'passwd',
    'pwd',
    'secret',
    'apiSecret',
    'clientSecret',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'email',
    'phone',
    'phone_number',
    'nik',
    'npwp',
    'account_number',
    'account_no',
    'accountNo',
    'rekening',
    'no_rekening',
    'no_hp',
    'no_telp',
    'alamat',
];
const REDACT_MAX_DEPTH = 4;
function buildRedactPaths() {
    const paths = [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
    ];
    for (const key of REDACT_KEY_NAMES) {
        let prefix = '';
        for (let depth = 0; depth <= REDACT_MAX_DEPTH; depth++) {
            paths.push(prefix + key);
            prefix += '*.';
        }
    }
    return paths;
}
const getPinoConfig = (serviceName) => {
    const name = serviceName || process.env.SERVICE_NAME || 'unknown-service';
    return {
        pinoHttp: {
            name,
            level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
            genReqId: (req) => {
                return (req.headers['x-correlation-id'] ||
                    req.headers['x-request-id'] ||
                    req.headers['x-trace-id'] ||
                    (0, uuid_1.v4)());
            },
            autoLogging: {
                ignore: (req) => {
                    const ignoredPaths = ['/health', '/metrics', '/favicon.ico'];
                    return ignoredPaths.includes(req.url);
                },
            },
            redact: {
                paths: buildRedactPaths(),
                censor: '[REDACTED]',
            },
            transport: process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        singleLine: true,
                        translateTime: 'SYS:standard',
                    },
                }
                : undefined,
            customProps: (req, res) => ({
                context: 'HTTP',
            }),
            serializers: {
                req: (req) => ({
                    method: req.method,
                    url: req.url,
                    id: req.id,
                }),
                res: (res) => ({
                    statusCode: res.statusCode,
                }),
            },
            customSuccessMessage: (req, res, responseTime) => {
                return `HTTP ${req.method} ${req.url} ${res.statusCode} - ${responseTime}ms`;
            },
            customErrorMessage: (req, res, err) => {
                return `HTTP ${req.method} ${req.url} ${res.statusCode} - Error: ${err.message}`;
            },
        },
    };
};
exports.getPinoConfig = getPinoConfig;
//# sourceMappingURL=logger.config.js.map