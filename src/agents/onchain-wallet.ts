import { encodeFunctionData, isAddress, type Address } from "viem";

const factoryAbi = [{
  type: "function",
  name: "createAgentWallet",
  stateMutability: "nonpayable",
  inputs: [
    { name: "owner", type: "address" },
    { name: "dailyLimit", type: "uint256" },
    { name: "perRequestLimit", type: "uint256" }
  ],
  outputs: [{ name: "wallet", type: "address" }]
}] as const;

export function agentWalletStatus() {
  const chainId = Number(process.env.MONAD_CHAIN_ID ?? 0);
  const factory = process.env.MONAD_AGENT_WALLET_FACTORY ?? "";
  return {
    configured: Boolean(chainId > 0 && isAddress(factory)),
    chainId: chainId || null,
    factory: isAddress(factory) ? factory : null
  };
}

export function prepareAgentWalletCreation(input: {
  owner: string;
  dailyLimitAtomic: string;
  perRequestLimitAtomic: string;
}) {
  const status = agentWalletStatus();
  if (!status.configured || !status.factory) throw new Error("AGENT_WALLET_FACTORY_NOT_CONFIGURED");
  if (!isAddress(input.owner)) throw new Error("INVALID_OWNER_ADDRESS");

  const dailyLimit = BigInt(input.dailyLimitAtomic);
  const perRequestLimit = BigInt(input.perRequestLimitAtomic);
  if (dailyLimit <= 0n || perRequestLimit <= 0n || perRequestLimit > dailyLimit) {
    throw new Error("INVALID_AGENT_BUDGET");
  }

  return {
    chainId: status.chainId,
    to: status.factory as Address,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: "createAgentWallet",
      args: [input.owner as Address, dailyLimit, perRequestLimit]
    }),
    value: "0"
  };
}
