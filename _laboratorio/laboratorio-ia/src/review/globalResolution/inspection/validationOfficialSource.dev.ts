import type {EntityOperation} from "../../entityOperations";
import type {ReviewCase, ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {
  GlobalResolutionCapabilityCatalog,
  GlobalResolutionProducerAdapterRegistry,
  GlobalResolutionProducerRegistry,
  createLuchadorCapabilityManifest,
  type GlobalResolutionProducerManifest,
  type ProducerAdapterImplementation,
} from "../producers";
import {UniversalReconciliationContractRegistry} from "../reconciliation/engine";
import type {GlobalResolutionReconciliationEvidence} from "../reconciliation/types";
import {fingerprintGlobalResolutionInspectionEvidence} from "./fingerprint";
import {fingerprintGlobalResolutionInspectionOperation} from "./service";
import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionInspectionEvidence,
  GlobalResolutionInspectionRequest,
  GlobalResolutionObservation,
} from "./types";

export const VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID = "validation_official_source";
export const VALIDATION_OFFICIAL_SOURCE_VERSION = "1.0.0";
export const VALIDATION_OFFICIAL_SOURCE_MANIFEST_VERSION = "1.0.0";
export const VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID = "validation:official-source-effects";
export const VALIDATION_OFFICIAL_SOURCE_CAPABILITY = "create:luchador";
export const VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY = "resume:validation_official_source";

export const validationOfficialSourceCompletionCapabilityManifest = Object.freeze({
  capabilityId: VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY,
  capabilityVersion: "1.0.0",
  description: "Cerrar conceptualmente un recorrido validation-only sin persistencia.",
  operationKinds: ["validate_entity"] as EntityOperation["kind"][],
  requirements: ["validation_fixture"],
  expectedEvidenceKinds: ["validation_result"],
  supportsInspection: false,
  supportsReconciliation: false,
  requiresExplicitAuthorization: false,
  idempotencyPolicy: "not_applicable" as const,
});

export type ValidationOfficialSourceScenario =
  | "confirmed_succeeded"
  | "confirmed_not_applied"
  | "conflicting_evidence"
  | "insufficient_evidence"
  | "technical_failure";

export const validationOfficialSourceAdapterIds = Object.freeze({
  planner: "validation-official-source.planner.v1",
  requestBuilder: "validation-official-source.inspection-request-builder.v1",
  reconciliationContract: "validation-official-source.reconciliation-contract.v1",
  lifecycleProjection: "validation-official-source.lifecycle-projection.v1",
  uiController: "validation-official-source.ui-controller.v1",
});

export const validationOfficialSourceManifest: GlobalResolutionProducerManifest = {
  manifestVersion: VALIDATION_OFFICIAL_SOURCE_MANIFEST_VERSION,
  producerId: VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID,
  producerVersion: VALIDATION_OFFICIAL_SOURCE_VERSION,
  displayName: "Fuente oficial de validación",
  family: "official_sources",
  caseTypes: ["validation_official_source"],
  capabilities: [{
    capabilityId: VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
    capabilityVersion: createLuchadorCapabilityManifest.capabilityVersion,
    operationKinds: ["create_entity"],
    modes: ["plan", "simulate", "inspect", "reconcile", "retry"],
    requiresExplicitAuthorization: false,
    supportsIdempotency: true,
    supportsInspection: true,
    supportsReconciliation: true,
    requiredContext: ["caseId", "caseVersion", "checkpointFingerprint", "operationFingerprint", "payloadFingerprint"],
    optionalContext: ["validationScenario"],
    dependencies: [],
  }, {
    capabilityId: VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY,
    capabilityVersion: "1.0.0",
    operationKinds: ["validate_entity"],
    modes: ["plan", "simulate"],
    requiresExplicitAuthorization: false,
    supportsIdempotency: false,
    supportsInspection: false,
    supportsReconciliation: false,
    requiredContext: ["caseId", "caseVersion"],
    dependencies: [],
  }],
  adapters: [
    {adapterKind: "planner", adapterId: validationOfficialSourceAdapterIds.planner, adapterVersionRange: "^1.0.0", priority: 100},
    {adapterKind: "inspection_request_builder", adapterId: validationOfficialSourceAdapterIds.requestBuilder, adapterVersionRange: "^1.0.0", capabilityIds: [VALIDATION_OFFICIAL_SOURCE_CAPABILITY], priority: 100},
    {adapterKind: "reconciliation_contract", adapterId: validationOfficialSourceAdapterIds.reconciliationContract, adapterVersionRange: "^1.0.0", capabilityIds: [VALIDATION_OFFICIAL_SOURCE_CAPABILITY], priority: 100},
    {adapterKind: "lifecycle_projection", adapterId: validationOfficialSourceAdapterIds.lifecycleProjection, adapterVersionRange: "^1.0.0", capabilityIds: [VALIDATION_OFFICIAL_SOURCE_CAPABILITY], priority: 100},
    {adapterKind: "ui_controller", adapterId: validationOfficialSourceAdapterIds.uiController, adapterVersionRange: "^1.0.0", priority: 100},
  ],
  inspectors: [{
    capabilityId: VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
    inspectorId: VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
    inspectorVersionRange: "^1.0.0",
    priority: 100,
    requiredEvidenceKinds: ["validation_entity", "identity_key", "payload_fingerprint"],
  }],
  executionPolicy: {
    maximumRisk: "none",
    defaultAuthorization: "not_required",
    retryPolicy: "manual_after_confirmed_absence",
    allowAutomaticExecution: false,
  },
  compatibility: {
    caseTypes: ["validation_official_source"],
    contracts: ["review-case:validation-only:v1"],
    sources: ["validation_fixture"],
    legacyProducerIds: [],
    minimumCheckpointManifestVersion: "1.0.0",
  },
  metadata: {
    validationOnly: true,
    persistence: "memory_only",
    network: "disabled",
  },
};

export function validationOfficialSourceAdapterDescriptors(): ProducerAdapterImplementation[] {
  return validationOfficialSourceManifest.adapters.map((binding) => ({
    adapterId: binding.adapterId,
    version: "1.0.0",
    adapterKind: binding.adapterKind,
    implementation: Object.freeze({validationOnly: true, adapterId: binding.adapterId}),
  }));
}

export function createValidationOfficialSourceProducerRuntime() {
  const capabilities = new GlobalResolutionCapabilityCatalog();
  capabilities.register(createLuchadorCapabilityManifest);
  capabilities.register(validationOfficialSourceCompletionCapabilityManifest);
  const adapters = new GlobalResolutionProducerAdapterRegistry();
  validationOfficialSourceAdapterDescriptors().forEach((adapter) => adapters.register(adapter));
  const producers = new GlobalResolutionProducerRegistry(capabilities, adapters, new Set([VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID]));
  producers.registerProducer(validationOfficialSourceManifest);
  return Object.freeze({capabilities, adapters, producers});
}

export function createValidationOfficialSourceReconciliationContracts(): UniversalReconciliationContractRegistry {
  const registry = new UniversalReconciliationContractRegistry();
  registry.register({
    version: "1.0.0",
    capability: VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
    requiredSuccessFields: ["documentId", "identityKey", "payloadFingerprint"],
    successOutcome: "validated_created",
  });
  return registry;
}

function scenarioObservations(
  scenario: ValidationOfficialSourceScenario,
  request: GlobalResolutionInspectionRequest,
): {status: GlobalResolutionInspectionEvidence["status"]; observations: GlobalResolutionObservation[]} {
  const identityKey = request.subject.identityKey ?? "validation:entity";
  const entityId = request.subject.expectedId ?? "validation-entity-memory-only";
  const payloadFingerprint = request.subject.expectedPayloadFingerprint;
  if (scenario === "confirmed_not_applied") return {
    status: "not_observed",
    observations: [{kind: "entity_missing", entityType: request.subject.entityType ?? "validation_entity", expectedId: entityId, identityKey}],
  };
  if (scenario === "conflicting_evidence") return {
    status: "ambiguous",
    observations: [
      {kind: "entity_exists", entityType: request.subject.entityType ?? "validation_entity", entityId, identityKey, payloadFingerprint},
      {kind: "entity_missing", entityType: request.subject.entityType ?? "validation_entity", expectedId: entityId, identityKey},
    ],
  };
  if (scenario === "insufficient_evidence") return {
    status: "observed",
    observations: [{kind: "entity_exists", entityType: request.subject.entityType ?? "validation_entity", entityId}],
  };
  if (scenario === "technical_failure") return {
    status: "unavailable",
    observations: [{kind: "service_unavailable", reason: "validation_inspector_unavailable"}],
  };
  return {
    status: "observed",
    observations: [{kind: "entity_exists", entityType: request.subject.entityType ?? "validation_entity", entityId, identityKey, payloadFingerprint}],
  };
}

export function createValidationOfficialSourceInspector(input: {
  scenario: ValidationOfficialSourceScenario;
  delay?: () => Promise<void>;
  overrideEvidence?: (evidence: GlobalResolutionInspectionEvidence) => GlobalResolutionInspectionEvidence;
}): GlobalResolutionEffectInspector {
  return Object.freeze({
    id: VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
    version: "1.0.0",
    supports(request: GlobalResolutionInspectionRequest) {
      if (request.producer !== VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID) return {supported: false as const, reason: "producer_unsupported" as const};
      if (request.capability !== VALIDATION_OFFICIAL_SOURCE_CAPABILITY) return {supported: false as const, reason: "capability_unsupported" as const};
      if (!request.subject.identityKey && !request.subject.expectedId) return {supported: false as const, reason: "subject_incomplete" as const};
      return {supported: true as const, specificity: 100};
    },
    async inspect(request: GlobalResolutionInspectionRequest, context: Parameters<GlobalResolutionEffectInspector["inspect"]>[1]) {
      if (input.delay) await input.delay();
      if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const evidence = buildValidationOfficialSourceEvidence(input.scenario, request, context.now());
      return input.overrideEvidence ? input.overrideEvidence(evidence) : evidence;
    },
  });
}

export function buildValidationOfficialSourceEvidence(
  scenario: ValidationOfficialSourceScenario,
  request: GlobalResolutionInspectionRequest,
  inspectedAt: string,
): GlobalResolutionInspectionEvidence {
  const projected = scenarioObservations(scenario, request);
  const semantic = {
    inspectorId: VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
    inspectorVersion: "1.0.0",
    producer: request.producer,
    producerVersion: request.producerVersion,
    manifestVersion: request.manifestVersion,
    manifestFingerprint: request.manifestFingerprint,
    capability: request.capability,
    capabilityVersion: request.capabilityVersion,
    operationId: request.operationId,
    operationFingerprint: request.operationFingerprint,
    checkpointFingerprint: request.checkpointFingerprint,
    checkpointVersion: request.checkpointVersion,
    inspectionGeneration: request.inspectionGeneration,
    status: projected.status,
    observations: projected.observations,
    warnings: [],
  };
  const fingerprint = fingerprintGlobalResolutionInspectionEvidence(semantic);
  return {
    ...semantic,
    inspectionId: `validation-inspection:${fingerprint.slice(-24)}`,
    inspectedAt,
    fingerprint,
  };
}

export function buildValidationOfficialSourceInspectionRequest(input: {
  reviewCase: ReviewCase;
  operationId: string;
  generation: number;
  requestedAt: string;
}): GlobalResolutionInspectionRequest {
  const checkpoint = input.reviewCase.globalResolution;
  if (!checkpoint) throw new Error("validation_checkpoint_missing");
  const operation = checkpoint.plan.operations.find((candidate) => candidate.id === input.operationId);
  if (!operation) throw new Error("validation_operation_missing");
  const payloadFingerprint = computeUniversalFingerprint(operation.payload as ReviewJsonValue);
  return {
    inspectorId: VALIDATION_OFFICIAL_SOURCE_INSPECTOR_ID,
    inspectorVersion: "1.0.0",
    caseId: input.reviewCase.id,
    producer: checkpoint.producer,
    producerVersion: checkpoint.producerManifest?.producerVersion,
    manifestVersion: checkpoint.producerManifest?.manifestVersion,
    manifestFingerprint: checkpoint.producerManifest?.manifestFingerprint,
    capability: VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
    capabilityVersion: checkpoint.producerManifest?.capabilityVersions.find((entry) => entry.capabilityId === VALIDATION_OFFICIAL_SOURCE_CAPABILITY)?.capabilityVersion,
    operationId: operation.id,
    operationFingerprint: fingerprintGlobalResolutionInspectionOperation(operation),
    checkpointFingerprint: checkpoint.checkpointFingerprint,
    checkpointVersion: checkpoint.storedAtCaseVersion,
    caseVersion: input.reviewCase.version,
    inspectionGeneration: input.generation,
    subject: {
      entityType: "validation_entity",
      expectedId: "validation-entity-memory-only",
      identityKey: typeof operation.target?.identityKey === "string" ? operation.target.identityKey : "validation:entity",
      expectedPayloadFingerprint: payloadFingerprint,
    },
    requestedAt: input.requestedAt,
  };
}

export function validationOfficialSourceEvidenceToReconciliationEvidence(
  evidence: GlobalResolutionInspectionEvidence,
): GlobalResolutionReconciliationEvidence[] {
  const exists = evidence.observations.find((observation): observation is Extract<GlobalResolutionObservation, {kind: "entity_exists"}> => observation.kind === "entity_exists");
  const missing = evidence.observations.some((observation) => observation.kind === "entity_missing");
  const conflict = Boolean(exists && missing) || evidence.status === "ambiguous";
  const finding = conflict ? "unknown" : evidence.status === "observed" && exists ? "effect_confirmed" : evidence.status === "not_observed" && missing ? "effect_not_found" : "unknown";
  return [{
    id: `validation-reconciliation-evidence:${evidence.fingerprint.slice(-24)}`,
    type: "external_inspection",
    source: "external_inspector",
    operationId: evidence.operationId,
    observedAt: evidence.inspectedAt,
    summary: conflict ? "La evidencia validation-only es ambigua." : finding === "effect_confirmed" ? "El inspector validation-only observó el efecto." : finding === "effect_not_found" ? "El inspector validation-only confirmó ausencia." : "El inspector validation-only no aportó una conclusión.",
    confidence: finding === "unknown" ? "insufficient" : "confirmed",
    fingerprint: exists?.payloadFingerprint,
    documentId: exists?.entityId,
    identityKey: exists?.identityKey,
    finding,
  }];
}

export const validationOfficialSourceSecurity = Object.freeze({
  validationOnly: true,
  memoryOnly: true,
  network: false,
  io: false,
  writes: false,
  sanity: false,
  saveDraft: false,
  resume: false,
  localStorage: false,
  secrets: false,
});
