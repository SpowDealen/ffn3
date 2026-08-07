import type {ContentTypeId} from "../../types";
import {buildEntityOperation, type EntityOperation, type EntityOperationEntityType, type OperationEvidence} from "../entityOperations";
import type {EntityResolutionResult, UniversalEntityType} from "../entityIdentity";
import {topologicalSortResolutionGraph} from "../resolutionGraph";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {appendFinalValidationAndResume} from "./deriveEntityOperations";
import {finalizeGlobalResolutionPlan} from "./finalizeGlobalResolutionPlan";
import {identityCreationGuardProfileForSchema, validateIdentityCreationAuthorization, type IdentityCreationPreflight} from "./identityCreationGuard";
import {resolveGlobalResolutionPlanningPolicy} from "./planningPolicies";
import type {GlobalResolutionBlocker, GlobalResolutionPlan, GlobalResolutionPlanningPolicy, PlanningContext} from "./types";
import {entityOperationRegistry} from "../entityOperations";
import type {GlobalResolutionReconciliationAssessment} from "./reconciliation";

export const TRANSVERSAL_RESOLUTION_PLANNER_VERSION = "1.0.0" as const;
export type TransversalResolutionDecisionKind = "reuse" | "create" | "investigate" | "repair_reference" | "validate" | "resume" | "blocked";
export type TransversalRequirementRole = "entity" | "repair_reference" | "validate";

export type TransversalPlanningRequirement = Readonly<{
  id: string;
  issueId?: string;
  role: TransversalRequirementRole;
  entityType: UniversalEntityType;
  resolution?: EntityResolutionResult;
  reconciliation?: GlobalResolutionReconciliationAssessment;
  creationPreflight?: IdentityCreationPreflight;
  preparedPayload?: ReviewJsonObject;
  fieldPath?: string;
  referenceId?: string;
  dependsOn?: readonly string[];
  evidence?: readonly OperationEvidence[];
  required?: boolean;
}>;

export type TransversalResolutionDecision = Readonly<{
  requirementId: string;
  issueId?: string;
  entityType: UniversalEntityType;
  decision: TransversalResolutionDecisionKind;
  operationIds: readonly string[];
  reasonCodes: readonly string[];
  evidenceFingerprints: readonly string[];
  candidateId?: string;
  creationGuardFingerprint?: string;
  ready: boolean;
}>;

export type TransversalResolutionPlan = Readonly<{
  version: typeof TRANSVERSAL_RESOLUTION_PLANNER_VERSION;
  plan: GlobalResolutionPlan;
  decisions: readonly TransversalResolutionDecision[];
  orderedOperationIds: readonly string[];
  layers: readonly (readonly string[])[];
  decisionFingerprint: string;
  inputFingerprint: string;
  executionAllowed: false;
  writes: false;
}>;

export type BuildTransversalResolutionPlanResult =
  | Readonly<{ok: true; value: TransversalResolutionPlan}>
  | Readonly<{ok: false; blockers: readonly GlobalResolutionBlocker[]; partialPlan?: GlobalResolutionPlan}>;

export type TransversalResolutionPlanningInput = Readonly<{
  reviewCase: ReviewCase;
  requirements: readonly TransversalPlanningRequirement[];
  producer?: string;
  originalOperation?: string;
  completionMode?: "resume_producer" | "entity_resolution";
  finalEntityType?: ContentTypeId;
  policy?: Partial<GlobalResolutionPlanningPolicy>;
  now?: () => string;
}>;

const schemaByUniversal: Readonly<Record<UniversalEntityType, EntityOperationEntityType | undefined>> = Object.freeze({fighter: "luchador", event: "evento", organization: "organizacion", discipline: "disciplina", weight_category: "categoriaPeso", fight: "combate", news: "noticia", result: undefined});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const confidence = (evidence: readonly OperationEvidence[]) => evidence.length ? Math.min(...evidence.map((item) => item.confidence)) : 0;
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const operationId = (kind: string, requirement: TransversalPlanningRequirement, semantic: unknown) => `transversal:${kind}:${requirement.id}:${fp(semantic).slice(-16)}`;
const blocker = (code: GlobalResolutionBlocker["code"], requirement: TransversalPlanningRequirement, message: string, requiredAction: string): GlobalResolutionBlocker => ({code, severity: "blocking", scope: "structure", issueId: requirement.issueId, entityType: schemaByUniversal[requirement.entityType], message, evidence: [...(requirement.evidence ?? [])], explanation: message, requiredAction});

function operation(input: {id: string; kind: EntityOperation["kind"]; schemaType: EntityOperationEntityType; requirement: TransversalPlanningRequirement; dependencyIds?: readonly string[]; target?: EntityOperation["target"]; payload?: ReviewJsonValue; capability?: string; explanation: string; risk?: EntityOperation["risk"]}): EntityOperation {
  const evidence = [...(input.requirement.evidence ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  return buildEntityOperation({id: input.id, kind: input.kind, entityType: input.schemaType, target: input.target, payload: input.payload, source: "global_resolution", evidence, confidence: confidence(evidence), risk: input.risk ?? (input.kind === "create_entity" ? "medium" : "low"), preconditions: [], postconditions: [], dependencyIds: unique(input.dependencyIds ?? []).sort(), requiredCapability: input.capability, compensatable: false, explanation: input.explanation});
}

type DraftDecision = {requirement: TransversalPlanningRequirement; decision: TransversalResolutionDecisionKind; operationIds: string[]; mainOperationId?: string; reasonCodes: string[]; candidateId?: string; guardFingerprint?: string; ready: boolean};

function initialDecision(requirement: TransversalPlanningRequirement): Omit<DraftDecision, "operationIds"> {
  if (requirement.role === "repair_reference") return {requirement, decision: requirement.referenceId || requirement.dependsOn?.length ? "repair_reference" : "blocked", reasonCodes: requirement.referenceId || requirement.dependsOn?.length ? ["reference_repair_required"] : ["reference_target_missing"], ready: Boolean(requirement.referenceId)};
  if (requirement.role === "validate") return {requirement, decision: "validate", reasonCodes: ["editorial_validation_required"], ready: true};
  const resolution = requirement.resolution;
  const preflight = requirement.creationPreflight;
  if (preflight?.state === "safe_to_reuse" && preflight.resolution.candidateId) return {requirement, decision: "reuse", reasonCodes: ["creation_preflight_reuse_existing"], candidateId: preflight.resolution.candidateId, guardFingerprint: preflight.guardFingerprint, ready: true};
  if (!resolution && requirement.reconciliation) {
    const assessment = requirement.reconciliation;
    const candidateId = "outcome" in assessment ? assessment.outcome?.documentId : undefined;
    if ((assessment.status === "confirmed_succeeded" || assessment.status === "already_reconciled") && candidateId) return {requirement, decision: "reuse", reasonCodes: [`reconciliation_${assessment.status}`], candidateId, ready: true};
    if (assessment.status === "conflicting_evidence") return {requirement, decision: "blocked", reasonCodes: ["reconciliation_conflicting_evidence"], ready: false};
    return {requirement, decision: "investigate", reasonCodes: [`reconciliation_${assessment.status}`], ready: true};
  }
  if (!resolution) return {requirement, decision: "investigate", reasonCodes: ["identity_resolution_missing"], ready: true};
  if (resolution.status === "reuse" && resolution.candidateId) return {requirement, decision: "reuse", reasonCodes: [...resolution.reasonCodes], candidateId: resolution.candidateId, ready: true};
  if (resolution.status === "create_new") {
    if (!requirement.preparedPayload) return {requirement, decision: "blocked", reasonCodes: ["creation_payload_missing"], ready: false};
    if (!preflight) return {requirement, decision: "blocked", reasonCodes: ["blocked_missing_preflight"], ready: false};
    if (preflight.state !== "safe_to_create" || preflight.decision !== "create_new") return {requirement, decision: preflight.state.startsWith("blocked_discovery_") || preflight.state === "blocked_insufficient_evidence" ? "investigate" : "blocked", reasonCodes: [preflight.state], guardFingerprint: preflight.guardFingerprint, ready: false};
    return {requirement, decision: "create", reasonCodes: [...resolution.reasonCodes, "creation_preflight_safe_to_create"], guardFingerprint: preflight.guardFingerprint, ready: true};
  }
  if (resolution.status === "probable_match" || resolution.status === "insufficient_evidence") return {requirement, decision: "investigate", reasonCodes: [...resolution.reasonCodes], ready: true};
  return {requirement, decision: "blocked", reasonCodes: [...resolution.reasonCodes, resolution.status], ready: false};
}

function decisionOperation(draft: Omit<DraftDecision, "operationIds">, schemaType: EntityOperationEntityType, dependencyIds: readonly string[]): EntityOperation | undefined {
  const requirement = draft.requirement;
  if (draft.decision === "reuse" && draft.candidateId) return operation({id: operationId("reuse", requirement, {candidateId: draft.candidateId, dependencyIds}), kind: "reuse_entity", schemaType, requirement, dependencyIds, target: {entityId: draft.candidateId}, capability: `reuse:${schemaType}`, explanation: "Reutilizar la identidad resuelta antes de considerar cualquier creación."});
  if (draft.decision === "create" && requirement.preparedPayload) {
    const profile = identityCreationGuardProfileForSchema(schemaType);
    return operation({id: requirement.creationPreflight?.operationId ?? operationId("create", requirement, {payload: requirement.preparedPayload, dependencyIds}), kind: "create_entity", schemaType, requirement, dependencyIds, payload: requirement.preparedPayload, capability: profile?.createOperation ?? `create:${schemaType}`, explanation: "Crear únicamente con Creation Guard completo y vigente."});
  }
  if (draft.decision === "investigate") return operation({id: operationId("investigate", requirement, {reasonCodes: draft.reasonCodes, dependencyIds}), kind: "find_entity", schemaType, requirement, dependencyIds, payload: {scope: "investigation", requirementId: requirement.id, reasonCodes: draft.reasonCodes}, capability: `resolve_identity:${requirement.entityType}`, explanation: "Investigar identidad o evidencia insuficiente antes de decidir reuse/create."});
  if (draft.decision === "validate") return operation({id: operationId("validate", requirement, {dependencyIds}), kind: "validate_entity", schemaType, requirement, dependencyIds, payload: {scope: "transversal_validation", requirementId: requirement.id}, capability: `validate:${schemaType}`, explanation: "Validar la incidencia editorial antes de continuar."});
  if (draft.decision === "repair_reference") return operation({id: operationId("repair-reference", requirement, {referenceId: requirement.referenceId, fieldPath: requirement.fieldPath, dependencyIds}), kind: "replace_reference", schemaType, requirement, dependencyIds, target: {fieldPath: requirement.fieldPath, entityId: requirement.referenceId}, payload: {scope: "repair_reference", referenceId: requirement.referenceId ?? null, requirementId: requirement.id}, capability: `repair_reference:${schemaType}`, explanation: "Reparar la referencia tras resolver su entidad objetivo."});
  return undefined;
}

function appendReferenceRepair(requirement: TransversalPlanningRequirement, schemaType: EntityOperationEntityType, sourceOperationId: string): EntityOperation | undefined {
  if (!requirement.fieldPath) return undefined;
  return operation({id: operationId("apply-reference", requirement, {sourceOperationId, fieldPath: requirement.fieldPath}), kind: "replace_reference", schemaType, requirement, dependencyIds: [sourceOperationId], target: {fieldPath: requirement.fieldPath, entityId: requirement.referenceId}, payload: {scope: "repair_reference", sourceOperationId, referenceId: requirement.referenceId ?? null}, capability: `repair_reference:${schemaType}`, explanation: "Aplicar la identidad reutilizada o creada a la referencia editorial afectada."});
}

export function buildTransversalResolutionPlan(input: TransversalResolutionPlanningInput): BuildTransversalResolutionPlanResult {
  const producer = text(input.producer) || text(input.reviewCase.context.producer) || "review_center";
  const originalOperation = text(input.originalOperation) || text(input.reviewCase.context.operation) || "resolve_review_case";
  const policy = resolveGlobalResolutionPlanningPolicy(input.policy);
  const requirements = [...input.requirements].sort((left, right) => left.id.localeCompare(right.id));
  if (!requirements.length || new Set(requirements.map((item) => item.id)).size !== requirements.length) return {ok: false, blockers: [{code: "invalid_planning_input", severity: "blocking", scope: "structure", message: "Los requirements deben ser únicos y no vacíos.", evidence: [], explanation: "No existe una entrada transversal determinista.", requiredAction: "Aportar requirements con IDs únicos."}]};
  const initial = new Map(requirements.map((requirement) => [requirement.id, initialDecision(requirement)]));
  const mainIds = new Map<string, string>();
  for (const requirement of requirements) {
    const draft = initial.get(requirement.id)!; const schemaType = schemaByUniversal[requirement.entityType];
    if (!schemaType || draft.decision === "blocked") continue;
    const placeholder = decisionOperation(draft, schemaType, []); if (placeholder) mainIds.set(requirement.id, placeholder.id);
  }
  const operations: EntityOperation[] = []; const drafts: DraftDecision[] = []; const blockers: GlobalResolutionBlocker[] = [];
  for (const requirement of requirements) {
    const base = initial.get(requirement.id)!; const schemaType = schemaByUniversal[requirement.entityType];
    if (!schemaType) { blockers.push(blocker("incompatible_entity_type", requirement, `No existe schema operativo para ${requirement.entityType}.`, "Mantener el caso bloqueado hasta registrar el mapping explícito.")); drafts.push({...base, decision: "blocked", operationIds: [], reasonCodes: [...base.reasonCodes, "schema_mapping_missing"], ready: false}); continue; }
    const missingDependencies = (requirement.dependsOn ?? []).filter((id) => !initial.has(id));
    if (missingDependencies.length) { blockers.push(blocker("unresolved_dependency", requirement, `Dependencias desconocidas: ${missingDependencies.join(", ")}.`, "Corregir los IDs de dependencia y reconstruir el plan.")); drafts.push({...base, decision: "blocked", operationIds: [], reasonCodes: [...base.reasonCodes, "dependency_missing"], ready: false}); continue; }
    if (base.decision === "blocked") {
      const ambiguous = requirement.resolution?.status === "ambiguous" || requirement.resolution?.status === "probable_match";
      blockers.push(blocker(ambiguous ? "ambiguous_entity_candidate" : "invalid_resolution", requirement, `La resolución de ${requirement.id} está bloqueada: ${base.reasonCodes.join(", ")}.`, ambiguous ? "Aportar evidencia discriminante; no seleccionar arbitrariamente." : "Resolver el bloqueo antes de continuar."));
      drafts.push({...base, operationIds: []}); continue;
    }
    const dependencyIds = (requirement.dependsOn ?? []).flatMap((id) => mainIds.get(id) ?? []);
    const main = decisionOperation(base, schemaType, dependencyIds);
    if (!main) { drafts.push({...base, decision: "blocked", operationIds: [], reasonCodes: [...base.reasonCodes, "operation_not_derived"], ready: false}); continue; }
    operations.push(main); mainIds.set(requirement.id, main.id);
    const repair = requirement.role === "entity" && ["reuse", "create"].includes(base.decision) ? appendReferenceRepair(requirement, schemaType, main.id) : undefined;
    if (repair) operations.push(repair);
    drafts.push({...base, mainOperationId: main.id, operationIds: [main.id, ...(repair ? [repair.id] : [])]});
  }
  const context: PlanningContext = {reviewCase: input.reviewCase, resolutions: [], effects: [], evidence: requirements.flatMap((item) => (item.evidence ?? []).map((value) => ({...value, issueId: item.issueId}))), preparedEntities: [], dependencyHints: [], producer, originalOperation, completionMode: input.completionMode ?? "resume_producer", finalEntityType: input.finalEntityType, policy, entityRegistry: entityOperationRegistry, metadata: {planner: "transversal_resolution"}};
  const derived = appendFinalValidationAndResume(context, {operations, blockers, warnings: [], assumptions: [], hasFinalValidation: false});
  const finalized = finalizeGlobalResolutionPlan({caseId: input.reviewCase.id, caseVersion: input.reviewCase.version, producer, originalOperation, operations: derived.operations, blockers: derived.blockers, warnings: derived.warnings, assumptions: derived.assumptions, policy, graphMetadata: {planner: "transversal_resolution", plannerVersion: TRANSVERSAL_RESOLUTION_PLANNER_VERSION, completionMode: input.completionMode ?? "resume_producer"}, now: input.now});
  if (!finalized.ok) return {ok: false, blockers: finalized.issues, partialPlan: finalized.partialPlan};
  const plan = finalized.plan;
  const decisions = drafts.map((draft): TransversalResolutionDecision => {
    let decision = draft.decision; let ready = draft.ready; const reasons = [...draft.reasonCodes];
    if (draft.decision === "create" && draft.requirement.creationPreflight) {
      const checked = validateIdentityCreationAuthorization(draft.requirement.creationPreflight, {plan, creationOperationId: draft.mainOperationId ?? draft.requirement.creationPreflight.operationId, now: input.now});
      if (!checked.valid) { decision = "blocked"; ready = false; reasons.push(`creation_guard_${checked.reasonCode}`); }
    }
    return Object.freeze({requirementId: draft.requirement.id, issueId: draft.requirement.issueId, entityType: draft.requirement.entityType, decision, operationIds: Object.freeze([...draft.operationIds]), reasonCodes: Object.freeze(unique(reasons).sort()), evidenceFingerprints: Object.freeze((draft.requirement.evidence ?? []).map((item) => fp(item)).sort()), candidateId: draft.candidateId, creationGuardFingerprint: draft.guardFingerprint, ready});
  });
  const resume = plan.operations.find((item) => item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) && item.payload.scope === "resume");
  if (resume) decisions.push(Object.freeze({requirementId: "resume", entityType: "news", decision: "resume", operationIds: Object.freeze([resume.id]), reasonCodes: Object.freeze(["final_validation_completed_before_resume"]), evidenceFingerprints: Object.freeze([]), ready: false}));
  const sorted = topologicalSortResolutionGraph(plan.graph);
  const decisionSemantic = decisions.map((item) => ({...item, operationIds: [...item.operationIds], reasonCodes: [...item.reasonCodes], evidenceFingerprints: [...item.evidenceFingerprints]}));
  const inputFingerprint = fp({caseId: input.reviewCase.id, caseVersion: input.reviewCase.version, producer, originalOperation, requirements: requirements.map((item) => ({id: item.id, issueId: item.issueId, role: item.role, entityType: item.entityType, resolutionFingerprint: item.resolution?.resolutionFingerprint, resolutionStatus: item.resolution?.status, candidateId: item.resolution?.candidateId, creationGuardFingerprint: item.creationPreflight?.guardFingerprint, preparedPayloadFingerprint: item.preparedPayload ? fp(item.preparedPayload) : undefined, reconciliationFingerprint: item.reconciliation?.assessmentFingerprint, reconciliationStatus: item.reconciliation?.status, fieldPath: item.fieldPath, referenceId: item.referenceId, dependsOn: [...(item.dependsOn ?? [])].sort(), evidence: item.evidence?.map((entry) => entry.id).sort()})), policy, finalEntityType: input.finalEntityType, completionMode: input.completionMode ?? "resume_producer"});
  return {ok: true, value: Object.freeze({version: TRANSVERSAL_RESOLUTION_PLANNER_VERSION, plan, decisions: Object.freeze(decisions), orderedOperationIds: Object.freeze(sorted.nodeIds), layers: Object.freeze(sorted.layers.map((layer) => Object.freeze([...layer]))), decisionFingerprint: fp(decisionSemantic), inputFingerprint, executionAllowed: false, writes: false})};
}

export const transversalResolutionPlannerSecurity = Object.freeze({writes: false, executes: false, mutatesCase: false, callerDecision: false, reuseBeforeCreate: true, creationGuardRequired: true, ambiguityBlocks: true, validationBeforeResume: true});
