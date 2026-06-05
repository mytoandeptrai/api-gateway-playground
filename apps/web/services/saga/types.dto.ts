export type SagaStatus =
  | "RUNNING"
  | "COMPLETED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "FAILED";

export type SagaStepStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "COMPENSATING"
  | "COMPENSATED"
  | "SKIPPED";

export type SagaStep = {
  stepName: string;
  label: string;
  icon: string;
  status: SagaStepStatus;
  commandTopic: string | null;
  retryCount: number;
  failedReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
};

export type SagaTrace = {
  sagaId: string;
  sagaType: string;
  status: SagaStatus;
  currentStep: string;
  cancelReason: string | null;
  startedAt: string;
  updatedAt: string;
  durationMs: number | null;
  steps: SagaStep[];
};

export type SagaTraceResponse = {
  orderId: string;
  sagas: SagaTrace[];
};
