import type {GlobalResolutionReconciliationEvidence} from "../reconciliation/types";
import type {GlobalResolutionInspectionEvidence, GlobalResolutionObservation} from "./types";

function documentObservation(observations: readonly GlobalResolutionObservation[]) {
  return observations.find((item): item is Extract<GlobalResolutionObservation, {kind: "entity_exists"}> => item.kind === "entity_exists");
}

export function inspectionEvidenceToReconciliationEvidence(evidence: GlobalResolutionInspectionEvidence): GlobalResolutionReconciliationEvidence[] {
  const document = documentObservation(evidence.observations);
  const payload = evidence.observations.find((item): item is Extract<GlobalResolutionObservation, {kind: "payload_matches"}> => item.kind === "payload_matches");
  const reference = evidence.observations.find((item): item is Extract<GlobalResolutionObservation, {kind: "reference_exists"}> => item.kind === "reference_exists");
  const explicitMissing = evidence.observations.some((item) => ["entity_missing", "reference_missing"].includes(item.kind));
  const explicitObserved = evidence.observations.some((item) => ["entity_exists", "reference_exists", "payload_matches"].includes(item.kind));
  const finding = evidence.status === "observed" && explicitObserved
    ? "effect_confirmed" as const
    : evidence.status === "not_observed" && explicitMissing
      ? "effect_not_found" as const
      : "unknown" as const;
  const summary = evidence.status === "observed"
    ? "La inspección externa observó el efecto esperado."
    : evidence.status === "not_observed"
      ? "La inspección externa no observó el efecto esperado."
      : evidence.status === "ambiguous"
        ? "La inspección externa encontró resultados ambiguos."
        : "La inspección externa no pudo aportar una conclusión.";
  return [{
    id: `reconciliation-evidence:${evidence.fingerprint.slice(-24)}`,
    type: "external_inspection",
    source: "external_inspector",
    operationId: evidence.operationId,
    observedAt: evidence.inspectedAt,
    summary,
    confidence: finding === "unknown" ? "insufficient" : "confirmed",
    fingerprint: document?.payloadFingerprint ?? payload?.actualFingerprint ?? (reference ? evidence.fingerprint : undefined),
    documentId: document?.entityId ?? reference?.ownerId,
    identityKey: document?.identityKey ?? reference?.targetId,
    finding,
  }];
}
