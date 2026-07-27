import {canonicalizeReviewJson, computeUniversalFingerprint, type UniversalFingerprint} from "../universal/fingerprints";
import type {ReviewJsonValue} from "../types";
import type {EntityOperation, OperationCondition, OperationEvidence} from "./types";

function canonical(value: ReviewJsonValue): string {
  return JSON.stringify(canonicalizeReviewJson(value));
}

function sortConditions(conditions: readonly OperationCondition[]): OperationCondition[] {
  return [...conditions].sort((left, right) => left.id.localeCompare(right.id) || canonical(left as unknown as ReviewJsonValue).localeCompare(canonical(right as unknown as ReviewJsonValue)));
}

function sortEvidence(evidence: readonly OperationEvidence[]): OperationEvidence[] {
  return [...evidence].map((item) => ({...item, limitations: [...new Set(item.limitations)].sort()})).sort((left, right) => left.id.localeCompare(right.id) || canonical(left as unknown as ReviewJsonValue).localeCompare(canonical(right as unknown as ReviewJsonValue)));
}

export function entityOperationFingerprintInput(operation: Omit<EntityOperation, "id" | "idempotencyKey" | "explanation">): ReviewJsonValue {
  return {
    kind: operation.kind,
    entityType: operation.entityType,
    target: operation.target,
    payload: operation.payload,
    source: operation.source,
    evidence: sortEvidence(operation.evidence),
    confidence: operation.confidence,
    risk: operation.risk,
    preconditions: sortConditions(operation.preconditions),
    postconditions: sortConditions(operation.postconditions),
    dependencyIds: [...new Set(operation.dependencyIds)].sort(),
    requiredCapability: operation.requiredCapability,
    compensatable: operation.compensatable,
  } as unknown as ReviewJsonValue;
}

export function fingerprintEntityOperation(operation: Omit<EntityOperation, "id" | "idempotencyKey" | "explanation">): UniversalFingerprint {
  return computeUniversalFingerprint(entityOperationFingerprintInput(operation));
}

export function expectedEntityOperationIdempotencyKey(operation: Omit<EntityOperation, "id" | "idempotencyKey" | "explanation">): string {
  return `entity-operation:${operation.kind}:${operation.entityType}:${fingerprintEntityOperation(operation)}`;
}
