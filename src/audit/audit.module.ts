import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { AuditTrail } from './audit-trail.entity';
import { AuditTrailService } from './audit-trail.service';
import { AuditTrailInterceptor } from './audit-trail.interceptor';
import { AuditLogQueryService } from './audit-log-query.service';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { AUDIT_SERVICE_NAME } from './audit-service-name.token';

// forRoot(serviceName), not a bare @Module() -- the centralized audit
// pipeline needs each service's own name attached to every published
// audit.events message (the local audit_trail table has no such column;
// it's implicit per-service there), and there's no other way to get a
// per-consumer value into a shared package's own injectable, the way the
// sibling Go package takes the service name as a publisher option.
// Consumers must use `imports: [AuditModule.forRoot('the-service-name')]`
// rather than a bare `imports: [AuditModule]`.
@Global()
@Module({})
export class AuditModule {
  static forRoot(serviceName: string): DynamicModule {
    return {
      module: AuditModule,
      imports: [TypeOrmModule.forFeature([AuditTrail]), RabbitMQModule],
      providers: [
        AuditTrailService,
        AuditLogQueryService,
        Reflector,
        { provide: AUDIT_SERVICE_NAME, useValue: serviceName },
        {
          provide: APP_INTERCEPTOR,
          useClass: AuditTrailInterceptor,
        },
      ],
      exports: [AuditTrailService, AuditLogQueryService],
    };
  }
}
