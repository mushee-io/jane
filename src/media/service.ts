import { randomUUID } from "node:crypto";
import { fal } from "@fal-ai/client";
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

function nativeFalModels(): MediaModel[] {
  if (!process.env.FAL_KEY) return [];
  return [
    {
      id: "fal-flux-schnell",
      provider: "fal",
      label: "FLUX.1 Schnell",
      modality: "image",
      operations: ["text-to-image"],
      endpoint: process.env.FAL_IMAGE_MODEL ?? "fal-ai/flux/schnell",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.84,
      latencyScore: 0.96,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-flux-dev-edit",
      provider: "fal",
      label: "FLUX.1 Dev Image Edit",
      modality: "image",
      operations: ["image-edit"],
      endpoint: process.env.FAL_IMAGE_EDIT_MODEL ?? "fal-ai/flux/dev/image-to-image",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.89,
      latencyScore: 0.78,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-wan-27-text-video",
      provider: "fal",
      label: "Wan 2.7 Text to Video",
      modality: "video",
      operations: ["text-to-video"],
      endpoint: process.env.FAL_VIDEO_TEXT_MODEL ?? "fal-ai/wan/v2.7/text-to-video",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.94,
      latencyScore: 0.56,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-wan-27-image-video",
      provider: "fal",
      label: "Wan 2.7 Image to Video",
      modality: "video",
      operations: ["image-to-video"],
      endpoint: process.env.FAL_VIDEO_IMAGE_MODEL ?? "fal-ai/wan/v2.7/image-to-video",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.94,
      latencyScore: 0.56,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    }
  ];
}

function models(): MediaModel[] {
  const raw = process.env.JANE_MEDIA_MODELS_JSON;
  let configured: MediaModel[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MediaModel[];
      configured = Array.isArray(parsed) ? parsed.filter((model) => model?.id && model?.endpoint) : [];
    } catch {
      configured = [];
    }
  }
  return [...nativeFalModels(), ...configured];
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

    if (model.provider === "fal") {
      if (!process.env.FAL_KEY) throw new Error("MEDIA_PROVIDER_API_KEY_NOT_CONFIGURED");
      fal.config({ credentials: process.env.FAL_KEY });

      if (request.modality === "video") {
        if (!request.prompt?.trim()) throw new Error("VIDEO_PROMPT_REQUIRED");
        const input: Record<string, unknown> = {
          prompt: request.prompt,
          resolution: request.metadata?.resolution ?? process.env.FAL_VIDEO_RESOLUTION ?? "720p",
          duration: request.durationSeconds ?? Number(process.env.FAL_VIDEO_DURATION_SECONDS ?? 5),
          enable_prompt_expansion: true,
          enable_safety_checker: true
        };
        const aspectRatio = request.metadata?.aspectRatio ?? request.metadata?.aspect_ratio;
        if (typeof aspectRatio === "string") input.aspect_ratio = aspectRatio;

        if (request.operation === "image-to-video") {
          const imageUrl = request.inputUrl ?? request.inputBase64;
          if (!imageUrl) throw new Error("IMAGE_INPUT_REQUIRED");
          input.image_url = imageUrl;
        }

        const queued = await fal.queue.submit(model.endpoint, { input });
        return {
          id:`media_${randomUUID().replace(/-/g,"")}`,
          modality:request.modality,
          operation:request.operation,
          provider:model.provider,
          model:model.id,
          status:"queued",
          requestId:queued.request_id,
          estimatedCostUsd:model.pricePerGeneration ?? null,
          routeScore:Number(route.selected.score.toFixed(4)),
          alternatives:route.alternatives.map((item) => ({
            id:item.model.id,
            provider:item.model.provider,
            estimatedCostUsd:item.model.pricePerGeneration ?? null
          })),
          output:null
        };
      }

      const baseInput: Record<string, unknown> = {
        prompt: request.prompt,
        num_images: 1,
        enable_safety_checker: true,
        output_format: request.format === "png" ? "png" : "jpeg"
      };
      const requestedSize = request.metadata?.size;
      if (typeof requestedSize === "string") baseInput.image_size = requestedSize;

      if (request.operation === "image-edit") {
        const imageUrl = request.inputUrl ?? request.inputBase64;
        if (!imageUrl) throw new Error("IMAGE_INPUT_REQUIRED");
        baseInput.image_url = imageUrl;
      }

      const result = await fal.subscribe(model.endpoint, {
        input: baseInput
      });
      const body = (result.data ?? {}) as Record<string, unknown>;

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
        requestId: result.requestId,
        output: body
      };
    }

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

  async status(modelId: string, requestId: string) {
    const model = models().find((candidate) => candidate.id === modelId);
    if (!model) throw new Error("MEDIA_MODEL_NOT_FOUND");
    if (model.provider !== "fal") throw new Error("MEDIA_STATUS_NOT_SUPPORTED");
    if (!process.env.FAL_KEY) throw new Error("MEDIA_PROVIDER_API_KEY_NOT_CONFIGURED");
    if (!requestId.trim()) throw new Error("MEDIA_REQUEST_ID_REQUIRED");

    fal.config({ credentials: process.env.FAL_KEY });
    const queueStatus = await fal.queue.status(model.endpoint, {
      requestId,
      logs: false
    });

    if (queueStatus.status === "COMPLETED") {
      const result = await fal.queue.result(model.endpoint, { requestId });
      return {
        status: "completed",
        provider: model.provider,
        model: model.id,
        requestId,
        output: (result.data ?? {}) as Record<string, unknown>
      };
    }

    return {
      status: queueStatus.status === "IN_QUEUE" ? "queued" : "processing",
      provider: model.provider,
      model: model.id,
      requestId,
      providerStatus: queueStatus.status
    };
  }
}
