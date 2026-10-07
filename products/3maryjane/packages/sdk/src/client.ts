import type { PublicClient, WalletClient } from "viem";
import {
  clAccountAbi,
  clAccountFactoryAbi,
  erc20Abi,
  intentEngineAbi,
  riskPolicyManagerAbi,
  riskSolverAbi,
} from "./abis";
import type {
  AdapterAction,
  Address,
  AssetExposure,
  CLDeployment,
  Hex,
  PortfolioMetrics,
  RiskPolicy,
  RiskSnapshot,
  SolverAction,
  SolverRecommendation,
} from "./types";

export interface CreateCLClientOptions {
  publicClient: PublicClient;
  walletClient?: WalletClient;
  deployment: CLDeployment;
}

export interface CreateIntentInput {
  account: Address;
  kind: number;
  asset: Address;
  targetNetUsd: bigint;
  maxNotionalUsd: bigint;
  deadline: bigint;
  constraintsHash: Hex;
  metadataHash: Hex;
}

export interface CLAccountState {
  owner: Address;
  paused: boolean;
  riskGuard: Address;
  riskGuardEnabled: boolean;
}

export interface SolverResult {
  recommendation: SolverRecommendation;
  metrics: PortfolioMetrics;
  exposures: AssetExposure[];
}

/** Stable public surface for the CL SDK. */
export interface CLClient {
  readonly deployment: CLDeployment;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient | undefined;
  getAccountState(account: Address): Promise<CLAccountState>;
  getRisk(account: Address): Promise<RiskSnapshot>;
  getPolicy(account: Address): Promise<RiskPolicy>;
  getCoveredAdapters(account: Address): Promise<Address[]>;
  getSolverRecommendation(account: Address): Promise<SolverResult>;
  tokenBalance(token: Address, account: Address): Promise<bigint>;
  predictAccount(owner: Address, salt: Hex): Promise<Address>;
  createAccount(salt: Hex): Promise<Hex>;
  execute(account: Address, adapter: Address, action: Hex): Promise<Hex>;
  executeBatch(account: Address, actions: readonly AdapterAction[]): Promise<Hex>;
  authorizeAdapter(account: Address, adapter: Address, authorized?: boolean): Promise<Hex>;
  setAssetAllowed(account: Address, asset: Address, allowed?: boolean): Promise<Hex>;
  setRiskGuard(account: Address, guard: Address, enabled?: boolean): Promise<Hex>;
  configurePolicy(account: Address, policy: RiskPolicy, adapters: readonly Address[]): Promise<Hex>;
  setAssetLimit(account: Address, asset: Address, maxAbsNetUsd: bigint): Promise<Hex>;
  setDefensiveOperator(account: Address, operator: Address, authorized?: boolean): Promise<Hex>;
  depositToken(account: Address, asset: Address, amount: bigint): Promise<Hex>;
  withdraw(account: Address, asset: Address, to: Address, amount: bigint): Promise<Hex>;
  createIntent(input: CreateIntentInput): Promise<Hex>;
  approveToken(token: Address, spender: Address, amount: bigint): Promise<Hex>;
}

interface RawPortfolioMetrics {
  assetsUsd: bigint;
  debtUsd: bigint;
  equityUsd: bigint;
  pnlUsd: bigint;
  grossExposureUsd: bigint;
  directionalExposureUsd: bigint;
  initialMarginUsd: bigint;
  maintenanceMarginUsd: bigint;
  leverageE18: bigint;
  healthE18: bigint;
  marginUtilizationE18: bigint;
  criticalMoveBps: bigint;
}

interface RawAssetExposure {
  asset: Address;
  netUsd: bigint;
  grossUsd: bigint;
  hedgedPairUsd: bigint;
  initialMarginUsd: bigint;
  maintenanceMarginUsd: bigint;
}

const solverActions: SolverAction[] = ["NONE", "HEDGE", "REPAY", "DELEVERAGE"];
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

function configured(value: Address | undefined, name: string): Address {
  if (!value) throw new Error(`${name} is not configured for this CL deployment`);
  return value;
}

function bytes32(value: Hex, name: string): Hex {
  if (!bytes32Pattern.test(value)) throw new Error(`${name} must be exactly 32 bytes`);
  return value;
}

function toMetrics(raw: RawPortfolioMetrics): PortfolioMetrics {
  return {
    assetsUsd: raw.assetsUsd,
    debtUsd: raw.debtUsd,
    equityUsd: raw.equityUsd,
    pnlUsd: raw.pnlUsd,
    grossExposureUsd: raw.grossExposureUsd,
    directionalExposureUsd: raw.directionalExposureUsd,
    initialMarginUsd: raw.initialMarginUsd,
    maintenanceMarginUsd: raw.maintenanceMarginUsd,
    leverageE18: raw.leverageE18,
    healthE18: raw.healthE18,
    marginUtilizationE18: raw.marginUtilizationE18,
    criticalMoveBps: raw.criticalMoveBps,
  };
}

function toExposure(raw: RawAssetExposure): AssetExposure {
  return {
    asset: raw.asset,
    netUsd: raw.netUsd,
    grossUsd: raw.grossUsd,
    hedgedPairUsd: raw.hedgedPairUsd,
    initialMarginUsd: raw.initialMarginUsd,
    maintenanceMarginUsd: raw.maintenanceMarginUsd,
  };
}

async function write(
  publicClient: PublicClient,
  walletClient: WalletClient | undefined,
  request: Parameters<PublicClient["simulateContract"]>[0],
): Promise<Hex> {
  if (!walletClient?.account) throw new Error("A connected wallet client is required for this operation");
  const simulation = await publicClient.simulateContract({ ...request, account: walletClient.account });
  return walletClient.writeContract(simulation.request);
}

export function createCLClient(options: CreateCLClientOptions): CLClient {
  const { publicClient, walletClient, deployment } = options;

  return {
    deployment,
    publicClient,
    walletClient,

    async getAccountState(account: Address): Promise<CLAccountState> {
      const [owner, paused, riskGuard, riskGuardEnabled] = await Promise.all([
        publicClient.readContract({ address: account, abi: clAccountAbi, functionName: "owner" }),
        publicClient.readContract({ address: account, abi: clAccountAbi, functionName: "paused" }),
        publicClient.readContract({ address: account, abi: clAccountAbi, functionName: "riskGuard" }),
        publicClient.readContract({ address: account, abi: clAccountAbi, functionName: "riskGuardEnabled" }),
      ]);
      return { owner, paused, riskGuard, riskGuardEnabled };
    },

    async getRisk(account: Address): Promise<RiskSnapshot> {
      const manager = configured(deployment.riskPolicyManager, "riskPolicyManager");
      const result = await publicClient.readContract({
        address: manager,
        abi: riskPolicyManagerAbi,
        functionName: "check",
        args: [account],
      });
      const [ok, reason, metrics, exposures] = result;
      return { ok, reason, metrics: toMetrics(metrics), exposures: exposures.map(toExposure) };
    },

    async getPolicy(account: Address): Promise<RiskPolicy> {
      const manager = configured(deployment.riskPolicyManager, "riskPolicyManager");
      const p = await publicClient.readContract({
        address: manager,
        abi: riskPolicyManagerAbi,
        functionName: "policy",
        args: [account],
      });
      return {
        enabled: p.enabled,
        allowRiskReducingWhenBreached: p.allowRiskReducingWhenBreached,
        maxGrossExposureUsd: p.maxGrossExposureUsd,
        maxDebtUsd: p.maxDebtUsd,
        maxLeverageE18: p.maxLeverageE18,
        maxMarginUtilizationE18: p.maxMarginUtilizationE18,
        minHealthE18: p.minHealthE18,
        minCriticalMoveBps: p.minCriticalMoveBps,
      };
    },

    async getCoveredAdapters(account: Address): Promise<Address[]> {
      const manager = configured(deployment.riskPolicyManager, "riskPolicyManager");
      const result = await publicClient.readContract({
        address: manager,
        abi: riskPolicyManagerAbi,
        functionName: "adapters",
        args: [account],
      });
      return [...result];
    },

    async getSolverRecommendation(account: Address): Promise<SolverResult> {
      const solver = configured(deployment.riskSolver, "riskSolver");
      const result = await publicClient.readContract({
        address: solver,
        abi: riskSolverAbi,
        functionName: "solve",
        args: [account],
      });
      const [r, metrics, exposures] = result;
      const actionIndex = Number(r.action);
      return {
        recommendation: {
          action: solverActions[actionIndex] ?? "NONE",
          reason: r.reason,
          asset: r.asset,
          currentNetUsd: r.currentNetUsd,
          targetNetUsd: r.targetNetUsd,
          reduceGrossUsd: r.reduceGrossUsd,
          repayDebtUsd: r.repayDebtUsd,
          severityBps: r.severityBps,
        },
        metrics: toMetrics(metrics),
        exposures: exposures.map(toExposure),
      };
    },

    async tokenBalance(token: Address, account: Address): Promise<bigint> {
      return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
    },

    async predictAccount(owner: Address, salt: Hex): Promise<Address> {
      const factory = configured(deployment.accountFactory, "accountFactory");
      return publicClient.readContract({
        address: factory,
        abi: clAccountFactoryAbi,
        functionName: "predictAccount",
        args: [owner, bytes32(salt, "salt")],
      });
    },

    async createAccount(salt: Hex): Promise<Hex> {
      const factory = configured(deployment.accountFactory, "accountFactory");
      return write(publicClient, walletClient, {
        address: factory,
        abi: clAccountFactoryAbi,
        functionName: "createAccount",
        args: [bytes32(salt, "salt")],
      });
    },

    async execute(account: Address, adapter: Address, action: Hex): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "execute",
        args: [adapter, action],
      });
    },

    async executeBatch(account: Address, actions: readonly AdapterAction[]): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "executeBatch",
        args: [[...actions]],
      });
    },

    async authorizeAdapter(account: Address, adapter: Address, authorized = true): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "authorizeAdapter",
        args: [adapter, authorized],
      });
    },

    async setAssetAllowed(account: Address, asset: Address, allowed = true): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "setAssetAllowed",
        args: [asset, allowed],
      });
    },

    async setRiskGuard(account: Address, guard: Address, enabled = true): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "setRiskGuard",
        args: [guard, enabled],
      });
    },

    async configurePolicy(account: Address, policy: RiskPolicy, adapters: readonly Address[]): Promise<Hex> {
      if (policy.minCriticalMoveBps < 0 || policy.minCriticalMoveBps > 65_535) {
        throw new Error("minCriticalMoveBps is outside uint16");
      }
      const manager = configured(deployment.riskPolicyManager, "riskPolicyManager");
      return write(publicClient, walletClient, {
        address: manager,
        abi: riskPolicyManagerAbi,
        functionName: "configure",
        args: [account, policy, [...adapters]],
      });
    },

    async setAssetLimit(account: Address, asset: Address, maxAbsNetUsd: bigint): Promise<Hex> {
      const manager = configured(deployment.riskPolicyManager, "riskPolicyManager");
      return write(publicClient, walletClient, {
        address: manager,
        abi: riskPolicyManagerAbi,
        functionName: "setAssetLimit",
        args: [account, asset, maxAbsNetUsd],
      });
    },

    async setDefensiveOperator(account: Address, operator: Address, authorized = true): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "setDefensiveOperator",
        args: [operator, authorized],
      });
    },

    async depositToken(account: Address, asset: Address, amount: bigint): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "depositToken",
        args: [asset, amount],
      });
    },

    async withdraw(account: Address, asset: Address, to: Address, amount: bigint): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: account,
        abi: clAccountAbi,
        functionName: "withdraw",
        args: [asset, to, amount],
      });
    },

    async createIntent(input: CreateIntentInput): Promise<Hex> {
      const engine = configured(deployment.intentEngine, "intentEngine");
      return write(publicClient, walletClient, {
        address: engine,
        abi: intentEngineAbi,
        functionName: "createIntent",
        args: [
          input.account,
          input.kind,
          input.asset,
          input.targetNetUsd,
          input.maxNotionalUsd,
          input.deadline,
          bytes32(input.constraintsHash, "constraintsHash"),
          bytes32(input.metadataHash, "metadataHash"),
        ],
      });
    },

    async approveToken(token: Address, spender: Address, amount: bigint): Promise<Hex> {
      return write(publicClient, walletClient, {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      });
    },
  };
}
