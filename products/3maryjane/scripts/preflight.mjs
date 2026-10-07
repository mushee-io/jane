#!/usr/bin/env node

/**
 * CL production preflight.
 *
 * This intentionally does not load .env itself; run it after exporting your local ignored env.
 * It never prints PRIVATE_KEY. The full clearing demo is pinned to Monad mainnet because the
 * repository only carries a verified Euler deployment for chain 143.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const official = {
  chainId: 143,
  kuruMargin: "0x2A68ba1833cDf93fa9Da1EEbd7F46242aD8E90c5",
  perplExchange: "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F",
  perplCollateral: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  eulerEvc: "0x7a9324E8f270413fa2E458f5831226d99C7477CD",
};

function fail(message) {
  console.error(`CL PREFLIGHT FAIL: ${message}`);
  process.exitCode = 1;
}

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required`);
    return "";
  }
  return value;
}

function address(name, { expected } = {}) {
  const value = env(name);
  if (!value) return value;
  if (!ADDRESS.test(value) || value.toLowerCase() === ZERO) {
    fail(`${name} is not a non-zero EVM address`);
    return value;
  }
  if (expected && value.toLowerCase() !== expected.toLowerCase()) {
    fail(`${name} does not match the currently pinned production address`);
  }
  return value;
}

function csv(name, validator = () => true) {
  const raw = env(name);
  if (!raw) return [];
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) fail(`${name} must contain at least one value`);
  for (const value of values) {
    if (!validator(value)) fail(`${name} contains invalid value ${value}`);
  }
  return values;
}

function positiveInt(name, { allowZero = false } = {}) {
  const raw = env(name);
  if (!raw) return 0n;
  if (!/^\d+$/.test(raw)) {
    fail(`${name} must be an unsigned integer`);
    return 0n;
  }
  const value = BigInt(raw);
  if (!allowZero && value === 0n) fail(`${name} must be greater than zero`);
  return value;
}

function addressValue(value) {
  return ADDRESS.test(value) && value.toLowerCase() !== ZERO;
}

function checkBaseProfile() {
  const chainId = Number(env("CL_DEMO_CHAIN_ID"));
  if (chainId !== official.chainId) {
    fail(`full Kuru + Perpl + Euler demo is pinned to Monad mainnet chain ${official.chainId}; got ${chainId}`);
  }

  address("KURU_MARGIN_ACCOUNT", { expected: official.kuruMargin });
  csv("KURU_TRACKED_TOKENS", addressValue);
  csv("KURU_MARKETS", addressValue);

  address("PERPL_EXCHANGE", { expected: official.perplExchange });
  address("PERPL_COLLATERAL", { expected: official.perplCollateral });
  csv("PERPL_TRACKED_PERP_IDS", (value) => /^\d+$/.test(value) && BigInt(value) > 0n);

  address("EULER_EVC", { expected: official.eulerEvc });
  csv("EULER_TRACKED_VAULTS", addressValue);
  csv("FREE_COLLATERAL_ASSETS", addressValue);

  address("RISK_UNDERLYING_ASSET");
  address("RISK_UNDERLYING_FEED");
  address("RISK_COLLATERAL_ASSET");
  address("RISK_COLLATERAL_FEED");
  positiveInt("RISK_UNDERLYING_MAX_STALENESS");
  positiveInt("RISK_COLLATERAL_MAX_STALENESS");

  // PRIVATE_KEY is required for an actual Foundry broadcast but is deliberately never echoed.
  if (!process.env.PRIVATE_KEY?.trim()) fail("PRIVATE_KEY is required for broadcast (value is never printed)");
}

function checkPostDeploy() {
  for (const name of [
    "ADAPTER_REGISTRY",
    "KURU_ADAPTER",
    "PERPL_ADAPTER",
    "EULER_ADAPTER",
    "WALLET_BALANCE_ADAPTER",
    "CL_ACCOUNT_FACTORY",
    "CL_RISK_REGISTRY",
    "CL_RISK_ENGINE",
    "CL_RISK_POLICY_MANAGER",
    "CL_RISK_SOLVER",
    "CL_INTENT_ENGINE",
    "CL_CAPITAL_ROUTER",
    "CL_MULTI_STEP_PLANNER",
    "CL_DEFENSIVE_EXECUTOR",
    "CL_KEEPER_NETWORK",
    "CL_SIMULATION_ENGINE",
  ]) address(name);

  const salt = env("CL_ACCOUNT_SALT");
  if (salt && !/^0x[0-9a-fA-F]{64}$/.test(salt)) fail("CL_ACCOUNT_SALT must be exactly 32 bytes");
  csv("CL_ALLOWED_ASSETS", addressValue);

  positiveInt("CL_POLICY_MAX_GROSS_USD_E18");
  positiveInt("CL_POLICY_MAX_DEBT_USD_E18", { allowZero: true });
  positiveInt("CL_POLICY_MAX_LEVERAGE_E18");
  positiveInt("CL_POLICY_MAX_MARGIN_UTILIZATION_E18");
  positiveInt("CL_POLICY_MIN_HEALTH_E18");
  const criticalMove = positiveInt("CL_POLICY_MIN_CRITICAL_MOVE_BPS", { allowZero: true });
  if (criticalMove > 10_000n) fail("CL_POLICY_MIN_CRITICAL_MOVE_BPS cannot exceed 10000");
}

const stage = process.argv[2] ?? "protocols";
if (!new Set(["protocols", "deployment", "all"]).has(stage)) {
  console.error("usage: node scripts/preflight.mjs [protocols|deployment|all]");
  process.exit(2);
}

if (stage === "protocols" || stage === "all") checkBaseProfile();
if (stage === "deployment" || stage === "all") checkPostDeploy();

if (!process.exitCode) {
  console.log(`CL PREFLIGHT PASS (${stage}) — configuration is structurally ready for the pinned mainnet profile.`);
}
