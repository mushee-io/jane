import test from "node:test";
import assert from "node:assert/strict";
import { JaneAIService } from "../src/ai/service.js";

test("M1-M5 baseline remains enabled in the standalone Jane product", () => {
  const jane = new JaneAIService();
  const health = jane.health();

  assert.equal(health.milestones.chat, true);
  assert.equal(health.milestones.multiModelRouter, true);
  assert.equal(health.milestones.priceOptimizer, true);
  assert.equal(health.milestones.outcomeRouting, true);
  assert.equal(health.milestones.localPrivacyScanner, true);
});

test("M1-M5 router can preview an economical route without live provider keys", () => {
  const jane = new JaneAIService();
  const route = jane.preview({
    mode: "auto",
    messages: [
      {
        role: "user",
        content: "Rewrite this short paragraph clearly and cheaply."
      }
    ]
  });

  assert.ok(route.selected);
  assert.ok(route.selected.estimatedCostUsd >= 0);
  assert.ok(route.selected.effectiveQuality > 0);
  assert.ok(route.requiredQuality > 0);
  assert.ok(Array.isArray(route.alternatives));
});
