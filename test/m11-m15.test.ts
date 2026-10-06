import test from "node:test";
import assert from "node:assert/strict";
import { FailoverController, classifyProviderFailure } from "../src/ai/failover.js";
import { SpendingPolicyEngine } from "../src/economics/spending-policy.js";
import { modelToMode, openAIModels, toJaneRequest } from "../src/openai/compat.js";
import { prepareSettlement } from "../src/monad/settlement.js";
import { createPrivacyReceipt } from "../src/privacy/receipt.js";
import type { ModelProfile, RouteCandidate, JaneRequest } from "../src/ai/types.js";

function model(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: "test",
    provider: "groq",
    model: "test-model",
    label: "Test",
    capabilities: ["general", "fast", "reasoning", "code", "vision"],
    contextWindow: 128000,
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.3,
    qualityScore: 0.85,
    latencyScore: 0.9,
    privacyScore: 0.8,
    zeroRetention: false,
    configured: true,
    ...overrides
  };
}

function candidate(m: ModelProfile, cost = 0.02): RouteCandidate {
  return {
    model: m,
    estimatedCostUsd: cost,
    effectiveCostUsd: cost,
    effectiveQuality: m.qualityScore,
    reliability: 0.94,
    score: 0.9,
    reasons: ["test"]
  };
}

test("OpenAI-compatible virtual model names map to 33jane modes", () => {
  assert.equal(modelToMode("33jane-auto"), "auto");
  assert.equal(modelToMode("33jane-code"), "code");
  assert.equal(modelToMode("33jane-confidential"), "confidential");
  assert.equal(openAIModels().some((entry) => entry.id === "33jane-private"), true);

  const req = toJaneRequest({
    model: "33jane-reason",
    messages: [{ role: "user", content: "reason about this" }],
    stream: false,
    jane: {
      maxCostUsd: 0.1,
      privacyApplied: true,
      redactedCount: 0,
      redactionCategories: []
    }
  });
  assert.equal(req.mode, "reason");
  assert.equal(req.maxCostUsd, 0.1);
});

test("circuit breaker opens after repeated provider failures", () => {
  const controller = new FailoverController(3, 60_000);
  assert.equal(controller.isAvailable("m"), true);
  controller.recordFailure("m", "provider_unavailable");
  controller.recordFailure("m", "provider_unavailable");
  assert.equal(controller.isAvailable("m"), true);
  controller.recordFailure("m", "provider_unavailable");
  assert.equal(controller.isAvailable("m"), false);
  controller.recordSuccess("m");
  assert.equal(controller.isAvailable("m"), true);
  assert.equal(classifyProviderFailure(new Error("PROVIDER_ERROR:429:rate limit")), "rate_limit");
});

test("spending policy enforces per-request, provider, privacy and daily budgets", () => {
  const engine = new SpendingPolicyEngine();
  const policy = {
    principal: "agent-1",
    maxCostUsdPerRequest: 0.05,
    dailyBudgetUsd: 0.08,
    allowedModes: ["auto"] as const,
    allowedProviders: ["groq"] as const,
    requireZeroRetention: false,
    minPrivacyScore: 0.7
  };

  const allowed = engine.evaluate(policy as any, "auto", candidate(model(), 0.03));
  assert.equal(allowed.allowed, true);

  engine.commit(policy as any, 0.06, "auto");
  const blocked = engine.evaluate(policy as any, "auto", candidate(model(), 0.03));
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reasons.join(" "), /daily budget/);

  const tooExpensive = engine.evaluate(policy as any, "auto", candidate(model(), 0.07));
  assert.equal(tooExpensive.allowed, false);
  assert.match(tooExpensive.reasons.join(" "), /per-request budget/);
});

test("Monad settlement preparation encodes a user-signable transaction from a privacy receipt", () => {
  process.env.MONAD_RPC_URL = "https://rpc.example.invalid";
  process.env.MONAD_CHAIN_ID = "10143";
  process.env.MONAD_SETTLEMENT_CONTRACT = "0x1111111111111111111111111111111111111111";
  process.env.MONAD_PROVIDER_TREASURY = "0x2222222222222222222222222222222222222222";
  process.env.MONAD_SETTLEMENT_TOKEN = "0x3333333333333333333333333333333333333333";
  process.env.MONAD_SETTLEMENT_TOKEN_DECIMALS = "6";
  process.env.MONAD_SETTLEMENT_TOKEN_SYMBOL = "USDC";

  const m = model({ id: "private", provider: "private", zeroRetention: true, privacyScore: 0.98 });
  const c = candidate(m, 0.0025);
  const request: JaneRequest = {
    mode: "confidential",
    messages: [{ role: "user", content: "sanitized request" }],
    clientPrivacy: { applied: true, redactedCount: 1, categories: ["EMAIL"] },
    spendingPolicy: {
      principal: "agent-33",
      maxCostUsdPerRequest: 0.01,
      dailyBudgetUsd: 1
    }
  };
  const receipt = createPrivacyReceipt({
    request,
    candidate: c,
    model: m,
    upstreamModel: "private-model",
    actualCostUsd: 0.0025,
    estimatedSavingsPercent: 60,
    failoverAttempts: 0
  });

  const tx = prepareSettlement(receipt);
  assert.equal(tx.chainId, 10143);
  assert.equal(tx.to, process.env.MONAD_SETTLEMENT_CONTRACT);
  assert.equal(tx.tokenSymbol, "USDC");
  assert.match(tx.data, /^0x[a-fA-F0-9]+$/);
  assert.equal(tx.amountAtomic, "2500");
  assert.equal(tx.receiptHash, `0x${receipt.receiptHash}`);
});
