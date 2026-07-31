import {fingerprintGlobalResolutionInspectionEvidence} from "./fingerprint";
import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionInspectionEvidence,
  GlobalResolutionInspectionRequest,
  GlobalResolutionInspectorCompatibility,
  GlobalResolutionObservation,
} from "./types";

type FixtureMode = "entity-observed" | "entity-missing" | "ambiguous" | "unavailable" | "throwing" | "slow";

export function createGlobalResolutionInspectionFixture(input: {
  mode: FixtureMode;
  id?: string;
  producer?: string;
  capability?: string;
  specificity?: number;
  delay?: () => Promise<void>;
  onInspect?: () => void;
}): GlobalResolutionEffectInspector {
  const id = input.id ?? `fixture:${input.mode}`;
  const version = "fixture-v1";
  const supports = (request: GlobalResolutionInspectionRequest): GlobalResolutionInspectorCompatibility => {
    if (input.producer && request.producer !== input.producer) return {supported: false, reason: "producer_unsupported"};
    if (input.capability && request.capability !== input.capability) return {supported: false, reason: "capability_unsupported"};
    if (["entity-observed", "entity-missing", "ambiguous"].includes(input.mode) && !request.subject.entityType) return {supported: false, reason: "subject_incomplete"};
    return {supported: true, specificity: input.specificity ?? 10};
  };
  return {
    id,
    version,
    supports,
    async inspect(request, context) {
      input.onInspect?.();
      if (input.mode === "throwing") throw new Error("fixture secret token=should-never-escape");
      if (input.mode === "slow") {
        await input.delay?.();
        if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      }
      const entityType = request.subject.entityType ?? "unknown";
      const entityId = request.subject.expectedId ?? "entity:fixture";
      let status: GlobalResolutionInspectionEvidence["status"] = "observed";
      let observations: GlobalResolutionObservation[] = [{kind: "entity_exists", entityType, entityId, identityKey: request.subject.identityKey, payloadFingerprint: request.subject.expectedPayloadFingerprint}];
      if (input.mode === "entity-missing") {
        status = "not_observed";
        observations = [{kind: "entity_missing", entityType, expectedId: request.subject.expectedId, identityKey: request.subject.identityKey}];
      } else if (input.mode === "ambiguous") {
        status = "ambiguous";
        observations = [{kind: "multiple_candidates", entityType, candidateIds: ["candidate:z", "candidate:a", "candidate:a"], identityKey: request.subject.identityKey}];
      } else if (input.mode === "unavailable" || input.mode === "slow") {
        status = "unavailable";
        observations = [{kind: "service_unavailable", reason: "fixture_unavailable"}];
      }
      const semantic = {inspectorId: id, inspectorVersion: version, producer: request.producer, capability: request.capability, operationId: request.operationId, operationFingerprint: request.operationFingerprint, checkpointFingerprint: request.checkpointFingerprint, status, observations, warnings: []};
      const fingerprint = fingerprintGlobalResolutionInspectionEvidence(semantic);
      return {...semantic, inspectionId: `fixture-inspection:${fingerprint.slice(-16)}`, inspectedAt: context.now(), fingerprint};
    },
  };
}
