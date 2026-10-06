import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.DEPLOY_RPC_URL || process.env.MONAD_RPC_URL;
const chainId = Number(process.env.DEPLOY_CHAIN_ID || process.env.MONAD_CHAIN_ID || 0);
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.MONAD_DEPLOYER_PRIVATE_KEY;
const contractName = process.env.DEPLOY_CONTRACT;
const args = process.env.DEPLOY_ARGS_JSON ? JSON.parse(process.env.DEPLOY_ARGS_JSON) : [];

if (!rpcUrl || !chainId || !privateKey || !contractName) {
  throw new Error("Set DEPLOY_RPC_URL, DEPLOY_CHAIN_ID, DEPLOYER_PRIVATE_KEY and DEPLOY_CONTRACT.");
}
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte 0x-prefixed private key.");
}

const artifact = JSON.parse(await readFile(`artifacts/${contractName}.json`, "utf8"));
const chain = defineChain({
  id: chainId,
  name: process.env.DEPLOY_CHAIN_NAME || "EVM",
  nativeCurrency: { name: "Native", symbol: process.env.DEPLOY_NATIVE_SYMBOL || "NATIVE", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});
const account = privateKeyToAccount(privateKey);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

console.log(`Deploying ${contractName} from ${account.address} on chain ${chainId}...`);
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args
});
console.log(`Deployment tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error("Deployment mined without a contract address.");

console.log(`${contractName} deployed: ${receipt.contractAddress}`);
