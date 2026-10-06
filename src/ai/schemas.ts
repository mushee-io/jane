import { z } from "zod";

export const janeModeSchema = z.enum(["auto", "fast", "reason", "code", "vision", "private", "confidential"]);

const spendingPolicySchema = z.object({
  principal: z.string().min(1).max(256),
  maxCostUsdPerRequest: z.number().positive().max(100).optional(),
  dailyBudgetUsd: z.number().positive().max(100000).optional(),
  allowedModes: z.array(janeModeSchema).max(20).optional(),
  allowedProviders: z.array(z.enum(["openai", "groq", "openrouter", "private"])).max(20).optional(),
  requireZeroRetention: z.boolean().optional(),
  minPrivacyScore: z.number().min(0).max(1).optional(),
  maxLatencyScorePenalty: z.number().min(0).max(1).optional()
});

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
  }).optional(),
  spendingPolicy: spendingPolicySchema.optional()
});

export const feedbackSchema = z.object({
  requestId: z.string().uuid(),
  signal: z.enum(["success", "failure", "retry", "thumbs_up", "thumbs_down"])
});


export const policyEvaluateSchema = z.object({
  policy: spendingPolicySchema,
  mode: janeModeSchema.default("auto"),
  modelId: z.string().optional()
});
