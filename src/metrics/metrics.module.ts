import { DynamicModule, Module } from '@nestjs/common';
import * as client from 'prom-client';
import { METRICS_SERVICE_NAME } from './metrics.constants';
import { MetricsController } from './metrics.controller';

let defaultMetricsCollected = false;

/**
 * Usage in AppModule:
 *   @Module({ imports: [MetricsModule.forRoot('my-service'), ...] })
 *   export class AppModule implements NestModule {
 *     configure(consumer: MiddlewareConsumer) {
 *       consumer.apply(MetricsMiddleware).forRoutes('*path'); // register FIRST,
 *       // so total duration includes every other middleware (auth, etc.) —
 *       // mirrors the Go services' app.Use(metrics.Middleware) placement.
 *       ...
 *     }
 *   }
 *
 * Registers against prom-client's default global registry (not an isolated
 * `new client.Registry()`) and calls collectDefaultMetrics() — same reason
 * as the Go side's fiberprometheus.NewWithDefaultRegistry: so Node's own
 * process/runtime metrics (event loop lag, heap, GC, RSS) are scraped
 * alongside the HTTP metrics, not silently excluded.
 */
@Module({})
export class MetricsModule {
    static forRoot(serviceName: string): DynamicModule {
        if (!defaultMetricsCollected) {
            client.collectDefaultMetrics();
            defaultMetricsCollected = true;
        }

        return {
            module: MetricsModule,
            controllers: [MetricsController],
            providers: [{ provide: METRICS_SERVICE_NAME, useValue: serviceName }],
            exports: [METRICS_SERVICE_NAME],
        };
    }
}
