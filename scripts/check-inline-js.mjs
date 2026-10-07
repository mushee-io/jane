import { readFile } from "node:fs/promises";

const files = ["index.html", "jane.html"];
let total = 0;

for (const file of files) {
  const html = await readFile(file, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((value) => value && value.trim());

  if (!scripts.length) throw new Error(`No inline scripts found in ${file}`);

  for (const [index, script] of scripts.entries()) {
    try {
      new Function(script);
    } catch (error) {
      console.error(`${file}: inline script #${index + 1} failed syntax validation`);
      throw error;
    }
  }

  total += scripts.length;
}

console.log(`Validated ${total} inline browser script(s) across ${files.join(", ")}.`);
