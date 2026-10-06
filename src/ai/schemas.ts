import { z } from "zod";

export const janeModeSchema = z.enum(["auto", "fast", "reason", "code", "vision", "private", "confidential"]);

const spendingPolicySchema = z.object({
  principal: z.string().min(1).max(256),
  maxCostUsdPerRequest: z.number().positive().max(100).optional(),
  dailyBudgetUsd: z.number().positive().max(100000).optional(),
  allowedModes: z.array(janeModeSchema).max(20).optional(),
  allowedProviders: z.array(z.enum(["openai", "groq", "openrouter", "private", "jane", "network"])).max(20).optional(),
  requireZeroRetention: z.boolean().optional(),
  minPrivacyScore: z.number().min(0).max(1).optional(),
  maxLatencyScorePenalty: z.number().min(0).max(1).optional(),
  allowedRegions: z.array(z.string().min(1).max(128)).max(50).optional()
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
  spendingPolicy: spendingPolicySchema.optional(),
  enterprise: z.object({
    orgId: z.string().min(1).max(128),
    actorId: z.string().max(256).optional(),
    department: z.string().max(128).optional()
  }).optional(),
  agentAccountId: z.string().min(1).max(128).optional()
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


export const agentAccountSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(128),
  owner: z.string().min(1).max(256),
  walletAddress: z.string().max(128).optional(),
  delegateAddress: z.string().max(128).optional(),
  active: z.boolean().optional(),
  dailyBudgetUsd: z.number().positive().max(100000).optional(),
  maxCostUsdPerRequest: z.number().positive().max(100).optional(),
  allowedModes: z.array(janeModeSchema).max(20).optional(),
  requireZeroRetention: z.boolean().optional(),
  minPrivacyScore: z.number().min(0).max(1).optional()
});

export const networkProviderSchema = z.object({
  nodeId: z.string().min(1).max(128).optional(),
  operator: z.string().min(1).max(256),
  name: z.string().min(1).max(128),
  endpoint: z.string().url().max(2048),
  apiKeyEnv: z.string().max(128).optional(),
  model: z.string().min(1).max(256),
  label: z.string().min(1).max(128),
  capabilities: z.array(z.enum(["general", "fast", "reasoning", "code", "vision"])).min(1).max(10).optional(),
  contextWindow: z.number().int().min(1024).max(10_000_000).optional(),
  inputCostPerMillion: z.number().min(0).max(100000).optional(),
  outputCostPerMillion: z.number().min(0).max(100000).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  latencyScore: z.number().min(0).max(1).optional(),
  privacyScore: z.number().min(0).max(1).optional(),
  zeroRetention: z.boolean().optional(),
  region: z.string().max(128).optional(),
  capacityRpm: z.number().int().positive().max(1_000_000).optional(),
  reputation: z.number().min(0).max(1).optional(),
  active: z.boolean().optional()
});

export const enterpriseOrgSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  active: z.boolean().default(true),
  allowedModes: z.array(janeModeSchema).max(20).optional(),
  allowedProviders: z.array(z.enum(["openai", "groq", "openrouter", "private", "jane", "network"])).max(20).optional(),
  requireZeroRetention: z.boolean().optional(),
  minPrivacyScore: z.number().min(0).max(1).optional(),
  dailyBudgetUsd: z.number().positive().max(1_000_000).optional(),
  maxCostUsdPerRequest: z.number().positive().max(1000).optional(),
  dataRegion: z.string().max(128).optional()
});
