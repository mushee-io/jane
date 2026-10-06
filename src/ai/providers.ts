import type { ChatMessage, CompletionResult, ModelProfile } from "./types.js";

interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

function configFor(provider: ModelProfile["provider"]): ProviderConfig {
  if (provider === "openai") {
    return {
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    };
  }
  if (provider === "groq") {
    return {
      baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY
    };
  }
  if (provider === "openrouter") {
    return {
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer": process.env.JANE_PUBLIC_URL ?? "https://33jane.vercel.app",
        "X-Title": "33jane"
      }
    };
  }
  return {
    baseUrl: process.env.JANE_PRIVATE_BASE_URL ?? "",
    apiKey: process.env.JANE_PRIVATE_API_KEY
  };
}

export async function completeChat(model: ModelProfile, messages: ChatMessage[]): Promise<CompletionResult> {
  const config = configFor(model.provider);
  if (!config.baseUrl) throw new Error("PROVIDER_BASE_URL_NOT_CONFIGURED");
  if (model.provider !== "private" && !config.apiKey) throw new Error("PROVIDER_API_KEY_NOT_CONFIGURED");

  const started = Date.now();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(config.headers ?? {})
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model.model,
      messages,
      temperature: 0.35,
      stream: false
    })
  });

  const latencyMs = Date.now() - started;
  const payload = await response.json().catch(() => ({})) as {
    error?: { message?: string } | string;
    model?: string;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(`PROVIDER_ERROR:${response.status}:${message ?? "unknown"}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  const normalized = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => part.text ?? "").join("")
      : "";

  if (!normalized.trim()) throw new Error("EMPTY_PROVIDER_RESPONSE");

  return {
    content: normalized,
    inputTokens: payload.usage?.prompt_tokens,
    outputTokens: payload.usage?.completion_tokens,
    latencyMs,
    rawModel: payload.model
  };
}
