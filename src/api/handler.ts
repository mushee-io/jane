import { JaneAIService } from "../ai/service.js";
import { feedbackSchema, janeRequestSchema } from "../ai/schemas.js";
import { verifyPrivacyReceipt, type PrivacyReceipt } from "../privacy/receipt.js";

function json(payload: unknown, status = 200, extra: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      ...extra
    }
  });
}

async function parseBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function normalizePath(url: URL): string {
  const routed = url.searchParams.get("path");
  if (!routed) return url.pathname;
  const clean = routed.replace(/^\/+/, "").replace(/^api\//, "");
  return `/api/${clean}`;
}

export function createApiHandler() {
  const jane = new JaneAIService();

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    const url = new URL(request.url);
    const path = normalizePath(url);

    try {
      if (request.method === "GET" && (path === "/api/health" || path === "/api/ai/health")) {
        return json(jane.health());
      }

      if (request.method === "GET" && path === "/api/ai/models") {
        return json({ models: jane.models() });
      }

      if (request.method === "GET" && path === "/api/ai/metrics") {
        return json({ metrics: jane.telemetry.snapshot() });
      }

      if (request.method === "POST" && path === "/api/ai/route") {
        const input = janeRequestSchema.parse(await parseBody(request));
        return json(jane.preview(input));
      }

      if (request.method === "POST" && path === "/api/ai/plan") {
        const input = janeRequestSchema.parse(await parseBody(request));
        return json(jane.plan(input));
      }

      if (request.method === "POST" && path === "/api/ai/chat") {
        const input = janeRequestSchema.parse(await parseBody(request));
        try {
          return json(await jane.chat(input));
        } catch (error) {
          const value = error as Error & { route?: unknown; failures?: unknown };
          const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
          return json({ error: value.message, route: value.route, failures: value.failures }, status);
        }
      }

      if (request.method === "POST" && path === "/api/ai/feedback") {
        const input = feedbackSchema.parse(await parseBody(request));
        return json(jane.feedback(input.requestId, input.signal));
      }

      if (request.method === "POST" && path === "/api/privacy/verify") {
        const body = await parseBody(request) as { receipt?: PrivacyReceipt };
        if (!body.receipt || typeof body.receipt !== "object") {
          return json({ error: "RECEIPT_REQUIRED" }, 400);
        }
        return json({
          valid: verifyPrivacyReceipt(body.receipt),
          receiptId: body.receipt.receiptId ?? null,
          receiptHash: body.receipt.receiptHash ?? null
        });
      }

      return json({ error: "NOT_FOUND", path, method: request.method }, 404);
    } catch (error) {
      const value = error as { issues?: unknown[]; message?: string };
      if (Array.isArray(value.issues)) {
        return json({ error: "VALIDATION_ERROR", issues: value.issues }, 400);
      }
      return json({ error: value.message ?? "UNKNOWN_ERROR" }, 400);
    }
  };
}
