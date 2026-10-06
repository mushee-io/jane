import test from "node:test";
import assert from "node:assert/strict";
import { classifyTask } from "../src/ai/classifier.js";
import { decideRoute } from "../src/ai/price-optimizer.js";
import { JaneTelemetry } from "../src/ai/telemetry.js";
import type { JaneRequest, ModelProfile } from "../src/ai/types.js";

function model(overrides: Partial<ModelProfile>): ModelProfile {
  return {
    id: "base",
    provider: "groq",
    model: "test-model",
    label: "Test",
    capabilities: ["general", "fast", "reasoning", "code"],
    contextWindow: 128000,
    inputCostPerMillion: 1,
    outputCostPerMillion: 1,
    qualityScore: 0.84,
    latencyScore: 0.8,
    privacyScore: 0.7,
    zeroRetention: false,
    configured: true,
    ...overrides
  };
}

function request(mode: JaneRequest["mode"], content: string): JaneRequest {
  return { mode, messages: [{ role: "user", content }] };
}

test("classifies coding requests", () => {
  assert.equal(classifyTask(request("auto", "Debug this TypeScript API function")), "code");
});

test("price optimizer prefers the cheaper model when quality is equivalent", () => {
  const telemetry = new JaneTelemetry();
  const cheap = model({ id: "cheap", label: "Cheap", inputCostPerMillion: 0.1, outputCostPerMillion: 0.2 });
  const expensive = model({ id: "expensive", label: "Expensive", inputCostPerMillion: 5, outputCostPerMillion: 10 });
  const route = decideRoute(request("auto", "Rewrite this short paragraph"), [expensive, cheap], telemetry, true);
  assert.equal(route.selected?.model.id, "cheap");
  assert.ok((route.estimatedSavingsPercent ?? 0) > 80);
});

test("private mode only permits high-privacy zero-retention routes", () => {
  const telemetry = new JaneTelemetry();
  const normal = model({ id: "normal", privacyScore: 0.95, zeroRetention: false });
  const privateRoute = model({ id: "private", provider: "private", privacyScore: 0.98, zeroRetention: true });
  const route = decideRoute(request("private", "Summarize my private document"), [normal, privateRoute], telemetry, true);
  assert.equal(route.selected?.model.id, "private");
});

test("outcome feedback changes effective model quality", () => {
  const telemetry = new JaneTelemetry();
  const candidate = model({ id: "learning", qualityScore: 0.9 });
  const before = telemetry.effectiveQuality(candidate);
  for (let i = 0; i < 20; i += 1) telemetry.recordFeedback("learning", "thumbs_down");
  const after = telemetry.effectiveQuality(candidate);
  assert.ok(after < before);
});

test("execution reliability uses a prior and learns from failures", () => {
  const telemetry = new JaneTelemetry();
  const before = telemetry.reliability("model");
  for (let i = 0; i < 10; i += 1) telemetry.recordExecution("model", false, 100, 0.01);
  assert.ok(telemetry.reliability("model") < before);
});
