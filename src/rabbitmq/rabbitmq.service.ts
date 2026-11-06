import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

// Distinguishes "the broker RPC never responded in time" from a genuine
// amqplib error — currently only used to give withTimeout's rejection a
// clear, greppable message/type; kept as its own class (rather than a plain
// Error) since a future caller of withTimeout may want to branch on it the
// way an earlier version of publish() did.
class RabbitMQTimeoutError extends Error {}

// Formalizes the ad-hoc pattern consuming services used to hand-roll
// (the same DLX/DLQ convention the sibling Go package declares on the Go
// side) into one reusable service, so every NestJS producer/consumer of a
// notification-worthy event gets it via one import instead of copying that
// connection/reconnect/DLX boilerplate again per service.
@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | undefined;
  private channel: amqp.Channel | undefined;
  private url = '';
  // Flips true only in onModuleDestroy — distinguishes "we intentionally
  // shut down" from "the connection dropped" so the reconnect loop below
  // knows when to actually stop instead of retrying against a closed app.
  private shuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private readonly reconnectDelayMs = 5000;

  // A fresh channel after reconnect starts with zero consumers — this
  // service was previously "connect once, no reconnect", so nothing
  // needed to track past registrations. Replaying these here is what
  // makes the new reconnect actually restore consume() behavior instead
  // of just quietly restoring publish() and leaving consumers dead.
  private readonly registeredConsumers: {
    queueName: string;
    handler: (payload: any, msg: amqp.ConsumeMessage) => Promise<void>;
  }[] = [];

  // A broker RPC (assertExchange/assertQueue/bindQueue) that never resolves
  // — a slow/unresponsive broker, or a connection that's dead but hasn't
  // fired its own 'close' event yet — used to hang publish() forever, with
  // no way for a caller (even one that only fire-and-forgets it via `void`)
  // to ever recover that channel. This is the TOTAL budget across every
  // retry attempt below, not per attempt — a caller that already awaits
  // publish() synchronously, directly in a request path, must not
  // silently start waiting several times longer just
  // because a retry got added.
  private readonly publishTimeoutMs = 5000;

  // Retry-with-backoff for a publish that fails WITHOUT consuming the
  // whole budget above — a broker blip that errors out in a few ms (e.g.
  // "channel closed" from a connection that dropped moments ago but hasn't
  // finished reconnecting yet) gets a second chance; a genuine hang that
  // eats the full publishTimeoutMs on attempt 1 has nothing left to retry
  // with, which is the same effective behavior as before this change.
  // Previously any failure — transient or not — meant the event was lost
  // forever with only a log line as evidence; this narrows that to
  // "the broker was unreachable for the full 5s budget," not "the broker
  // hiccuped for an instant at the exact moment this fired."
  private readonly publishMaxAttempts = 3;
  private readonly publishRetryDelayMs = 300;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.url = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672/',
    );
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown) return;

    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
      });
      // 'close' fires on both a graceful close() and an unexpected drop —
      // onModuleDestroy sets shuttingDown first, so scheduleReconnect's own
      // guard is what keeps a deliberate shutdown from spawning a retry.
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.connection = undefined;
        this.channel = undefined;
        this.scheduleReconnect();
      });

      this.logger.log('Connected to RabbitMQ');

      for (const { queueName, handler } of this.registeredConsumers) {
        await this.startConsuming(queueName, handler);
      }
    } catch (err) {
      // Matches this codebase's existing precedent (and the sibling Go
      // package's own client): a producer/
      // consumer that can't reach RabbitMQ logs and carries on rather than
      // crashing the whole service — the primary action (e.g. approving an
      // access request) must never fail just because a notification
      // couldn't be queued. Previously this was also permanent — no retry
      // ever followed a failed/dropped connection, silently disabling
      // publish()/consume() for the rest of the process's life. Now it
      // retries on a fixed interval until it succeeds or the app shuts down.
      this.logger.error(
        `Failed to connect to RabbitMQ, publish()/consume() will be a no-op until reconnected: ${err.message}`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, this.reconnectDelayMs);
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  // Must stay byte-identical to the sibling Go package's own queue
  // declaration — a mismatched DLX/DLQ argument set on a queue that already
  // exists causes a permanent PRECONDITION_FAILED for every subsequent
  // publish/consume, on both sides, an incident this queue naming
  // convention's own history already includes once.
  //
  // Takes the channel explicitly rather than reading the mutable this.channel
  // field — this.channel can be reassigned mid-flight by a CONCURRENT
  // reconnect, and every caller here needs to keep operating on the specific
  // channel it started with, not whatever this.channel happens to point to
  // by the time each awaited step resumes. (publish() below no longer
  // shares this.channel at all — it uses its own private channel per call —
  // but startConsuming()'s long-lived channel still needs this guarantee.)
  private async assertQueueWithDlx(channel: amqp.Channel, queueName: string): Promise<void> {
    const dlxName = `${queueName}.dlx`;
    const dlqName = `${queueName}.dlq`;

    await channel.assertExchange(dlxName, 'direct', { durable: true });
    await channel.assertQueue(dlqName, { durable: true });
    await channel.bindQueue(dlqName, dlxName, dlqName);
    await channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlxName,
        'x-dead-letter-routing-key': dlqName,
      },
    });
  }

  // Retries publishOnce within publishTimeoutMs's TOTAL budget (see that
  // field's own comment) — a fast failure (e.g. "not connected" while the
  // background reconnect loop is mid-flight) leaves budget for another
  // try; a failure that itself consumed the whole budget (a genuine hang)
  // leaves nothing to retry with, so this degrades to exactly today's
  // single-attempt behavior in that case rather than adding latency on
  // top of it.
  async publish(queueName: string, payload: unknown): Promise<void> {
    const deadline = Date.now() + this.publishTimeoutMs;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= this.publishMaxAttempts; attempt++) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      try {
        await this.publishOnce(queueName, payload, remainingMs);
        return;
      } catch (err) {
        lastErr = err;
        const remainingAfterMs = deadline - Date.now();
        if (attempt < this.publishMaxAttempts && remainingAfterMs > this.publishRetryDelayMs) {
          this.logger.warn(
            `Publish to "${queueName}" failed (attempt ${attempt}/${this.publishMaxAttempts}), retrying: ${(err as Error).message}`,
          );
          await this.sleep(this.publishRetryDelayMs);
        }
      }
    }

    this.logger.error(`Failed to publish to "${queueName}": ${(lastErr as Error)?.message}`);
  }

  // One attempt, bounded by timeoutMs (a slice of publish()'s overall
  // budget, not always the full publishTimeoutMs). Gets its OWN fresh
  // channel rather than sharing this.channel (the one consume() keeps open
  // long-term) — amqplib channels are cheap, and this is what actually
  // isolates concurrent AND retried callers from each other. An earlier
  // version of this fix captured this.channel into a local variable, which
  // stopped a timed-out call from null-deref'ing another concurrent call's
  // in-flight operation, but still closed the SAME underlying amqp
  // connection those calls shared (`this.connection?.close()`), which
  // amqplib itself rejects every pending operation on — so a healthy
  // concurrent publish() still failed as collateral damage. A private
  // channel per attempt has no such shared state to damage in the first
  // place.
  private async publishOnce(queueName: string, payload: unknown, timeoutMs: number): Promise<void> {
    const connection = this.connection;
    if (!connection) {
      throw new Error('RabbitMQ not connected');
    }

    let channel: amqp.Channel | undefined;
    try {
      await this.withTimeout(
        (async () => {
          channel = await connection.createChannel();
          await this.doPublish(channel, queueName, payload);
        })(),
        timeoutMs,
        `publish to "${queueName}"`,
      );
    } finally {
      // Best-effort — if THIS is the operation that just timed out, close()
      // may never resolve either; fire-and-forget so cleanup never becomes
      // a second thing this call can hang on.
      void channel?.close().catch(() => undefined);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async doPublish(channel: amqp.Channel, queueName: string, payload: unknown): Promise<void> {
    await this.assertQueueWithDlx(channel, queueName);
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new RabbitMQTimeoutError(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  async consume(
    queueName: string,
    handler: (payload: any, msg: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    // Remembered regardless of current connection state, so a reconnect
    // (immediate retry below, or a later one after a drop) can replay this
    // registration onto the new channel.
    this.registeredConsumers.push({ queueName, handler });

    if (!this.channel) {
      this.logger.warn(
        `RabbitMQ not connected — will subscribe to "${queueName}" once (re)connected`,
      );
      return;
    }
    await this.startConsuming(queueName, handler);
  }

  private async startConsuming(
    queueName: string,
    handler: (payload: any, msg: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    // Captured once and closed over below, not read via this.channel inside
    // the consume callback — a message is only ever ack/nack-able on the
    // exact channel that delivered it. If a reconnect swaps this.channel for
    // a new one while an older in-flight message is still being handled,
    // reading this.channel at ack/nack time would try to acknowledge it on
    // the WRONG (new) channel instead of the one that actually holds it.
    const channel = this.channel!;
    await this.assertQueueWithDlx(channel, queueName);
    await channel.prefetch(10);

    await channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        let payload: any;
        try {
          payload = JSON.parse(msg.content.toString());
        } catch (err) {
          this.logger.error(
            `Failed to parse message on "${queueName}", sending to DLQ: ${err.message}`,
          );
          this.safeNack(channel, msg, queueName);
          return;
        }

        try {
          await handler(payload, msg);
          channel.ack(msg);
        } catch (err) {
          this.logger.error(`Handler failed for "${queueName}": ${err.message}`);
          this.safeNack(channel, msg, queueName);
        }
      },
      { noAck: false },
    );

    this.logger.log(`Consuming from queue "${queueName}"`);
  }

  // amqplib's consume() callback isn't awaited/caught by amqplib itself, so
  // a nack() that throws (e.g. the channel was already closed by something
  // else between ack failing and this fallback running) would otherwise
  // become an unhandled promise rejection — under Node's default
  // (--unhandled-rejections=throw, Node >=15) that crashes the whole
  // process over one message that was already going to be redelivered/
  // dead-lettered regardless.
  private safeNack(channel: amqp.Channel, msg: amqp.ConsumeMessage, queueName: string): void {
    try {
      channel.nack(msg, false, false);
    } catch (err) {
      this.logger.error(`Failed to nack message on "${queueName}": ${(err as Error).message}`);
    }
  }
}
