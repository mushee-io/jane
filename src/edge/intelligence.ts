import { createHash } from "node:crypto";
import type { JaneRequest } from "../ai/types.js";
import { classifyTask, estimateInputTokens } from "../ai/classifier.js";

export interface EdgePlan {
  requestHash: string;
  task: ReturnType<typeof classifyTask>;
  estimatedInputTokens: number;
  cacheEligible: boolean;
  privacyBoundary: "local-first" | "provider";
  recommendations: string[];
}

export function edgePlan(request: JaneRequest): EdgePlan {
  const requestHash = createHash("sha256").update(JSON.stringify({
    mode: request.mode,
    messages: request.messages,
    context: request.clientContext
  })).digest("hex");
  const task = classifyTask(request);
  const estimatedInputTokens = estimateInputTokens(request);
  const hasExternalContext = Boolean(request.clientContext?.sentChars);
  const cacheEligible = !hasExternalContext && request.mode !== "confidential";

  const recommendations: string[] = [];
  if (estimatedInputTokens > 8_000) recommendations.push("compress repeated context before upstream inference");
  if (request.clientPrivacy?.redactedCount) recommendations.push("keep redaction map on the client boundary");
  if (cacheEligible) recommendations.push("eligible for device-local exact-response cache");
  if (task === "fast") recommendations.push("prefer low-latency route");

  return {
    requestHash,
    task,
    estimatedInputTokens,
    cacheEligible,
    privacyBoundary: request.clientPrivacy?.applied ? "local-first" : "provider",
    recommendations
  };
}
