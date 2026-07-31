import type {EntityOperation} from "../../entityOperations";
import {expectedEntityOperationIdempotencyKey} from "../../entityOperations/fingerprintEntityOperation";
import type {ReviewCase} from "../../types";
import {computeUniversalFingerprint, type ReviewProducerRegistration} from "../../universal";
import {buildResolutionGraphFromOperations} from "../buildResolutionGraphFromOperations";
import {pilotCapabilityRegistry} from "../capabilities";
import {buildCurrentGlobalResolutionCatalog} from "../checkpoint/catalog";
import {applyCheckpointReconciliation, createCheckpointAfterPlanning, markCheckpointReconciliationRequired, updateCheckpointAfterFighterIdentityGuard} from "../checkpoint/lifecycle";
import {deserializeGlobalResolutionPlan, deserializeResolutionGraph} from "../checkpoint/serialization";
import type {GlobalResolutionCheckpoint} from "../checkpoint/types";
import {expectedGlobalResolutionPlanIdempotencyKey, fingerprintGlobalResolutionPlan} from "../fingerprintGlobalResolutionPlan";
import {resolveGlobalResolutionPlanningPolicy} from "../planningPolicies";
import type {GlobalResolutionPlan} from "../types";
import {ensureFighterIdentityGuardOperations, FIGHTER_IDENTITY_GUARD_CAPABILITY, type FighterIdentityGuardAuthorization} from "../identityGuard";
import {assessReconciliation, buildUniversalReconciliationContext} from "../reconciliation/service";
import {checkpointProjectionForExternalNewsReconciliation} from "../reconciliation/contracts/externalNews";
import {UniversalReconciliationContractRegistry} from "../reconciliation/engine";
import {
  createGlobalResolutionProducerRuntime,
  EXTERNAL_NEWS_PRODUCER_ID,
  externalNewsProducerManifest,
  type ProducerResolution,
} from "../producers";
import type {
  GlobalResolutionReconciliationAssessment,
  GlobalResolutionReconciliationCase,
  GlobalResolutionReconciliationEvidence,
} from "../reconciliation/types";
import {inspectionEvidenceToReconciliationEvidence} from "./adapter";
import {fingerprintGlobalResolutionInspectionOperation} from "./service";
import type {GlobalResolutionInspectionEvidence, GlobalResolutionObservation} from "./types";
import {GlobalResolutionInspectorRegistry} from "./registry";
import {
  buildValidationOfficialSourceEvidence,
  buildValidationOfficialSourceInspectionRequest,
  createValidationOfficialSourceProducerRuntime,
  createValidationOfficialSourceReconciliationContracts,
  validationOfficialSourceAdapterIds,
  validationOfficialSourceEvidenceToReconciliationEvidence,
  VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
  VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY,
  VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID,
  type ValidationOfficialSourceScenario,
} from "./validationOfficialSource.dev";

export const GLOBAL_RESOLUTION_INSPECTION_DEV_FIXTURE_ENABLED = Boolean(import.meta.env?.DEV);
export const GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID = "operation:dev:create-luchador";
export const GLOBAL_RESOLUTION_INSPECTION_VALIDATION_DEV_OPERATION_ID = "operation:dev:validation-official-source:create-luchador";
export const GLOBAL_RESOLUTION_INSPECTION_DEV_PRODUCERS = Object.freeze([
  EXTERNAL_NEWS_PRODUCER_ID,
  VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID,
] as const);
export type GlobalResolutionInspectionDevProducer = typeof GLOBAL_RESOLUTION_INSPECTION_DEV_PRODUCERS[number];

export const GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS = Object.freeze([
  "confirmed_succeeded",
  "confirmed_not_applied",
  "conflicting_evidence",
  "insufficient_evidence",
  "already_reconciled",
  "technical_failure",
  "technical_error",
  "unsupported",
  "stale_context",
  "producer_missing",
  "producer_ambiguous",
  "producer_version_mismatch",
  "capability_unsupported",
  "inspector_unavailable",
] as const);

export type GlobalResolutionInspectionDevScenario = typeof GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS[number];

export const GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIO_LABELS: Readonly<Record<GlobalResolutionInspectionDevScenario, string>> = Object.freeze({
  confirmed_succeeded: "Efecto confirmado",
  confirmed_not_applied: "Efecto no aplicado",
  conflicting_evidence: "Evidencias contradictorias",
  insufficient_evidence: "Evidencia insuficiente",
  already_reconciled: "Operación ya reconciliada",
  technical_failure: "Fallo técnico seguro",
  technical_error: "Error técnico seguro",
  unsupported: "Inspector no compatible",
  stale_context: "Contexto obsoleto",
  producer_missing: "Productor ausente",
  producer_ambiguous: "Productor ambiguo",
  producer_version_mismatch: "Versión incompatible",
  capability_unsupported: "Capability no soportada",
  inspector_unavailable: "Inspector no disponible",
});

const FIXTURE_NOW = "2026-07-29T12:00:00.000Z";
const FIGHTER_ID = "fighter-dev-fixture-very-long-id-for-responsive-validation-000001";
const IDENTITY_KEY = "fighter:dev-fixture:very-long-identity-key-for-responsive-validation-000001";

function fixtureCatalog(producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID) {
  const runtime = producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? createValidationOfficialSourceProducerRuntime()
    : createGlobalResolutionProducerRuntime();
  const producer = {
    producerId,
    version: 1,
    supportedEntityTypes: ["noticia", "luchador"],
    supportedOperations: ["create_draft"],
    buildReviewInput() { throw new Error("dev_fixture_producer_not_executable"); },
    async rebuildCurrentState() { throw new Error("dev_fixture_producer_not_executable"); },
    validateSnapshot() { throw new Error("dev_fixture_producer_not_executable"); },
  } as ReviewProducerRegistration;
  return buildCurrentGlobalResolutionCatalog({
    capabilities: [
      ...pilotCapabilityRegistry.list().map((capability) => ({...capability, support: "contract_only" as const})),
      ...(producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? [{
        id: VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY,
        support: "contract_only" as const,
        operationKinds: ["validate_entity" as const],
        description: "Cierre conceptual validation-only.",
      }] : []),
    ],
    executors: [],
    producers: [producer],
    producerRegistry: runtime.producers,
  });
}

function operation(producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID): EntityOperation {
  const semantic: Omit<EntityOperation, "id" | "idempotencyKey" | "explanation"> = {
    kind: "create_entity",
    entityType: "luchador",
    target: {identityKey: IDENTITY_KEY},
    payload: {
      entityType: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_entity" : "fighter",
      name: "Fixture visual AU4",
      identityKey: IDENTITY_KEY,
      disciplineId: "mma",
      organizationIds: ["dev-fixture"],
      sourceEvidence: [{source: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_fixture" : "dev_fixture"}],
    },
    source: "global_resolution",
    evidence: [],
    confidence: .99,
    risk: "medium",
    preconditions: [],
    postconditions: [],
    dependencyIds: [],
    requiredCapability: "create:luchador",
    compensatable: false,
  };
  return {
    ...semantic,
    id: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? GLOBAL_RESOLUTION_INSPECTION_VALIDATION_DEV_OPERATION_ID : GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID,
    idempotencyKey: expectedEntityOperationIdempotencyKey(semantic),
    explanation: "Fixture DEV aislado para validación visual.",
  };
}

function resumeOperation(
  createOperation: EntityOperation,
  producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID,
): EntityOperation {
  const semantic: Omit<EntityOperation, "id" | "idempotencyKey" | "explanation"> = {
    kind: "validate_entity",
    entityType: "noticia",
    payload: {
      scope: "resume",
      producer: producerId,
      operation: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_fixture_complete" : "create_draft",
    },
    source: "global_resolution",
    evidence: [],
    confidence: .99,
    risk: "low",
    preconditions: [],
    postconditions: [],
    dependencyIds: [createOperation.id],
    requiredCapability: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
      ? VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY
      : "resume:external_news",
    compensatable: false,
  };
  return {
    ...semantic,
    id: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
      ? "operation:dev:validation-official-source:complete"
      : "operation:dev:resume-external-news",
    idempotencyKey: expectedEntityOperationIdempotencyKey(semantic),
    explanation: "Cierre conceptual del fixture DEV.",
  };
}

function checkpoint(reviewCase: ReviewCase, alreadyReconciled = false, producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID): GlobalResolutionCheckpoint {
  const fixtureOperation = operation(producerId);
  const operations = ensureFighterIdentityGuardOperations([fixtureOperation, resumeOperation(fixtureOperation, producerId)], producerId);
  const policy = resolveGlobalResolutionPlanningPolicy({
    availableCapabilities: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
      ? ["create:luchador", FIGHTER_IDENTITY_GUARD_CAPABILITY, VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY]
      : ["create:luchador", FIGHTER_IDENTITY_GUARD_CAPABILITY, "resume:external_news"],
    requireAllNodesForResume: true,
  });
  const graph = buildResolutionGraphFromOperations({
    caseId: reviewCase.id,
    caseVersion: reviewCase.version,
    producer: producerId,
    originalOperation: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_fixture" : "create_draft",
    operations,
    policy,
    metadata: {fixture: true},
    now: () => FIXTURE_NOW,
  });
  const bare: Omit<GlobalResolutionPlan, "id" | "fingerprint" | "idempotencyKey" | "createdAt" | "status" | "executable" | "structurallyValid"> = {
    schemaVersion: 1,
    caseId: reviewCase.id,
    caseVersion: reviewCase.version,
    producer: producerId,
    originalOperation: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_fixture" : "create_draft",
    operations,
    graph,
    blockers: [],
    warnings: [],
    assumptions: [],
    policy,
    requiredCapabilities: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
      ? ["create:luchador", FIGHTER_IDENTITY_GUARD_CAPABILITY, VALIDATION_OFFICIAL_SOURCE_COMPLETION_CAPABILITY]
      : ["create:luchador", FIGHTER_IDENTITY_GUARD_CAPABILITY, "resume:external_news"],
  };
  const plan: GlobalResolutionPlan = {
    ...bare,
    id: "plan:dev-fixture",
    fingerprint: fingerprintGlobalResolutionPlan(bare),
    idempotencyKey: expectedGlobalResolutionPlanIdempotencyKey(bare),
    createdAt: FIXTURE_NOW,
    status: "ready",
    executable: true,
    structurallyValid: true,
  };
  const catalog = fixtureCatalog(producerId);
  const planned = createCheckpointAfterPlanning({reviewCase, plan, catalog, now: () => FIXTURE_NOW});
  const guardOperation = operations.find((candidate) => candidate.requiredCapability === FIGHTER_IDENTITY_GUARD_CAPABILITY)!;
  const authorizationBase: Omit<FighterIdentityGuardAuthorization, "authorizationFingerprint"> = {
    authorizationVersion: "1.0.0", capability: FIGHTER_IDENTITY_GUARD_CAPABILITY,
    guardOperationId: guardOperation.id, creationOperationId: fixtureOperation.id,
    planFingerprint: plan.fingerprint, caseId: plan.caseId, caseVersion: plan.caseVersion,
    producer: producerId, source: "fixture", decision: "create_new", reasonCode: "create_new_authorized",
    identityFingerprint: computeUniversalFingerprint({fixture: IDENTITY_KEY}),
    creationPayloadFingerprint: computeUniversalFingerprint(fixtureOperation.payload ?? null),
    requestFingerprint: computeUniversalFingerprint({fixture: "request"}),
    discoveryStatus: "complete", discoveryResultFingerprint: computeUniversalFingerprint({fixture: "discovery"}),
    candidateIds: [], strategyIds: ["canonical_label_exact"], warningCodes: [],
    contextFingerprint: computeUniversalFingerprint({planFingerprint: plan.fingerprint, producer: producerId}),
    authorizedAt: FIXTURE_NOW, expiresAt: "2026-07-29T12:15:00.000Z",
  };
  const authorization: FighterIdentityGuardAuthorization = {
    ...authorizationBase,
    authorizationFingerprint: computeUniversalFingerprint({...authorizationBase, candidateIds: [], strategyIds: ["canonical_label_exact"], warningCodes: []}),
  };
  const guarded = updateCheckpointAfterFighterIdentityGuard({reviewCase, plan, catalog, checkpoint: planned, authorization, now: () => FIXTURE_NOW});
  const uncertain = markCheckpointReconciliationRequired({
    reviewCase,
    checkpoint: guarded,
    plan,
    catalog,
    operationId: fixtureOperation.id,
    reason: "dev_fixture_uncertain",
    now: () => FIXTURE_NOW,
  });
  if (!alreadyReconciled) return uncertain;
  return applyCheckpointReconciliation({
    reviewCase,
    checkpoint: uncertain,
    plan,
    catalog,
    operationId: fixtureOperation.id,
    assessmentFingerprint: "sha256-v1:devfixturealreadyreconciled000000000000001",
    outcome: "confirmed_succeeded",
    capability: "create:luchador",
    idempotencyKey: fixtureOperation.idempotencyKey,
    documentId: FIGHTER_ID,
    identityKey: IDENTITY_KEY,
    operationOutcome: "created",
    payloadFingerprint: computeUniversalFingerprint(fixtureOperation.payload as never),
    projection: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? undefined : checkpointProjectionForExternalNewsReconciliation("create:luchador"),
    now: () => FIXTURE_NOW,
  });
}

export function createGlobalResolutionInspectionDevReviewCase(
  alreadyReconciled = false,
  producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID,
): ReviewCase {
  const reviewCase: ReviewCase = {
    schemaVersion: 1,
    id: `case:dev-fixture:inspection:${producerId}`,
    dedupeKey: `case:dev-fixture:inspection:${producerId}`,
    module: "external.news",
    title: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "Fixture visual AU4 · Fuente oficial técnica" : "Fixture visual AU4 · Inspección Sanity",
    status: "open",
    priority: "high",
    subject: {type: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? "validation_official_source" : "external_news"},
    issues: [],
    resolutions: [],
    context: {producer: producerId, fixture: "au4-inspection"},
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    version: 1,
    resumeAttempts: 0,
  };
  return {...reviewCase, globalResolution: checkpoint(reviewCase, alreadyReconciled, producerId)};
}

function inspectionEvidence(
  suffix: string,
  status: GlobalResolutionInspectionEvidence["status"],
  observations: GlobalResolutionObservation[],
  reviewCase: ReviewCase,
): GlobalResolutionInspectionEvidence {
  const checkpointValue = reviewCase.globalResolution!;
  const fixtureOperation = checkpointValue.plan.operations.find((candidate) => candidate.id === GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID)!;
  return {
    inspectorId: "sanity:external_news-effects:dev-fixture",
    inspectorVersion: "dev-1",
    inspectionId: `inspection:dev-fixture:${suffix}`,
    producer: "external_news",
    capability: "create:luchador",
    operationId: GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID,
    operationFingerprint: fingerprintGlobalResolutionInspectionOperation(fixtureOperation),
    checkpointFingerprint: checkpointValue.checkpointFingerprint,
    inspectedAt: FIXTURE_NOW,
    status,
    observations,
    warnings: [],
    fingerprint: `sha256-v1:devfixtureevidence${suffix.replace(/[^a-z0-9]/gi, "")}000000000000000001`,
  };
}

function localEvidence(): GlobalResolutionReconciliationEvidence {
  return {
    id: "reconciliation-evidence:dev-fixture-local",
    type: "operation_history",
    source: "checkpoint",
    operationId: GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID,
    observedAt: FIXTURE_NOW,
    summary: "El checkpoint local registró un resultado incierto y exige reconciliación.",
    confidence: "insufficient",
    outcome: "reconciliation_required",
    finding: "unknown",
  };
}

const operationIdForProducer = (producerId: GlobalResolutionInspectionDevProducer) =>
  producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? GLOBAL_RESOLUTION_INSPECTION_VALIDATION_DEV_OPERATION_ID
    : GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID;

function scenarioEvidence(scenario: GlobalResolutionInspectionDevScenario, reviewCase: ReviewCase): GlobalResolutionInspectionEvidence[] {
  const payloadFingerprint = computeUniversalFingerprint(
    reviewCase.globalResolution!.plan.operations.find(({id}) => id === GLOBAL_RESOLUTION_INSPECTION_DEV_OPERATION_ID)!.payload as never,
  );
  if (scenario === "confirmed_not_applied") return [inspectionEvidence("missing", "not_observed", [{
    kind: "entity_missing",
    entityType: "luchador",
    expectedId: FIGHTER_ID,
    identityKey: IDENTITY_KEY,
  }], reviewCase)];
  if (scenario === "conflicting_evidence") return [
    inspectionEvidence("exists", "observed", [{
      kind: "entity_exists",
      entityType: "luchador",
      entityId: FIGHTER_ID,
      identityKey: IDENTITY_KEY,
      payloadFingerprint,
    }], reviewCase),
    inspectionEvidence("missing", "not_observed", [{
      kind: "entity_missing",
      entityType: "luchador",
      expectedId: FIGHTER_ID,
      identityKey: IDENTITY_KEY,
    }], reviewCase),
  ];
  if (scenario === "insufficient_evidence") return [inspectionEvidence("incomplete", "observed", [{
    kind: "entity_exists",
    entityType: "luchador",
    entityId: FIGHTER_ID,
  }], reviewCase)];
  return [inspectionEvidence("exists", "observed", [{
    kind: "entity_exists",
    entityType: "luchador",
    entityId: FIGHTER_ID,
    identityKey: IDENTITY_KEY,
    payloadFingerprint,
  }], reviewCase)];
}

export type GlobalResolutionInspectionDevResult = {
  reviewCase: ReviewCase;
  evidence: GlobalResolutionInspectionEvidence;
  assessment: GlobalResolutionReconciliationAssessment;
  producerState: {
    status: ProducerResolution["status"] | "capability_unsupported" | "inspector_unavailable";
    displayName?: string;
    producerVersion?: string;
    family?: string;
    capability: string;
    operationKind?: string;
    adapter?: string;
    inspectorBinding?: string;
    compatibility: string;
    manifestFingerprint?: string;
    inspectionGeneration?: number;
  };
};

function producerFixtureState(
  scenario: GlobalResolutionInspectionDevScenario,
  producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID,
  generation = 0,
): GlobalResolutionInspectionDevResult["producerState"] {
  const runtime = producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? createValidationOfficialSourceProducerRuntime()
    : createGlobalResolutionProducerRuntime();
  if (producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID) {
    const resolution = runtime.producers.resolveProducerForCase({producerId, producerVersion: "1.0.0"});
    if (resolution.status !== "resolved") return {status: resolution.status, capability: VALIDATION_OFFICIAL_SOURCE_CAPABILITY, compatibility: resolution.status};
    const binding = runtime.producers.resolveInspectorBinding(producerId, VALIDATION_OFFICIAL_SOURCE_CAPABILITY);
    return {
      status: scenario === "unsupported" ? "capability_unsupported" : binding.status === "resolved" ? "resolved" : "inspector_unavailable",
      displayName: resolution.producer.manifest.displayName,
      producerVersion: resolution.producer.manifest.producerVersion,
      family: resolution.producer.manifest.family,
      capability: VALIDATION_OFFICIAL_SOURCE_CAPABILITY,
      operationKind: "create_entity",
      adapter: validationOfficialSourceAdapterIds.requestBuilder,
      inspectorBinding: binding.status === "resolved" ? binding.binding.inspectorId : undefined,
      compatibility: scenario === "unsupported" ? "incompatible" : "validation_only",
      manifestFingerprint: resolution.producer.fingerprint,
      inspectionGeneration: generation,
    };
  }
  if (scenario === "producer_ambiguous") {
    runtime.producers.registerProducer({...structuredClone(externalNewsProducerManifest), producerId: "fixture_competing_source", displayName: "Fuente competidora del fixture"});
  }
  const resolution = scenario === "producer_missing"
    ? runtime.producers.resolveProducerForCase({})
    : scenario === "producer_ambiguous"
      ? runtime.producers.resolveProducerForCase({caseType: "external_news"})
      : scenario === "producer_version_mismatch"
        ? runtime.producers.resolveProducerForCase({producerId: EXTERNAL_NEWS_PRODUCER_ID, producerVersion: "9.0.0"})
        : runtime.producers.resolveProducerForCase({producerId: EXTERNAL_NEWS_PRODUCER_ID, producerVersion: "1.0.0"});
  if (resolution.status !== "resolved") return {status: resolution.status, capability: "create:luchador", compatibility: resolution.status};
  if (scenario === "capability_unsupported") return {
    status: runtime.producers.resolveCapability(EXTERNAL_NEWS_PRODUCER_ID, {kind: "create_entity", requiredCapability: "create:unknown"}) ? "resolved" : "capability_unsupported",
    displayName: resolution.producer.manifest.displayName,
    producerVersion: resolution.producer.manifest.producerVersion,
    capability: "create:unknown",
    compatibility: "incompatible",
  };
  const inspector = runtime.producers.resolveInspectorBinding(
    EXTERNAL_NEWS_PRODUCER_ID,
    "create:luchador",
    scenario === "inspector_unavailable" ? new GlobalResolutionInspectorRegistry() : undefined,
  );
  return {
    status: scenario === "inspector_unavailable" ? "inspector_unavailable" : resolution.status,
    displayName: resolution.producer.manifest.displayName,
    producerVersion: resolution.producer.manifest.producerVersion,
    family: resolution.producer.manifest.family,
    capability: "create:luchador",
    operationKind: "create_entity",
    adapter: externalNewsProducerManifest.adapters.find((adapter) => adapter.adapterKind === "inspection_request_builder")?.adapterId,
    inspectorBinding: inspector.status === "resolved" ? inspector.binding.inspectorId : undefined,
    compatibility: inspector.status === "resolved" ? "legacy_compatible" : inspector.status,
    manifestFingerprint: resolution.producer.fingerprint,
    inspectionGeneration: generation,
  };
}

export function buildGlobalResolutionInspectionDevResult(
  scenario: GlobalResolutionInspectionDevScenario,
  producerId: GlobalResolutionInspectionDevProducer = EXTERNAL_NEWS_PRODUCER_ID,
  generation = 0,
): GlobalResolutionInspectionDevResult {
  const reviewCase = createGlobalResolutionInspectionDevReviewCase(scenario === "already_reconciled", producerId);
  const operationId = operationIdForProducer(producerId);
  const validationScenario: ValidationOfficialSourceScenario = scenario === "technical_error" || scenario === "technical_failure"
    ? "technical_failure"
    : ["confirmed_succeeded", "confirmed_not_applied", "conflicting_evidence", "insufficient_evidence"].includes(scenario)
      ? scenario as ValidationOfficialSourceScenario
      : "confirmed_succeeded";
  const evidence = producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? [buildValidationOfficialSourceEvidence(
      validationScenario,
      buildValidationOfficialSourceInspectionRequest({reviewCase, operationId, generation, requestedAt: FIXTURE_NOW}),
      FIXTURE_NOW,
    )]
    : scenarioEvidence(scenario, reviewCase);
  const adaptEvidence = producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? validationOfficialSourceEvidenceToReconciliationEvidence
    : inspectionEvidenceToReconciliationEvidence;
  const reconciliationCase: GlobalResolutionReconciliationCase = {
    caseId: reviewCase.id,
    caseVersion: reviewCase.version,
    checkpointFingerprint: reviewCase.globalResolution?.checkpointFingerprint,
    operationId,
    capability: "create:luchador",
    reason: "executor_uncertain",
    evidence: [{...localEvidence(), operationId}, ...evidence.flatMap(adaptEvidence)],
    confidence: scenario === "insufficient_evidence" ? "insufficient" : "confirmed",
    createdAt: FIXTURE_NOW,
  };
  const producerState = producerFixtureState(scenario, producerId, generation);
  const registry = producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? createValidationOfficialSourceReconciliationContracts()
    : undefined;
  return {
    reviewCase,
    evidence: evidence[0],
    producerState,
    assessment: assessReconciliation(reconciliationCase, reviewCase.globalResolution!, scenario === "technical_error" || scenario === "technical_failure"
      ? {registry, technicalFailure: {code: "inspection_failed"}, inspectorId: evidence[0].inspectorId}
      : ["unsupported", "producer_missing", "producer_ambiguous", "capability_unsupported", "inspector_unavailable"].includes(scenario)
        ? {registry: new UniversalReconciliationContractRegistry(), unsupported: {code: "unsupported"}}
        : scenario === "stale_context" || scenario === "producer_version_mismatch"
          ? {registry, expectedContext: {...buildUniversalReconciliationContext(reconciliationCase, reviewCase.globalResolution!), caseVersion: reviewCase.version + 1}}
          : {registry, inspectorId: evidence[0].inspectorId, inspectedAt: evidence[0].inspectedAt}),
  };
}

export function applyGlobalResolutionInspectionDevFixtureAssessment(
  reviewCase: ReviewCase,
  assessment: GlobalResolutionReconciliationAssessment,
): ReviewCase {
  if (assessment.status !== "confirmed_succeeded" && assessment.status !== "confirmed_not_applied") {
    return structuredClone(reviewCase);
  }
  const checkpointValue = reviewCase.globalResolution;
  if (!checkpointValue) throw new Error("dev_fixture_checkpoint_missing");
  const producerId = checkpointValue.producer === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    ? VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID
    : EXTERNAL_NEWS_PRODUCER_ID;
  const operationId = operationIdForProducer(producerId);
  const graph = deserializeResolutionGraph(checkpointValue.graph, checkpointValue.plan, checkpointValue.createdAt);
  if (!graph.ok) throw new Error("dev_fixture_graph_invalid");
  const plan = deserializeGlobalResolutionPlan(checkpointValue.plan, graph.value, checkpointValue.createdAt);
  if (!plan.ok) throw new Error("dev_fixture_plan_invalid");
  const outcome = assessment.status === "confirmed_succeeded" ? assessment.outcome : undefined;
  const evolved = applyCheckpointReconciliation({
    reviewCase,
    checkpoint: checkpointValue,
    plan: plan.value,
    catalog: fixtureCatalog(producerId),
    operationId,
    assessmentFingerprint: assessment.assessmentFingerprint,
    outcome: assessment.status,
    capability: "create:luchador",
    idempotencyKey: operation(producerId).idempotencyKey,
    documentId: outcome?.documentId,
    identityKey: outcome?.identityKey,
    operationOutcome: outcome?.outcome,
    payloadFingerprint: outcome?.payloadFingerprint,
    projection: producerId === VALIDATION_OFFICIAL_SOURCE_PRODUCER_ID ? undefined : checkpointProjectionForExternalNewsReconciliation("create:luchador"),
    provenance: {
      inspectorId: assessment.inspectorId,
      evidenceFingerprint: assessment.evidenceFingerprint,
      assessmentFingerprint: assessment.assessmentFingerprint,
      appliedAction: assessment.status === "confirmed_succeeded" ? "repair_checkpoint" : "enable_retry",
      reasonCodes: assessment.reasons?.map((reason) => reason.code) ?? [],
    },
    now: () => FIXTURE_NOW,
  });
  return {...structuredClone(reviewCase), globalResolution: evolved};
}

type PendingInspection = {controller: AbortController; timer: ReturnType<typeof setTimeout>};

export class GlobalResolutionInspectionDevFixtureSession {
  private generation = 0;
  private pending?: PendingInspection;
  private disposed = false;

  get pendingCount(): number {
    return this.pending ? 1 : 0;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get inspectionGeneration(): number {
    return this.generation;
  }

  selectScenario(): void {
    this.invalidate();
  }

  selectProducer(): void {
    this.invalidate();
  }

  inspect(
    scenario: GlobalResolutionInspectionDevScenario,
    producerOrOptions: GlobalResolutionInspectionDevProducer | {signal?: AbortSignal; delayMs?: number} = EXTERNAL_NEWS_PRODUCER_ID,
    maybeOptions: {signal?: AbortSignal; delayMs?: number} = {},
  ): Promise<GlobalResolutionInspectionDevResult | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    const producerId = typeof producerOrOptions === "string" ? producerOrOptions : EXTERNAL_NEWS_PRODUCER_ID;
    const options = typeof producerOrOptions === "string" ? maybeOptions : producerOrOptions;
    this.invalidate();
    const generation = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, {once: true});
    return new Promise((resolve) => {
      const finish = () => {
        options.signal?.removeEventListener("abort", abort);
        if (this.pending?.controller === controller) this.pending = undefined;
        if (controller.signal.aborted || this.disposed || generation !== this.generation) {
          resolve(undefined);
          return;
        }
        resolve(buildGlobalResolutionInspectionDevResult(scenario, producerId, generation));
      };
      const timer = setTimeout(finish, options.delayMs ?? 700);
      controller.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        finish();
      }, {once: true});
      this.pending = {controller, timer};
    });
  }

  invalidate(): void {
    this.generation += 1;
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.controller.abort();
    this.pending = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
}

export const globalResolutionInspectionDevFixtureSecurity = Object.freeze({
  devOnly: true,
  usesPersistentStore: false,
  writesLocalStorage: false,
  callsSanity: false,
  callsInspectionEndpoint: false,
  executesOperations: false,
  callsSaveDraft: false,
  callsResume: false,
  mutatesRealReviewCases: false,
  persistsResults: false,
} as const);
