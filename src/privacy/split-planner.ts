import type { JaneRequest } from "../ai/types.js";

export interface SplitPlanStep {
  id: string;
  boundary: "local" | "private" | "public";
  purpose: string;
  mayUseWeb: boolean;
  receivesSensitiveContext: boolean;
}

export interface SplitPlan {
  recommended: boolean;
  reason: string;
  steps: SplitPlanStep[];
}

const publicResearch = /\b(web|internet|research|latest|current|competitor|market|news|benchmark|salary|price|public sources?)\b/i;
const sensitiveWork = /\b(confidential|private|internal|board|employee|customer|financial|contract|source code|secret|proprietary|personal)\b/i;

export function planSplitInference(request: JaneRequest): SplitPlan {
  const text = request.messages.map((message) => message.content).join("\n");
  const needsPublic = publicResearch.test(text);
  const needsPrivate = request.mode === "private"
    || request.mode === "confidential"
    || sensitiveWork.test(text)
    || Boolean(request.clientPrivacy?.redactedCount);

  if (!needsPublic || !needsPrivate) {
    return {
      recommended: false,
      reason: needsPrivate
        ? "The task is sensitive but does not appear to require a separate public-research boundary."
        : "The task does not require both private context and public research.",
      steps: [{
        id: "single-route",
        boundary: needsPrivate ? "private" : "public",
        purpose: "Execute as a single policy-constrained inference request.",
        mayUseWeb: needsPublic,
        receivesSensitiveContext: needsPrivate
      }]
    };
  }

  return {
    recommended: true,
    reason: "The request mixes sensitive context with public research. Separate them so no public model receives the private source material.",
    steps: [
      {
        id: "private-extract",
        boundary: "private",
        purpose: "Derive only the non-identifying facts and questions required from confidential context.",
        mayUseWeb: false,
        receivesSensitiveContext: true
      },
      {
        id: "public-research",
        boundary: "public",
        purpose: "Research public information using only the sanitized questions produced by the private step.",
        mayUseWeb: true,
        receivesSensitiveContext: false
      },
      {
        id: "local-merge",
        boundary: "local",
        purpose: "Combine private findings and public research without exposing the original confidential source.",
        mayUseWeb: false,
        receivesSensitiveContext: false
      }
    ]
  };
}
