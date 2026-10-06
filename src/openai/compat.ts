import { z } from "zod";
import type { JaneMode, JaneRequest } from "../ai/types.js";

export const openAIChatSchema = z.object({
  model: z.string().default("33jane-auto"),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).min(1),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  user: z.string().max(256).optional(),
  jane: z.object({
    maxCostUsd: z.number().positive().max(100).optional(),
    privacyApplied: z.boolean().optional(),
    redactedCount: z.number().int().min(0).optional(),
    redactionCategories: z.array(z.string()).optional(),
    spendingPolicy: z.any().optional()
  }).optional()
});

export type OpenAIChatInput = z.infer<typeof openAIChatSchema>;

export function modelToMode(model: string): JaneMode {
  const value = model.toLowerCase();
  if (value.endsWith("-fast")) return "fast";
  if (value.endsWith("-reason")) return "reason";
  if (value.endsWith("-code")) return "code";
  if (value.endsWith("-vision")) return "vision";
  if (value.endsWith("-private")) return "private";
  if (value.endsWith("-confidential")) return "confidential";
  return "auto";
}

export function toJaneRequest(input: OpenAIChatInput): JaneRequest {
  return {
    mode: modelToMode(input.model),
    messages: input.messages,
    maxCostUsd: input.jane?.maxCostUsd,
    clientPrivacy: {
      applied: input.jane?.privacyApplied ?? false,
      redactedCount: input.jane?.redactedCount ?? 0,
      categories: input.jane?.redactionCategories ?? []
    },
    spendingPolicy: input.jane?.spendingPolicy
  };
}

export function toOpenAIResponse(result: any, requestedModel: string) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl_${String(result.id).replace(/-/g, "")}`,
    object: "chat.completion",
    created,
    model: requestedModel,
    choices: [{
      index: 0,
      message: { role: "assistant", content: result.answer },
      finish_reason: "stop"
    }],
    usage: {
      prompt_tokens: result.usage?.inputTokens ?? 0,
      completion_tokens: result.usage?.outputTokens ?? 0,
      total_tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0)
    },
    jane: {
      request_id: result.id,
      routed_model: result.model,
      route: result.route,
      privacy_receipt: result.privacyReceipt,
      settlement: result.settlement ?? null
    }
  };
}

export function openAIStream(result: any, requestedModel: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const id = `chatcmpl_${String(result.id).replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);
  const content = String(result.answer ?? "");
  const chunks = content.match(/.{1,80}(?:\s|$)/gs) ?? [content];

  return new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      send({
        id, object: "chat.completion.chunk", created, model: requestedModel,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      });
      for (const chunk of chunks) {
        send({
          id, object: "chat.completion.chunk", created, model: requestedModel,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
        });
      }
      send({
        id, object: "chat.completion.chunk", created, model: requestedModel,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        jane: { request_id: result.id, route: result.route, privacy_receipt: result.privacyReceipt }
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

export function openAIModels() {
  const now = Math.floor(Date.now() / 1000);
  return ["auto","fast","reason","code","vision","private","confidential"].map((mode) => ({
    id: `33jane-${mode}`,
    object: "model",
    created: now,
    owned_by: "33jane"
  }));
}
