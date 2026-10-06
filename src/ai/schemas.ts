import { z } from "zod";

export const janeModeSchema = z.enum(["auto", "fast", "reason", "code", "vision", "private", "confidential"]);

export const janeRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().min(1).max(200_000)
  })).min(1).max(100),
  mode: janeModeSchema.default("auto"),
  maxCostUsd: z.number().positive().max(100).optional(),
  clientPrivacy: z.object({
    applied: z.boolean(),
    redactedCount: z.number().int().min(0).max(10_000),
    categories: z.array(z.string().max(80)).max(50)
  }).optional(),
  clientContext: z.object({
    originalChars: z.number().int().min(0).max(10_000_000),
    sentChars: z.number().int().min(0).max(10_000_000),
    selectedChunks: z.number().int().min(0).max(10_000),
    sources: z.array(z.string().max(100)).max(100)
  }).optional()
});

export const feedbackSchema = z.object({
  requestId: z.string().uuid(),
  signal: z.enum(["success", "failure", "retry", "thumbs_up", "thumbs_down"])
});
