import { app } from "../../packages/api/src/app";

function normalizePath(request: Request): Request {
  const url = new URL(request.url);
  const prefixes = ["/.netlify/functions/api", "/api"];

  for (const prefix of prefixes) {
    if (url.pathname === prefix) {
      url.pathname = "/";
      return new Request(url, request);
    }
    if (url.pathname.startsWith(`${prefix}/`)) {
      url.pathname = url.pathname.slice(prefix.length) || "/";
      return new Request(url, request);
    }
  }

  return request;
}

export default async (request: Request): Promise<Response> => {
  return app.fetch(normalizePath(request));
};
