import { cp, mkdir, rm } from "node:fs/promises";

const from = "products/3maryjane/packages/terminal/dist";
const to = "public/clearing";

await rm(to, { recursive: true, force: true });
await mkdir("public", { recursive: true });
await cp(from, to, { recursive: true });

console.log("Copied 3maryjane clearing house to public/clearing/");
