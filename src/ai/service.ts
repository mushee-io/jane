import { modelCatalog } from "./catalog.js";
import { decideRoute } from "./price-optimizer.js";
import { completeChat } from "./providers.js";
import { JaneTelemetry } from "./telemetry.js";
import { FailoverController, classifyProviderFailure, isRetryableFailure, type FailureRecord } from "./failover.js";
import { SpendingPolicyEngine } from "../economics/spending-policy.js";
import { AgentAccountRegistry } from "../agents/accounts.js";
import { ProviderMarket } from "../network/provider-market.js";
import { edgePlan } from "../edge/intelligence.js";
import { EnterpriseGateway } from "../enterprise/gateway.js";
import { tokenUtilityStatus } from "../token/utility.js";
import { catalogSummary } from "../catalog/unified.js";
import { BenchmarkService } from "../benchmarks/service.js";
import { checkPrivacyPolicy } from "../privacy/policy.js";
import { createPrivacyReceipt } from "../privacy/receipt.js";
import { planSplitInference } from "../privacy/split-planner.js";
import { prepareSettlement, settlementStatus } from "../monad/settlement.js";
import type { FeedbackSignal, JaneMode, JaneRequest, ModelProfile, RouteDecision, SpendingPolicy } from "./types.js";

function mergePolicies(a: SpendingPolicy | undefined, b: SpendingPolicy | undefined): SpendingPolicy | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const min = (x?: number, y?: number) => x === undefined ? y : y === undefined ? x : Math.min(x, y);
  const max = (x?: number, y?: number) => x === undefined ? y : y === undefined ? x : Math.max(x, y);
  const intersect = <T,>(x?: T[], y?: T[]) => {
    if (!x?.length) return y?.length ? [...y] : undefined;
    if (!y?.length) return [...x];
    return x.filter((item) => y.includes(item));
  };

  return {
    principal: a.principal || b.principal,
    maxCostUsdPerRequest: min(a.maxCostUsdPerRequest, b.maxCostUsdPerRequest),
    dailyBudgetUsd: min(a.dailyBudgetUsd, b.dailyBudgetUsd),
    allowedModes: intersect(a.allowedModes, b.allowedModes),
    allowedProviders: intersect(a.allowedProviders, b.allowedProviders),
    requireZeroRetention: Boolean(a.requireZeroRetention || b.requireZeroRetention),
    minPrivacyScore: max(a.minPrivacyScore, b.minPrivacyScore),
    maxLatencyScorePenalty: min(a.maxLatencyScorePenalty, b.maxLatencyScorePenalty),
    allowedRegions: intersect(a.allowedRegions, b.allowedRegions)
  };
}

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
    configured: model.configured,
    networkNodeId: model.networkNodeId,
    region: model.region
  };
}

export class JaneAIService {
  readonly telemetry = new JaneTelemetry();
  readonly failover = new FailoverController();
  readonly spending = new SpendingPolicyEngine();
  readonly agents = new AgentAccountRegistry();
  readonly market = new ProviderMarket();
  readonly enterprise = new EnterpriseGateway();
  readonly benchmarks = new BenchmarkService();
  private readonly requestModels = new Map<string, string>();

  private allModels(): ModelProfile[] {
    return [...modelCatalog(), ...this.market.modelProfiles()];
  }

  models() {
    return this.allModels().map(publicModel);
  }

  health() {
    const models = this.allModels();
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
        onchainExecutionReceipts: true,
        agentWallets: true,
        providerMarketplace: true,
        janeOwnedInference: true,
        edgeIntelligence: true,
        enterpriseGateway: true,
        tokenUtility: true,
        openComputeNetwork: true,
        massiveModelCatalog: true,
        imageStudio: true,
        videoStudio: true,
        audioStudio: true,
        realtimeVoiceFoundation: true,
        deepResearch: true,
        charactersAndAgents: true,
        modelArena: true,
        confidentialAttestation: true,
        developerPlatform: true,
        installableApp: true,
        teamsAdmin: true,
        publicBenchmarks: true
      },
      configuredProviders: models.filter((model) => model.configured).map((model) => model.provider),
      availableRoutes: models.map((model) => ({ id: model.id, configured: model.configured })),
      circuits: this.failover.snapshot(models),
      monad: settlementStatus(),
      agents: { count: this.agents.list().length },
      providerNetwork: this.market.summary(),
      enterprise: { organizations: this.enterprise.listOrgs().length },
      token: tokenUtilityStatus(),
      catalog: catalogSummary(),
      benchmarks: { runs: this.benchmarks.list(1000).length }
    };
  }

  preview(request: JaneRequest): RouteDecision {
    return decideRoute(request, this.allModels(), this.telemetry, false);
  }

  plan(request: JaneRequest) {
    return {
      splitInference: planSplitInference(request),
      edge: edgePlan(request)
    };
  }

  edge(request: JaneRequest) {
    return edgePlan(request);
  }

  evaluatePolicy(policy: SpendingPolicy, mode: JaneMode = "auto") {
    return this.spending.evaluate(policy, mode);
  }

  policyUsage(principal: string) {
    return this.spending.snapshot(principal);
  }

  async chat(request: JaneRequest) {
    let effectiveRequest: JaneRequest = { ...request };

    if (request.agentAccountId) {
      const agentPolicy = this.agents.spendingPolicy(request.agentAccountId);
      effectiveRequest = {
        ...effectiveRequest,
        spendingPolicy: mergePolicies(effectiveRequest.spendingPolicy, agentPolicy)
      };
    }

    const enterpriseDecision = this.enterprise.apply(effectiveRequest);
    effectiveRequest = enterpriseDecision.request;

    const models = this.allModels();
    const liveDecision = decideRoute(effectiveRequest, models, this.telemetry, true);
    const previewDecision = decideRoute(effectiveRequest, models, this.telemetry, false);
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

      const privacyPolicy = checkPrivacyPolicy(effectiveRequest, model);
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

      const spendDecision = effectiveRequest.spendingPolicy
        ? this.spending.evaluate(effectiveRequest.spendingPolicy, effectiveRequest.mode, candidate)
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
        const completion = await completeChat(model, effectiveRequest.messages, {
          generation: effectiveRequest.generation,
          attachments: effectiveRequest.attachments
        });
        const actualInput = completion.inputTokens ?? liveDecision.estimatedInputTokens;
        const actualOutput = completion.outputTokens ?? liveDecision.estimatedOutputTokens;
        const cost =
          (actualInput / 1_000_000) * model.inputCostPerMillion
          + (actualOutput / 1_000_000) * model.outputCostPerMillion;

        this.telemetry.recordExecution(model.id, true, completion.latencyMs, cost);
        this.benchmarks.record({
          task: liveDecision.task,
          modelId: model.id,
          provider: model.provider,
          latencyMs: completion.latencyMs,
          costUsd: Number(cost.toFixed(8)),
          qualityScore: candidate.effectiveQuality,
          success: true,
          privacyScore: model.privacyScore
        });
        this.failover.recordSuccess(model.id);
        if (model.networkNodeId) this.market.record(model.networkNodeId, true);
        this.remember(liveDecision.requestId, model.id);

        const committedPolicy = effectiveRequest.spendingPolicy
          ? this.spending.commit(effectiveRequest.spendingPolicy, cost, effectiveRequest.mode)
          : null;

        const receipt = createPrivacyReceipt({
          request: effectiveRequest,
          candidate,
          model,
          upstreamModel: completion.rawModel ?? model.model,
          actualCostUsd: Number(cost.toFixed(8)),
          estimatedSavingsPercent: previewDecision.estimatedSavingsPercent,
          failoverAttempts: failures.length
        });

        this.enterprise.record(effectiveRequest.enterprise, {
          requestHash: receipt.requestHash,
          receiptHash: receipt.receiptHash,
          provider: model.provider,
          modelId: model.id,
          costUsd: Number(cost.toFixed(8))
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
          mode: effectiveRequest.mode,
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
          privacy: effectiveRequest.clientPrivacy ?? {
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
          splitPlan: planSplitInference(effectiveRequest),
          edgePlan: edgePlan(effectiveRequest),
          settlement,
          agentAccount: effectiveRequest.agentAccountId
            ? { id: effectiveRequest.agentAccountId }
            : null,
          enterprise: effectiveRequest.enterprise
            ? {
                orgId: effectiveRequest.enterprise.orgId,
                actorId: effectiveRequest.enterprise.actorId ?? null,
                department: effectiveRequest.enterprise.department ?? null,
                policyDigest: this.enterprise.policyDigest(effectiveRequest.enterprise.orgId)
              }
            : null,
          providerNetwork: this.market.summary()
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
        this.benchmarks.record({
          task: liveDecision.task,
          modelId: model.id,
          provider: model.provider,
          latencyMs,
          costUsd: candidate.estimatedCostUsd,
          qualityScore: candidate.effectiveQuality,
          success: false,
          privacyScore: model.privacyScore
        });
        if (model.networkNodeId) this.market.record(model.networkNodeId, false);
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
