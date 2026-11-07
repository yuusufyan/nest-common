# @yuusufyan/nest-common

Shared NestJS building blocks for microservices: audit trail, structured logging with redaction, Prometheus metrics, RabbitMQ, Redis, response shaping, and a TypeORM base service.

## Install

```bash
npm install github:yuusufyan/nest-common
```

The package ships compiled output in `dist/`, so no build step is needed in the consumer.

## What's inside

| Area | Exports | Notes |
| --- | --- | --- |
| Audit | `AuditModule.forRoot(serviceName)`, `@Audit()`, `AuditTrailService`, `AuditLogQueryService`, `AuditTrail` | Writes a local `audit_trail` row and (optionally) publishes to the shared `audit.events` queue. Sensitive/PII fields are recursively masked at any depth. |
| Logging | `getPinoConfig(serviceName?)` | `nestjs-pino` params with explicit depth-enumerated redaction paths for secrets and PII. |
| HTTP shape | `TransformInterceptor`, `AllExceptionsFilter`, `RpcExceptionsFilter`, `ResponseInterface` | One response envelope across services; cycle- and size-safe serialization. |
| Metrics | `MetricsModule.forRoot(serviceName)`, `MetricsMiddleware`, `MetricsController` | `prom-client` on the default registry, including Node runtime metrics. |
| Messaging | `RabbitMQModule`, `RabbitMQService`, `NOTIFICATIONS_QUEUE_NAME` | Connection/reconnect, DLX/DLQ convention, publish timeout and retry. |
| Cache | `RedisModule`, `RedisService` | `ioredis` with optional logical-DB isolation. |
| Middleware | `JwtDecoderMiddleware`, `InternalSecretMiddleware` | Decode a bearer token; reject requests that bypass the API gateway. |
| Auth | `JwtAuthGuard`, `@CurrentUser()` | Reject requests without a verified JWT (401); inject the token payload into handlers. |
| Data | `BaseService<T>`, `GetTableDto`, `ResultTable` | Abstract paginated/filtered/sortable TypeORM query base class. |

## Configuration

All configuration comes from environment variables via `@nestjs/config`. Nothing is hardcoded.

| Variable | Used by | Required |
| --- | --- | --- |
| `NODE_ENV` | `AllExceptionsFilter`, logger | Set to `production` on servers. Raw error messages are only returned to clients when it is `development` or `test`. |
| `INTERNAL_SERVICE_SECRET` | `InternalSecretMiddleware` | Yes — the middleware fails closed (rejects every request) when unset. |
| `RABBITMQ_URL` | `RabbitMQService` | Defaults to a local broker on `localhost:5672` with RabbitMQ's default guest account; set it in any real environment. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | `RedisService` | Host/port default to `localhost:6379`. |

## Usage

```ts
@Module({
  imports: [
    AuditModule.forRoot('my-service'),
    MetricsModule.forRoot('my-service'),
    RedisModule,
    RabbitMQModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Register MetricsMiddleware first so the recorded duration covers
    // every other middleware.
    consumer.apply(MetricsMiddleware).forRoutes('*path');
    consumer.apply(InternalSecretMiddleware).forRoutes('*path');
  }
}
```

Mark an endpoint for the audit trail:

```ts
@Post()
@Audit({ action: AuditAction.CREATE, tableName: 'users' })
create(@Body() dto: CreateUserDto) { ... }
```

Require a logged-in user. `JwtDecoderMiddleware` only decodes the token and
never rejects a request, so routes that need a user must add `JwtAuthGuard`
(and the middleware must run on those routes, with `JwtModule` registered):

```ts
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@CurrentUser() user, @CurrentUser('sub') userId: string) { ... }
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # jest
```

## License

MIT
