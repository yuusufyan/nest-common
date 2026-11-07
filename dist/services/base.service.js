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
var BaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const types_1 = require("../shared/types");
function normalizeSortDirection(orderBy) {
    return orderBy === 'DESC' ? 'DESC' : 'ASC';
}
let BaseService = BaseService_1 = class BaseService {
    constructor(repository) {
        this.repository = repository;
        this.logger = new common_1.Logger(BaseService_1.name);
    }
    async create(payload, userId) {
        this.logger.log(`[create] Creating a new entity for user: ${userId}`);
        try {
            const data = this.repository.create({
                ...payload,
                created_by: userId,
                updated_by: userId,
            });
            const savedData = await this.repository.save(data);
            this.logger.log(`[create] Successfully created entity with ID: ${savedData?.id}`);
            return savedData;
        }
        catch (error) {
            if (error.name === 'QueryFailedError') {
                throw new common_1.BadRequestException('The submitted data is invalid or violates system constraints.');
            }
            this.logger.error(`[create] Failed to create entity: ${error?.message}`, error?.stack);
            throw new common_1.InternalServerErrorException('Failed to create data.');
        }
    }
    async findAll(payload, relations = [], callback, searchFields, builder) {
        this.logger.log(`[findAll] Fetching entries. Page: ${payload.page}, Limit: ${payload.limit}, Term: ${payload.term || 'N/A'}`);
        const page = (payload.page - 1) * payload.limit;
        const keyword = payload.term?.trim();
        const query = builder || this.repository.createQueryBuilder('entity');
        const alias = query.alias;
        relations.forEach((relation) => {
            if (!builder) {
                query.leftJoinAndSelect(`${alias}.${relation}`, relation);
            }
        });
        if (callback) {
            callback(query);
        }
        const metadata = builder
            ? query.expressionMap.mainAlias.metadata
            : this.repository.metadata;
        const deleteDateColumn = metadata.deleteDateColumn;
        if (deleteDateColumn) {
            query.andWhere(`${alias}.${deleteDateColumn.propertyName} IS NULL`);
        }
        if (keyword) {
            let columns = [];
            if (searchFields && searchFields.length > 0) {
                columns = searchFields;
            }
            else {
                const metadata = builder
                    ? query.expressionMap.mainAlias.metadata
                    : this.repository.metadata;
                columns = metadata.columns
                    .filter((column) => column.type === 'varchar' || column.type === 'text')
                    .map((column) => `${alias}.${column.propertyName}`);
            }
            if (columns.length > 0) {
                query.andWhere(new typeorm_1.Brackets((qb) => {
                    columns.forEach((column, index) => {
                        const condition = `${column} LIKE :keyword`;
                        if (index === 0) {
                            qb.where(condition);
                        }
                        else {
                            qb.orWhere(condition);
                        }
                    });
                }), { keyword: `${keyword}%` });
            }
        }
        if (payload.sortBy) {
            const sortMetadata = builder
                ? query.expressionMap.mainAlias.metadata
                : this.repository.metadata;
            const orderBy = normalizeSortDirection(payload.orderBy);
            if (payload.sortBy.includes('.')) {
                const validated = this.resolveRelationSortColumn(sortMetadata, payload.sortBy);
                if (validated) {
                    query.orderBy(`${validated.relation}.${validated.column}`, orderBy);
                }
                else {
                    this.logger.warn(`[findAll] Invalid or unsafe relation sortBy ignored: ${payload.sortBy}`);
                }
            }
            else {
                const isValidColumn = sortMetadata.columns.some((column) => column.propertyName === payload.sortBy ||
                    column.databaseName === payload.sortBy);
                if (isValidColumn) {
                    query.orderBy(`${alias}.${payload.sortBy}`, orderBy);
                }
                else {
                    this.logger.warn(`[findAll] Invalid sortBy column ignored: ${payload.sortBy}`);
                }
            }
        }
        const [data, count] = await query
            .skip(page)
            .take(payload.limit)
            .getManyAndCount();
        this.logger.log(`[findAll] Retrieved ${data.length} records out of total ${count}.`);
        const result = new types_1.ResultTable();
        result.perPage = Number(payload.limit);
        result.page = Number(payload.page);
        result.totalItems = count;
        result.totalPages = Math.ceil(count / payload.limit);
        result.data = data;
        return result;
    }
    resolveRelationSortColumn(metadata, sortBy) {
        const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(sortBy);
        if (!match) {
            return null;
        }
        const [, relationName, columnName] = match;
        const relationMeta = metadata?.relations?.find((relation) => relation.propertyName === relationName);
        if (!relationMeta) {
            return null;
        }
        const targetMetadata = relationMeta.inverseEntityMetadata;
        const isValidColumn = targetMetadata?.columns?.some((column) => column.propertyName === columnName ||
            column.databaseName === columnName);
        return isValidColumn ? { relation: relationName, column: columnName } : null;
    }
    async findOne(id, relations = []) {
        this.logger.log(`[findOne] Fetching entity with ID: ${id}`);
        const data = await this.repository.findOne({
            where: { id },
            relations,
        });
        if (!data) {
            const entityName = this.repository.metadata.tableName;
            this.logger.warn(`[findOne] Entity not found: ${entityName} with ID ${id}`);
            throw new common_1.NotFoundException(`${entityName} with ID ${id} not found. Please verify the ID and try again.`);
        }
        this.logger.log(`[findOne] Entity with ID: ${id} found successfully.`);
        return data;
    }
    async update(id, payload, userId) {
        const entityName = this.repository.metadata.tableName;
        this.logger.log(`[update] Updating ${entityName} with ID: ${id}`);
        const exists = await this.repository.findOne({
            where: { id },
        });
        if (!exists) {
            this.logger.warn(`[update] Entity not found for update: ${entityName} with ID ${id}`);
            throw new common_1.NotFoundException(`${entityName} with ID ${id} not found. Cannot update non-existent record.`);
        }
        const result = await this.repository.update(id, {
            ...payload,
            updated_by: userId,
        });
        this.logger.log(`[update] Successfully updated ${entityName} with ID: ${id}`);
        return result;
    }
    async remove(id, userId) {
        const entityName = this.repository.metadata.tableName;
        this.logger.log(`[remove] Soft deleting ${entityName} with ID: ${id}`);
        const exists = await this.repository.findOne({
            where: { id },
        });
        if (!exists) {
            this.logger.warn(`[remove] Entity not found for deletion: ${entityName} with ID ${id}`);
            throw new common_1.NotFoundException(`${entityName} with ID ${id} not found. Cannot delete non-existent record.`);
        }
        const hasDeletedBy = this.repository.metadata.columns.some((column) => column.propertyName === 'deleted_by');
        if (hasDeletedBy) {
            await this.repository.update(id, {
                deleted_by: userId,
            });
        }
        const result = await this.repository.softDelete(id);
        this.logger.log(`[remove] Successfully soft deleted ${entityName} with ID: ${id}.`);
        return result;
    }
    async findActiveList() {
        this.logger.log(`[findActiveList] Fetching list of active entities.`);
        const data = await this.repository
            .createQueryBuilder('entity')
            .select(['entity.id', 'entity.name'])
            .where('entity.status = :status', { status: types_1.ActiveStatus.Active })
            .getMany();
        this.logger.log(`[findActiveList] Retrieved ${data.length} active entities.`);
        return data;
    }
};
exports.BaseService = BaseService;
exports.BaseService = BaseService = BaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.Repository])
], BaseService);
//# sourceMappingURL=base.service.js.map