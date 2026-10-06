import { readFile, mkdir, writeFile } from "node:fs/promises";
import solc from "solc";

const source = await readFile("contracts/JaneInferenceSettlement.sol", "utf8");

const input = {
  language: "Solidity",
  sources: {
    "JaneInferenceSettlement.sol": { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((item) => item.severity === "error");
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage ?? error.message);
  process.exit(1);
}

const contract = output.contracts?.["JaneInferenceSettlement.sol"]?.JaneInferenceSettlement;
if (!contract?.evm?.bytecode?.object) {
  throw new Error("JaneInferenceSettlement compilation produced no bytecode");
}

await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/JaneInferenceSettlement.json",
  JSON.stringify({
    contractName: "JaneInferenceSettlement",
    compiler: solc.version(),
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  }, null, 2)
);

console.log("Compiled JaneInferenceSettlement -> artifacts/JaneInferenceSettlement.json");
