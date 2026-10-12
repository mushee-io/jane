import { mkdir, copyFile } from "node:fs/promises";

await mkdir("public", { recursive: true });
await mkdir("public/assets", { recursive: true });
await mkdir("public/fonts", { recursive: true });

for (const [from,to] of [
  ["index.html","public/index.html"],
  ["styles.css","public/styles.css"],
  ["main.js","public/main.js"],
  ["jane.html","public/jane.html"],
  ["manifest.webmanifest","public/manifest.webmanifest"],
  ["sw.js","public/sw.js"],
  ["assets/icon.svg","public/assets/icon.svg"],
  ["assets/logo.webp","public/assets/logo.webp"],
  ["assets/e2ee.js","public/assets/e2ee.js"],
  ["assets/voice.js","public/assets/voice.js"],
  ["fonts/GeistPixel-Circle.woff2","public/fonts/GeistPixel-Circle.woff2"]
]) {
  await copyFile(from,to);
}

console.log("Copied Jane homepage + focused AI workspace + PWA assets to public/");
