import { z } from "zod";
import type { JaneMode, JaneRequest } from "../ai/types.js";

const openAIContentPartSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string().min(1).max(15_000_000),
      detail: z.enum(["auto", "low", "high"]).optional()
    })
  })
]);

export const openAIChatSchema = z.object({
  model: z.string().default("33jane-auto"),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(openAIContentPartSchema)])
  })).min(1),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
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
  const attachments: NonNullable<JaneRequest["attachments"]> = [];
  const messages = input.messages.map((message) => {
    if (typeof message.content === "string") return { role: message.role, content: message.content };
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.type === "text" ? part.text : "")
      .join("\n");
    for (const part of message.content) {
      if (part.type !== "image_url") continue;
      const url = part.image_url.url;
      const match = url.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        attachments.push({ type: "image_base64", mediaType: match[1], data: match[2], detail: part.image_url.detail });
      } else {
        attachments.push({ type: "image_url", url, detail: part.image_url.detail });
      }
    }
    return { role: message.role, content: text || "[Image attached]" };
  });

  return {
    mode: modelToMode(input.model),
    messages,
    attachments: attachments.length ? attachments : undefined,
    generation: {
      temperature: input.temperature,
      topP: input.top_p,
      maxOutputTokens: input.max_tokens
    },
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


export const openAIResponsesSchema = z.object({
  model: z.string().default("33jane-auto"),
  input: z.union([
    z.string(),
    z.array(z.object({
      role: z.enum(["system", "user", "assistant"]).default("user"),
      content: z.string()
    }))
  ]),
  stream: z.boolean().optional().default(false),
  user: z.string().max(256).optional(),
  jane: z.object({
    maxCostUsd: z.number().positive().max(100).optional(),
    privacyApplied: z.boolean().optional(),
    redactedCount: z.number().int().min(0).optional(),
    redactionCategories: z.array(z.string()).optional(),
    spendingPolicy: z.any().optional()
  }).optional()
});

export type OpenAIResponsesInput = z.infer<typeof openAIResponsesSchema>;

export function responseToJaneRequest(input: OpenAIResponsesInput): JaneRequest {
  const messages = typeof input.input === "string"
    ? [{ role: "user" as const, content: input.input }]
    : input.input;

  return {
    mode: modelToMode(input.model),
    messages,
    maxCostUsd: input.jane?.maxCostUsd,
    clientPrivacy: {
      applied: input.jane?.privacyApplied ?? false,
      redactedCount: input.jane?.redactedCount ?? 0,
      categories: input.jane?.redactionCategories ?? []
    },
    spendingPolicy: input.jane?.spendingPolicy
  };
}

export function toOpenAIResponsesResult(result: any, requestedModel: string) {
  return {
    id: `resp_${String(result.id).replace(/-/g, "")}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: requestedModel,
    output: [{
      id: `msg_${String(result.id).replace(/-/g, "")}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text: result.answer,
        annotations: []
      }]
    }],
    usage: {
      input_tokens: result.usage?.inputTokens ?? 0,
      output_tokens: result.usage?.outputTokens ?? 0,
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
