import type { ChatMessage, CompletionResult, JaneGenerationConfig, JaneImageAttachment, ModelProfile } from "./types.js";

interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

function configFor(model: ModelProfile): ProviderConfig {
  const provider = model.provider;
  if (provider === "network") {
    const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
    return {
      baseUrl: model.endpoint ?? "",
      apiKey
    };
  }
  if (provider === "jane") {
    return {
      baseUrl: process.env.JANE_COMPUTE_BASE_URL ?? "",
      apiKey: process.env.JANE_COMPUTE_API_KEY
    };
  }
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

export async function completeChat(
  model: ModelProfile,
  messages: ChatMessage[],
  options: { generation?: JaneGenerationConfig; attachments?: JaneImageAttachment[] } = {}
): Promise<CompletionResult> {
  const config = configFor(model);
  if (!config.baseUrl) throw new Error("PROVIDER_BASE_URL_NOT_CONFIGURED");
  if (!["private", "network"].includes(model.provider) && !config.apiKey) throw new Error("PROVIDER_API_KEY_NOT_CONFIGURED");
  if (model.provider === "network" && model.apiKeyEnv && !config.apiKey) throw new Error("PROVIDER_API_KEY_NOT_CONFIGURED");

  const started = Date.now();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(config.headers ?? {})
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

  const timeoutMs = Number(process.env.JANE_PROVIDER_TIMEOUT_MS ?? 30_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("PROVIDER_TIMEOUT")), timeoutMs);

  const upstreamMessages: Array<Record<string, unknown>> = messages.map((message) => ({ ...message }));
  if (options.attachments?.length) {
    const index = [...messages].map((message) => message.role).lastIndexOf("user");
    if (index >= 0) {
      const user = messages[index]!;
      const parts: Array<Record<string, unknown>> = [{ type: "text", text: user.content }];
      for (const attachment of options.attachments) {
        const url = attachment.type === "image_url"
          ? attachment.url
          : `data:${attachment.mediaType ?? "image/jpeg"};base64,${attachment.data ?? ""}`;
        if (!url) continue;
        parts.push({
          type: "image_url",
          image_url: { url, detail: attachment.detail ?? "auto" }
        });
      }
      upstreamMessages[index] = { role: "user", content: parts };
    }
  }

  const generation = options.generation ?? {};

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: model.model,
        messages: upstreamMessages,
        temperature: generation.temperature ?? 0.35,
        ...(generation.topP !== undefined ? { top_p: generation.topP } : {}),
        ...(generation.maxOutputTokens !== undefined ? { max_tokens: generation.maxOutputTokens } : {}),
        stream: false
      })
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`PROVIDER_TIMEOUT:${timeoutMs}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }

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
