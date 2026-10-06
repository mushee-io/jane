export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  dimensions?: number;
  encoding_format?: "float" | "base64";
}

export class JaneEmbeddingService {
  status() {
    return {
      configured: Boolean(process.env.JANE_EMBEDDING_ENDPOINT),
      model: process.env.JANE_EMBEDDING_MODEL ?? "jane-embedding"
    };
  }

  async create(request: EmbeddingRequest) {
    const endpoint = process.env.JANE_EMBEDDING_ENDPOINT;
    if (!endpoint) throw new Error("EMBEDDING_PROVIDER_NOT_CONFIGURED");
    const apiKey = process.env.JANE_EMBEDDING_API_KEY;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        input: request.input,
        model: request.model ?? process.env.JANE_EMBEDDING_MODEL ?? "jane-embedding",
        ...(request.dimensions ? { dimensions: request.dimensions } : {}),
        ...(request.encoding_format ? { encoding_format: request.encoding_format } : {})
      })
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`EMBEDDING_PROVIDER_ERROR:${response.status}`);
    return payload;
  }
}
