export type JaneModality = "text" | "image" | "video" | "audio" | "speech" | "embedding" | "search";

export interface UnifiedModel {
  id: string;
  label: string;
  provider: string;
  modality: JaneModality;
  capabilities: string[];
  priceInput?: number;
  priceOutput?: number;
  pricePerGeneration?: number;
  qualityScore: number;
  latencyScore: number;
  privacyScore: number;
  zeroRetention: boolean;
  configured: boolean;
  endpoint?: string;
  apiKeyEnv?: string;
  metadata?: Record<string, unknown>;
}

function fromEnv(): UnifiedModel[] {
  const raw = process.env.JANE_MODEL_CATALOG_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UnifiedModel[];
    return Array.isArray(parsed)
      ? parsed.filter((model) => model?.id && model?.provider && model?.modality)
      : [];
  } catch {
    return [];
  }
}

export function unifiedCatalog(): UnifiedModel[] {
  const defaults: UnifiedModel[] = [
    {
      id: "jane-auto-text",
      label: "33jane Auto",
      provider: "33jane",
      modality: "text",
      capabilities: ["chat","reasoning","code","vision-routing"],
      qualityScore: 0.90,
      latencyScore: 0.86,
      privacyScore: 0.92,
      zeroRetention: false,
      configured: true
    },
    {
      id: "jane-image-auto",
      label: "33jane Image Auto",
      provider: "33jane",
      modality: "image",
      capabilities: ["text-to-image","image-edit","inpaint","upscale","background-remove"],
      qualityScore: 0.90,
      latencyScore: 0.82,
      privacyScore: 0.90,
      zeroRetention: false,
      configured: Boolean(process.env.JANE_MEDIA_MODELS_JSON)
    },
    {
      id: "jane-video-auto",
      label: "33jane Video Auto",
      provider: "33jane",
      modality: "video",
      capabilities: ["text-to-video","image-to-video","extend","upscale"],
      qualityScore: 0.89,
      latencyScore: 0.72,
      privacyScore: 0.88,
      zeroRetention: false,
      configured: Boolean(process.env.JANE_MEDIA_MODELS_JSON)
    },
    {
      id: "jane-audio-auto",
      label: "33jane Audio Auto",
      provider: "33jane",
      modality: "audio",
      capabilities: ["music","sfx","transcription"],
      qualityScore: 0.88,
      latencyScore: 0.82,
      privacyScore: 0.90,
      zeroRetention: false,
      configured: Boolean(process.env.JANE_MEDIA_MODELS_JSON)
    },
    {
      id: "jane-voice-auto",
      label: "33jane Voice Auto",
      provider: "33jane",
      modality: "speech",
      capabilities: ["tts","stt","speech-to-speech","realtime"],
      qualityScore: 0.90,
      latencyScore: 0.90,
      privacyScore: 0.90,
      zeroRetention: false,
      configured: Boolean(process.env.JANE_MEDIA_MODELS_JSON)
    }
  ];
  const seen = new Set<string>();
  return [...defaults, ...fromEnv()].filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export function catalogSummary() {
  const models = unifiedCatalog();
  const byModality = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.modality] = (acc[model.modality] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: models.length,
    configured: models.filter((model) => model.configured).length,
    byModality
  };
}
