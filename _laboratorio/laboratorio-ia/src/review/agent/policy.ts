import type {EditorialAgentPolicy, EditorialCapabilityEffect, EditorialCapabilityRisk} from "./types";

const RISK: Record<EditorialCapabilityRisk, number> = {none: 0, low: 1, medium: 2, high: 3, critical: 4};
export const DEFAULT_EDITORIAL_AGENT_POLICY: EditorialAgentPolicy = {allowedEffects: ["read_local", "read_external"], maximumRisk: "low", maximumSteps: 12, maximumDurationMs: 30_000};

export function buildEditorialAgentPolicy(input: Partial<EditorialAgentPolicy> = {}): EditorialAgentPolicy {
  return {
    allowedEffects: [...new Set(input.allowedEffects ?? DEFAULT_EDITORIAL_AGENT_POLICY.allowedEffects)],
    maximumRisk: input.maximumRisk ?? DEFAULT_EDITORIAL_AGENT_POLICY.maximumRisk,
    maximumSteps: Math.min(50, Math.max(1, input.maximumSteps ?? DEFAULT_EDITORIAL_AGENT_POLICY.maximumSteps)),
    maximumDurationMs: Math.min(300_000, Math.max(1_000, input.maximumDurationMs ?? DEFAULT_EDITORIAL_AGENT_POLICY.maximumDurationMs)),
  };
}

export function evaluateCapabilityPolicy(effects: EditorialCapabilityEffect[], risk: EditorialCapabilityRisk, policy: EditorialAgentPolicy): {allowed: boolean; reasons: string[]} {
  const reasons = effects.filter((effect) => !policy.allowedEffects.includes(effect)).map((effect) => `Efecto no autorizado: ${effect}.`);
  if (RISK[risk] > RISK[policy.maximumRisk]) reasons.push(`Riesgo ${risk} superior al máximo ${policy.maximumRisk}.`);
  return {allowed: reasons.length === 0, reasons};
}
