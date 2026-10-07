export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export type PositionType =
  | "CASH"
  | "SPOT"
  | "PERP"
  | "SUPPLY"
  | "DEBT"
  | "LP"
  | "OTHER";

export interface NormalizedPosition {
  protocolId: Hex;
  instrumentId: Hex;
  asset: Address;
  positionType: PositionType;
  /** Raw signed exposure in the integrated protocol's native position units. */
  signedExposure: bigint;
  /** 0 means intentionally unvalued until a price/decimal provider is applied. */
  notional: bigint;
  collateral: bigint;
  debt: bigint;
  pnl: bigint;
  metadata: Hex;
}

export interface ValuedPosition extends NormalizedPosition {
  valueUsd: bigint;
  valueDecimals: number;
}

export interface ExposureBucket {
  asset: Address;
  signedExposure: bigint;
  positionCount: number;
}

export interface AdapterAction {
  adapter: Address;
  action: Hex;
}

export interface PortfolioMetrics {
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

export interface AssetExposure {
  asset: Address;
  netUsd: bigint;
  grossUsd: bigint;
  hedgedPairUsd: bigint;
  initialMarginUsd: bigint;
  maintenanceMarginUsd: bigint;
}

export interface RiskPolicy {
  enabled: boolean;
  allowRiskReducingWhenBreached: boolean;
  maxGrossExposureUsd: bigint;
  maxDebtUsd: bigint;
  maxLeverageE18: bigint;
  maxMarginUtilizationE18: bigint;
  minHealthE18: bigint;
  minCriticalMoveBps: number;
}

export interface RiskSnapshot {
  ok: boolean;
  reason: Hex;
  metrics: PortfolioMetrics;
  exposures: AssetExposure[];
}

export type SolverAction = "NONE" | "HEDGE" | "REPAY" | "DELEVERAGE";

export interface SolverRecommendation {
  action: SolverAction;
  reason: Hex;
  asset: Address;
  currentNetUsd: bigint;
  targetNetUsd: bigint;
  reduceGrossUsd: bigint;
  repayDebtUsd: bigint;
  severityBps: bigint;
}

export interface CLDeployment {
  chainId: number;
  accountFactory?: Address;
  adapterRegistry?: Address;
  riskRegistry?: Address;
  riskEngine?: Address;
  riskPolicyManager?: Address;
  riskSolver?: Address;
  intentEngine?: Address;
  capitalRouter?: Address;
  multiStepPlanner?: Address;
  defensiveExecutor?: Address;
  keeperNetwork?: Address;
  simulationEngine?: Address;
  adapters?: Record<string, Address>;
}

export interface ProtocolTargetPermission {
  target: Address;
  /** Exact 4-byte function selectors that the CL account may call on this target. */
  selectors: Hex[];
}

export interface ProtocolManifest {
  id: string;
  displayName: string;
  adapter: Address;
  chainId: number;
  positionTypes: PositionType[];
  /** Every target that buildExecution() may emit. */
  targets: Address[];
  /** Production manifests should enumerate selectors for every target. */
  targetPermissions?: ProtocolTargetPermission[];
  assets: Address[];
  docsUrl?: string;
  metadata?: Record<string, string>;
}
