#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function address(name) {
  const value = required(name);
  if (!ADDRESS.test(value) || value.toLowerCase() === ZERO) throw new Error(`${name} is not a non-zero address`);
  return value;
}

function csv(name, parser = (value) => value) {
  return required(name).split(",").map((value) => parser(value.trim())).filter(Boolean);
}

function optionalHash(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!HASH.test(value)) throw new Error(`${name} is not a 32-byte transaction hash`);
  return value;
}

const chainId = Number(required("CL_DEMO_CHAIN_ID"));
if (chainId !== 143) throw new Error(`final evidence writer expects Monad mainnet chain 143, got ${chainId}`);

const evidence = {
  schema: "cl.monad.deployment-evidence.v1",
  generatedAt: new Date().toISOString(),
  chainId,
  rpc: "https://rpc.monad.xyz",
  commitSha: process.env.GIT_COMMIT_SHA?.trim() || null,
  contracts: {
    adapterRegistry: address("ADAPTER_REGISTRY"),
    accountFactory: address("CL_ACCOUNT_FACTORY"),
    riskRegistry: address("CL_RISK_REGISTRY"),
    riskEngine: address("CL_RISK_ENGINE"),
    riskPolicyManager: address("CL_RISK_POLICY_MANAGER"),
    riskSolver: address("CL_RISK_SOLVER"),
    intentEngine: address("CL_INTENT_ENGINE"),
    capitalRouter: address("CL_CAPITAL_ROUTER"),
    multiStepPlanner: address("CL_MULTI_STEP_PLANNER"),
    defensiveExecutor: address("CL_DEFENSIVE_EXECUTOR"),
    keeperNetwork: address("CL_KEEPER_NETWORK"),
    simulationEngine: address("CL_SIMULATION_ENGINE"),
  },
  adapters: {
    kuru: address("KURU_ADAPTER"),
    perpl: address("PERPL_ADAPTER"),
    euler: address("EULER_ADAPTER"),
    walletBalance: address("WALLET_BALANCE_ADAPTER"),
  },
  protocols: {
    kuru: {
      marginAccount: address("KURU_MARGIN_ACCOUNT"),
      trackedTokens: csv("KURU_TRACKED_TOKENS", (value) => {
        if (!ADDRESS.test(value)) throw new Error(`invalid KURU_TRACKED_TOKENS entry ${value}`);
        return value;
      }),
      markets: csv("KURU_MARKETS", (value) => {
        if (!ADDRESS.test(value)) throw new Error(`invalid KURU_MARKETS entry ${value}`);
        return value;
      }),
    },
    perpl: {
      exchange: address("PERPL_EXCHANGE"),
      collateral: address("PERPL_COLLATERAL"),
      perpIds: csv("PERPL_TRACKED_PERP_IDS", (value) => {
        if (!/^\d+$/.test(value)) throw new Error(`invalid PERPL_TRACKED_PERP_IDS entry ${value}`);
        return Number(value);
      }),
    },
    euler: {
      evc: address("EULER_EVC"),
      vaults: csv("EULER_TRACKED_VAULTS", (value) => {
        if (!ADDRESS.test(value)) throw new Error(`invalid EULER_TRACKED_VAULTS entry ${value}`);
        return value;
      }),
    },
  },
  risk: {
    underlyingAsset: address("RISK_UNDERLYING_ASSET"),
    underlyingFeed: address("RISK_UNDERLYING_FEED"),
    collateralAsset: address("RISK_COLLATERAL_ASSET"),
    collateralFeed: address("RISK_COLLATERAL_FEED"),
  },
  account: {
    address: address("CL_ACCOUNT"),
    owner: address("CL_ACCOUNT_OWNER"),
  },
  transactions: {
    funding: optionalHash("DEMO_TX_FUNDING"),
    kuru: optionalHash("DEMO_TX_KURU"),
    perpl: optionalHash("DEMO_TX_PERPL"),
    euler: optionalHash("DEMO_TX_EULER"),
    policyRevertAttempt: optionalHash("DEMO_TX_POLICY_REVERT"),
    defense: optionalHash("DEMO_TX_DEFENSE"),
  },
};

const output = process.argv[2] || "deployments/monad-mainnet.json";
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8" });
console.log(`Wrote CL deployment evidence to ${output}`);
