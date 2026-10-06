export type JaneMode = "auto" | "fast" | "reason" | "code" | "vision" | "private";
export type TaskKind = "general" | "fast" | "reasoning" | "code" | "vision";
export type FeedbackSignal = "success" | "failure" | "retry" | "thumbs_up" | "thumbs_down";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ClientPrivacySummary {
  applied: boolean;
  redactedCount: number;
  categories: string[];
}

export interface JaneRequest {
  messages: ChatMessage[];
  mode: JaneMode;
  maxCostUsd?: number;
  clientPrivacy?: ClientPrivacySummary;
}

export interface ModelProfile {
  id: string;
  provider: "openai" | "groq" | "openrouter" | "private";
  model: string;
  label: string;
  capabilities: TaskKind[];
  contextWindow: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  qualityScore: number;
  latencyScore: number;
  privacyScore: number;
  zeroRetention: boolean;
  configured: boolean;
}

export interface ModelTelemetry {
  modelId: string;
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  positiveFeedback: number;
  negativeFeedback: number;
  averageLatencyMs: number;
  totalCostUsd: number;
}

export interface RouteCandidate {
  model: ModelProfile;
  estimatedCostUsd: number;
  effectiveCostUsd: number;
  effectiveQuality: number;
  reliability: number;
  score: number;
  reasons: string[];
}

export interface RouteDecision {
  requestId: string;
  mode: JaneMode;
  task: TaskKind;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requiredQuality: number;
  selected: RouteCandidate | null;
  alternatives: RouteCandidate[];
  estimatedSavingsPercent: number | null;
}

export interface CompletionResult {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  rawModel?: string;
}
