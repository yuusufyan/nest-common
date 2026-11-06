import { SetMetadata } from '@nestjs/common';
import { AuditAction } from './audit-trail.entity';

export interface AuditOptions {
  tableName: string;
  action: AuditAction;
  description?: string;
}

export const AUDIT_METADATA_KEY = 'audit_metadata';

export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA_KEY, options);
