import { createHash } from "node:crypto";
import type { JaneMode, JaneRequest, ModelProfile, SpendingPolicy } from "../ai/types.js";

export interface EnterpriseContext {
  orgId: string;
  actorId?: string;
  department?: string;
}

export interface EnterpriseOrg {
  id: string;
  name: string;
  active: boolean;
  allowedModes?: JaneMode[];
  allowedProviders?: ModelProfile["provider"][];
  requireZeroRetention?: boolean;
  minPrivacyScore?: number;
  dailyBudgetUsd?: number;
  maxCostUsdPerRequest?: number;
  dataRegion?: string;
}

export interface EnterpriseAuditEvent {
  at: string;
  orgId: string;
  actorId?: string;
  department?: string;
  requestHash: string;
  receiptHash: string;
  provider: string;
  modelId: string;
  costUsd: number;
}

function bootstrap(): EnterpriseOrg[] {
  const raw = process.env.JANE_ENTERPRISE_ORGS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as EnterpriseOrg[];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.id && entry?.name) : [];
  } catch {
    return [];
  }
}

export class EnterpriseGateway {
  private readonly orgs = new Map<string, EnterpriseOrg>();
  private readonly audit: EnterpriseAuditEvent[] = [];

  constructor() {
    for (const org of bootstrap()) this.orgs.set(org.id, org);
  }

  listOrgs(): EnterpriseOrg[] {
    return [...this.orgs.values()].map((org) => ({ ...org }));
  }

  upsertOrg(org: EnterpriseOrg): EnterpriseOrg {
    const normalized = { ...org, id: org.id.trim(), name: org.name.trim() };
    this.orgs.set(normalized.id, normalized);
    return { ...normalized };
  }

  apply(request: JaneRequest): { request: JaneRequest; org: EnterpriseOrg | null } {
    if (!request.enterprise?.orgId) return { request, org: null };
    const org = this.orgs.get(request.enterprise.orgId);
    if (!org || !org.active) throw new Error("ENTERPRISE_ORG_NOT_ACTIVE");

    if (org.allowedModes?.length && !org.allowedModes.includes(request.mode)) {
      throw new Error("ENTERPRISE_MODE_BLOCKED");
    }

    const existing = request.spendingPolicy;
    const merged: SpendingPolicy = {
      principal: existing?.principal ?? `org:${org.id}:${request.enterprise.actorId ?? "anonymous"}`,
      maxCostUsdPerRequest: minDefined(existing?.maxCostUsdPerRequest, org.maxCostUsdPerRequest),
      dailyBudgetUsd: minDefined(existing?.dailyBudgetUsd, org.dailyBudgetUsd),
      allowedModes: intersect(existing?.allowedModes, org.allowedModes),
      allowedProviders: intersect(existing?.allowedProviders, org.allowedProviders),
      requireZeroRetention: Boolean(existing?.requireZeroRetention || org.requireZeroRetention),
      minPrivacyScore: maxDefined(existing?.minPrivacyScore, org.minPrivacyScore),
      maxLatencyScorePenalty: existing?.maxLatencyScorePenalty
    };

    return {
      request: { ...request, spendingPolicy: merged },
      org: { ...org }
    };
  }

  record(context: EnterpriseContext | undefined, input: {
    requestHash: string;
    receiptHash: string;
    provider: string;
    modelId: string;
    costUsd: number;
  }): void {
    if (!context?.orgId) return;
    this.audit.unshift({
      at: new Date().toISOString(),
      orgId: context.orgId,
      actorId: context.actorId,
      department: context.department,
      ...input
    });
    if (this.audit.length > 5_000) this.audit.length = 5_000;
  }

  auditLog(orgId?: string): EnterpriseAuditEvent[] {
    return this.audit.filter((event) => !orgId || event.orgId === orgId).slice(0, 500).map((event) => ({ ...event }));
  }

  policyDigest(orgId: string): string | null {
    const org = this.orgs.get(orgId);
    return org ? createHash("sha256").update(JSON.stringify(org)).digest("hex") : null;
  }
}

function minDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

function maxDefined(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function intersect<T>(a?: T[], b?: T[]): T[] | undefined {
  if (!a?.length) return b?.length ? [...b] : undefined;
  if (!b?.length) return [...a];
  return a.filter((value) => b.includes(value));
}
