import { readFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.MONAD_RPC_URL;
const chainId = Number(process.env.MONAD_CHAIN_ID ?? 0);
const privateKey = process.env.MONAD_DEPLOYER_PRIVATE_KEY;

if (!rpcUrl || !chainId || !privateKey) {
  throw new Error("Set MONAD_RPC_URL, MONAD_CHAIN_ID and MONAD_DEPLOYER_PRIVATE_KEY before deployment.");
}
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error("MONAD_DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed private key.");
}

const artifact = JSON.parse(await readFile("artifacts/JaneInferenceSettlement.json", "utf8"));
const chain = defineChain({
  id: chainId,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});
const account = privateKeyToAccount(privateKey);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

console.log(`Deploying JaneInferenceSettlement from ${account.address} on chain ${chainId}...`);
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode
});
console.log(`Deployment tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error("Deployment mined without a contract address.");

console.log(`JaneInferenceSettlement deployed: ${receipt.contractAddress}`);
console.log("Set MONAD_SETTLEMENT_CONTRACT to this address in the 33jane deployment environment.");
