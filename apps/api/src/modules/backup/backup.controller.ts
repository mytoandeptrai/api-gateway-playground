import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from './guards/admin.guard';
import { BackupService } from './services/backup.service';
import {
  AdminEmailBodyDto,
  AdminEmailQueryDto,
  ListBackupsQueryDto,
  ListRestoreHistoryQueryDto,
  RestoreBodyDto,
  SelectiveRestoreBodyDto,
} from './dto/backup.dto';

@ApiTags('Backup')
@UseGuards(AdminGuard)
@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @ApiOperation({
    summary: 'List all backups',
    description:
      'Returns a paginated list of backup logs. Supports filtering by status and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of backup logs',
    schema: {
      example: {
        data: [
          {
            backupId: 'a1b2c3d4-...',
            status: 'SUCCESS',
            startTime: '2025-06-01T02:00:00.000Z',
            endTime: '2025-06-01T02:00:12.000Z',
            size: 204800,
            location: 'https://drive.google.com/file/d/...',
            fileId: '1XyZ...',
            isAutomatic: true,
            metadata: { collections: ['users'], totalRows: 150 },
          },
        ],
        total: 1,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  async listBackups(@Query() query: ListBackupsQueryDto) {
    return this.backupService.findAll({
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post('trigger')
  @ApiOperation({
    summary: 'Trigger a manual backup',
    description:
      'Enqueues a backup job immediately. The backup runs asynchronously — use GET /backup/:backupId to poll progress.',
  })
  @ApiBody({ type: AdminEmailBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Backup job enqueued',
    schema: {
      example: { backupId: 'a1b2c3d4-...', status: 'IN_PROGRESS' },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  async triggerBackup(@Body() _body: AdminEmailBodyDto) {
    return this.backupService.triggerBackup();
  }

  @Get(':backupId')
  @ApiOperation({
    summary: 'Get backup detail by ID',
    description:
      'Returns the full backup log including status, size, Drive location, and collection metadata.',
  })
  @ApiParam({
    name: 'backupId',
    description: 'UUID of the backup',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Backup log',
    schema: {
      example: {
        backupId: 'a1b2c3d4-...',
        status: 'SUCCESS',
        startTime: '2025-06-01T02:00:00.000Z',
        endTime: '2025-06-01T02:00:12.000Z',
        size: 204800,
        location: 'https://drive.google.com/file/d/...',
        fileId: '1XyZ...',
        error: null,
        isAutomatic: true,
        metadata: { collections: ['users'], totalRows: 150 },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async getBackup(
    @Param('backupId') backupId: string,
    @Query() _query: AdminEmailQueryDto,
  ) {
    return this.backupService.findOne(backupId);
  }

  @Get(':backupId/collections')
  @ApiOperation({
    summary: 'List collections available in a backup',
    description:
      'Returns the table names included in the backup. Use this to build the payload for selective restore.',
  })
  @ApiParam({
    name: 'backupId',
    description: 'UUID of the backup',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Available collections',
    schema: { example: { backupId: 'a1b2c3d4-...', collections: ['users'] } },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async getCollections(
    @Param('backupId') backupId: string,
    @Query() _query: AdminEmailQueryDto,
  ) {
    const collections = await this.backupService.getCollections(backupId);
    return { backupId, collections };
  }

  @Post(':backupId/restore')
  @ApiOperation({
    summary: 'Restore entire backup',
    description:
      'Restores all collections from the backup. REPLACE mode deletes existing records first; MERGE mode upserts by primary key. Runs asynchronously — poll GET /backup/restore/:restoreId for progress. NOTE: backup_logs and restore_logs are never overwritten.',
  })
  @ApiParam({
    name: 'backupId',
    description: 'UUID of the backup to restore',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: RestoreBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Restore job enqueued',
    schema: { example: { restoreId: 'b2c3d4e5-...', status: 'IN_PROGRESS' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  @ApiResponse({
    status: 404,
    description: 'Backup not found or not in SUCCESS status',
  })
  async restoreBackup(
    @Param('backupId') backupId: string,
    @Body() body: RestoreBodyDto,
  ) {
    return this.backupService.triggerRestore(backupId, body.email, body.mode);
  }

  @Post(':backupId/restore/selective')
  @ApiOperation({
    summary: 'Restore selected collections from a backup',
    description:
      'Restores only the specified collections. Use GET /backup/:backupId/collections to see available collection names. Status may be PARTIAL if some collections succeed and others fail.',
  })
  @ApiParam({
    name: 'backupId',
    description: 'UUID of the backup to restore from',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: SelectiveRestoreBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Selective restore job enqueued',
    schema: { example: { restoreId: 'b2c3d4e5-...', status: 'IN_PROGRESS' } },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async selectiveRestore(
    @Param('backupId') backupId: string,
    @Body() body: SelectiveRestoreBodyDto,
  ) {
    return this.backupService.triggerSelectiveRestore(
      backupId,
      body.email,
      body.collections,
      body.mode,
    );
  }

  @Get('restore/history')
  @ApiOperation({
    summary: 'List restore history',
    description:
      'Returns a paginated list of restore logs. Supports filtering by status, mode, date range, and search.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated restore history',
    schema: {
      example: {
        data: [
          {
            restoreId: 'b2c3d4e5-...',
            backupId: 'a1b2c3d4-...',
            userEmail: 'admin@example.com',
            collections: ['users'],
            mode: 'REPLACE',
            status: 'SUCCESS',
            startTime: '2025-06-01T10:00:00.000Z',
            endTime: '2025-06-01T10:00:05.000Z',
            collectionStats: { users: { restored: 150, errors: 0 } },
            error: null,
          },
        ],
        total: 1,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  async listRestoreHistory(@Query() query: ListRestoreHistoryQueryDto) {
    return this.backupService.findRestoreHistory({
      status: query.status,
      mode: query.mode,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('restore/:restoreId')
  @ApiOperation({
    summary: 'Get restore detail by ID',
    description:
      'Returns restore status, per-collection stats, and error details if applicable.',
  })
  @ApiParam({
    name: 'restoreId',
    description: 'UUID of the restore job',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({
    status: 200,
    description: 'Restore log',
    schema: {
      example: {
        restoreId: 'b2c3d4e5-...',
        backupId: 'a1b2c3d4-...',
        userEmail: 'admin@example.com',
        collections: ['users'],
        mode: 'REPLACE',
        status: 'SUCCESS',
        startTime: '2025-06-01T10:00:00.000Z',
        endTime: '2025-06-01T10:00:05.000Z',
        collectionStats: { users: { restored: 150, errors: 0 } },
        error: null,
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied — invalid admin email',
  })
  @ApiResponse({ status: 404, description: 'Restore job not found' })
  async getRestore(
    @Param('restoreId') restoreId: string,
    @Query() _query: AdminEmailQueryDto,
  ) {
    return this.backupService.findOneRestore(restoreId);
  }
}
