import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import solc from "solc";

const files = (await readdir("contracts")).filter((name) => name.endsWith(".sol"));
const sources = {};
for (const file of files) {
  sources[file] = { content: await readFile(`contracts/${file}`, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
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

await mkdir("artifacts", { recursive: true });
let count = 0;
for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, contract] of Object.entries(contracts)) {
    const bytecode = contract?.evm?.bytecode?.object;
    if (!bytecode) continue;
    await writeFile(
      `artifacts/${contractName}.json`,
      JSON.stringify({
        contractName,
        sourceName,
        compiler: solc.version(),
        abi: contract.abi,
        bytecode: `0x${bytecode}`
      }, null, 2)
    );
    count += 1;
    console.log(`Compiled ${contractName} -> artifacts/${contractName}.json`);
  }
}
if (!count) throw new Error("No deployable contract bytecode produced.");
