import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as client from 'prom-client';
import { METRICS_SERVICE_NAME } from './metrics.constants';

/**
 * Same metric names/label shape as the Go services' fiberprometheus setup
 * (http_requests_total, http_request_duration_seconds,
 * http_requests_in_progress_total — labels service/method/path/status_code)
 * so both stacks feed the same Grafana dashboard/alert rules without
 * per-language special-casing.
 */
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

// Same skip-path convention already used by logger.config.ts's pino
// autoLogging.ignore list — kept in sync deliberately, not coincidentally.
const SKIP_PATHS = new Set(['/health', '/metrics', '/favicon.ico']);

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
    constructor(@Inject(METRICS_SERVICE_NAME) private readonly serviceName: string) {}

    use(req: Request, res: Response, next: NextFunction) {
        if (SKIP_PATHS.has(req.path)) {
            return next();
        }

        const method = req.method;
        httpRequestsInProgress.inc({ service: this.serviceName, method });
        const startedAt = process.hrtime.bigint();

        res.on('finish', () => {
            httpRequestsInProgress.dec({ service: this.serviceName, method });

            const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
            // req.route.path is only populated once Express has matched a
            // route — by the 'finish' event routing has already completed,
            // so this is the route TEMPLATE (e.g. '/users/:id'), not the
            // resolved URL with real param values. That matters: using the
            // resolved URL would create one label combination per distinct
            // id/uuid ever requested, an unbounded-cardinality metric.
            // req.baseUrl covers routes mounted on a sub-router; falls back
            // to req.path for genuinely unmatched (404) requests.
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
}
