import { getAddress, isAddress } from "viem";
import type { Address, CLDeployment } from "@cl-monad/sdk";

function optionalAddress(name: string): Address | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!isAddress(value)) throw new Error(`${name} is not a valid address`);
  return getAddress(value) as Address;
}

const chainId = Number(process.env.CL_CHAIN_ID ?? "10143");
if (chainId !== 143 && chainId !== 10143) throw new Error(`Unsupported CL_CHAIN_ID ${chainId}`);

export const rpcUrl = process.env.CL_RPC_URL;
export const port = Number(process.env.PORT ?? "8787");

const kuruAdapter = optionalAddress("CL_KURU_ADAPTER");
const perplAdapter = optionalAddress("CL_PERPL_ADAPTER");
const eulerAdapter = optionalAddress("CL_EULER_ADAPTER");
const walletBalanceAdapter = optionalAddress("CL_WALLET_BALANCE_ADAPTER");

export const deployment: CLDeployment = {
  chainId,
  accountFactory: optionalAddress("CL_ACCOUNT_FACTORY"),
  adapterRegistry: optionalAddress("CL_ADAPTER_REGISTRY"),
  riskRegistry: optionalAddress("CL_RISK_REGISTRY"),
  riskEngine: optionalAddress("CL_RISK_ENGINE"),
  riskPolicyManager: optionalAddress("CL_RISK_POLICY_MANAGER"),
  riskSolver: optionalAddress("CL_RISK_SOLVER"),
  intentEngine: optionalAddress("CL_INTENT_ENGINE"),
  capitalRouter: optionalAddress("CL_CAPITAL_ROUTER"),
  multiStepPlanner: optionalAddress("CL_MULTI_STEP_PLANNER"),
  defensiveExecutor: optionalAddress("CL_DEFENSIVE_EXECUTOR"),
  keeperNetwork: optionalAddress("CL_KEEPER_NETWORK"),
  simulationEngine: optionalAddress("CL_SIMULATION_ENGINE"),
  adapters: {
    ...(kuruAdapter ? { Kuru: kuruAdapter } : {}),
    ...(perplAdapter ? { Perpl: perplAdapter } : {}),
    ...(eulerAdapter ? { Euler: eulerAdapter } : {}),
    ...(walletBalanceAdapter ? { WalletBalance: walletBalanceAdapter } : {}),
  },
};
