import type { ModelProfile } from "./types.js";

function num(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function modelCatalog(): ModelProfile[] {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const privateConfigured = Boolean(process.env.JANE_PRIVATE_BASE_URL && process.env.JANE_PRIVATE_MODEL);

  return [
    {
      id: "openai-reason",
      provider: "openai",
      model: process.env.OPENAI_REASON_MODEL ?? "gpt-5-mini",
      label: "Frontier Reasoning",
      capabilities: ["general", "reasoning", "code", "vision"],
      contextWindow: num("OPENAI_CONTEXT_WINDOW", 128000),
      inputCostPerMillion: num("OPENAI_INPUT_COST_PER_M", 0.25),
      outputCostPerMillion: num("OPENAI_OUTPUT_COST_PER_M", 2),
      qualityScore: num("OPENAI_QUALITY_SCORE", 0.91),
      latencyScore: num("OPENAI_LATENCY_SCORE", 0.72),
      privacyScore: num("OPENAI_PRIVACY_SCORE", 0.74),
      zeroRetention: process.env.OPENAI_ZERO_RETENTION === "true",
      configured: openaiConfigured
    },
    {
      id: "groq-fast",
      provider: "groq",
      model: process.env.GROQ_FAST_MODEL ?? "openai/gpt-oss-120b",
      label: "Ultra Fast Open Model",
      capabilities: ["general", "fast", "reasoning", "code"],
      contextWindow: num("GROQ_CONTEXT_WINDOW", 131072),
      inputCostPerMillion: num("GROQ_INPUT_COST_PER_M", 0.15),
      outputCostPerMillion: num("GROQ_OUTPUT_COST_PER_M", 0.60),
      qualityScore: num("GROQ_QUALITY_SCORE", 0.82),
      latencyScore: num("GROQ_LATENCY_SCORE", 0.96),
      privacyScore: num("GROQ_PRIVACY_SCORE", 0.70),
      zeroRetention: process.env.GROQ_ZERO_RETENTION === "true",
      configured: groqConfigured
    },
    {
      id: "openrouter-economy",
      provider: "openrouter",
      model: process.env.OPENROUTER_ECONOMY_MODEL ?? "qwen/qwen3-30b-a3b",
      label: "Economy General",
      capabilities: ["general", "fast", "reasoning", "code"],
      contextWindow: num("OPENROUTER_CONTEXT_WINDOW", 131072),
      inputCostPerMillion: num("OPENROUTER_INPUT_COST_PER_M", 0.10),
      outputCostPerMillion: num("OPENROUTER_OUTPUT_COST_PER_M", 0.30),
      qualityScore: num("OPENROUTER_QUALITY_SCORE", 0.78),
      latencyScore: num("OPENROUTER_LATENCY_SCORE", 0.82),
      privacyScore: num("OPENROUTER_PRIVACY_SCORE", 0.62),
      zeroRetention: process.env.OPENROUTER_ZERO_RETENTION === "true",
      configured: openrouterConfigured
    },
    {
      id: "jane-private",
      provider: "private",
      model: process.env.JANE_PRIVATE_MODEL ?? "private-model",
      label: "Confidential Route",
      capabilities: ["general", "fast", "reasoning", "code", "vision"],
      contextWindow: num("JANE_PRIVATE_CONTEXT_WINDOW", 128000),
      inputCostPerMillion: num("JANE_PRIVATE_INPUT_COST_PER_M", 0.40),
      outputCostPerMillion: num("JANE_PRIVATE_OUTPUT_COST_PER_M", 1.20),
      qualityScore: num("JANE_PRIVATE_QUALITY_SCORE", 0.84),
      latencyScore: num("JANE_PRIVATE_LATENCY_SCORE", 0.70),
      privacyScore: num("JANE_PRIVATE_PRIVACY_SCORE", 0.98),
      zeroRetention: true,
      configured: privateConfigured
    }
  ];
}
