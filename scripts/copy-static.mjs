import { mkdir, copyFile } from "node:fs/promises";

await mkdir("public", { recursive: true });
await mkdir("public/assets", { recursive: true });

for (const [from,to] of [
  ["index.html","public/index.html"],
  ["manifest.webmanifest","public/manifest.webmanifest"],
  ["sw.js","public/sw.js"],
  ["assets/icon.svg","public/assets/icon.svg"]
]) {
  await copyFile(from,to);
}

console.log("Copied 33jane web app + PWA assets to public/");
