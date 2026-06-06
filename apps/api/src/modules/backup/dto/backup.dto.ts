import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsArray, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BackupStatus } from '../entities/backup-log.entity';
import { RestoreMode, RestoreStatus } from '../entities/restore-log.entity';

export class AdminEmailBodyDto {
  @ApiProperty({
    description: 'Admin email address for authorization',
    example: 'admin@example.com',
  })
  @IsEmail()
  email: string;
}

export class AdminEmailQueryDto {
  @ApiProperty({
    description: 'Admin email address for authorization',
    example: 'admin@example.com',
  })
  @IsEmail()
  email: string;
}

export class ListBackupsQueryDto extends AdminEmailQueryDto {
  @ApiPropertyOptional({
    enum: BackupStatus,
    description: 'Filter by backup status',
    example: BackupStatus.SUCCESS,
  })
  @IsOptional()
  @IsEnum(BackupStatus)
  status?: BackupStatus;

  @ApiPropertyOptional({
    description: 'Filter backups created on or after this date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter backups created on or before this date (ISO 8601)',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}

export class RestoreBodyDto extends AdminEmailBodyDto {
  @ApiProperty({
    enum: RestoreMode,
    default: RestoreMode.REPLACE,
    description:
      'REPLACE — delete all existing records then insert from backup. MERGE — upsert by primary key (keeps unaffected records).',
    example: RestoreMode.REPLACE,
  })
  @IsEnum(RestoreMode)
  mode: RestoreMode = RestoreMode.REPLACE;
}

export class SelectiveRestoreBodyDto extends RestoreBodyDto {
  @ApiProperty({
    type: [String],
    description: 'List of collection (table) names to restore. Must exist in the backup.',
    example: ['users'],
  })
  @IsArray()
  @IsString({ each: true })
  collections: string[];
}

export class ListRestoreHistoryQueryDto extends AdminEmailQueryDto {
  @ApiPropertyOptional({
    enum: RestoreStatus,
    description: 'Filter by restore status',
    example: RestoreStatus.SUCCESS,
  })
  @IsOptional()
  @IsEnum(RestoreStatus)
  status?: RestoreStatus;

  @ApiPropertyOptional({
    enum: RestoreMode,
    description: 'Filter by restore mode',
    example: RestoreMode.REPLACE,
  })
  @IsOptional()
  @IsEnum(RestoreMode)
  mode?: RestoreMode;

  @ApiPropertyOptional({
    description: 'Search by backupId or userEmail (case-insensitive)',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter restores started on or after this date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter restores started on or before this date (ISO 8601)',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;
}
