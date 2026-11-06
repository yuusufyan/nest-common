"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        const host = this.configService.get('REDIS_HOST') || 'localhost';
        const port = this.configService.get('REDIS_PORT') || 6379;
        const password = this.configService.get('REDIS_PASSWORD');
        const db = this.configService.get('REDIS_DB');
        this.client = new ioredis_1.default({
            host,
            port,
            password,
            db,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            commandTimeout: 3000,
        });
        this.client.on('error', (err) => {
            this.logger.error('Redis Client Error', err);
        });
        this.client.on('connect', () => {
            this.logger.log('Successfully connected to Redis');
        });
    }
    getClient() {
        return this.client;
    }
    async onModuleDestroy() {
        try {
            if (this.client.status !== 'end' && this.client.status !== 'close') {
                await this.client.quit();
            }
        }
        catch (err) {
            this.logger.warn('Redis connection closed during shutdown');
        }
    }
    async get(key) {
        const data = await this.client.get(key);
        if (!data)
            return null;
        try {
            return JSON.parse(data);
        }
        catch (e) {
            return data;
        }
    }
    async set(key, value, ttl) {
        const data = typeof value === 'object' ? JSON.stringify(value) : value;
        if (ttl) {
            await this.client.set(key, data, 'EX', ttl);
        }
        else {
            await this.client.set(key, data);
        }
    }
    async del(key) {
        return this.client.del(key);
    }
    async keys(pattern) {
        return this.client.keys(pattern);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map