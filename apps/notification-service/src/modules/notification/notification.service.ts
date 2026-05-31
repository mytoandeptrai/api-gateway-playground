import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NotificationLog } from './entities/notification-log.entity';
import { NotificationGateway } from './notification.gateway';

interface SendPayload {
  eventId: string;
  userId: string;
  email: string;
  template: string;
  data: Record<string, unknown>;
  channels: ('email' | 'socket')[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    private readonly gateway: NotificationGateway,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', 'localhost'),
      port: this.configService.get<number>('MAIL_PORT', 1113),
      secure: false,
    });
  }

  async send(envelope: {
    eventId: string;
    sagaId: string;
    orderId: string;
    userId: string;
    payload: SendPayload;
  }) {
    const { eventId, userId, payload } = envelope;

    const alreadySent = await this.logRepo.findOne({ where: { eventId } });
    if (alreadySent) {
      this.logger.warn(`Duplicate notification eventId=${eventId}`);
      return;
    }

    const { email, template, data, channels } = payload;

    if (channels.includes('email') && email) {
      await this.sendEmail(email, template, data);
    }

    if (channels.includes('socket')) {
      this.gateway.emitToUser(userId, 'order.status_updated', {
        orderId: envelope.orderId,
        ...data,
      });
    }

    await this.logRepo.save(
      this.logRepo.create({
        userId,
        eventId,
        type: template,
        channel: channels.join(','),
        payload: payload as unknown as object,
        status: 'SENT',
      }),
    );

    this.logger.log(
      `Notification sent: template=${template}, userId=${userId}`,
    );
  }

  private async sendEmail(
    to: string,
    template: string,
    data: Record<string, unknown>,
  ) {
    const from = this.configService.get<string>(
      'MAIL_FROM',
      'noreply@nextmart.local',
    );
    const subject = this.getSubject(template);
    const html = this.buildHtml(template, data);

    try {
      await this.transporter.sendMail({ from, to, subject, html });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
    }
  }

  private getSubject(template: string): string {
    const subjects: Record<string, string> = {
      'order-created': '[NextMart] Đơn hàng của bạn đã được tạo',
      'payment-success': '[NextMart] Thanh toán thành công',
      'order-confirmed': '[NextMart] Đơn hàng đã được xác nhận',
      'order-shipped': '[NextMart] Đơn hàng đang được giao',
      'order-delivered': '[NextMart] Đơn hàng đã giao thành công',
      'order-cancelled': '[NextMart] Đơn hàng đã bị hủy',
      'refund-approved': '[NextMart] Yêu cầu hoàn tiền được chấp nhận',
      'refund-rejected': '[NextMart] Yêu cầu hoàn tiền bị từ chối',
      'refund-completed': '[NextMart] Hoàn tiền thành công',
    };
    return subjects[template] ?? `[NextMart] Thông báo: ${template}`;
  }

  private buildHtml(template: string, data: Record<string, unknown>): string {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>NextMart Notification</h2>
        <p>Template: <strong>${template}</strong></p>
        <pre style="background:#f5f5f5;padding:16px;border-radius:4px">${JSON.stringify(data, null, 2)}</pre>
        <hr/>
        <small style="color:#999">NextMart — E-commerce platform</small>
      </div>
    `;
  }
}
