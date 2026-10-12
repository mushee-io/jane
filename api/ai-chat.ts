import { JaneAIService } from "../src/ai/service.js";
import { janeRequestSchema } from "../src/ai/schemas.js";
import { requireJaneUser } from "../src/auth/neon.js";
import { recordUsage } from "../src/db/jane.js";

export const config = { maxDuration: 30 };

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    try {
      const body = await request.json();
      const input = janeRequestSchema.parse(body);
      const jane = new JaneAIService();
      const result = await jane.chat(input);
      try{
        const user=await requireJaneUser(request);
        await recordUsage({
          userId:user.id,
          requestId:result.id,
          modality:"text",
          provider:result.model?.provider,
          modelId:result.model?.id,
          inputTokens:result.usage?.inputTokens,
          outputTokens:result.usage?.outputTokens,
          costUsd:result.route?.actualCostUsd
        });
      }catch(_){}
      return Response.json(result, {
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    } catch (error) {
      const value = error as Error & { route?: unknown; failures?: unknown };
      const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
      return Response.json(
        { error: value.message || "JANE_CHAT_FAILED", route: value.route, failures: value.failures },
        { status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } }
      );
    }
  }
};
