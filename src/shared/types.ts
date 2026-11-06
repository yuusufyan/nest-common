import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export enum ActiveStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

export class GetTableDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  term?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ required: false, enum: ['ASC', 'DESC'] })
  @IsOptional()
  orderBy?: 'ASC' | 'DESC';

  // Allow for extra dynamic properties like division_id
  [key: string]: any;
}

export class ResultTable {
  data: any[];
  totalItems: number;
  total?: number; // For backward compatibility
  page: number; // Changed to number for consistency
  perPage: number;
  totalPages: number;
  limit?: number; // For backward compatibility
}

export class CreateGeneralDto {
  @ApiProperty({ enum: ActiveStatus, default: ActiveStatus.Active })
  @IsOptional()
  status?: ActiveStatus;
}
