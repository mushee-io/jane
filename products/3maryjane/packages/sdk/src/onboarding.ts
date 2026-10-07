import { getAddress, isAddress } from "viem";
import type { Address, Hex, ProtocolManifest, ProtocolTargetPermission } from "./types";

export interface ManifestValidation {
  ok: boolean;
  errors: string[];
  normalized?: ProtocolManifest;
}

const supportedChains = new Set([143, 10143]);
const selectorPattern = /^0x[0-9a-fA-F]{8}$/;

function uniqueAddresses(values: readonly Address[]): Address[] {
  return [...new Set(values.map((value) => getAddress(value) as Address))];
}

function normalizePermissions(values: readonly ProtocolTargetPermission[]): ProtocolTargetPermission[] {
  const byTarget = new Map<Address, Set<Hex>>();
  for (const permission of values) {
    const target = getAddress(permission.target) as Address;
    const selectors = byTarget.get(target) ?? new Set<Hex>();
    for (const selector of permission.selectors) selectors.add(selector.toLowerCase() as Hex);
    byTarget.set(target, selectors);
  }
  return [...byTarget.entries()].map(([target, selectors]) => ({ target, selectors: [...selectors] }));
}

export function validateProtocolManifest(input: ProtocolManifest): ManifestValidation {
  const errors: string[] = [];
  if (!/^[A-Z0-9_]{2,32}$/.test(input.id)) errors.push("id must be 2-32 uppercase letters, digits or underscores");
  if (!input.displayName.trim()) errors.push("displayName is required");
  if (!supportedChains.has(input.chainId)) errors.push(`unsupported Monad chainId ${input.chainId}`);
  if (!isAddress(input.adapter) || input.adapter === "0x0000000000000000000000000000000000000000") {
    errors.push("adapter must be a non-zero address");
  }
  if (input.targets.length === 0) errors.push("at least one allowlisted target is required");
  if (input.positionTypes.length === 0) errors.push("at least one normalized position type is required");

  const normalizedTargets = new Set<string>();
  for (const target of input.targets) {
    if (!isAddress(target) || target === "0x0000000000000000000000000000000000000000") {
      errors.push(`invalid target ${target}`);
    } else {
      normalizedTargets.add(getAddress(target));
    }
  }

  for (const asset of input.assets) {
    if (!isAddress(asset)) errors.push(`invalid asset ${asset}`);
  }

  if (input.targetPermissions) {
    const coveredTargets = new Set<string>();
    for (const permission of input.targetPermissions) {
      if (!isAddress(permission.target) || permission.target === "0x0000000000000000000000000000000000000000") {
        errors.push(`invalid permission target ${permission.target}`);
        continue;
      }
      const normalizedTarget = getAddress(permission.target);
      coveredTargets.add(normalizedTarget);
      if (!normalizedTargets.has(normalizedTarget)) {
        errors.push(`permission target ${permission.target} is not declared in targets`);
      }
      if (permission.selectors.length === 0) errors.push(`permission target ${permission.target} has no selectors`);
      for (const selector of permission.selectors) {
        if (!selectorPattern.test(selector)) errors.push(`invalid 4-byte selector ${selector}`);
      }
    }
    for (const target of normalizedTargets) {
      if (!coveredTargets.has(target)) errors.push(`target ${target} is missing selector permissions`);
    }
  }

  if (errors.length !== 0) return { ok: false, errors };

  const normalized: ProtocolManifest = {
    id: input.id,
    displayName: input.displayName,
    adapter: getAddress(input.adapter) as Address,
    chainId: input.chainId,
    positionTypes: [...input.positionTypes],
    targets: uniqueAddresses(input.targets),
    assets: uniqueAddresses(input.assets),
    ...(input.targetPermissions ? { targetPermissions: normalizePermissions(input.targetPermissions) } : {}),
    ...(input.docsUrl !== undefined ? { docsUrl: input.docsUrl } : {}),
    ...(input.metadata !== undefined ? { metadata: { ...input.metadata } } : {}),
  };

  return { ok: true, errors: [], normalized };
}

export function assertProtocolManifest(input: ProtocolManifest): ProtocolManifest {
  const result = validateProtocolManifest(input);
  if (!result.ok || !result.normalized) throw new Error(`Invalid CL protocol manifest: ${result.errors.join("; ")}`);
  return result.normalized;
}

export function manifestSecurityChecklist(manifest: ProtocolManifest): string[] {
  return [
    `${manifest.id}: adapter does not custody funds`,
    `${manifest.id}: every execution target is explicitly allowlisted`,
    `${manifest.id}: exact selector permissions are ${manifest.targetPermissions ? "declared" : "NOT DECLARED"}`,
    `${manifest.id}: getPositions() fails closed for material read failures`,
    `${manifest.id}: units/decimals are documented before risk mapping`,
    `${manifest.id}: derivative instruments have explicit underlying/collateral mapping`,
    `${manifest.id}: live addresses are re-verified for chain ${manifest.chainId}`,
    `${manifest.id}: fork/live integration tests cover deposits, exits and failure paths`,
  ];
}
