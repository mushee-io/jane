import type { JaneRequest, ModelProfile } from "../ai/types.js";

export interface PrivacyPolicyCheck {
  allowed: boolean;
  reasons: string[];
}

export function checkPrivacyPolicy(request: JaneRequest, model: ModelProfile): PrivacyPolicyCheck {
  const reasons: string[] = [];

  if (request.mode === "private" || request.mode === "confidential") {
    if (!request.clientPrivacy?.applied) {
      reasons.push("local privacy firewall was not applied");
    }
    if (!model.zeroRetention) {
      reasons.push("selected provider is not marked zero-retention");
    }
  }

  if (request.mode === "confidential" && model.privacyScore < 0.95) {
    reasons.push("confidential mode requires privacy score >= 0.95");
  }

  return { allowed: reasons.length === 0, reasons };
}
