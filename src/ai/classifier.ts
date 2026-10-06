import type { JaneMode, JaneRequest, TaskKind } from "./types.js";

const codePattern = /\b(code|typescript|javascript|python|rust|solidity|react|bug|debug|function|class|api|sql|css|html|compile|repository|github)\b|\`\`\`/i;
const reasoningPattern = /\b(analy[sz]e|compare|evaluate|strategy|reason|prove|derive|research|architecture|trade-?off|plan|complex|step by step)\b/i;
const visionPattern = /\b(image|photo|screenshot|diagram|vision|picture|scan|ocr)\b/i;
const fastPattern = /\b(short|quick|brief|rewrite|translate|format|summari[sz]e|extract)\b/i;

export function classifyTask(request: JaneRequest): TaskKind {
  if (request.mode === "code") return "code";
  if (request.mode === "reason") return "reasoning";
  if (request.mode === "vision") return "vision";
  if (request.mode === "fast") return "fast";

  const text = request.messages.map((message) => message.content).join("\n");
  if (visionPattern.test(text)) return "vision";
  if (codePattern.test(text)) return "code";
  if (reasoningPattern.test(text)) return "reasoning";
  if (fastPattern.test(text)) return "fast";
  return "general";
}

export function estimateInputTokens(request: JaneRequest): number {
  const characters = request.messages.reduce((sum, message) => sum + message.content.length + 12, 0);
  return Math.max(1, Math.ceil(characters / 4));
}

export function estimateOutputTokens(task: TaskKind, mode: JaneMode): number {
  if (mode === "fast") return 320;
  if (task === "code") return 1100;
  if (task === "reasoning") return 1300;
  if (task === "vision") return 850;
  return 650;
}
