import { modelCatalog } from "./catalog.js";
import { decideRoute } from "./price-optimizer.js";
import { completeChat } from "./providers.js";
import { JaneTelemetry } from "./telemetry.js";
import { FailoverController, classifyProviderFailure, isRetryableFailure, type FailureRecord } from "./failover.js";
import { SpendingPolicyEngine } from "../economics/spending-policy.js";
import { checkPrivacyPolicy } from "../privacy/policy.js";
import { createPrivacyReceipt } from "../privacy/receipt.js";
import { planSplitInference } from "../privacy/split-planner.js";
import { prepareSettlement, settlementStatus } from "../monad/settlement.js";
import type { FeedbackSignal, JaneMode, JaneRequest, ModelProfile, RouteDecision, SpendingPolicy } from "./types.js";

function publicModel(model: ModelProfile) {
  return {
    id: model.id,
    label: model.label,
    provider: model.provider,
    model: model.model,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
    inputCostPerMillion: model.inputCostPerMillion,
    outputCostPerMillion: model.outputCostPerMillion,
    qualityScore: model.qualityScore,
    latencyScore: model.latencyScore,
    privacyScore: model.privacyScore,
    zeroRetention: model.zeroRetention,
    configured: model.configured
  };
}

export class JaneAIService {
  readonly telemetry = new JaneTelemetry();
  readonly failover = new FailoverController();
  readonly spending = new SpendingPolicyEngine();
  private readonly requestModels = new Map<string, string>();

  models() {
    return modelCatalog().map(publicModel);
  }

  health() {
    const models = modelCatalog();
    return {
      status: "ok",
      service: "33jane-ai",
      milestones: {
        chat: true,
        multiModelRouter: true,
        priceOptimizer: true,
        outcomeRouting: true,
        localPrivacyScanner: true,
        contextMinimization: true,
        encryptedVaultFoundation: true,
        confidentialRouter: true,
        splitInferencePlanner: true,
        privacyReceipts: true,
        openAICompatibleApi: true,
        advancedFailover: true,
        programmableSpendingPolicies: true,
        monadSettlement: true,
        onchainExecutionReceipts: true
      },
      configuredProviders: models.filter((model) => model.configured).map((model) => model.provider),
      availableRoutes: models.map((model) => ({ id: model.id, configured: model.configured })),
      circuits: this.failover.snapshot(models),
      monad: settlementStatus()
    };
  }

  preview(request: JaneRequest): RouteDecision {
    return decideRoute(request, modelCatalog(), this.telemetry, false);
  }

  plan(request: JaneRequest) {
    return planSplitInference(request);
  }

  evaluatePolicy(policy: SpendingPolicy, mode: JaneMode = "auto") {
    return this.spending.evaluate(policy, mode);
  }

  policyUsage(principal: string) {
    return this.spending.snapshot(principal);
  }

  async chat(request: JaneRequest) {
    const models = modelCatalog();
    const liveDecision = decideRoute(request, models, this.telemetry, true);
    const previewDecision = decideRoute(request, models, this.telemetry, false);
    const candidates = [
      ...(liveDecision.selected ? [liveDecision.selected] : []),
      ...liveDecision.alternatives
    ];

    if (candidates.length === 0) {
      const error = new Error("NO_LIVE_AI_PROVIDER_CONFIGURED");
      (error as Error & { route?: RouteDecision }).route = previewDecision;
      throw error;
    }

    const failures: FailureRecord[] = [];
    for (const candidate of candidates) {
      const model = candidate.model;

      if (!this.failover.isAvailable(model.id)) {
        failures.push({
          modelId: model.id,
          provider: model.provider,
          classification: "provider_unavailable",
          message: "CIRCUIT_OPEN",
          retryable: true,
          latencyMs: 0
        });
        continue;
      }

      const privacyPolicy = checkPrivacyPolicy(request, model);
      if (!privacyPolicy.allowed) {
        failures.push({
          modelId: model.id,
          provider: model.provider,
          classification: "privacy",
          message: `PRIVACY_POLICY_BLOCKED:${privacyPolicy.reasons.join("|")}`,
          retryable: false,
          latencyMs: 0
        });
        continue;
      }

      const spendDecision = request.spendingPolicy
        ? this.spending.evaluate(request.spendingPolicy, request.mode, candidate)
        : null;
      if (spendDecision && !spendDecision.allowed) {
        failures.push({
          modelId: model.id,
          provider: model.provider,
          classification: "bad_request",
          message: `SPENDING_POLICY_BLOCKED:${spendDecision.reasons.join("|")}`,
          retryable: false,
          latencyMs: 0
        });
        continue;
      }

      const started = Date.now();
      try {
        const completion = await completeChat(model, request.messages);
        const actualInput = completion.inputTokens ?? liveDecision.estimatedInputTokens;
        const actualOutput = completion.outputTokens ?? liveDecision.estimatedOutputTokens;
        const cost =
          (actualInput / 1_000_000) * model.inputCostPerMillion
          + (actualOutput / 1_000_000) * model.outputCostPerMillion;

        this.telemetry.recordExecution(model.id, true, completion.latencyMs, cost);
        this.failover.recordSuccess(model.id);
        this.remember(liveDecision.requestId, model.id);

        const committedPolicy = request.spendingPolicy
          ? this.spending.commit(request.spendingPolicy, cost)
          : null;

        const receipt = createPrivacyReceipt({
          request,
          candidate,
          model,
          upstreamModel: completion.rawModel ?? model.model,
          actualCostUsd: Number(cost.toFixed(8)),
          estimatedSavingsPercent: previewDecision.estimatedSavingsPercent,
          failoverAttempts: failures.length
        });

        let settlement = null;
        if (settlementStatus().configured) {
          try {
            settlement = prepareSettlement(receipt);
          } catch {
            settlement = null;
          }
        }

        return {
          id: liveDecision.requestId,
          object: "33jane.response",
          created: new Date().toISOString(),
          mode: request.mode,
          answer: completion.content,
          model: {
            id: model.id,
            provider: model.provider,
            upstreamModel: completion.rawModel ?? model.model
          },
          route: {
            task: liveDecision.task,
            score: candidate.score,
            reasons: candidate.reasons,
            estimatedCostUsd: candidate.estimatedCostUsd,
            actualCostUsd: Number(cost.toFixed(8)),
            estimatedSavingsPercent: previewDecision.estimatedSavingsPercent,
            alternatives: previewDecision.alternatives.map((alternative) => ({
              id: alternative.model.id,
              estimatedCostUsd: alternative.estimatedCostUsd,
              score: alternative.score
            }))
          },
          privacy: request.clientPrivacy ?? {
            applied: false,
            redactedCount: 0,
            categories: []
          },
          usage: {
            inputTokens: actualInput,
            outputTokens: actualOutput
          },
          latencyMs: completion.latencyMs,
          failoverAttempts: failures,
          spendingPolicy: committedPolicy,
          privacyReceipt: receipt,
          splitPlan: planSplitInference(request),
          settlement
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "PROVIDER_FAILURE";
        const classification = classifyProviderFailure(error);
        const latencyMs = Date.now() - started;
        failures.push({
          modelId: model.id,
          provider: model.provider,
          classification,
          message,
          retryable: isRetryableFailure(classification),
          latencyMs
        });
        if (classification !== "privacy" && classification !== "bad_request") {
          this.failover.recordFailure(model.id, classification);
        }
        this.telemetry.recordExecution(model.id, false, latencyMs, candidate.estimatedCostUsd);
      }
    }

    const error = new Error("ALL_AI_ROUTES_FAILED");
    (error as Error & { failures?: unknown }).failures = failures;
    throw error;
  }

  feedback(requestId: string, signal: FeedbackSignal) {
    const modelId = this.requestModels.get(requestId);
    if (!modelId) throw new Error("REQUEST_NOT_FOUND_FOR_FEEDBACK");
    this.telemetry.recordFeedback(modelId, signal);
    return { ok: true, requestId, modelId, signal };
  }

  private remember(requestId: string, modelId: string): void {
    this.requestModels.set(requestId, modelId);
    if (this.requestModels.size > 5_000) {
      const first = this.requestModels.keys().next().value as string | undefined;
      if (first) this.requestModels.delete(first);
    }
  }
}
