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
var RabbitMQService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RabbitMQService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const amqp = __importStar(require("amqplib"));
class RabbitMQTimeoutError extends Error {
}
let RabbitMQService = RabbitMQService_1 = class RabbitMQService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RabbitMQService_1.name);
        this.url = '';
        this.shuttingDown = false;
        this.reconnectDelayMs = 5000;
        this.registeredConsumers = [];
        this.publishTimeoutMs = 5000;
        this.publishMaxAttempts = 3;
        this.publishRetryDelayMs = 300;
    }
    async onModuleInit() {
        this.url = this.configService.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/');
        await this.connect();
    }
    async connect() {
        if (this.shuttingDown)
            return;
        try {
            this.connection = await amqp.connect(this.url);
            this.channel = await this.connection.createChannel();
            this.connection.on('error', (err) => {
                this.logger.error(`RabbitMQ connection error: ${err.message}`);
            });
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
        }
        catch (err) {
            this.logger.error(`Failed to connect to RabbitMQ, publish()/consume() will be a no-op until reconnected: ${err.message}`);
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.shuttingDown || this.reconnectTimer)
            return;
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
    async assertQueueWithDlx(channel, queueName) {
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
    async publish(queueName, payload) {
        const deadline = Date.now() + this.publishTimeoutMs;
        let lastErr;
        for (let attempt = 1; attempt <= this.publishMaxAttempts; attempt++) {
            const remainingMs = deadline - Date.now();
            if (remainingMs <= 0)
                break;
            try {
                await this.publishOnce(queueName, payload, remainingMs);
                return;
            }
            catch (err) {
                lastErr = err;
                const remainingAfterMs = deadline - Date.now();
                if (attempt < this.publishMaxAttempts && remainingAfterMs > this.publishRetryDelayMs) {
                    this.logger.warn(`Publish to "${queueName}" failed (attempt ${attempt}/${this.publishMaxAttempts}), retrying: ${err.message}`);
                    await this.sleep(this.publishRetryDelayMs);
                }
            }
        }
        this.logger.error(`Failed to publish to "${queueName}": ${lastErr?.message}`);
    }
    async publishOnce(queueName, payload, timeoutMs) {
        const connection = this.connection;
        if (!connection) {
            throw new Error('RabbitMQ not connected');
        }
        let channel;
        try {
            await this.withTimeout((async () => {
                channel = await connection.createChannel();
                await this.doPublish(channel, queueName, payload);
            })(), timeoutMs, `publish to "${queueName}"`);
        }
        finally {
            void channel?.close().catch(() => undefined);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async doPublish(channel, queueName, payload) {
        await this.assertQueueWithDlx(channel, queueName);
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
            persistent: true,
            contentType: 'application/json',
        });
    }
    withTimeout(promise, timeoutMs, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new RabbitMQTimeoutError(`${label} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            promise.then((value) => {
                clearTimeout(timer);
                resolve(value);
            }, (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    async consume(queueName, handler) {
        this.registeredConsumers.push({ queueName, handler });
        if (!this.channel) {
            this.logger.warn(`RabbitMQ not connected — will subscribe to "${queueName}" once (re)connected`);
            return;
        }
        await this.startConsuming(queueName, handler);
    }
    async startConsuming(queueName, handler) {
        const channel = this.channel;
        await this.assertQueueWithDlx(channel, queueName);
        await channel.prefetch(10);
        await channel.consume(queueName, async (msg) => {
            if (!msg)
                return;
            let payload;
            try {
                payload = JSON.parse(msg.content.toString());
            }
            catch (err) {
                this.logger.error(`Failed to parse message on "${queueName}", sending to DLQ: ${err.message}`);
                this.safeNack(channel, msg, queueName);
                return;
            }
            try {
                await handler(payload, msg);
                channel.ack(msg);
            }
            catch (err) {
                this.logger.error(`Handler failed for "${queueName}": ${err.message}`);
                this.safeNack(channel, msg, queueName);
            }
        }, { noAck: false });
        this.logger.log(`Consuming from queue "${queueName}"`);
    }
    safeNack(channel, msg, queueName) {
        try {
            channel.nack(msg, false, false);
        }
        catch (err) {
            this.logger.error(`Failed to nack message on "${queueName}": ${err.message}`);
        }
    }
};
exports.RabbitMQService = RabbitMQService;
exports.RabbitMQService = RabbitMQService = RabbitMQService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RabbitMQService);
//# sourceMappingURL=rabbitmq.service.js.map