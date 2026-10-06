import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  type Address
} from "viem";

const utilityAbi = [
  {
    type: "function",
    name: "stakedBalance",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "benefitBps",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "tierOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint8" }]
  }
] as const;

function config() {
  return {
    rpcUrl: process.env.JANE_TOKEN_RPC_URL ?? "",
    chainId: Number(process.env.JANE_TOKEN_CHAIN_ID ?? 0),
    staking: process.env.JANE_33G_STAKING_CONTRACT ?? ""
  };
}

export function tokenUtilityStatus() {
  const value = config();
  return {
    configured: Boolean(value.rpcUrl && value.chainId > 0 && isAddress(value.staking)),
    chainId: value.chainId || null,
    stakingContract: isAddress(value.staking) ? getAddress(value.staking) : null,
    symbol: "33G",
    maxSupply: "1000000000"
  };
}

export async function getTokenUtility(account: string) {
  const value = config();
  if (!value.rpcUrl || !value.chainId || !isAddress(value.staking)) throw new Error("33G_UTILITY_NOT_CONFIGURED");
  if (!isAddress(account)) throw new Error("INVALID_WALLET_ADDRESS");

  const chain = defineChain({
    id: value.chainId,
    name: "33G Utility Chain",
    nativeCurrency: { name: "Native", symbol: "NATIVE", decimals: 18 },
    rpcUrls: { default: { http: [value.rpcUrl] } }
  });
  const client = createPublicClient({ chain, transport: http(value.rpcUrl) });
  const address = getAddress(account) as Address;
  const contract = getAddress(value.staking) as Address;
  const [staked, benefit, tier] = await Promise.all([
    client.readContract({ address: contract, abi: utilityAbi, functionName: "stakedBalance", args: [address] }),
    client.readContract({ address: contract, abi: utilityAbi, functionName: "benefitBps", args: [address] }),
    client.readContract({ address: contract, abi: utilityAbi, functionName: "tierOf", args: [address] })
  ]);

  return {
    address,
    symbol: "33G",
    stakedAtomic: staked.toString(),
    tier: Number(tier),
    platformBenefitBps: Number(benefit),
    platformBenefitPercent: Number(benefit) / 100
  };
}
