import {canonicalizeReviewJson, computeUniversalFingerprint, type UniversalFingerprint} from "../universal/fingerprints";
import type {ReviewJsonValue} from "../types";
import type {ResolutionGraph, ResolutionNode} from "./types";

function canonical(value: ReviewJsonValue): string {
  return JSON.stringify(canonicalizeReviewJson(value));
}

function intentNode(node: ResolutionNode): ReviewJsonValue {
  return {
    id: node.id,
    operation: node.operation,
    dependencyIds: [...new Set(node.dependencyIds)].sort(),
    evidence: [...node.evidence].sort((left, right) => left.id.localeCompare(right.id) || canonical(left as unknown as ReviewJsonValue).localeCompare(canonical(right as unknown as ReviewJsonValue))),
    risk: node.risk,
    confidence: node.confidence,
    preconditions: [...node.preconditions].sort((left, right) => left.id.localeCompare(right.id)),
    postconditions: [...node.postconditions].sort((left, right) => left.id.localeCompare(right.id)),
    idempotencyKey: node.idempotencyKey,
    isResumeNode: node.isResumeNode,
    requiredForCompletion: node.requiredForCompletion,
    dependencyPolicy: node.dependencyPolicy ? {...node.dependencyPolicy, acceptedStates: [...new Set(node.dependencyPolicy.acceptedStates)].sort()} : undefined,
  } as unknown as ReviewJsonValue;
}

export function resolutionGraphFingerprintInput(graph: Omit<ResolutionGraph, "id" | "fingerprint" | "idempotencyKey" | "state" | "createdAt" | "updatedAt">): ReviewJsonValue {
  return {
    schemaVersion: graph.schemaVersion,
    caseId: graph.caseId,
    caseVersion: graph.caseVersion,
    producerId: graph.producerId,
    originalOperation: graph.originalOperation,
    nodes: [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id)).map(intentNode),
    metadata: graph.metadata,
  } as unknown as ReviewJsonValue;
}

export function fingerprintResolutionGraph(graph: Omit<ResolutionGraph, "id" | "fingerprint" | "idempotencyKey" | "state" | "createdAt" | "updatedAt">): UniversalFingerprint {
  return computeUniversalFingerprint(resolutionGraphFingerprintInput(graph));
}

export function expectedResolutionGraphIdempotencyKey(graph: Omit<ResolutionGraph, "id" | "fingerprint" | "idempotencyKey" | "state" | "createdAt" | "updatedAt">): string {
  return `resolution-graph:${graph.caseId}:${graph.caseVersion}:${fingerprintResolutionGraph(graph)}`;
}
