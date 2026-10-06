import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createApiHandler } from "./handler.js";

const handle = createApiHandler();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

const server = createServer(async (req, res) => {
  try {
    if ((req.url === "/" || req.url === "/index.html") && req.method === "GET") {
      const html = await readFile("index.html");
      res.statusCode = 200;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }

    const request = new Request(
      `http://${req.headers.host ?? `${host}:${port}`}${req.url ?? "/"}`,
      {
        method: req.method ?? "GET",
        headers,
        body: ["GET", "HEAD"].includes(req.method ?? "GET") || body.length === 0 ? undefined : body
      }
    );

    const response = await handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "SERVER_ERROR" }));
  }
});

server.listen(port, host, () => {
  console.log(`33jane listening on http://${host}:${port}`);
});
