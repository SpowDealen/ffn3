import {sanitizeInspectionText} from "./errors";
import {fingerprintGlobalResolutionInspectionEvidence, observationSortKey} from "./fingerprint";
import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionInspectionEvidence,
  GlobalResolutionInspectionRequest,
  GlobalResolutionObservation,
} from "./types";

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => text(value) && /^sha256-v1:[a-z0-9]+$/i.test(value);
const clean = (value: string) => value.trim().slice(0, 180);
const inspectionStatuses = new Set<GlobalResolutionInspectionEvidence["status"]>([
  "observed",
  "not_observed",
  "ambiguous",
  "unavailable",
  "unsupported",
]);

function normalizeObservation(value: GlobalResolutionObservation): GlobalResolutionObservation | undefined {
  switch (value.kind) {
    case "entity_exists":
      return text(value.entityType) && text(value.entityId) ? {kind: value.kind, entityType: clean(value.entityType), entityId: clean(value.entityId), identityKey: text(value.identityKey) ? clean(value.identityKey) : undefined, payloadFingerprint: fingerprint(value.payloadFingerprint) ? value.payloadFingerprint : undefined} : undefined;
    case "entity_missing":
      return text(value.entityType) ? {kind: value.kind, entityType: clean(value.entityType), expectedId: text(value.expectedId) ? clean(value.expectedId) : undefined, identityKey: text(value.identityKey) ? clean(value.identityKey) : undefined} : undefined;
    case "reference_exists":
    case "reference_missing":
      return text(value.ownerId) && text(value.field) && text(value.targetId) ? {kind: value.kind, ownerId: clean(value.ownerId), field: clean(value.field), targetId: clean(value.targetId)} : undefined;
    case "payload_matches":
    case "payload_differs":
      return text(value.entityId) && fingerprint(value.expectedFingerprint) && fingerprint(value.actualFingerprint) ? {kind: value.kind, entityId: clean(value.entityId), expectedFingerprint: value.expectedFingerprint, actualFingerprint: value.actualFingerprint} : undefined;
    case "multiple_candidates": {
      const candidateIds = [...new Set(value.candidateIds.filter(text).map(clean))].sort();
      return text(value.entityType) && candidateIds.length > 1 ? {kind: value.kind, entityType: clean(value.entityType), candidateIds, identityKey: text(value.identityKey) ? clean(value.identityKey) : undefined} : undefined;
    }
    case "service_unavailable":
      return {kind: value.kind, reason: sanitizeInspectionText(value.reason)};
  }
}

export function normalizeGlobalResolutionInspectionEvidence(input: {
  request: GlobalResolutionInspectionRequest;
  inspector: Pick<GlobalResolutionEffectInspector, "id" | "version">;
  evidence: GlobalResolutionInspectionEvidence;
  inspectedAt: string;
}): GlobalResolutionInspectionEvidence {
  const observations = new Map<string, GlobalResolutionObservation>();
  for (const raw of Array.isArray(input.evidence.observations) ? input.evidence.observations : []) {
    const normalized = normalizeObservation(raw);
    if (normalized) observations.set(observationSortKey(normalized), normalized);
  }
  const normalizedObservations = [...observations.values()].sort((left, right) => observationSortKey(left).localeCompare(observationSortKey(right)));
  const warnings = [...new Set((Array.isArray(input.evidence.warnings) ? input.evidence.warnings : []).map(sanitizeInspectionText))].sort();
  const status = inspectionStatuses.has(input.evidence.status) ? input.evidence.status : "unavailable";
  const semantic = {
    inspectorId: input.inspector.id,
    inspectorVersion: input.inspector.version,
    producer: input.request.producer,
    producerVersion: input.request.producerVersion,
    manifestVersion: input.request.manifestVersion,
    manifestFingerprint: input.request.manifestFingerprint,
    capability: input.request.capability,
    capabilityVersion: input.request.capabilityVersion,
    operationId: input.request.operationId,
    operationFingerprint: input.request.operationFingerprint,
    checkpointFingerprint: input.request.checkpointFingerprint,
    checkpointVersion: input.request.checkpointVersion,
    inspectionGeneration: input.request.inspectionGeneration,
    status,
    observations: normalizedObservations,
    warnings,
  };
  const fingerprintValue = fingerprintGlobalResolutionInspectionEvidence(semantic);
  return {
    ...semantic,
    inspectionId: `global-resolution-inspection:${fingerprintValue.slice(-24)}`,
    inspectedAt: input.inspectedAt,
    fingerprint: fingerprintValue,
  };
}
