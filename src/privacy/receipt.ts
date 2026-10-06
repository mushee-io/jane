import { createHash, randomUUID } from "node:crypto";
import type { JaneRequest, ModelProfile, RouteCandidate } from "../ai/types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface PrivacyReceipt {
  version: "1";
  receiptId: string;
  createdAt: string;
  requestHash: string;
  policyHash: string;
  mode: JaneRequest["mode"];
  provider: string;
  modelId: string;
  upstreamModel: string;
  zeroRetention: boolean;
  privacyScore: number;
  redactedCount: number;
  categories: string[];
  context: {
    originalChars: number | null;
    sentChars: number | null;
    exposurePercent: number | null;
    selectedChunks: number | null;
    sources: string[];
  };
  route: {
    estimatedCostUsd: number;
    actualCostUsd: number;
    estimatedSavingsPercent: number | null;
  };
  failoverAttempts: number;
  receiptHash: string;
}

export function createPrivacyReceipt(input: {
  request: JaneRequest;
  candidate: RouteCandidate;
  model: ModelProfile;
  upstreamModel: string;
  actualCostUsd: number;
  estimatedSavingsPercent: number | null;
  failoverAttempts: number;
}): PrivacyReceipt {
  const requestHash = sha256(JSON.stringify({
    mode: input.request.mode,
    messages: input.request.messages,
    privacy: input.request.clientPrivacy,
    context: input.request.clientContext
  }));

  const policyHash = sha256(JSON.stringify({
    mode: input.request.mode,
    zeroRetentionRequired: input.request.mode === "private" || input.request.mode === "confidential",
    minimumPrivacyScore: input.request.mode === "confidential" ? 0.95 : input.request.mode === "private" ? 0.90 : null,
    localRedactionApplied: Boolean(input.request.clientPrivacy?.applied),
    spendingPolicy: input.request.spendingPolicy ?? null
  }));

  const context = input.request.clientContext;
  const exposurePercent = context && context.originalChars > 0
    ? Math.round((context.sentChars / context.originalChars) * 10_000) / 100
    : null;

  const receiptBase = {
    version: "1" as const,
    receiptId: randomUUID(),
    createdAt: new Date().toISOString(),
    requestHash,
    policyHash,
    mode: input.request.mode,
    provider: input.model.provider,
    modelId: input.model.id,
    upstreamModel: input.upstreamModel,
    zeroRetention: input.model.zeroRetention,
    privacyScore: input.model.privacyScore,
    redactedCount: input.request.clientPrivacy?.redactedCount ?? 0,
    categories: input.request.clientPrivacy?.categories ?? [],
    context: {
      originalChars: context?.originalChars ?? null,
      sentChars: context?.sentChars ?? null,
      exposurePercent,
      selectedChunks: context?.selectedChunks ?? null,
      sources: context?.sources ?? []
    },
    route: {
      estimatedCostUsd: input.candidate.estimatedCostUsd,
      actualCostUsd: input.actualCostUsd,
      estimatedSavingsPercent: input.estimatedSavingsPercent
    },
    failoverAttempts: input.failoverAttempts
  };

  return {
    ...receiptBase,
    receiptHash: sha256(JSON.stringify(receiptBase))
  };
}


export function verifyPrivacyReceipt(receipt: PrivacyReceipt): boolean {
  const { receiptHash, ...base } = receipt;
  if (!/^[a-f0-9]{64}$/.test(receiptHash)) return false;
  return sha256(JSON.stringify(base)) === receiptHash;
}
