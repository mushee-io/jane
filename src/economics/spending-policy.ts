import { createHash } from "node:crypto";
import type { JaneMode, RouteCandidate, SpendingPolicy } from "../ai/types.js";

export interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
  spentTodayUsd: number;
  remainingTodayUsd: number | null;
  policyHash: string;
}

function stablePolicy(policy: SpendingPolicy): string {
  return JSON.stringify({
    principal: policy.principal,
    maxCostUsdPerRequest: policy.maxCostUsdPerRequest ?? null,
    dailyBudgetUsd: policy.dailyBudgetUsd ?? null,
    allowedModes: policy.allowedModes ?? [],
    allowedProviders: policy.allowedProviders ?? [],
    requireZeroRetention: policy.requireZeroRetention ?? false,
    minPrivacyScore: policy.minPrivacyScore ?? null,
    maxLatencyScorePenalty: policy.maxLatencyScorePenalty ?? null
  });
}

export function spendingPolicyHash(policy: SpendingPolicy): string {
  return createHash("sha256").update(stablePolicy(policy)).digest("hex");
}

export class SpendingPolicyEngine {
  private readonly dailySpend = new Map<string, number>();

  private key(principal: string, at = new Date()): string {
    return `${at.toISOString().slice(0, 10)}:${principal}`;
  }

  spentToday(principal: string): number {
    return this.dailySpend.get(this.key(principal)) ?? 0;
  }

  evaluate(
    policy: SpendingPolicy,
    mode: JaneMode,
    candidate?: RouteCandidate
  ): PolicyDecision {
    const reasons: string[] = [];
    const spent = this.spentToday(policy.principal);

    if (policy.allowedModes?.length && !policy.allowedModes.includes(mode)) {
      reasons.push(`mode ${mode} is not allowed`);
    }

    if (candidate) {
      if (policy.maxCostUsdPerRequest !== undefined && candidate.estimatedCostUsd > policy.maxCostUsdPerRequest) {
        reasons.push("estimated request cost exceeds per-request budget");
      }
      if (policy.dailyBudgetUsd !== undefined && spent + candidate.estimatedCostUsd > policy.dailyBudgetUsd) {
        reasons.push("estimated request cost exceeds remaining daily budget");
      }
      if (policy.allowedProviders?.length && !policy.allowedProviders.includes(candidate.model.provider)) {
        reasons.push(`provider ${candidate.model.provider} is not allowed`);
      }
      if (policy.requireZeroRetention && !candidate.model.zeroRetention) {
        reasons.push("policy requires a zero-retention provider");
      }
      if (policy.minPrivacyScore !== undefined && candidate.model.privacyScore < policy.minPrivacyScore) {
        reasons.push("provider privacy score is below policy minimum");
      }
      if (policy.maxLatencyScorePenalty !== undefined && (1 - candidate.model.latencyScore) > policy.maxLatencyScorePenalty) {
        reasons.push("provider latency score violates policy");
      }
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      spentTodayUsd: Number(spent.toFixed(8)),
      remainingTodayUsd: policy.dailyBudgetUsd === undefined
        ? null
        : Number(Math.max(0, policy.dailyBudgetUsd - spent).toFixed(8)),
      policyHash: spendingPolicyHash(policy)
    };
  }

  commit(policy: SpendingPolicy, amountUsd: number): PolicyDecision {
    const key = this.key(policy.principal);
    this.dailySpend.set(key, (this.dailySpend.get(key) ?? 0) + Math.max(0, amountUsd));
    return this.evaluate(policy, "auto");
  }

  snapshot(principal: string) {
    return {
      principal,
      spentTodayUsd: Number(this.spentToday(principal).toFixed(8))
    };
  }
}
