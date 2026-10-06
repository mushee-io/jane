import type { ModelProfile } from "./types.js";

export type FailureClass =
  | "timeout"
  | "rate_limit"
  | "provider_unavailable"
  | "bad_request"
  | "auth"
  | "privacy"
  | "unknown";

export interface FailureRecord {
  modelId: string;
  provider: string;
  classification: FailureClass;
  message: string;
  retryable: boolean;
  latencyMs: number;
}

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  lastFailure?: FailureClass;
}

export class FailoverController {
  private readonly circuits = new Map<string, CircuitState>();

  constructor(
    private readonly failureThreshold = Number(process.env.JANE_CIRCUIT_FAILURE_THRESHOLD ?? 3),
    private readonly cooldownMs = Number(process.env.JANE_CIRCUIT_COOLDOWN_MS ?? 30_000)
  ) {}

  isAvailable(modelId: string): boolean {
    const state = this.circuits.get(modelId);
    if (!state) return true;
    if (state.openUntil <= Date.now()) {
      if (state.openUntil > 0) this.circuits.set(modelId, { ...state, openUntil: 0, consecutiveFailures: 0 });
      return true;
    }
    return false;
  }

  recordSuccess(modelId: string): void {
    this.circuits.set(modelId, { consecutiveFailures: 0, openUntil: 0 });
  }

  recordFailure(modelId: string, classification: FailureClass): void {
    const current = this.circuits.get(modelId) ?? { consecutiveFailures: 0, openUntil: 0 };
    const failures = current.consecutiveFailures + 1;
    const openUntil = failures >= this.failureThreshold ? Date.now() + this.cooldownMs : current.openUntil;
    this.circuits.set(modelId, { consecutiveFailures: failures, openUntil, lastFailure: classification });
  }

  snapshot(models: ModelProfile[]) {
    return models.map((model) => {
      const state = this.circuits.get(model.id);
      return {
        modelId: model.id,
        provider: model.provider,
        available: this.isAvailable(model.id),
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        openUntil: state?.openUntil ?? 0,
        lastFailure: state?.lastFailure ?? null
      };
    });
  }
}

export function classifyProviderFailure(error: unknown): FailureClass {
  const message = error instanceof Error ? error.message : String(error);
  if (/PRIVACY_POLICY_BLOCKED/i.test(message)) return "privacy";
  if (/timeout|abort/i.test(message)) return "timeout";
  if (/PROVIDER_ERROR:429|rate.?limit/i.test(message)) return "rate_limit";
  if (/PROVIDER_ERROR:5\d\d|unavailable|overloaded|ECONNRESET|fetch failed/i.test(message)) return "provider_unavailable";
  if (/PROVIDER_ERROR:401|PROVIDER_ERROR:403|API_KEY_NOT_CONFIGURED|auth/i.test(message)) return "auth";
  if (/PROVIDER_ERROR:4\d\d|invalid|bad.?request/i.test(message)) return "bad_request";
  return "unknown";
}

export function isRetryableFailure(classification: FailureClass): boolean {
  return classification === "timeout"
    || classification === "rate_limit"
    || classification === "provider_unavailable"
    || classification === "unknown";
}
