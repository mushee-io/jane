import { randomUUID } from "node:crypto";
import type { JaneRequest } from "../ai/types.js";
import type { JaneAIService } from "../ai/service.js";
import type { JaneMediaService, MediaRequest } from "../media/service.js";
import type { JaneResearchService } from "../research/service.js";

export interface AgenticRunRequest extends JaneRequest {
  objective?: string;
  allowWeb?: boolean;
  allowX?: boolean;
  allowMedia?: boolean;
  maxSteps?: number;
}

export interface AgenticStep {
  id: string;
  tool: "web_search" | "web_scrape" | "x_search" | "image" | "video" | "audio" | "chat";
  reason: string;
  status: "planned" | "completed" | "skipped" | "failed";
  output?: unknown;
  error?: string;
}

function lastUserText(request: JaneRequest): string {
  return request.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
}

function urls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)\]}>"']+/gi)]
    .map((match) => match[0])
    .slice(0, 5);
}

export class JaneAgenticService {
  constructor(
    private readonly jane: JaneAIService,
    private readonly research: JaneResearchService,
    private readonly media: JaneMediaService
  ) {}

  plan(request: AgenticRunRequest): AgenticStep[] {
    const objective = (request.objective ?? lastUserText(request)).trim();
    const lower = objective.toLowerCase();
    const plan: AgenticStep[] = [];
    const foundUrls = urls(objective);

    if (request.allowWeb !== false && foundUrls.length) {
      plan.push({
        id: "scrape",
        tool: "web_scrape",
        reason: "The request contains URLs whose contents may be needed.",
        status: "planned"
      });
    }

    if (
      request.allowWeb !== false
      && /\b(latest|today|current|news|research|search|look up|find online|web)\b/i.test(objective)
    ) {
      plan.push({
        id: "search",
        tool: "web_search",
        reason: "The answer depends on current or external information.",
        status: "planned"
      });
    }

    if (
      request.allowX
      && /\b(x\.com|twitter|tweet|tweets|on x|social reaction)\b/i.test(objective)
    ) {
      plan.push({
        id: "x",
        tool: "x_search",
        reason: "The request explicitly asks for X/Twitter information.",
        status: "planned"
      });
    }

    if (request.allowMedia !== false && /\b(generate|create|make|draw|render)\b/i.test(objective)) {
      if (/\b(image|picture|logo|poster|art|photo)\b/i.test(lower)) {
        plan.push({ id: "image", tool: "image", reason: "The request asks for visual generation.", status: "planned" });
      } else if (/\b(video|clip|animation)\b/i.test(lower)) {
        plan.push({ id: "video", tool: "video", reason: "The request asks for video generation.", status: "planned" });
      } else if (/\b(music|song|sound|audio|sfx)\b/i.test(lower)) {
        plan.push({ id: "audio", tool: "audio", reason: "The request asks for audio generation.", status: "planned" });
      }
    }

    plan.push({
      id: "answer",
      tool: "chat",
      reason: plan.length ? "Synthesize tool outputs into the final answer." : "No external tool is required.",
      status: "planned"
    });

    return plan.slice(0, Math.min(8, Math.max(1, request.maxSteps ?? 6)));
  }

  async run(request: AgenticRunRequest) {
    const objective = (request.objective ?? lastUserText(request)).trim();
    if (!objective) throw new Error("AGENT_OBJECTIVE_REQUIRED");

    const plan = this.plan(request);
    const evidence: string[] = [];

    for (const step of plan) {
      try {
        if (step.tool === "web_search" || step.tool === "web_scrape" || step.tool === "x_search") {
          const result = await this.research.research({
            ...request,
            query: objective,
            urls: step.tool === "web_scrape" ? urls(objective) : undefined,
            includeX: step.tool === "x_search",
            maxResults: 8
          });
          step.output = result;
          step.status = "completed";
          evidence.push(JSON.stringify(result.sources));
          continue;
        }

        if (["image", "video", "audio"].includes(step.tool)) {
          const mediaRequest: MediaRequest = {
            modality: step.tool as MediaRequest["modality"],
            operation: step.tool === "image" ? "text-to-image" : step.tool === "video" ? "text-to-video" : "music",
            prompt: objective,
            privacy: request.mode === "confidential" ? "confidential" : request.mode === "private" ? "private" : "standard",
            maxCostUsd: request.maxCostUsd
          };
          const result = await this.media.generate(mediaRequest);
          step.output = result;
          step.status = "completed";
          evidence.push(JSON.stringify(result));
          continue;
        }

        if (step.tool === "chat") {
          const messages = evidence.length
            ? [
                {
                  role: "system" as const,
                  content: "You are 33jane Agentic. Complete the user's objective using only the tool evidence provided where factual claims depend on external data. Be concise and identify uncertainty."
                },
                {
                  role: "user" as const,
                  content: `Objective:\n${objective}\n\nTool evidence:\n${evidence.join("\n\n")}`
                }
              ]
            : request.messages;

          const answer = await this.jane.chat({ ...request, messages });
          step.output = {
            answer: answer.answer,
            model: answer.model,
            route: answer.route,
            privacyReceipt: answer.privacyReceipt
          };
          step.status = "completed";
        }
      } catch (error) {
        step.status = "failed";
        step.error = error instanceof Error ? error.message : "AGENT_STEP_FAILED";
        if (step.tool === "chat") throw error;
      }
    }

    const final = [...plan].reverse().find((step) => step.tool === "chat" && step.status === "completed");
    return {
      id: `agent_${randomUUID().replace(/-/g, "")}`,
      objective,
      steps: plan,
      answer: (final?.output as { answer?: string } | undefined)?.answer ?? null
    };
  }
}
