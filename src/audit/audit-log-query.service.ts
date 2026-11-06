import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, Repository } from 'typeorm';
import { AuditTrail } from './audit-trail.entity';
import { GetAuditLogDto } from './audit-log-query.dto';
import { ResultTable } from '../shared/types';

const DEFAULT_WINDOW_DAYS = 30;

// The read side of audit_trail — AuditTrailService (audit-trail.service.ts)
// is write-only (log()), built for AuditTrailInterceptor, and was never meant
// to serve queries back out. Every @Audit()-decorated endpoint across every
// service using this package has been writing here for a while; this is what
// finally lets a service read its own audit trail back.
//
// Deliberately a shared SERVICE only, not a shared controller/module with a
// baked-in guard: authorization strategy differs by consuming service —
// some services keep their own local ABAC permission guard, while others
// enforce nothing locally and trust the API gateway entirely via
// InternalSecretMiddleware, gating real access at the gateway's own
// permission check on the proxy route instead. Each
// consuming service should write its own thin controller — inject this
// service, apply whatever guard already matches its own convention.
//
// Registered as a provider on the (Global) AuditModule, so any service that
// already imports AuditModule for @Audit() support can inject this directly
// with no extra module wiring.
@Injectable()
export class AuditLogQueryService {
  constructor(
    @InjectRepository(AuditTrail)
    private readonly repository: Repository<AuditTrail>,
  ) {}

  async findAll(query: GetAuditLogDto): Promise<ResultTable> {
    const { from, to } = this.resolveRange(query.from, query.to);

    const where: Record<string, any> = {
      created_at: Between(from, to),
    };
    if (query.user_id) where.user_id = query.user_id;
    if (query.username) where.username = ILike(`%${query.username}%`);
    if (query.table_name) where.table_name = query.table_name;
    if (query.action) where.action = query.action;
    if (query.search) where.description = ILike(`%${query.search}%`);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, totalItems] = await this.repository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      totalItems,
      total: totalItems,
      page,
      perPage: limit,
      limit,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }

  // Feeds a table_name filter dropdown with values that actually occur in
  // THIS service's own audit_trail, instead of a hardcoded list this package
  // has no ownership over — every @Audit()-decorated controller across every
  // consuming service picks its own tableName string independently.
  async findTableNames(): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('a')
      .select('DISTINCT a.table_name', 'table_name')
      .orderBy('a.table_name', 'ASC')
      .getRawMany<{ table_name: string }>();
    return rows.map((r) => r.table_name);
  }

  // "to" defaults to now; "from" defaults to DEFAULT_WINDOW_DAYS before "to"
  // — an unbounded query against an append-only table that only grows is a
  // self-inflicted slow-query waiting to happen. A date-only "to" (e.g.
  // "2026-01-01") is bumped to the end of that day so "to = today" includes
  // today, mirroring the usual range-end convention for
  // date-range query params.
  private resolveRange(from?: string, to?: string): { from: Date; to: Date } {
    const toDate = to ? new Date(to) : new Date();
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    return { from: fromDate, to: toDate };
  }
}
