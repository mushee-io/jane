import { randomUUID } from "node:crypto";
import { classifyTask, estimateInputTokens, estimateOutputTokens } from "./classifier.js";
import type { JaneRequest, ModelProfile, RouteCandidate, RouteDecision, TaskKind } from "./types.js";
import { JaneTelemetry } from "./telemetry.js";

function requiredQuality(task: TaskKind, mode: JaneRequest["mode"]): number {
  if (mode === "reason") return 0.88;
  if (mode === "code") return 0.82;
  if (mode === "private") return 0.76;
  if (mode === "fast") return 0.68;
  if (task === "reasoning") return 0.83;
  if (task === "code") return 0.78;
  if (task === "vision") return 0.80;
  return 0.72;
}

function supports(model: ModelProfile, task: TaskKind, mode: JaneRequest["mode"]): boolean {
  if (!model.capabilities.includes(task) && !(task === "fast" && model.capabilities.includes("general"))) return false;
  if (mode === "private" && (!model.zeroRetention || model.privacyScore < 0.90)) return false;
  return true;
}

function estimateCost(model: ModelProfile, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * model.inputCostPerMillion
    + (outputTokens / 1_000_000) * model.outputCostPerMillion;
}

export function decideRoute(
  request: JaneRequest,
  models: ModelProfile[],
  telemetry: JaneTelemetry,
  configuredOnly = false
): RouteDecision {
  const task = classifyTask(request);
  const estimatedInputTokens = estimateInputTokens(request);
  const estimatedOutputTokens = estimateOutputTokens(task, request.mode);
  const threshold = requiredQuality(task, request.mode);

  const supported = models.filter((model) =>
    (!configuredOnly || model.configured)
    && supports(model, task, request.mode)
    && estimatedInputTokens <= model.contextWindow
  );

  const raw = supported.map((model) => {
    const estimatedCostUsd = estimateCost(model, estimatedInputTokens, estimatedOutputTokens);
    const reliability = telemetry.reliability(model.id);
    const effectiveQuality = telemetry.effectiveQuality(model);
    const effectiveCostUsd = estimatedCostUsd / Math.max(0.35, reliability);
    return { model, estimatedCostUsd, reliability, effectiveQuality, effectiveCostUsd };
  });

  const qualityEligible = raw.filter((item) => item.effectiveQuality >= threshold);
  const pool = qualityEligible.length > 0
    ? qualityEligible
    : raw.sort((a, b) => b.effectiveQuality - a.effectiveQuality).slice(0, Math.min(2, raw.length));

  const maxCost = Math.max(...pool.map((item) => item.effectiveCostUsd), 0.000001);
  const minCost = Math.min(...pool.map((item) => item.effectiveCostUsd), maxCost);
  const range = Math.max(maxCost - minCost, 0.000001);

  const candidates: RouteCandidate[] = pool.map((item) => {
    const costScore = 1 - ((item.effectiveCostUsd - minCost) / range);
    const privacyWeight = request.mode === "private" ? 0.34 : 0.07;
    const speedWeight = request.mode === "fast" ? 0.30 : 0.12;
    const qualityWeight = request.mode === "reason" ? 0.42 : 0.31;
    const reliabilityWeight = 0.20;
    const costWeight = Math.max(0.08, 1 - privacyWeight - speedWeight - qualityWeight - reliabilityWeight);
    const score =
      item.effectiveQuality * qualityWeight
      + item.model.latencyScore * speedWeight
      + item.model.privacyScore * privacyWeight
      + item.reliability * reliabilityWeight
      + costScore * costWeight;

    const reasons = [
      item.effectiveQuality >= threshold ? "quality threshold met" : "best available quality",
      costScore > 0.72 ? "low expected cost" : "cost within policy",
      item.reliability > 0.90 ? "high observed reliability" : "learning from outcomes"
    ];
    if (request.mode === "private" && item.model.zeroRetention) reasons.push("zero-retention route");
    if (request.mode === "fast" && item.model.latencyScore > 0.85) reasons.push("low-latency route");

    return {
      model: item.model,
      estimatedCostUsd: Number(item.estimatedCostUsd.toFixed(8)),
      effectiveCostUsd: Number(item.effectiveCostUsd.toFixed(8)),
      effectiveQuality: Number(item.effectiveQuality.toFixed(4)),
      reliability: Number(item.reliability.toFixed(4)),
      score: Number(score.toFixed(6)),
      reasons
    };
  }).sort((a, b) => b.score - a.score);

  const withinBudget = request.maxCostUsd === undefined
    ? candidates
    : candidates.filter((candidate) => candidate.estimatedCostUsd <= request.maxCostUsd!);
  const selected = withinBudget[0] ?? null;
  const alternatives = (withinBudget.length ? withinBudget : candidates).slice(1, 4);

  let estimatedSavingsPercent: number | null = null;
  if (selected && candidates.length > 1) {
    const expensive = Math.max(...candidates.map((candidate) => candidate.estimatedCostUsd));
    if (expensive > 0) estimatedSavingsPercent = Math.max(0, Math.round((1 - selected.estimatedCostUsd / expensive) * 100));
  }

  return {
    requestId: randomUUID(),
    mode: request.mode,
    task,
    estimatedInputTokens,
    estimatedOutputTokens,
    requiredQuality: threshold,
    selected,
    alternatives,
    estimatedSavingsPercent
  };
}
