import { Params } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

// Field names redacted at every enumerated depth below. Kept in sync (as
// much as pino's redact syntax allows -- see REDACT_MAX_DEPTH's comment)
// with the sensitive/PII word lists in audit-trail.interceptor.ts, so a
// plain `logger.info({...})` call gets the same baseline protection as the
// audit trail for the exact key spellings actually used across
// consuming services' DTOs/entities.
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

// fast-redact (and pino v10's @pinojs/redact fork, which implements the
// same path syntax) has NO recursive/any-depth wildcard: `**` is not valid
// syntax at all, and is silently a no-op rather than an error -- which is
// exactly how this redaction previously shipped completely broken (every
// path here used to be `'**.*password'`-style: invalid glob syntax that
// matched nothing, confirmed via a raw `logger.info({ password: '...' })`
// probe that reached the log in plaintext). A single `*` only ever consumes
// exactly ONE path segment (verified empirically -- @pinojs/redact's own
// README claims `*.password` "redacts password at any level", which is NOT
// what it does: `*.*.password`/`*.*.*.password` do not get redacted by a
// bare `*.password`). Depth is therefore enumerated explicitly here. This
// is a best-effort net for direct `logger.log(obj)` calls with a handful of
// levels of nesting -- NOT a substitute for the audit trail's own
// arbitrary-depth recursive masking (audit-trail.interceptor.ts), which
// remains the source of truth for the audit_trail table / audit.events
// queue.
const REDACT_MAX_DEPTH = 4;

function buildRedactPaths(): string[] {
  const paths: string[] = [
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

export const getPinoConfig = (serviceName?: string): Params => {
  const name = serviceName || process.env.SERVICE_NAME || 'unknown-service';
  return {
    pinoHttp: {
      name,
      level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      genReqId: (req) => {
        return (
          req.headers['x-correlation-id'] ||
          req.headers['x-request-id'] ||
          req.headers['x-trace-id'] ||
          uuidv4()
        );
      },
      // Silent Bug Fix: Exclude health checks from logs to prevent pollution
      autoLogging: {
        ignore: (req: any) => {
          const ignoredPaths = ['/health', '/metrics', '/favicon.ico'];
          return ignoredPaths.includes(req.url);
        },
      },
      redact: {
        paths: buildRedactPaths(),
        censor: '[REDACTED]',
      },
      transport:
        process.env.NODE_ENV !== 'production'
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
      // Standardize fields to match the sibling Go package as much as possible
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
