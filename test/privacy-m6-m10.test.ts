import test from "node:test";
import assert from "node:assert/strict";
import { decideRoute } from "../src/ai/price-optimizer.js";
import { JaneTelemetry } from "../src/ai/telemetry.js";
import type { JaneRequest, ModelProfile } from "../src/ai/types.js";
import { checkPrivacyPolicy } from "../src/privacy/policy.js";
import { planSplitInference } from "../src/privacy/split-planner.js";
import { createPrivacyReceipt, verifyPrivacyReceipt } from "../src/privacy/receipt.js";

function model(overrides: Partial<ModelProfile>): ModelProfile {
  return {
    id: "base",
    provider: "groq",
    model: "test-model",
    label: "Test",
    capabilities: ["general", "fast", "reasoning", "code", "vision"],
    contextWindow: 128000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 1,
    qualityScore: 0.9,
    latencyScore: 0.8,
    privacyScore: 0.7,
    zeroRetention: false,
    configured: true,
    ...overrides
  };
}

function request(mode: JaneRequest["mode"], content: string): JaneRequest {
  return {
    mode,
    messages: [{ role: "user", content }],
    clientPrivacy: { applied: true, redactedCount: 2, categories: ["EMAIL"] },
    clientContext: { originalChars: 10_000, sentChars: 2_500, selectedChunks: 3, sources: ["vault"] }
  };
}

test("confidential mode only admits private zero-retention high-privacy providers", () => {
  const telemetry = new JaneTelemetry();
  const normal = model({ id: "normal", provider: "openai", privacyScore: 0.99, zeroRetention: true });
  const weakPrivate = model({ id: "weak-private", provider: "private", privacyScore: 0.90, zeroRetention: true });
  const confidential = model({ id: "confidential", provider: "private", privacyScore: 0.98, zeroRetention: true });
  const route = decideRoute(request("confidential", "Analyze this confidential board document"), [normal, weakPrivate, confidential], telemetry, true);
  assert.equal(route.selected?.model.id, "confidential");
});

test("confidential policy blocks requests that skipped the local privacy firewall", () => {
  const req = request("confidential", "Confidential data");
  req.clientPrivacy = { applied: false, redactedCount: 0, categories: [] };
  const result = checkPrivacyPolicy(req, model({ provider: "private", privacyScore: 0.99, zeroRetention: true }));
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join(" "), /privacy firewall/);
});

test("split planner separates public research from private source material", () => {
  const plan = planSplitInference(request("confidential", "Use our private board financials and research the latest competitor pricing on the web"));
  assert.equal(plan.recommended, true);
  assert.deepEqual(plan.steps.map((step) => step.boundary), ["private", "public", "local"]);
  assert.equal(plan.steps[1]?.receivesSensitiveContext, false);
});

test("privacy receipt contains hashes and context exposure without raw prompt", () => {
  const req = request("confidential", "Sensitive prompt <EMAIL_1>");
  const candidateModel = model({ id: "confidential", provider: "private", privacyScore: 0.98, zeroRetention: true });
  const decision = decideRoute(req, [candidateModel], new JaneTelemetry(), true);
  assert.ok(decision.selected);
  const receipt = createPrivacyReceipt({
    request: req,
    candidate: decision.selected!,
    model: candidateModel,
    upstreamModel: "private-model",
    actualCostUsd: 0.01,
    estimatedSavingsPercent: 40,
    failoverAttempts: 0
  });
  assert.equal(receipt.context.exposurePercent, 25);
  assert.equal(receipt.zeroRetention, true);
  assert.equal(receipt.receiptHash.length, 64);
  assert.equal(JSON.stringify(receipt).includes("Sensitive prompt"), false);
  assert.equal(verifyPrivacyReceipt(receipt), true);

  const tampered = { ...receipt, privacyScore: 0.1 };
  assert.equal(verifyPrivacyReceipt(tampered), false);
});
