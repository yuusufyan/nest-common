import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from './audit-trail.entity';

// Deliberately its own DTO rather than GetTableDto (shared/types.ts) — AuditTrail
// has no `status` column (it's an append-only log, nothing to activate/
// deactivate), and its meaningful filters (actor, action type, table, date
// range) don't map onto GetTableDto's single generic `term` search.
export class GetAuditLogDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // Capped at 100: this queries a table that only grows (append-only, no
  // deletes) and is shared by every @Audit()-decorated endpoint in the
  // consuming service, unlike the small reference tables most paginated
  // list endpoints in this codebase page through.
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Filter to one actor by their user id (UUID).' })
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on username/email as recorded at the time of the action.',
  })
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    description:
      'Exact match on the audited resource (the tableName each @Audit() call was given). See the table-names endpoint for the live list.',
  })
  @IsOptional()
  table_name?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    description: 'ISO 8601. Inclusive lower bound on created_at. Defaults to 30 days before "to".',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description:
      'ISO 8601. Inclusive upper bound on created_at (a date-only value is bumped to 23:59:59.999 of that day). Defaults to now.',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match against the free-text description field.',
  })
  @IsOptional()
  search?: string;
}
