import test from "node:test";
import assert from "node:assert/strict";
import { createApiHandler } from "../src/api/handler.js";

test("OpenAI-compatible model list is exposed", async () => {
  delete process.env.JANE_API_KEYS;
  const handle = createApiHandler();
  const response = await handle(new Request("http://localhost/v1/models"));
  assert.equal(response.status, 200);
  const body = await response.json() as { data: Array<{ id: string }> };
  assert.equal(body.data.some((model) => model.id === "jane-auto"), true);
  assert.equal(body.data.some((model) => model.id === "jane-confidential"), true);
});

test("policy evaluation endpoint accepts agent budget policy", async () => {
  const handle = createApiHandler();
  const response = await handle(new Request("http://localhost/api/policy/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "auto",
      policy: {
        principal: "agent-api-test",
        maxCostUsdPerRequest: 0.05,
        dailyBudgetUsd: 2
      }
    })
  }));
  assert.equal(response.status, 200);
  const body = await response.json() as { allowed: boolean; policyHash: string };
  assert.equal(body.allowed, true);
  assert.equal(body.policyHash.length, 64);
});

test("Monad status endpoint is safe when settlement is not configured", async () => {
  delete process.env.MONAD_RPC_URL;
  delete process.env.MONAD_SETTLEMENT_CONTRACT;
  const handle = createApiHandler();
  const response = await handle(new Request("http://localhost/api/monad/status"));
  assert.equal(response.status, 200);
  const body = await response.json() as { configured: boolean };
  assert.equal(body.configured, false);
});
