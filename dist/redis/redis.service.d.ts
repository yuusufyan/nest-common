import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleDestroy {
    private configService;
    private readonly client;
    private readonly logger;
    constructor(configService: ConfigService);
    getClient(): Redis;
    onModuleDestroy(): Promise<void>;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
}
