import { randomUUID } from "node:crypto";
import { fal } from "@fal-ai/client";
import { JaneAIService } from "../ai/service.js";
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
    },
    {
      id: "fal-stable-audio-25",
      provider: "fal",
      label: "Stable Audio 2.5",
      modality: "audio",
      operations: ["music"],
      endpoint: process.env.FAL_MUSIC_MODEL ?? "fal-ai/stable-audio-25/text-to-audio",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.91,
      latencyScore: 0.62,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-elevenlabs-sfx",
      provider: "fal",
      label: "ElevenLabs Sound Effects V2",
      modality: "audio",
      operations: ["sfx"],
      endpoint: process.env.FAL_SFX_MODEL ?? "fal-ai/elevenlabs/sound-effects/v2",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.93,
      latencyScore: 0.84,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-audio-transcription",
      provider: "fal",
      label: "fal Speech to Text",
      modality: "audio",
      operations: ["transcription"],
      endpoint: process.env.FAL_STT_MODEL ?? "fal-ai/speech-to-text",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.90,
      latencyScore: 0.94,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-kokoro-british",
      provider: "fal",
      label: "Kokoro British English",
      modality: "speech",
      operations: ["tts"],
      endpoint: process.env.FAL_TTS_MODEL ?? "fal-ai/kokoro/british-english",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.88,
      latencyScore: 0.96,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "fal-speech-to-text",
      provider: "fal",
      label: "fal Speech to Text",
      modality: "speech",
      operations: ["stt"],
      endpoint: process.env.FAL_STT_MODEL ?? "fal-ai/speech-to-text",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.90,
      latencyScore: 0.94,
      privacyScore: 0.60,
      zeroRetention: false,
      configured: true
    },
    {
      id: "jane-voice-beta",
      provider: "jane-voice",
      label: "Jane Voice Beta",
      modality: "speech",
      operations: ["speech-to-speech"],
      endpoint: "jane://voice-beta",
      apiKeyEnv: "FAL_KEY",
      qualityScore: 0.92,
      latencyScore: 0.82,
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

function routeMetadata(route: ReturnType<JaneMediaService["choose"]>) {
  if (!route.selected) return {};
  return {
    estimatedCostUsd: route.selected.model.pricePerGeneration ?? null,
    routeScore: Number(route.selected.score.toFixed(4)),
    alternatives: route.alternatives.map((item) => ({
      id:item.model.id,
      provider:item.model.provider,
      estimatedCostUsd:item.model.pricePerGeneration ?? null
    }))
  };
}

function audioSource(request: MediaRequest) {
  return request.inputUrl ?? request.inputBase64;
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

  private async voiceBeta(request: MediaRequest, route: ReturnType<JaneMediaService["choose"]>) {
    if (request.privacy && request.privacy !== "standard") {
      throw new Error("VOICE_BETA_PRIVATE_ROUTE_NOT_CONFIGURED");
    }
    if (!process.env.FAL_KEY) throw new Error("MEDIA_PROVIDER_API_KEY_NOT_CONFIGURED");
    const source = audioSource(request);
    if (!source) throw new Error("AUDIO_INPUT_REQUIRED");

    fal.config({ credentials: process.env.FAL_KEY });
    const stt = await fal.subscribe(process.env.FAL_STT_MODEL ?? "fal-ai/speech-to-text", {
      input: { audio_url: source, use_pnc: true }
    });
    const sttData = (stt.data ?? {}) as Record<string, unknown>;
    const transcript = String(sttData.output ?? "").trim();
    if (!transcript) throw new Error("VOICE_TRANSCRIPTION_EMPTY");

    const jane = new JaneAIService();
    const answer = await jane.chat({
      mode: "auto",
      messages: [{ role: "user", content: transcript }],
      generation: { maxOutputTokens: 700 }
    });

    const tts = await fal.subscribe(process.env.FAL_TTS_MODEL ?? "fal-ai/kokoro/british-english", {
      input: {
        prompt: answer.answer,
        voice: request.voice ?? process.env.FAL_TTS_VOICE ?? "bm_george",
        speed: 1,
        enable_safety_checker: true
      }
    });

    return {
      id:`media_${randomUUID().replace(/-/g,"")}`,
      modality:request.modality,
      operation:request.operation,
      provider:"jane-voice",
      model:"jane-voice-beta",
      ...routeMetadata(route),
      requestId:tts.requestId,
      output:{
        transcript,
        answer:answer.answer,
        audio:(tts.data as Record<string, unknown>)?.audio ?? null,
        aiModel:answer.model,
        route:answer.route
      }
    };
  }

  async generate(request: MediaRequest) {
    const route = this.choose(request);
    if (!route.selected) throw new Error("NO_MEDIA_ROUTE_AVAILABLE");
    const model = route.selected.model;
    const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
    if (model.apiKeyEnv && !apiKey) throw new Error("MEDIA_PROVIDER_API_KEY_NOT_CONFIGURED");

    if (model.provider === "jane-voice") {
      return this.voiceBeta(request, route);
    }

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
          ...routeMetadata(route),
          output:null
        };
      }

      if (request.modality === "audio") {
        if (request.operation === "transcription") {
          const source = audioSource(request);
          if (!source) throw new Error("AUDIO_INPUT_REQUIRED");
          const result = await fal.subscribe(model.endpoint, { input: { audio_url: source, use_pnc: true } });
          return {
            id:`media_${randomUUID().replace(/-/g,"")}`,
            modality:request.modality,
            operation:request.operation,
            provider:model.provider,
            model:model.id,
            ...routeMetadata(route),
            requestId:result.requestId,
            output:(result.data ?? {}) as Record<string, unknown>
          };
        }

        if (!request.prompt?.trim()) throw new Error("AUDIO_PROMPT_REQUIRED");
        const input: Record<string, unknown> = request.operation === "sfx"
          ? {
              text:request.prompt,
              duration_seconds:Math.min(22, Math.max(0.5, request.durationSeconds ?? 6)),
              prompt_influence:0.3,
              output_format:"mp3_44100_128"
            }
          : {
              prompt:request.prompt,
              seconds_total:Math.min(190, Math.max(5, request.durationSeconds ?? 20)),
              num_inference_steps:8,
              guidance_scale:1,
              enable_safety_checker:true
            };
        const queued = await fal.queue.submit(model.endpoint, { input });
        return {
          id:`media_${randomUUID().replace(/-/g,"")}`,
          modality:request.modality,
          operation:request.operation,
          provider:model.provider,
          model:model.id,
          status:"queued",
          requestId:queued.request_id,
          ...routeMetadata(route),
          output:null
        };
      }

      if (request.modality === "speech") {
        if (request.operation === "stt") {
          const source = audioSource(request);
          if (!source) throw new Error("AUDIO_INPUT_REQUIRED");
          const result = await fal.subscribe(model.endpoint, { input: { audio_url: source, use_pnc: true } });
          return {
            id:`media_${randomUUID().replace(/-/g,"")}`,
            modality:request.modality,
            operation:request.operation,
            provider:model.provider,
            model:model.id,
            ...routeMetadata(route),
            requestId:result.requestId,
            output:(result.data ?? {}) as Record<string, unknown>
          };
        }

        if (request.operation === "tts") {
          if (!request.prompt?.trim()) throw new Error("TTS_TEXT_REQUIRED");
          const result = await fal.subscribe(model.endpoint, {
            input: {
              prompt:request.prompt,
              voice:request.voice ?? process.env.FAL_TTS_VOICE ?? "bm_george",
              speed:1,
              enable_safety_checker:true
            }
          });
          return {
            id:`media_${randomUUID().replace(/-/g,"")}`,
            modality:request.modality,
            operation:request.operation,
            provider:model.provider,
            model:model.id,
            ...routeMetadata(route),
            requestId:result.requestId,
            output:(result.data ?? {}) as Record<string, unknown>
          };
        }
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

      const result = await fal.subscribe(model.endpoint, { input: baseInput });
      const body = (result.data ?? {}) as Record<string, unknown>;
      return {
        id:`media_${randomUUID().replace(/-/g,"")}`,
        modality:request.modality,
        operation:request.operation,
        provider:model.provider,
        model:model.id,
        ...routeMetadata(route),
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
        ...routeMetadata(route),
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
