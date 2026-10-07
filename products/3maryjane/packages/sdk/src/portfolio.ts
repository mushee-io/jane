import type { Address, ExposureBucket, NormalizedPosition } from "./types";

/**
 * Aggregate raw exposures only when the positions share the same asset address.
 * Perp instruments use metadata/instrumentId and should be valued before cross-venue netting.
 */
export function aggregateRawAssetExposure(
  positions: readonly NormalizedPosition[],
): ExposureBucket[] {
  const buckets = new Map<Address, ExposureBucket>();

  for (const position of positions) {
    const current = buckets.get(position.asset) ?? {
      asset: position.asset,
      signedExposure: 0n,
      positionCount: 0,
    };
    current.signedExposure += position.signedExposure;
    current.positionCount += 1;
    buckets.set(position.asset, current);
  }

  return [...buckets.values()];
}

export function positionsByProtocol(
  positions: readonly NormalizedPosition[],
): Map<string, NormalizedPosition[]> {
  const result = new Map<string, NormalizedPosition[]>();
  for (const position of positions) {
    const bucket = result.get(position.protocolId) ?? [];
    bucket.push(position);
    result.set(position.protocolId, bucket);
  }
  return result;
}
