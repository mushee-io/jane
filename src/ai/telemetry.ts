import type { FeedbackSignal, ModelProfile, ModelTelemetry } from "./types.js";

function empty(modelId: string): ModelTelemetry {
  return {
    modelId,
    requests: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    averageLatencyMs: 0,
    totalCostUsd: 0
  };
}

export class JaneTelemetry {
  private readonly metrics = new Map<string, ModelTelemetry>();

  get(modelId: string): ModelTelemetry {
    return { ...(this.metrics.get(modelId) ?? empty(modelId)) };
  }

  reliability(modelId: string): number {
    const metric = this.metrics.get(modelId) ?? empty(modelId);
    // Bayesian prior keeps new models from being over-penalised by a tiny sample.
    return (9.4 + metric.successes) / (10 + metric.requests);
  }

  effectiveQuality(model: ModelProfile): number {
    const metric = this.metrics.get(model.id) ?? empty(model.id);
    const feedbackCount = metric.positiveFeedback + metric.negativeFeedback;
    if (feedbackCount === 0) return model.qualityScore;
    const feedback = (4 + metric.positiveFeedback) / (5 + feedbackCount);
    return Math.max(0.25, Math.min(0.99, model.qualityScore * 0.72 + feedback * 0.28));
  }

  recordExecution(modelId: string, success: boolean, latencyMs: number, costUsd: number): void {
    const current = this.metrics.get(modelId) ?? empty(modelId);
    const requests = current.requests + 1;
    const averageLatencyMs = ((current.averageLatencyMs * current.requests) + latencyMs) / requests;
    this.metrics.set(modelId, {
      ...current,
      requests,
      successes: current.successes + (success ? 1 : 0),
      failures: current.failures + (success ? 0 : 1),
      averageLatencyMs,
      totalCostUsd: current.totalCostUsd + Math.max(0, costUsd)
    });
  }

  recordFeedback(modelId: string, signal: FeedbackSignal): void {
    const current = this.metrics.get(modelId) ?? empty(modelId);
    this.metrics.set(modelId, {
      ...current,
      retries: current.retries + (signal === "retry" ? 1 : 0),
      positiveFeedback: current.positiveFeedback + (signal === "thumbs_up" || signal === "success" ? 1 : 0),
      negativeFeedback: current.negativeFeedback + (signal === "thumbs_down" || signal === "failure" || signal === "retry" ? 1 : 0)
    });
  }

  snapshot(): ModelTelemetry[] {
    return [...this.metrics.values()].map((entry) => ({ ...entry }));
  }
}
