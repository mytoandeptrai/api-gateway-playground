import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import { RefundRequest, RefundStatus } from './entities/refund-request.entity';
import { OutboxEvent } from './entities/outbox-event.entity';

interface KafkaEnvelope {
  eventId: string;
  eventType: string;
  sagaId: string;
  orderId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;
  private readonly maxFileSizeMb: number;
  private readonly refundWindowDays: number;

  constructor(
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>('minio.bucket', 'refund-files');
    this.maxFileSizeMb = this.configService.get<number>('MAX_FILE_SIZE_MB', 5);
    this.refundWindowDays = this.configService.get<number>('REFUND_WINDOW_DAYS', 7);

    this.minioClient = new Minio.Client({
      endPoint: this.configService.get<string>('minio.endPoint', 'localhost'),
      port: this.configService.get<number>('minio.port', 1117),
      useSSL: this.configService.get<boolean>('minio.useSSL', false),
      accessKey: this.configService.get<string>('minio.accessKey', 'minioadmin'),
      secretKey: this.configService.get<string>('minio.secretKey', 'minioadmin'),
    });

    this.ensureBucket().catch((err) =>
      this.logger.warn(`MinIO bucket setup: ${err}`),
    );
  }

  private async ensureBucket() {
    const exists = await this.minioClient.bucketExists(this.bucket);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucket);
      this.logger.log(`MinIO bucket '${this.bucket}' created`);
    }
  }

  async createRefund(body: {
    orderId: string;
    userId: string;
    userEmail: string;
    reason: string;
    deliveredAt: string;
    files: Express.Multer.File[];
  }): Promise<{ refundId: string; status: string }> {
    const { orderId, userId, userEmail, reason, deliveredAt, files } = body;

    const existing = await this.refundRepo.findOne({ where: { orderId } });
    if (existing) {
      throw new BadRequestException('Refund request already exists for this order');
    }

    const deliveredDate = new Date(deliveredAt);
    const windowMs = this.refundWindowDays * 24 * 60 * 60 * 1000;
    if (Date.now() - deliveredDate.getTime() > windowMs) {
      throw new BadRequestException(
        `Đã hết thời hạn yêu cầu hoàn tiền (${this.refundWindowDays} ngày)`,
      );
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('Cần ít nhất 1 file đính kèm');
    }
    if (files.length > 3) {
      throw new BadRequestException('Tối đa 3 files');
    }

    const fileUrls = await this.uploadFiles(orderId, files);

    const refundId = randomUUID();
    const envelope = this.buildEnvelope('refund.requested', orderId, userId, {
      refundId,
      orderId,
      userId,
      userEmail,
      reason,
      fileUrls,
    });

    const refund = await this.dataSource.transaction(async (manager) => {
      const request = await manager.save(
        RefundRequest,
        manager.create(RefundRequest, {
          id: refundId,
          orderId,
          userId,
          reason,
          fileUrls,
          status: RefundStatus.REFUND_PENDING,
        }),
      );

      await manager.save(
        OutboxEvent,
        manager.create(OutboxEvent, {
          aggregateId: request.id,
          eventType: 'refund.requested',
          payload: envelope,
          published: false,
        }),
      );

      return request;
    });

    this.logger.log(`Refund request created: ${refund.id} for order ${orderId}`);
    return { refundId: refund.id, status: refund.status };
  }

  async getByOrderId(orderId: string): Promise<RefundRequest | null> {
    return this.refundRepo.findOne({ where: { orderId } });
  }

  async validateAndEmit(refundId: string) {
    const refund = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!refund) throw new NotFoundException(`Refund ${refundId} not found`);

    const { approved, reviewNote } = this.validateRefund(refund);
    const newStatus = approved ? RefundStatus.REFUND_APPROVED : RefundStatus.REFUND_REJECTED;

    const envelope = this.buildEnvelope('refund.validated', refund.orderId, refund.userId, {
      refundId: refund.id,
      orderId: refund.orderId,
      approved,
      reviewNote,
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.update(RefundRequest, { id: refundId }, { status: newStatus, reviewNote: reviewNote ?? null });

      await manager.save(
        OutboxEvent,
        manager.create(OutboxEvent, {
          aggregateId: refundId,
          eventType: 'refund.validated',
          payload: envelope,
          published: false,
        }),
      );
    });

    this.logger.log(`Refund ${refundId} validated: approved=${approved}`);
  }

  async updateStatus(payload: {
    refundId: string;
    status: string;
    reviewNote?: string;
  }) {
    const { refundId, status, reviewNote } = payload;
    const refund = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!refund) {
      this.logger.warn(`Refund ${refundId} not found for status update`);
      return;
    }
    await this.refundRepo.update(
      { id: refundId },
      { status: status as RefundStatus, reviewNote: reviewNote ?? null },
    );
    this.logger.log(`Refund ${refundId} status updated to ${status}`);
  }

  private validateRefund(refund: RefundRequest): {
    approved: boolean;
    reviewNote?: string;
  } {
    if (refund.reason.length < 20) {
      return { approved: false, reviewNote: 'Lý do hoàn tiền quá ngắn (tối thiểu 20 ký tự)' };
    }
    if (!refund.fileUrls || refund.fileUrls.length === 0) {
      return { approved: false, reviewNote: 'Cần ít nhất 1 file đính kèm hợp lệ' };
    }
    return { approved: true };
  }

  private async uploadFiles(orderId: string, files: Express.Multer.File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const objectName = `${orderId}/${randomUUID()}-${file.originalname}`;
      await this.minioClient.putObject(
        this.bucket,
        objectName,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );
      urls.push(`${this.bucket}/${objectName}`);
    }
    return urls;
  }

  private buildEnvelope(
    eventType: string,
    orderId: string,
    userId: string,
    payload: Record<string, unknown>,
  ): KafkaEnvelope {
    return {
      eventId: randomUUID(),
      eventType,
      sagaId: '',
      orderId,
      userId,
      correlationId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload,
    };
  }
}
