import { randomUUID } from "node:crypto";
import type { JaneModality } from "../catalog/unified.js";

export interface MediaModel {
  id: string;
  provider: string;
  label: string;
  modality: Extract<JaneModality, "image"|"video"|"audio"|"speech">;
  operations: string[];
  endpoint: string;
  apiKeyEnv?: string;
  pricePerGeneration?: number;
  qualityScore: number;
  latencyScore: number;
  privacyScore: number;
  zeroRetention: boolean;
  configured?: boolean;
}

export interface MediaRequest {
  modality: MediaModel["modality"];
  operation: string;
  prompt?: string;
  inputUrl?: string;
  inputBase64?: string;
  durationSeconds?: number;
  voice?: string;
  format?: string;
  maxCostUsd?: number;
  privacy?: "standard"|"private"|"confidential";
  metadata?: Record<string, unknown>;
}

function models(): MediaModel[] {
  const raw = process.env.JANE_MEDIA_MODELS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MediaModel[];
    return Array.isArray(parsed) ? parsed.filter((model) => model?.id && model?.endpoint) : [];
  } catch {
    return [];
  }
}

function score(model: MediaModel, request: MediaRequest): number {
  const price = model.pricePerGeneration ?? 0.05;
  const costScore = 1 / (1 + price * 8);
  const privacyWeight = request.privacy === "confidential" ? 0.38 : request.privacy === "private" ? 0.25 : 0.10;
  const qualityWeight = 0.42;
  const latencyWeight = 0.18;
  const costWeight = Math.max(0.05, 1 - privacyWeight - qualityWeight - latencyWeight);
  return model.qualityScore*qualityWeight + model.latencyScore*latencyWeight + model.privacyScore*privacyWeight + costScore*costWeight;
}

export class JaneMediaService {
  list() {
    return models().map(({ apiKeyEnv, endpoint, ...model }) => ({
      ...model,
      configured: Boolean(endpoint && (!apiKeyEnv || process.env[apiKeyEnv]))
    }));
  }

  choose(request: MediaRequest) {
    const candidates = models()
      .filter((model) => model.modality === request.modality)
      .filter((model) => model.operations.includes(request.operation))
      .filter((model) => !request.maxCostUsd || (model.pricePerGeneration ?? 0) <= request.maxCostUsd)
      .filter((model) => request.privacy !== "confidential" || (model.zeroRetention && model.privacyScore >= 0.95))
      .filter((model) => request.privacy !== "private" || model.privacyScore >= 0.85)
      .map((model) => ({ model, score: score(model, request) }))
      .sort((a,b) => b.score-a.score);
    return { selected: candidates[0] ?? null, alternatives: candidates.slice(1,4) };
  }

  async generate(request: MediaRequest) {
    const route = this.choose(request);
    if (!route.selected) throw new Error("NO_MEDIA_ROUTE_AVAILABLE");
    const model = route.selected.model;
    const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
    if (model.apiKeyEnv && !apiKey) throw new Error("MEDIA_PROVIDER_API_KEY_NOT_CONFIGURED");

    const controller = new AbortController();
    const timeout = Number(process.env.JANE_MEDIA_TIMEOUT_MS ?? 120_000);
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(model.endpoint, {
        method:"POST",
        headers:{
          "content-type":"application/json",
          ...(apiKey ? { authorization:`Bearer ${apiKey}` } : {})
        },
        signal:controller.signal,
        body:JSON.stringify({
          model:model.id,
          operation:request.operation,
          prompt:request.prompt,
          input_url:request.inputUrl,
          input_base64:request.inputBase64,
          duration_seconds:request.durationSeconds,
          voice:request.voice,
          format:request.format,
          metadata:request.metadata
        })
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(`MEDIA_PROVIDER_ERROR:${response.status}`);
      return {
        id:`media_${randomUUID().replace(/-/g,"")}`,
        modality:request.modality,
        operation:request.operation,
        provider:model.provider,
        model:model.id,
        estimatedCostUsd:model.pricePerGeneration ?? null,
        routeScore:Number(route.selected.score.toFixed(4)),
        alternatives:route.alternatives.map((item) => ({
          id:item.model.id,
          provider:item.model.provider,
          estimatedCostUsd:item.model.pricePerGeneration ?? null
        })),
        output:body
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
