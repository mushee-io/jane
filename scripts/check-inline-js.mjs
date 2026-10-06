import { readFile } from "node:fs/promises";

const html = await readFile("index.html", "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((value) => value && value.trim());

if (!scripts.length) throw new Error("No inline scripts found in index.html");

for (const [index, script] of scripts.entries()) {
  try {
    // Syntax validation only. Browser globals are not executed.
    new Function(script);
  } catch (error) {
    console.error(`Inline script #${index + 1} failed syntax validation`);
    throw error;
  }
}

console.log(`Validated ${scripts.length} inline browser script(s).`);
