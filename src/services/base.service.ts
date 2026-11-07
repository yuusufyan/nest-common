import { NotFoundException, Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import {
  Brackets,
  Repository,
  UpdateResult,
  SelectQueryBuilder,
  DeepPartial,
  FindOptionsWhere,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { GetTableDto, ResultTable, ActiveStatus } from '../shared/types';

export interface HasId {
  id?: number | any;
}

export interface HasStatus {
  status?: ActiveStatus | string;
}

// GetTableDto.orderBy is typed 'ASC' | 'DESC' at compile time only, which
// class-validator does not enforce at runtime. NOT a SQL injection vector,
// unlike sortBy: TypeORM's own SelectQueryBuilder.addOrderBy() already
// throws a TypeORMError for any direction value other than the literal
// strings 'ASC'/'DESC' (verified against typeorm 0.3.0 through 0.3.28, the
// whole ^0.3.0 range this package and its consumers use) -- so a malicious
// value never reaches generated SQL either way. What this DOES fix: without
// it, a bad/unexpected orderBy value throws that TypeORMError uncaught
// (crash / DoS on malformed input) instead of falling back to a sane
// default, which is what this whitelist restores.
function normalizeSortDirection(orderBy: unknown): 'ASC' | 'DESC' {
  return orderBy === 'DESC' ? 'DESC' : 'ASC';
}

@Injectable()
export abstract class BaseService<T extends HasId & HasStatus> {
  protected logger: Logger = new Logger(BaseService.name);

  constructor(
    protected readonly repository: Repository<T>,
  ) { }

  async create(payload: DeepPartial<T>, userId?: string): Promise<T> {
    this.logger.log(`[create] Creating a new entity for user: ${userId}`);
    try {
      const data = this.repository.create({
        ...payload,
        created_by: userId,
        updated_by: userId,
      } as any);
      const savedData = await this.repository.save(data);
      this.logger.log(
        `[create] Successfully created entity with ID: ${(savedData as any)?.id}`,
      );
      return savedData as unknown as T;
    } catch (error: any) {
      if (error.name === 'QueryFailedError') {
        throw new BadRequestException('The submitted data is invalid or violates system constraints.');
      }
      // Driver errors can carry internal hosts; keep them in the logs only.
      this.logger.error(`[create] Failed to create entity: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException('Failed to create data.');
    }
  }

  async findAll(
    payload: GetTableDto,
    relations: string[] = [],
    callback?: (qb: SelectQueryBuilder<T>) => void,
    searchFields?: string[],
    builder?: SelectQueryBuilder<any>,
  ): Promise<ResultTable> {
    this.logger.log(
      `[findAll] Fetching entries. Page: ${payload.page}, Limit: ${payload.limit
      }, Term: ${payload.term || 'N/A'}`,
    );
    const page = (payload.page - 1) * payload.limit;
    const keyword = payload.term?.trim();

    const query = builder || this.repository.createQueryBuilder('entity');
    const alias = query.alias;

    relations.forEach((relation) => {
      // Check if relation is already joined to avoid duplicates if builder is passed
      if (!builder) {
        query.leftJoinAndSelect(`${alias}.${relation}`, relation);
      }
    });

    if (callback) {
      callback(query);
    }

    const metadata = builder
      ? query.expressionMap.mainAlias!.metadata
      : this.repository.metadata;
    const deleteDateColumn = metadata.deleteDateColumn;
    if (deleteDateColumn) {
      query.andWhere(`${alias}.${deleteDateColumn.propertyName} IS NULL`);
    }

    if (keyword) {
      let columns: string[] = [];

      if (searchFields && searchFields.length > 0) {
        columns = searchFields;
      } else {
        const metadata = builder
          ? query.expressionMap.mainAlias!.metadata
          : this.repository.metadata;
        columns = metadata.columns
          .filter(
            (column) => column.type === 'varchar' || column.type === 'text',
          )
          .map((column) => `${alias}.${column.propertyName}`);
      }

      if (columns.length > 0) {
        query.andWhere(
          new Brackets((qb) => {
            columns.forEach((column, index) => {
              const condition = `${column} LIKE :keyword`;
              if (index === 0) {
                qb.where(condition);
              } else {
                qb.orWhere(condition);
              }
            });
          }),
          { keyword: `${keyword}%` },
        );
      }
    }

    if (payload.sortBy) {
      const sortMetadata = builder
        ? query.expressionMap.mainAlias!.metadata
        : this.repository.metadata;
      const orderBy = normalizeSortDirection(payload.orderBy);

      if (payload.sortBy.includes('.')) {
        // sortBy targeting a joined relation (e.g. "division.name"). This
        // value is attacker-controlled query input -- it must be validated
        // against the entity's real TypeORM metadata before it is ever
        // handed to the query builder. Previously it was passed straight
        // into `.orderBy()` unchecked, which was a confirmed SQL injection
        // (e.g. sortBy=`entity.id, (select pg_sleep(5))`).
        const validated = this.resolveRelationSortColumn(
          sortMetadata,
          payload.sortBy,
        );
        if (validated) {
          query.orderBy(
            `${validated.relation}.${validated.column}`,
            orderBy,
          );
        } else {
          this.logger.warn(
            `[findAll] Invalid or unsafe relation sortBy ignored: ${payload.sortBy}`,
          );
        }
      } else {
        const isValidColumn = sortMetadata.columns.some(
          (column) =>
            column.propertyName === payload.sortBy ||
            column.databaseName === payload.sortBy,
        );
        if (isValidColumn) {
          query.orderBy(`${alias}.${payload.sortBy}`, orderBy);
        } else {
          this.logger.warn(
            `[findAll] Invalid sortBy column ignored: ${payload.sortBy}`,
          );
        }
      }
    }

    const [data, count] = await query
      .skip(page)
      .take(payload.limit)
      .getManyAndCount();

    this.logger.log(
      `[findAll] Retrieved ${data.length} records out of total ${count}.`,
    );

    const result = new ResultTable();
    result.perPage = Number(payload.limit);
    result.page = Number(payload.page);
    result.totalItems = count;
    result.totalPages = Math.ceil(count / payload.limit);
    result.data = data;
    return result;
  }

  /**
   * Validates a relation-qualified `sortBy` value (e.g. "division.name")
   * against the entity's actual TypeORM metadata: `relationName` must be a
   * real declared relation on the entity, and `columnName` must be a real
   * column on that relation's target entity. Built dynamically from
   * metadata (not a per-consumer hardcoded list) since this base class is
   * shared by many entities across services.
   *
   * Returns null for anything that isn't exactly `<identifier>.<identifier>`
   * or that doesn't resolve to a real relation/column -- this is the
   * whitelist that replaced passing `sortBy` straight into `.orderBy()`.
   */
  private resolveRelationSortColumn(
    metadata: any,
    sortBy: string,
  ): { relation: string; column: string } | null {
    const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(
      sortBy,
    );
    if (!match) {
      return null;
    }
    const [, relationName, columnName] = match;

    const relationMeta = metadata?.relations?.find(
      (relation: any) => relation.propertyName === relationName,
    );
    if (!relationMeta) {
      return null;
    }

    const targetMetadata = relationMeta.inverseEntityMetadata;
    const isValidColumn = targetMetadata?.columns?.some(
      (column: any) =>
        column.propertyName === columnName ||
        column.databaseName === columnName,
    );

    return isValidColumn ? { relation: relationName, column: columnName } : null;
  }

  async findOne(id: any, relations: string[] = []): Promise<T> {
    this.logger.log(`[findOne] Fetching entity with ID: ${id}`);
    const data = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      relations,
    });

    if (!data) {
      const entityName = this.repository.metadata.tableName;
      this.logger.warn(
        `[findOne] Entity not found: ${entityName} with ID ${id}`,
      );
      throw new NotFoundException(
        `${entityName} with ID ${id} not found. Please verify the ID and try again.`,
      );
    }
    this.logger.log(`[findOne] Entity with ID: ${id} found successfully.`);
    return data;
  }

  async update(
    id: any,
    payload: QueryDeepPartialEntity<T>,
    userId?: string,
  ): Promise<UpdateResult> {
    const entityName = this.repository.metadata.tableName;
    this.logger.log(`[update] Updating ${entityName} with ID: ${id}`);

    // Check if entity exists
    const exists = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!exists) {
      this.logger.warn(
        `[update] Entity not found for update: ${entityName} with ID ${id}`,
      );
      throw new NotFoundException(
        `${entityName} with ID ${id} not found. Cannot update non-existent record.`,
      );
    }

    const result = await this.repository.update(id, {
      ...payload,
      updated_by: userId,
    } as any);

    this.logger.log(
      `[update] Successfully updated ${entityName} with ID: ${id}`,
    );
    return result;
  }

  async remove(id: any, userId?: string): Promise<UpdateResult> {
    const entityName = this.repository.metadata.tableName;
    this.logger.log(`[remove] Soft deleting ${entityName} with ID: ${id}`);

    // Check if entity exists
    const exists = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!exists) {
      this.logger.warn(
        `[remove] Entity not found for deletion: ${entityName} with ID ${id}`,
      );
      throw new NotFoundException(
        `${entityName} with ID ${id} not found. Cannot delete non-existent record.`,
      );
    }

    const hasDeletedBy = this.repository.metadata.columns.some(
      (column) => column.propertyName === 'deleted_by',
    );

    if (hasDeletedBy) {
      await this.repository.update(id, {
        deleted_by: userId,
      } as unknown as QueryDeepPartialEntity<T>);
    }
    const result = await this.repository.softDelete(id);

    this.logger.log(
      `[remove] Successfully soft deleted ${entityName} with ID: ${id}.`,
    );
    return result;
  }

  async findActiveList(): Promise<Partial<T>[]> {
    this.logger.log(`[findActiveList] Fetching list of active entities.`);
    const data = await this.repository
      .createQueryBuilder('entity')
      .select(['entity.id', 'entity.name'])
      .where('entity.status = :status', { status: ActiveStatus.Active })
      .getMany();

    this.logger.log(
      `[findActiveList] Retrieved ${data.length} active entities.`,
    );
    return data as Partial<T>[];
  }
}
