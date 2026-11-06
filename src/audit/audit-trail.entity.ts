import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
  DOWNLOAD = 'DOWNLOAD',
}

@Entity('audit_trail')
@Index(['user_id', 'created_at'])
@Index(['table_name', 'record_id'])
export class AuditTrail {
  // Application-generated UUID stored as varchar rather than a native `uuid`
  // column type: 'uuid' is Postgres-only and unsupported by TypeORM's MySQL
  // driver, and this entity is shared across both MySQL and Postgres services.
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  user_id: string;

  @Index()
  @Column({ length: 100, nullable: true })
  username: string;

  @Index()
  @Column({ length: 100 })
  table_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  record_id: string;

  @Index()
  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ type: 'text', nullable: true })
  old_values: string;

  @Column({ type: 'text', nullable: true })
  new_values: string;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // No explicit `type` here — 'timestamptz' is Postgres-only; letting TypeORM
  // pick each driver's default keeps this portable to MySQL too.
  @CreateDateColumn()
  created_at: Date;
}
