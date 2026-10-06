import test from "node:test";
import assert from "node:assert/strict";
import { AgentAccountRegistry } from "../src/agents/accounts.js";
import { ProviderMarket } from "../src/network/provider-market.js";
import { edgePlan } from "../src/edge/intelligence.js";
import { EnterpriseGateway } from "../src/enterprise/gateway.js";
import { tokenUtilityStatus } from "../src/token/utility.js";
import { createApiHandler } from "../src/api/handler.js";

test("agent accounts produce enforceable spending policies", () => {
  delete process.env.JANE_AGENT_ACCOUNTS_JSON;
  const agents = new AgentAccountRegistry();
  const agent = agents.upsert({
    name: "Research Agent",
    owner: "owner-1",
    dailyBudgetUsd: 1.5,
    maxCostUsdPerRequest: 0.04,
    requireZeroRetention: true,
    allowedModes: ["auto", "private"]
  });
  const policy = agents.spendingPolicy(agent.id);
  assert.equal(policy.principal, agent.id);
  assert.equal(policy.dailyBudgetUsd, 1.5);
  assert.equal(policy.maxCostUsdPerRequest, 0.04);
  assert.equal(policy.requireZeroRetention, true);
});

test("provider marketplace converts live nodes into routable model profiles", () => {
  delete process.env.JANE_NETWORK_PROVIDERS_JSON;
  delete process.env.JANE_NETWORK_ALLOWED_HOSTS;
  process.env.JANE_NETWORK_HEARTBEAT_STALE_MS = "300000";
  const market = new ProviderMarket();
  const node = market.upsert({
    operator: "0xoperator",
    name: "Node One",
    endpoint: "https://compute.example.com/v1",
    model: "qwen-test",
    label: "Qwen Test",
    capabilities: ["general", "code"],
    zeroRetention: true,
    privacyScore: 0.95,
    capacityRpm: 100
  });
  const profiles = market.modelProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.provider, "network");
  assert.equal(profiles[0]?.networkNodeId, node.nodeId);
  assert.equal(market.summary().capacityRpm, 100);
});

test("edge intelligence marks simple requests as local-cache eligible", () => {
  const plan = edgePlan({
    mode: "auto",
    messages: [{ role: "user", content: "Rewrite this sentence briefly" }],
    clientPrivacy: { applied: true, redactedCount: 0, categories: [] }
  });
  assert.equal(plan.cacheEligible, true);
  assert.equal(plan.privacyBoundary, "local-first");
  assert.equal(plan.requestHash.length, 64);
});

test("enterprise gateway merges stricter organization policy", () => {
  process.env.JANE_ENTERPRISE_ORGS_JSON = JSON.stringify([{
    id: "acme",
    name: "Acme",
    active: true,
    allowedModes: ["auto", "private"],
    allowedProviders: ["private", "jane"],
    requireZeroRetention: true,
    minPrivacyScore: 0.9,
    dailyBudgetUsd: 10,
    maxCostUsdPerRequest: 0.2
  }]);
  const gateway = new EnterpriseGateway();
  const result = gateway.apply({
    mode: "auto",
    messages: [{ role: "user", content: "hello" }],
    enterprise: { orgId: "acme", actorId: "alice" },
    spendingPolicy: {
      principal: "alice",
      dailyBudgetUsd: 5,
      maxCostUsdPerRequest: 0.1
    }
  });
  assert.equal(result.org?.id, "acme");
  assert.equal(result.request.spendingPolicy?.dailyBudgetUsd, 5);
  assert.equal(result.request.spendingPolicy?.maxCostUsdPerRequest, 0.1);
  assert.equal(result.request.spendingPolicy?.requireZeroRetention, true);
  assert.deepEqual(result.request.spendingPolicy?.allowedProviders, ["private", "jane"]);
});

test("33G utility reports fixed supply while deployment remains optional", () => {
  delete process.env.JANE_TOKEN_RPC_URL;
  delete process.env.JANE_TOKEN_CHAIN_ID;
  delete process.env.JANE_33G_STAKING_CONTRACT;
  const status = tokenUtilityStatus();
  assert.equal(status.configured, false);
  assert.equal(status.maxSupply, "1000000000");
});

test("admin mutation APIs are closed when no admin key is configured", async () => {
  delete process.env.JANE_ADMIN_KEY;
  const handle = createApiHandler();
  const response = await handle(new Request("http://localhost/api/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Agent", owner: "owner" })
  }));
  assert.equal(response.status, 503);
  const body = await response.json() as { error: string };
  assert.equal(body.error, "ADMIN_API_DISABLED");
});
