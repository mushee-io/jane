import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex
} from "viem";
import type { PrivacyReceipt } from "../privacy/receipt.js";

export const janeSettlementAbi = [
  {
    type: "function",
    name: "settleInference",
    stateMutability: "payable",
    inputs: [
      { name: "receiptHash", type: "bytes32" },
      { name: "requestHash", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
      { name: "provider", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "event",
    name: "InferenceSettled",
    anonymous: false,
    inputs: [
      { name: "payer", type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "receiptHash", type: "bytes32", indexed: true },
      { name: "requestHash", type: "bytes32", indexed: false },
      { name: "policyHash", type: "bytes32", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false }
    ]
  }
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const erc20ApprovalAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" }
  ],
  outputs: [{ name: "", type: "bool" }]
}] as const;

function envConfig() {
  const rpcUrl = process.env.MONAD_RPC_URL ?? "";
  const contract = process.env.MONAD_SETTLEMENT_CONTRACT ?? "";
  const provider = process.env.MONAD_PROVIDER_TREASURY ?? "";
  const token = process.env.MONAD_SETTLEMENT_TOKEN ?? ZERO_ADDRESS;
  const chainId = Number(process.env.MONAD_CHAIN_ID ?? 0);
  const decimals = Number(process.env.MONAD_SETTLEMENT_TOKEN_DECIMALS ?? 6);
  const symbol = process.env.MONAD_SETTLEMENT_TOKEN_SYMBOL ?? "USDC";

  return {
    rpcUrl,
    contract: contract as Address,
    provider: provider as Address,
    token: token as Address,
    chainId,
    decimals,
    symbol
  };
}

function hash32(value: string): Hex {
  return (`0x${value.replace(/^0x/, "")}`) as Hex;
}

export function settlementStatus() {
  const config = envConfig();
  return {
    configured: Boolean(
      config.rpcUrl
      && config.chainId > 0
      && isAddress(config.contract)
      && isAddress(config.provider)
      && isAddress(config.token)
    ),
    chainId: config.chainId || null,
    contract: isAddress(config.contract) ? config.contract : null,
    providerTreasury: isAddress(config.provider) ? config.provider : null,
    settlementToken: isAddress(config.token) ? config.token : null,
    tokenSymbol: config.symbol,
    tokenDecimals: config.decimals
  };
}

export function prepareSettlement(receipt: PrivacyReceipt) {
  const config = envConfig();
  const status = settlementStatus();
  if (!status.configured) throw new Error("MONAD_SETTLEMENT_NOT_CONFIGURED");

  const minimumUnit = 1 / (10 ** config.decimals);
  const billableUsd = Math.max(receipt.route.actualCostUsd, minimumUnit);
  const amount = parseUnits(billableUsd.toFixed(config.decimals), config.decimals);
  const data = encodeFunctionData({
    abi: janeSettlementAbi,
    functionName: "settleInference",
    args: [
      hash32(receipt.receiptHash),
      hash32(receipt.requestHash),
      hash32(receipt.policyHash),
      config.provider,
      config.token,
      amount
    ]
  });

  const approval = config.token === ZERO_ADDRESS ? null : {
    to: config.token,
    data: encodeFunctionData({
      abi: erc20ApprovalAbi,
      functionName: "approve",
      args: [config.contract, amount]
    }),
    value: "0"
  };

  return {
    chainId: config.chainId,
    to: config.contract,
    data,
    value: config.token === ZERO_ADDRESS ? amount.toString() : "0",
    approval,
    token: config.token,
    tokenSymbol: config.symbol,
    tokenDecimals: config.decimals,
    amountAtomic: amount.toString(),
    amountUsd: billableUsd,
    measuredCostUsd: receipt.route.actualCostUsd,
    provider: config.provider,
    receiptHash: `0x${receipt.receiptHash}`,
    requestHash: `0x${receipt.requestHash}`,
    policyHash: `0x${receipt.policyHash}`,
    note: config.token === ZERO_ADDRESS
      ? "Native-token settlement uses amountUsd as token units only for demo configuration; use a stable settlement token for production."
      : "The approval transaction is included. Send it before the settlement transaction unless sufficient allowance already exists."
  };
}

export async function verifySettlement(txHash: Hex, expectedReceiptHash: string) {
  const config = envConfig();
  const status = settlementStatus();
  if (!status.configured) throw new Error("MONAD_SETTLEMENT_NOT_CONFIGURED");

  const chain = defineChain({
    id: config.chainId,
    name: "Monad",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } }
  });
  const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const expected = expectedReceiptHash.toLowerCase().replace(/^0x/, "");

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.contract.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: janeSettlementAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "InferenceSettled") continue;
      const args = decoded.args as {
        payer: Address;
        provider: Address;
        receiptHash: Hex;
        requestHash: Hex;
        policyHash: Hex;
        token: Address;
        amount: bigint;
      };
      if (args.receiptHash.toLowerCase().replace(/^0x/, "") !== expected) continue;
      return {
        verified: receipt.status === "success",
        chainId: config.chainId,
        txHash,
        blockNumber: receipt.blockNumber.toString(),
        payer: args.payer,
        provider: args.provider,
        receiptHash: args.receiptHash,
        requestHash: args.requestHash,
        policyHash: args.policyHash,
        token: args.token,
        amountAtomic: args.amount.toString()
      };
    } catch {
      // Ignore unrelated logs.
    }
  }

  return {
    verified: false,
    chainId: config.chainId,
    txHash,
    blockNumber: receipt.blockNumber.toString(),
    reason: "matching InferenceSettled event not found"
  };
}
