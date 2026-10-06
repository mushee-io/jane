import { mkdir, copyFile } from "node:fs/promises";

await mkdir("public", { recursive: true });
await mkdir("public/assets", { recursive: true });

for (const [from,to] of [
  ["index.html","public/index.html"],
  ["manifest.webmanifest","public/manifest.webmanifest"],
  ["sw.js","public/sw.js"],
  ["assets/icon.svg","public/assets/icon.svg"],
  ["assets/e2ee.js","public/assets/e2ee.js"],
  ["assets/voice.js","public/assets/voice.js"]
]) {
  await copyFile(from,to);
}

console.log("Copied 33jane web app + PWA assets to public/");
