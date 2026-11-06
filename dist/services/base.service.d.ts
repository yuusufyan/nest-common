import { Logger } from '@nestjs/common';
import { Repository, UpdateResult, SelectQueryBuilder, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { GetTableDto, ResultTable, ActiveStatus } from '../shared/types';
export interface HasId {
    id?: number | any;
}
export interface HasStatus {
    status?: ActiveStatus | string;
}
export declare abstract class BaseService<T extends HasId & HasStatus> {
    protected readonly repository: Repository<T>;
    protected logger: Logger;
    constructor(repository: Repository<T>);
    create(payload: DeepPartial<T>, userId?: string): Promise<T>;
    findAll(payload: GetTableDto, relations?: string[], callback?: (qb: SelectQueryBuilder<T>) => void, searchFields?: string[], builder?: SelectQueryBuilder<any>): Promise<ResultTable>;
    private resolveRelationSortColumn;
    findOne(id: any, relations?: string[]): Promise<T>;
    update(id: any, payload: QueryDeepPartialEntity<T>, userId?: string): Promise<UpdateResult>;
    remove(id: any, userId?: string): Promise<UpdateResult>;
    findActiveList(): Promise<Partial<T>[]>;
}
