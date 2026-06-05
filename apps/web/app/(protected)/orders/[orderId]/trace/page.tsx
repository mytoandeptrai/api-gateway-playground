"use client";

import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  SkipForward,
  RefreshCw,
} from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useGetSagaTraceQuery } from "@/services/saga";
import type {
  SagaStatus,
  SagaStepStatus,
  SagaTrace,
} from "@/services/saga/types.dto";
import { formatDate } from "@/utils/format";

// ─── Status configs ───────────────────────────────────────────────────────────

const SAGA_STATUS_CONFIG: Record<
  SagaStatus,
  { label: string; className: string }
> = {
  RUNNING: {
    label: "Đang chạy",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  COMPLETED: {
    label: "Hoàn thành",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  COMPENSATING: {
    label: "Đang rollback",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
  COMPENSATED: {
    label: "Đã rollback",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  FAILED: {
    label: "Thất bại",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const STEP_STATUS_CONFIG: Record<
  SagaStepStatus,
  { icon: React.ReactNode; lineClass: string; dotClass: string }
> = {
  COMPLETED: {
    icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
    lineClass: "bg-green-400",
    dotClass: "border-green-500 bg-green-50",
  },
  FAILED: {
    icon: <XCircle className="w-5 h-5 text-red-500" />,
    lineClass: "bg-red-300",
    dotClass: "border-red-500 bg-red-50",
  },
  COMPENSATED: {
    icon: <RefreshCw className="w-5 h-5 text-yellow-600" />,
    lineClass: "bg-yellow-300",
    dotClass: "border-yellow-500 bg-yellow-50",
  },
  COMPENSATING: {
    icon: <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />,
    lineClass: "bg-orange-300",
    dotClass: "border-orange-500 bg-orange-50",
  },
  IN_PROGRESS: {
    icon: <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />,
    lineClass: "bg-blue-300",
    dotClass: "border-blue-500 bg-blue-50",
  },
  PENDING: {
    icon: <Clock className="w-5 h-5 text-gray-400" />,
    lineClass: "bg-gray-200",
    dotClass: "border-gray-300 bg-gray-50",
  },
  SKIPPED: {
    icon: <SkipForward className="w-5 h-5 text-gray-400" />,
    lineClass: "bg-gray-200",
    dotClass: "border-gray-300 bg-gray-50",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null) {
  if (ms === null) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SagaCard({ saga, index }: { saga: SagaTrace; index: number }) {
  const statusCfg = SAGA_STATUS_CONFIG[saga.status];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">
            {index + 1}.{" "}
            {saga.sagaType === "ORDER_SAGA" ? "Order Saga" : "Refund Saga"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {saga.durationMs !== null && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(saga.durationMs)}
              </span>
            )}
            <Badge variant="outline" className={statusCfg.className}>
              {statusCfg.label}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono break-all">
          sagaId: {saga.sagaId}
        </p>
        {saga.cancelReason && (
          <div className="flex items-start gap-1.5 mt-1 p-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {saga.cancelReason}
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="relative">
          {saga.steps.map((step, i) => {
            const cfg = STEP_STATUS_CONFIG[step.status];
            const isLast = i === saga.steps.length - 1;

            return (
              <div key={`${step.stepName}-${i}`} className="flex gap-3">
                {/* Timeline column */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 ${cfg.dotClass}`}
                  >
                    {cfg.icon}
                  </div>
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 min-h-4 my-1 ${cfg.lineClass}`}
                    />
                  )}
                </div>

                {/* Content column */}
                <div className="pb-5 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{step.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {step.stepName}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {step.durationMs !== null && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(step.durationMs)}
                        </span>
                      )}
                      {step.startedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(step.startedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {step.commandTopic && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Topic:{" "}
                      <span className="font-mono text-blue-600">
                        {step.commandTopic}
                      </span>
                    </p>
                  )}

                  {step.retryCount > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-orange-600">
                      <RefreshCw className="w-3 h-3" />
                      Retry: {step.retryCount} lần
                    </div>
                  )}

                  {step.failedReason && (
                    <div className="mt-1.5 flex items-start gap-1.5 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                      <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {step.failedReason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TraceSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5 pt-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SagaTracePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useGetSagaTraceQuery(orderId);

  // data = BaseResponseType<SagaTraceResponse>, data.data = SagaTraceResponse
  const trace = data?.data;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Saga Trace</h1>
          <p className="text-xs text-muted-foreground font-mono break-all">
            orderId: {orderId}
          </p>
        </div>
      </div>

      {isLoading && <TraceSkeleton />}

      {isError && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">Không tìm thấy saga cho order này.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {trace && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {trace.sagas.length} saga{trace.sagas.length > 1 ? "s" : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Làm mới
            </Button>
          </div>

          {trace.sagas.map((saga, i) => (
            <SagaCard key={saga.sagaId} saga={saga} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
