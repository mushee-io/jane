import { JaneAIService } from "../ai/service.js";
import { feedbackSchema, janeRequestSchema, policyEvaluateSchema } from "../ai/schemas.js";
import { openAIChatSchema, openAIModels, openAIStream, toJaneRequest, toOpenAIResponse } from "../openai/compat.js";
import { prepareSettlement, settlementStatus, verifySettlement } from "../monad/settlement.js";
import { verifyPrivacyReceipt, type PrivacyReceipt } from "../privacy/receipt.js";
import type { Hex } from "viem";

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
  const v1 = url.searchParams.get("v1");
  if (v1 !== null) return `/v1/${v1.replace(/^\/+/, "")}`;
  const routed = url.searchParams.get("path");
  if (!routed) return url.pathname;
  const clean = routed.replace(/^\/+/, "").replace(/^api\//, "");
  return `/api/${clean}`;
}

function openAIError(message: string, status = 400, code = "jane_error"): Response {
  return json({
    error: {
      message,
      type: "invalid_request_error",
      param: null,
      code
    }
  }, status);
}

function requireJaneApiKey(request: Request): Response | null {
  const configured = (process.env.JANE_API_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) return null;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!configured.includes(token)) {
    return openAIError("Invalid or missing 33jane API key.", 401, "invalid_api_key");
  }
  return null;
}

export function createApiHandler() {
  const jane = new JaneAIService();

  return async function handle(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });

    const url = new URL(request.url);
    const path = normalizePath(url);

    try {
      if (path.startsWith("/v1/")) {
        const authError = requireJaneApiKey(request);
        if (authError) return authError;
      }

      if (request.method === "GET" && path === "/v1/models") {
        return json({ object: "list", data: openAIModels() });
      }

      if (request.method === "POST" && path === "/v1/chat/completions") {
        let input;
        try {
          input = openAIChatSchema.parse(await parseBody(request));
        } catch (error) {
          const value = error as { issues?: unknown[] };
          return openAIError(
            Array.isArray(value.issues) ? "Invalid OpenAI-compatible chat request." : "Invalid request.",
            400,
            "invalid_request"
          );
        }

        try {
          const result = await jane.chat(toJaneRequest(input));
          if (input.stream) {
            return new Response(openAIStream(result, input.model), {
              status: 200,
              headers: {
                "content-type": "text/event-stream; charset=utf-8",
                "cache-control": "no-cache, no-transform",
                "connection": "keep-alive",
                "access-control-allow-origin": "*"
              }
            });
          }
          return json(toOpenAIResponse(result, input.model));
        } catch (error) {
          const value = error as Error & { failures?: unknown };
          const status = value.message === "NO_LIVE_AI_PROVIDER_CONFIGURED" ? 503 : 502;
          return openAIError(value.message, status, "upstream_error");
        }
      }

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

      if (request.method === "POST" && path === "/api/policy/evaluate") {
        const input = policyEvaluateSchema.parse(await parseBody(request));
        return json(jane.evaluatePolicy(input.policy, input.mode));
      }

      if (request.method === "GET" && path === "/api/policy/usage") {
        const principal = url.searchParams.get("principal");
        if (!principal) return json({ error: "PRINCIPAL_REQUIRED" }, 400);
        return json(jane.policyUsage(principal));
      }

      if (request.method === "GET" && path === "/api/monad/status") {
        return json(settlementStatus());
      }

      if (request.method === "POST" && path === "/api/monad/settlement/prepare") {
        const body = await parseBody(request) as { receipt?: PrivacyReceipt };
        if (!body.receipt || !verifyPrivacyReceipt(body.receipt)) {
          return json({ error: "VALID_PRIVACY_RECEIPT_REQUIRED" }, 400);
        }
        return json(prepareSettlement(body.receipt));
      }

      if (request.method === "POST" && path === "/api/monad/settlement/verify") {
        const body = await parseBody(request) as { txHash?: Hex; receiptHash?: string };
        if (!body.txHash || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) {
          return json({ error: "VALID_TX_HASH_REQUIRED" }, 400);
        }
        if (!body.receiptHash || !/^(0x)?[a-fA-F0-9]{64}$/.test(body.receiptHash)) {
          return json({ error: "VALID_RECEIPT_HASH_REQUIRED" }, 400);
        }
        const executionReceipt = await verifySettlement(body.txHash, body.receiptHash);
        return json({ executionReceipt });
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
