import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import type {GlobalResolutionInspectionEvidence, GlobalResolutionObservation} from "./types";

export function observationSortKey(observation: GlobalResolutionObservation): string {
  switch (observation.kind) {
    case "entity_exists": return `${observation.kind}:${observation.entityType}:${observation.entityId}:${observation.identityKey ?? ""}:${observation.payloadFingerprint ?? ""}`;
    case "entity_missing": return `${observation.kind}:${observation.entityType}:${observation.expectedId ?? ""}:${observation.identityKey ?? ""}`;
    case "reference_exists":
    case "reference_missing": return `${observation.kind}:${observation.ownerId}:${observation.field}:${observation.targetId}`;
    case "payload_matches":
    case "payload_differs": return `${observation.kind}:${observation.entityId}:${observation.expectedFingerprint}:${observation.actualFingerprint}`;
    case "multiple_candidates": return `${observation.kind}:${observation.entityType}:${[...observation.candidateIds].sort().join(",")}:${observation.identityKey ?? ""}`;
    case "service_unavailable": return `${observation.kind}:${observation.reason}`;
  }
}

export function fingerprintGlobalResolutionInspectionEvidence(
  evidence: Omit<GlobalResolutionInspectionEvidence, "fingerprint" | "inspectionId" | "inspectedAt">,
): string {
  return computeUniversalFingerprint({
    inspectorId: evidence.inspectorId,
    inspectorVersion: evidence.inspectorVersion,
    producer: evidence.producer,
    producerVersion: evidence.producerVersion,
    manifestVersion: evidence.manifestVersion,
    manifestFingerprint: evidence.manifestFingerprint,
    capability: evidence.capability,
    capabilityVersion: evidence.capabilityVersion,
    operationId: evidence.operationId,
    operationFingerprint: evidence.operationFingerprint,
    checkpointFingerprint: evidence.checkpointFingerprint,
    checkpointVersion: evidence.checkpointVersion,
    inspectionGeneration: evidence.inspectionGeneration,
    status: evidence.status,
    observations: [...evidence.observations].sort((left, right) => observationSortKey(left).localeCompare(observationSortKey(right))),
    warnings: [...evidence.warnings].sort(),
  } as unknown as ReviewJsonValue);
}
