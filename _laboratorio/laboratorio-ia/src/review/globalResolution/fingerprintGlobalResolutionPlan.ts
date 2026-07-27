import {canonicalizeReviewJson, computeUniversalFingerprint} from "../universal/fingerprints";
import type {ReviewJsonValue} from "../types";
import type {GlobalResolutionPlan} from "./types";

export function globalResolutionPlanFingerprintInput(plan: Omit<GlobalResolutionPlan, "id" | "fingerprint" | "idempotencyKey" | "createdAt" | "status" | "executable" | "structurallyValid">): ReviewJsonValue {
  return {
    schemaVersion: plan.schemaVersion,
    caseId: plan.caseId,
    caseVersion: plan.caseVersion,
    producer: plan.producer,
    originalOperation: plan.originalOperation,
    operations: [...plan.operations].sort((left, right) => left.id.localeCompare(right.id)),
    graphFingerprint: plan.graph.fingerprint,
    blockers: [...plan.blockers].filter((blocker) => blocker.scope === "structure").sort((left, right) => `${left.code}:${left.issueId ?? ""}`.localeCompare(`${right.code}:${right.issueId ?? ""}`)),
    assumptions: [...plan.assumptions].sort((left, right) => left.code.localeCompare(right.code)),
    policy: plan.policy,
    requiredCapabilities: [...new Set(plan.requiredCapabilities)].sort(),
  } as unknown as ReviewJsonValue;
}

export function fingerprintGlobalResolutionPlan(plan: Omit<GlobalResolutionPlan, "id" | "fingerprint" | "idempotencyKey" | "createdAt" | "status" | "executable" | "structurallyValid">): string {
  return computeUniversalFingerprint(canonicalizeReviewJson(globalResolutionPlanFingerprintInput(plan)));
}

export function expectedGlobalResolutionPlanIdempotencyKey(plan: Omit<GlobalResolutionPlan, "id" | "fingerprint" | "idempotencyKey" | "createdAt" | "status" | "executable" | "structurallyValid">): string {
  return `global-resolution-plan:${plan.caseId}:${plan.caseVersion}:${fingerprintGlobalResolutionPlan(plan)}`;
}
