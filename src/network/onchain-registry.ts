import { createHash } from "node:crypto";
import { encodeFunctionData, isAddress, parseEther, type Address } from "viem";

const registryAbi = [{
  type: "function",
  name: "register",
  stateMutability: "payable",
  inputs: [
    { name: "metadataHash", type: "bytes32" },
    { name: "endpointHash", type: "bytes32" }
  ],
  outputs: []
}] as const;

function sha256Hex(value: string): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function computeRegistryStatus() {
  const chainId = Number(process.env.MONAD_CHAIN_ID ?? 0);
  const registry = process.env.MONAD_COMPUTE_REGISTRY ?? "";
  return {
    configured: Boolean(chainId > 0 && isAddress(registry)),
    chainId: chainId || null,
    registry: isAddress(registry) ? registry : null,
    minimumBondNative: process.env.MONAD_COMPUTE_MIN_BOND ?? "0.01"
  };
}

export function prepareComputeRegistration(input: {
  metadata: Record<string, unknown>;
  endpoint: string;
  bondNative?: string;
}) {
  const status = computeRegistryStatus();
  if (!status.configured || !status.registry) throw new Error("COMPUTE_REGISTRY_NOT_CONFIGURED");
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("NETWORK_ENDPOINT_NOT_ALLOWED");
  }

  const metadataHash = sha256Hex(JSON.stringify(input.metadata));
  const endpointHash = sha256Hex(input.endpoint);
  const bond = parseEther(input.bondNative ?? status.minimumBondNative);

  return {
    chainId: status.chainId,
    to: status.registry as Address,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "register",
      args: [metadataHash, endpointHash]
    }),
    value: bond.toString(),
    metadataHash,
    endpointHash,
    bondAtomic: bond.toString()
  };
}
