import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

// @Global(), no forRoot() — same shape as RedisModule, the one existing
// nest-common module that already manages a long-lived external connection
// with its own reconnect/error handling, which this is structurally closest
// to (unlike MetricsModule/AuditModule, neither needs a live external
// connection).
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
