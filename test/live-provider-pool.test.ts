import test from "node:test";
import assert from "node:assert/strict";
import { modelCatalog } from "../src/ai/catalog.js";

test("Jane ships a serious Groq and OpenRouter model pool", () => {
  const models = modelCatalog();
  const ids = new Set(models.map((model) => model.id));

  for (const id of [
    "groq-instant",
    "groq-fast",
    "openrouter-economy",
    "openrouter-haiku",
    "openrouter-mistral",
    "openrouter-sol",
    "openrouter-sonnet"
  ]) {
    assert.equal(ids.has(id), true, `missing ${id}`);
  }

  const livePool = models.filter((model) => ["groq", "openrouter"].includes(model.provider));
  assert.ok(livePool.length >= 7);
  assert.ok(livePool.every((model) => model.inputCostPerMillion >= 0));
  assert.ok(livePool.every((model) => model.outputCostPerMillion >= 0));
  assert.ok(livePool.every((model) => model.qualityScore > 0));
});
