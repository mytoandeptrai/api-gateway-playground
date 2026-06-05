import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SagaInstance } from './entities/saga-instance.entity';
import { SagaStep, SagaStepStatus } from './entities/saga-step.entity';

const STEP_LABELS: Record<string, string> = {
  RESERVE_INVENTORY: 'Kiểm tra & đặt hàng tồn kho',
  AWAIT_PAYMENT: 'Chờ thanh toán',
  CONFIRM_INVENTORY: 'Xác nhận xuất kho',
  CREATE_SHIPPING: 'Tạo đơn vận chuyển',
  AWAIT_DELIVERY: 'Đang giao hàng',
  COMPLETE_ORDER: 'Hoàn thành đơn hàng',
  VALIDATE_REFUND: 'Xét duyệt hoàn tiền',
  PROCESS_REFUND: 'Xử lý hoàn tiền',
  REJECT_REFUND: 'Từ chối hoàn tiền',
  COMPLETE_REFUND: 'Hoàn tiền thành công',
  CANCELLED: 'Đơn hàng đã hủy',
};

const STATUS_ICON: Record<SagaStepStatus, string> = {
  [SagaStepStatus.COMPLETED]: '✅',
  [SagaStepStatus.FAILED]: '❌',
  [SagaStepStatus.COMPENSATED]: '↩️',
  [SagaStepStatus.COMPENSATING]: '⏳',
  [SagaStepStatus.IN_PROGRESS]: '🔄',
  [SagaStepStatus.PENDING]: '⏸️',
  [SagaStepStatus.SKIPPED]: '⏭️',
};

@Injectable()
export class SagaTraceService {
  constructor(
    @InjectRepository(SagaInstance)
    private readonly sagaRepo: Repository<SagaInstance>,
    @InjectRepository(SagaStep)
    private readonly stepRepo: Repository<SagaStep>,
  ) {}

  async getTraceByOrderId(orderId: string) {
    const sagas = await this.sagaRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });

    if (!sagas.length) {
      throw new NotFoundException(`No saga found for orderId: ${orderId}`);
    }

    const results = await Promise.all(
      sagas.map(async (saga) => {
        const steps = await this.stepRepo.find({
          where: { sagaId: saga.id },
          order: { startedAt: 'ASC', createdAt: 'ASC' },
        });

        const formattedSteps = steps.map((step) => {
          const durationMs =
            step.startedAt && step.completedAt
              ? step.completedAt.getTime() - step.startedAt.getTime()
              : null;

          return {
            stepName: step.stepName,
            label: STEP_LABELS[step.stepName] ?? step.stepName,
            icon: STATUS_ICON[step.status],
            status: step.status,
            commandTopic: step.commandTopic,
            retryCount: step.retryCount,
            failedReason: step.failedReason,
            startedAt: step.startedAt,
            completedAt: step.completedAt,
            durationMs,
          };
        });

        const sagaDurationMs =
          saga.createdAt && saga.updatedAt
            ? saga.updatedAt.getTime() - saga.createdAt.getTime()
            : null;

        return {
          sagaId: saga.id,
          sagaType: saga.sagaType,
          status: saga.status,
          currentStep: saga.currentStep,
          cancelReason: saga.cancelReason,
          startedAt: saga.createdAt,
          updatedAt: saga.updatedAt,
          durationMs: sagaDurationMs,
          steps: formattedSteps,
        };
      }),
    );

    return {
      orderId,
      sagas: results,
    };
  }
}
