import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly client: Redis;
    private readonly logger = new Logger(RedisService.name);

    constructor(private configService: ConfigService) {
        const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
        const port = this.configService.get<number>('REDIS_PORT') || 6379;
        const password = this.configService.get<string>('REDIS_PASSWORD');
        // Defaults to 0 (ioredis's own default) when unset — existing
        // consumers that never set REDIS_DB keep their current behavior
        // unchanged. Added so services sharing one physical Redis instance
        // (several dev services all point at the same host) can isolate
        // their keyspace onto separate logical DBs instead of colliding on
        // DB 0 with everyone else, including the API gateway's session state.
        const db = this.configService.get<number>('REDIS_DB');

        this.client = new Redis({
            host,
            port,
            password,
            db,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            commandTimeout: 3000, // Silent Bug Fix: Prevent hanging on slow Redis
        });

        this.client.on('error', (err) => {
            this.logger.error('Redis Client Error', err);
        });

        this.client.on('connect', () => {
            this.logger.log('Successfully connected to Redis');
        });
    }

    getClient(): Redis {
        return this.client;
    }

    async onModuleDestroy() {
        try {
            // Disconnect gracefully — prevents ioredis "Connection is closed" error on shutdown
            if (this.client.status !== 'end' && this.client.status !== 'close') {
                await this.client.quit();
            }
        } catch (err) {
            // Suppress errors during shutdown — connection may already be closing
            this.logger.warn('Redis connection closed during shutdown');
        }
    }

    async get<T>(key: string): Promise<T | null> {
        const data = await this.client.get(key);
        if (!data) return null;
        try {
            return JSON.parse(data) as T;
        } catch (e) {
            return data as unknown as T;
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        const data = typeof value === 'object' ? JSON.stringify(value) : value;
        if (ttl) {
            await this.client.set(key, data, 'EX', ttl);
        } else {
            await this.client.set(key, data);
        }
    }

    async del(key: string): Promise<number> {
        return this.client.del(key);
    }

    async keys(pattern: string): Promise<string[]> {
        return this.client.keys(pattern);
    }
}
