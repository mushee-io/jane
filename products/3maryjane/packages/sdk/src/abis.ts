import { parseAbi } from "viem";

export const clAccountAbi = parseAbi([
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function riskGuard() view returns (address)",
  "function riskGuardEnabled() view returns (bool)",
  "function paused() view returns (bool)",
  "function authorizedAdapter(address) view returns (bool)",
  "function authorizedAdapterVersion(address) view returns (uint64)",
  "function allowedAsset(address) view returns (bool)",
  "function defensiveOperator(address) view returns (bool)",
  "function setPaused(bool state)",
  "function setRiskGuard(address guard, bool enabled)",
  "function setDefensiveOperator(address operator, bool authorized)",
  "function setAssetAllowed(address asset, bool allowed)",
  "function authorizeAdapter(address adapter, bool authorized)",
  "function depositToken(address asset, uint256 amount)",
  "function withdraw(address asset, address to, uint256 amount)",
  "function execute(address adapter, bytes action) returns (bytes[] results)",
  "function executeBatch((address adapter,bytes action)[] actions) returns (bytes[][] results)",
  "function executeDefensiveBatch((address adapter,bytes action)[] actions) returns (bytes[][] results)",
]);

export const clAccountFactoryAbi = parseAbi([
  "function registry() view returns (address)",
  "function predictAccount(address user, bytes32 salt) view returns (address)",
  "function createAccount(bytes32 salt) returns (address account)",
]);

export const riskPolicyManagerAbi = parseAbi([
  "error AdapterReadFailed(address adapter)",
  "function policy(address account) view returns ((bool enabled,bool allowRiskReducingWhenBreached,uint256 maxGrossExposureUsd,uint256 maxDebtUsd,uint256 maxLeverageE18,uint256 maxMarginUtilizationE18,uint256 minHealthE18,uint16 minCriticalMoveBps))",
  "function adapters(address account) view returns (address[])",
  "function limitedAssets(address account) view returns (address[])",
  "function assetLimitUsd(address account, address asset) view returns (uint256)",
  "function isAdapterCovered(address account, address adapter) view returns (bool)",
  "function check(address account) view returns (bool ok, bytes32 reason, (uint256 assetsUsd,uint256 debtUsd,int256 equityUsd,int256 pnlUsd,uint256 grossExposureUsd,uint256 directionalExposureUsd,uint256 initialMarginUsd,uint256 maintenanceMarginUsd,uint256 leverageE18,uint256 healthE18,uint256 marginUtilizationE18,uint256 criticalMoveBps) metrics, (address asset,int256 netUsd,uint256 grossUsd,uint256 hedgedPairUsd,uint256 initialMarginUsd,uint256 maintenanceMarginUsd)[] exposures)",
  "function configure(address account, (bool enabled,bool allowRiskReducingWhenBreached,uint256 maxGrossExposureUsd,uint256 maxDebtUsd,uint256 maxLeverageE18,uint256 maxMarginUtilizationE18,uint256 minHealthE18,uint16 minCriticalMoveBps) policy_, address[] adapters)",
  "function setAssetLimit(address account, address asset, uint256 maxAbsNetUsd)",
]);

export const riskSolverAbi = parseAbi([
  "error AdapterReadFailed(address adapter)",
  "function solve(address account) view returns ((uint8 action,bytes32 reason,address asset,int256 currentNetUsd,int256 targetNetUsd,uint256 reduceGrossUsd,uint256 repayDebtUsd,uint256 severityBps) recommendation,(uint256 assetsUsd,uint256 debtUsd,int256 equityUsd,int256 pnlUsd,uint256 grossExposureUsd,uint256 directionalExposureUsd,uint256 initialMarginUsd,uint256 maintenanceMarginUsd,uint256 leverageE18,uint256 healthE18,uint256 marginUtilizationE18,uint256 criticalMoveBps) metrics,(address asset,int256 netUsd,uint256 grossUsd,uint256 hedgedPairUsd,uint256 initialMarginUsd,uint256 maintenanceMarginUsd)[] exposures)",
]);

export const intentEngineAbi = parseAbi([
  "function nextNonce(address account) view returns (uint64)",
  "function createIntent(address account,uint8 kind,address asset,int256 targetNetUsd,uint256 maxNotionalUsd,uint64 deadline,bytes32 constraintsHash,bytes32 metadataHash) returns (bytes32 intentId)",
  "function cancelIntent(bytes32 intentId)",
  "function bindPlan(bytes32 intentId, bytes32 planId)",
  "function markExecuted(bytes32 intentId, bytes32 planId)",
  "function isActive(bytes32 intentId) view returns (bool)",
  "function getIntent(bytes32 intentId) view returns ((address account,uint8 kind,address asset,int256 targetNetUsd,uint256 maxNotionalUsd,uint64 deadline,uint64 nonce,bytes32 constraintsHash,bytes32 metadataHash,uint8 status,bytes32 boundPlanId))",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
