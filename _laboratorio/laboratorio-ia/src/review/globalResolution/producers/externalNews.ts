import type {GlobalResolutionCapabilityManifest, GlobalResolutionProducerManifest, ProducerAdapterImplementation} from "./types";
import {createLuchadorCapabilityManifest, resolveFighterIdentityCapabilityManifest} from "./sharedCapabilities";

export const EXTERNAL_NEWS_PRODUCER_ID = "external_news";
export const EXTERNAL_NEWS_PRODUCER_VERSION = "1.0.0";
export const EXTERNAL_NEWS_MANIFEST_VERSION = "1.0.0";
export const EXTERNAL_NEWS_INSPECTOR_ID = "sanity:external_news-effects";

export const externalNewsUniversalCapabilities: readonly GlobalResolutionCapabilityManifest[] = Object.freeze([
  resolveFighterIdentityCapabilityManifest,
  createLuchadorCapabilityManifest,
  {
    capabilityId: "replace_reference:noticia:luchador",
    capabilityVersion: "1.0.0",
    description: "Sustituir una referencia proyectada por una referencia real.",
    operationKinds: ["replace_reference"],
    requirements: ["real_reference", "payload_fingerprint"],
    expectedEvidenceKinds: ["document_id", "reference_id"],
    supportsInspection: true,
    supportsReconciliation: true,
    requiresExplicitAuthorization: false,
    idempotencyPolicy: "required",
  },
  {
    capabilityId: "resume:external_news",
    capabilityVersion: "1.0.0",
    description: "Persistir el borrador preparado y reanudar el caso.",
    operationKinds: ["validate_entity"],
    requirements: ["prepared_resume", "ephemeral_authorization"],
    expectedEvidenceKinds: ["document_id", "payload_fingerprint"],
    supportsInspection: true,
    supportsReconciliation: true,
    requiresExplicitAuthorization: true,
    idempotencyPolicy: "required",
  },
  {
    capabilityId: "validate:noticia",
    capabilityVersion: "1.0.0",
    description: "Validar el payload final de noticia sin escritura.",
    operationKinds: ["validate_entity"],
    requirements: ["reconstructed_payload"],
    expectedEvidenceKinds: ["validation_result"],
    supportsInspection: false,
    supportsReconciliation: false,
    requiresExplicitAuthorization: false,
    idempotencyPolicy: "not_applicable",
  },
]);

export const externalNewsProducerAdapterIds = Object.freeze({
  caseAdapter: "external-news.case-adapter.v1",
  planner: "external-news.global-resolution-planner.v1",
  createExecutor: "global-resolution.create-luchador.v1",
  referenceExecutor: "global-resolution.replace-external-news-fighter-reference.v1",
  resumeExecutor: "global-resolution.resume-external-news.v1",
  inspectionRequestBuilder: "external-news.sanity-inspection-request-builder.v1",
  referenceResolver: "external-news.fighter-reference-resolver.v1",
  reconciliationContract: "external-news.reconciliation-contract.v1",
  lifecycleProjection: "external-news.checkpoint-projection.v1",
  uiController: "external-news.global-resolution-controls.v1",
} as const);

export const externalNewsProducerManifest: GlobalResolutionProducerManifest = {
  manifestVersion: EXTERNAL_NEWS_MANIFEST_VERSION,
  producerId: EXTERNAL_NEWS_PRODUCER_ID,
  producerVersion: EXTERNAL_NEWS_PRODUCER_VERSION,
  displayName: "Noticias externas",
  family: "external_news",
  caseTypes: ["external_news"],
  capabilities: externalNewsUniversalCapabilities.map((capability) => ({
    capabilityId: capability.capabilityId,
    capabilityVersion: capability.capabilityVersion,
    operationKinds: [...capability.operationKinds],
    modes: capability.capabilityId === "validate:noticia"
      ? ["plan", "simulate"]
      : capability.capabilityId === "resolve_identity:fighter"
        ? ["plan", "simulate", "execute"]
      : ["plan", "simulate", "execute", "inspect", "reconcile", "retry"],
    requiresExplicitAuthorization: capability.requiresExplicitAuthorization,
    supportsIdempotency: capability.idempotencyPolicy !== "not_applicable",
    supportsInspection: capability.supportsInspection,
    supportsReconciliation: capability.supportsReconciliation,
    requiredContext: capability.capabilityId === "resume:external_news"
      ? ["caseId", "caseVersion", "checkpointFingerprint", "previewFingerprint", "payloadFingerprint"]
      : ["caseId", "caseVersion", "checkpointFingerprint", "operationFingerprint"],
    optionalContext: ["source", "documentId"],
    dependencies: capability.capabilityId === "create:luchador" ? ["resolve_identity:fighter"]
      : capability.capabilityId === "replace_reference:noticia:luchador" ? ["create:luchador"] : [],
  })),
  adapters: [
    {adapterKind: "case_adapter", adapterId: externalNewsProducerAdapterIds.caseAdapter, adapterVersionRange: "^1.0.0", priority: 100},
    {adapterKind: "planner", adapterId: externalNewsProducerAdapterIds.planner, adapterVersionRange: "^1.0.0", priority: 100},
    {adapterKind: "executor", adapterId: externalNewsProducerAdapterIds.createExecutor, adapterVersionRange: "^1.0.0", capabilityIds: ["create:luchador"], priority: 100},
    {adapterKind: "executor", adapterId: externalNewsProducerAdapterIds.referenceExecutor, adapterVersionRange: "^1.0.0", capabilityIds: ["replace_reference:noticia:luchador"], priority: 100},
    {adapterKind: "executor", adapterId: externalNewsProducerAdapterIds.resumeExecutor, adapterVersionRange: "^1.0.0", capabilityIds: ["resume:external_news"], priority: 100},
    {adapterKind: "inspection_request_builder", adapterId: externalNewsProducerAdapterIds.inspectionRequestBuilder, adapterVersionRange: "^1.0.0", capabilityIds: ["create:luchador", "replace_reference:noticia:luchador", "resume:external_news"], priority: 100},
    {adapterKind: "reference_resolver", adapterId: externalNewsProducerAdapterIds.referenceResolver, adapterVersionRange: "^1.0.0", capabilityIds: ["replace_reference:noticia:luchador"], priority: 100},
    {adapterKind: "reconciliation_contract", adapterId: externalNewsProducerAdapterIds.reconciliationContract, adapterVersionRange: "^1.0.0", capabilityIds: ["create:luchador", "replace_reference:noticia:luchador", "resume:external_news"], priority: 100},
    {adapterKind: "lifecycle_projection", adapterId: externalNewsProducerAdapterIds.lifecycleProjection, adapterVersionRange: "^1.0.0", capabilityIds: ["create:luchador", "resume:external_news"], priority: 100},
    {adapterKind: "ui_controller", adapterId: externalNewsProducerAdapterIds.uiController, adapterVersionRange: "^1.0.0", priority: 100},
  ],
  inspectors: ["create:luchador", "replace_reference:noticia:luchador", "resume:external_news"].map((capabilityId) => ({
    capabilityId,
    inspectorId: EXTERNAL_NEWS_INSPECTOR_ID,
    inspectorVersionRange: "^1.0.0",
    priority: 100,
    requiredEvidenceKinds: ["document_id", "fingerprint"],
  })),
  executionPolicy: {
    maximumRisk: "medium",
    defaultAuthorization: "explicit",
    retryPolicy: "manual_after_confirmed_absence",
    allowAutomaticExecution: false,
  },
  autonomyPolicy: {
    policyVersion: "1.0.0",
    maximumAutonomousRisk: "medium",
    allowedAutonomousCapabilities: ["resolve_identity:fighter", "validate:noticia"],
    supervisedCapabilities: ["replace_reference:noticia:luchador"],
    requiresAuthorizationCapabilities: ["create:luchador", "resume:external_news"],
    forbiddenAutonomousCapabilities: [],
  },
  compatibility: {
    caseTypes: ["external_news"],
    contracts: ["review-case:external-news:v1"],
    sources: [],
    legacyProducerIds: ["external-news"],
    minimumCheckpointManifestVersion: "1.0.0",
  },
  metadata: {
    pilot: true,
    lifecycle: "AU3",
    inspection: "AU4",
  },
};

export function externalNewsProducerAdapterDescriptors(): ProducerAdapterImplementation[] {
  return externalNewsProducerManifest.adapters.map((binding) => ({
    adapterId: binding.adapterId,
    version: "1.0.0",
    adapterKind: binding.adapterKind,
    implementation: Object.freeze({adapterId: binding.adapterId}),
  }));
}
