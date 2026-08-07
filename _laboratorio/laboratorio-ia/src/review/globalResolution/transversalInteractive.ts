import type {ContentTypeId} from "../../types";
import {deriveResolutionNodeReadiness} from "../resolutionGraph";
import type {EntityResolutionResult, UniversalEntityType} from "../entityIdentity";
import type {OperationEvidence} from "../entityOperations";
import type {ReviewCase, ReviewIssue, ReviewResolution, ReviewValueKind} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {pilotCapabilityRegistry, type GlobalResolutionCapability} from "./capabilities";
import {createGlobalResolutionCheckpoint} from "./checkpoint/checkpoint";
import {recoverGlobalResolutionCheckpoint} from "./checkpoint/recovery";
import type {GlobalResolutionCheckpoint, GlobalResolutionRecoveryEnvironment, GlobalResolutionRecoveryResult} from "./checkpoint/types";
import {buildTransversalResolutionPlan, type TransversalPlanningRequirement, type TransversalResolutionDecision, type TransversalResolutionDecisionKind, type TransversalResolutionPlan} from "./transversalPlanning";

export const TRANSVERSAL_INTERACTIVE_PLANNER_VERSION = "1.0.0" as const;

type SafePlanAction = TransversalResolutionDecisionKind;
type PlanEntityType = Exclude<UniversalEntityType, "result">;

export type TransversalPlanOperationView = Readonly<{
  id: string;
  action: SafePlanAction;
  entityType: string;
  explanation: string;
  reasonCodes: readonly string[];
  dependencyIds: readonly string[];
  evidenceCount: number;
  ready: boolean;
  readinessReasons: readonly string[];
}>;

export type TransversalPlanView = Readonly<{
  source: "generated" | "recovered";
  status: "fresh" | "stale" | "invalid" | "absent";
  planFingerprint?: string;
  graphFingerprint?: string;
  decisionFingerprint?: string;
  inputFingerprint?: string;
  checkpoint?: Readonly<{id: string; phase: string; fingerprint: string; updatedAt: string}>;
  operations: readonly TransversalPlanOperationView[];
  blockers: readonly Readonly<{code: string; message: string; requiredAction: string}>[];
  recoveryReasons: readonly string[];
  readyOperationIds: readonly string[];
  executionAllowed: false;
  writes: false;
}>;

export type TransversalInteractiveGeneration = Readonly<{
  transversal: TransversalResolutionPlan;
  checkpoint: GlobalResolutionCheckpoint;
  view: TransversalPlanView;
}>;

const universalByValueKind: Readonly<Partial<Record<ReviewValueKind, PlanEntityType>>> = Object.freeze({
  fighter: "fighter",
  event: "event",
  organization: "organization",
  category: "weight_category",
  discipline: "discipline",
  fight: "fight",
});

const universalByName: Readonly<Record<string, PlanEntityType>> = Object.freeze({
  fighter: "fighter", luchador: "fighter", event: "event", evento: "event", organization: "organization", organizacion: "organization",
  category: "weight_category", categoria: "weight_category", categoriapeso: "weight_category", weight_category: "weight_category",
  discipline: "discipline", disciplina: "discipline", fight: "fight", combate: "fight", news: "news", noticia: "news",
});

const contentTypeByUniversal: Readonly<Record<PlanEntityType, ContentTypeId | undefined>> = Object.freeze({
  fighter: "luchador", event: "evento", organization: "organizacion", weight_category: "categoriaPeso", discipline: "disciplina", fight: "combate", news: "noticia",
});

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function entityType(value: unknown, fallback: PlanEntityType = "news"): PlanEntityType {
  return universalByName[text(value).replace(/\s+/g, "").toLocaleLowerCase("es")] ?? fallback;
}

function issueEntityType(issue: ReviewIssue, fallback: PlanEntityType): PlanEntityType {
  const candidateType = issue.candidates?.find((candidate) => text(candidate.entityType))?.entityType;
  return entityType(candidateType, universalByValueKind[issue.valueKind ?? "text"] ?? fallback);
}

function evidenceFor(issue: ReviewIssue): OperationEvidence[] {
  return [{
    id: `review-case:${issue.id}`,
    kind: "review_issue",
    source: "review_center",
    confidence: issue.blocking ? .9 : issue.required ? .75 : .6,
    limitations: issue.evidence?.length ? ["La evidencia detallada se mantiene en el caso y no se muestra en este resumen."] : ["No hay evidencia externa normalizada todavía."],
  }];
}

function resultFor(entity: PlanEntityType, status: EntityResolutionResult["status"], issue: ReviewIssue, candidateId?: string): EntityResolutionResult {
  const semantic = {entity, status, issueId: issue.id, candidateId: candidateId ?? null};
  return {
    entityType: entity,
    status,
    candidateId,
    candidates: [],
    reasonCodes: [status === "reuse" ? "editorial_candidate_selected" : status],
    inputFingerprint: computeUniversalFingerprint({scope: "transversal_interactive", ...semantic}),
    resolutionFingerprint: computeUniversalFingerprint({kind: "resolution", ...semantic}),
  };
}

function resolutionFor(issue: ReviewIssue, resolution: ReviewResolution | undefined, fallback: PlanEntityType): TransversalPlanningRequirement {
  const selected = resolution?.type === "select_candidate"
    ? issue.candidates?.find((candidate) => candidate.id === resolution.candidateId)
    : undefined;
  const type = issueEntityType(issue, fallback);
  const base = {id: `issue:${issue.id}`, issueId: issue.id, entityType: type, evidence: evidenceFor(issue), required: issue.required};
  if (resolution?.type === "link_reference") return {...base, role: "repair_reference" as const, referenceId: resolution.sanityId, fieldPath: issue.fieldPath};
  if (resolution?.type === "select_candidate" && selected) return {...base, role: "entity" as const, entityType: entityType(selected.entityType, type), resolution: resultFor(entityType(selected.entityType, type), "reuse", issue, selected.sanityId ?? selected.id), fieldPath: issue.fieldPath};
  if (resolution?.type === "create_entity") {
    const creationType = entityType(resolution.entityType, type);
    return {...base, role: "entity" as const, entityType: creationType, resolution: resultFor(creationType, "create_new", issue), preparedPayload: resolution.draft, fieldPath: issue.fieldPath};
  }
  if (resolution?.type === "set_value" || resolution?.type === "select_image" || resolution?.type === "accept_value" || resolution?.type === "confirm_duplicate" || resolution?.type === "reject_duplicate" || resolution?.type === "discard") return {...base, role: "validate" as const};
  if (issue.kind === "ambiguous_reference" || issue.kind === "duplicate_candidate" || issue.kind === "contradictory_data") return {...base, role: "entity" as const, resolution: resultFor(type, "ambiguous", issue)};
  if (issue.kind === "missing_reference" && text(issue.fieldPath)) return {...base, role: "repair_reference" as const, fieldPath: issue.fieldPath};
  return {...base, role: "entity" as const};
}

/** Converts existing review decisions into B5 requirements; it does not query, create, or execute. */
export function deriveTransversalPlanningRequirements(reviewCase: ReviewCase): readonly TransversalPlanningRequirement[] {
  const fallback = entityType(reviewCase.subject.type);
  const resolutions = new Map(reviewCase.resolutions.map((resolution) => [resolution.issueId, resolution]));
  const requirements = reviewCase.issues.map((issue) => resolutionFor(issue, resolutions.get(issue.id), fallback));
  if (requirements.length) return requirements.sort((left, right) => left.id.localeCompare(right.id));
  return [{id: "case:validation", role: "validate", entityType: fallback, evidence: [{id: `review-case:${reviewCase.id}:empty`, kind: "review_case", source: "review_center", confidence: .5, limitations: ["El caso no contiene incidencias concretas."]}]}];
}

function capabilitiesFor(plan: TransversalResolutionPlan): GlobalResolutionCapability[] {
  const known = new Map(pilotCapabilityRegistry.list().map((capability) => [capability.id, capability]));
  for (const capability of plan.plan.requiredCapabilities) if (!known.has(capability)) known.set(capability, {id: capability, support: "contract_only", operationKinds: ["find_entity", "create_entity", "reuse_entity", "replace_reference", "validate_entity"], description: "Capacidad declarativa del plan transversal; no ejecutable desde el Centro de Revisión."});
  return [...known.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function decisionForOperation(operationId: string, plan: TransversalResolutionPlan | undefined): TransversalResolutionDecision | undefined {
  return plan?.decisions.find((decision) => decision.operationIds.includes(operationId));
}

function actionFromOperation(operation: {kind: string; payload?: unknown}): SafePlanAction {
  const payload = operation.payload && typeof operation.payload === "object" && !Array.isArray(operation.payload) ? operation.payload as Record<string, unknown> : undefined;
  if (payload?.scope === "resume") return "resume";
  if (operation.kind === "reuse_entity") return "reuse";
  if (operation.kind === "create_entity") return "create";
  if (operation.kind === "find_entity") return "investigate";
  if (operation.kind === "replace_reference") return "repair_reference";
  return "validate";
}

function viewFrom(plan: TransversalResolutionPlan, checkpoint: GlobalResolutionCheckpoint | undefined, source: "generated" | "recovered", recovery?: GlobalResolutionRecoveryResult): TransversalPlanView {
  const graph = checkpoint ? recovery?.status === "valid" ? recovery.graph : plan.plan.graph : plan.plan.graph;
  const operations = plan.orderedOperationIds.map((id) => plan.plan.operations.find((operation) => operation.id === id)).filter((operation): operation is TransversalResolutionPlan["plan"]["operations"][number] => Boolean(operation)).map((operation) => {
    const decision = decisionForOperation(operation.id, plan);
    const readiness = deriveResolutionNodeReadiness(graph, operation.id);
    return {id: operation.id, action: decision?.decision ?? actionFromOperation(operation), entityType: operation.entityType, explanation: operation.explanation, reasonCodes: decision?.reasonCodes ?? [], dependencyIds: [...operation.dependencyIds], evidenceCount: operation.evidence.length, ready: readiness.ready && decision?.ready !== false, readinessReasons: readiness.reasons};
  });
  const recoveryReasons = recovery?.status === "stale" || recovery?.status === "invalid" ? recovery.reasons : [];
  return {
    source,
    status: recovery?.status === "stale" ? "stale" : recovery?.status === "invalid" ? "invalid" : "fresh",
    planFingerprint: plan.plan.fingerprint,
    graphFingerprint: checkpoint?.graphFingerprint ?? plan.plan.graph.fingerprint,
    decisionFingerprint: plan.decisionFingerprint,
    inputFingerprint: plan.inputFingerprint,
    checkpoint: checkpoint ? {id: checkpoint.id, phase: checkpoint.phase, fingerprint: checkpoint.checkpointFingerprint, updatedAt: checkpoint.updatedAt} : undefined,
    operations,
    blockers: plan.plan.blockers.map((item) => ({code: item.code, message: item.message, requiredAction: item.requiredAction})),
    recoveryReasons,
    readyOperationIds: operations.filter((operation) => operation.ready).map((operation) => operation.id),
    executionAllowed: false,
    writes: false,
  };
}

function recoveredTransversal(checkpoint: GlobalResolutionCheckpoint, recovery: Extract<GlobalResolutionRecoveryResult, {status: "valid"}>): TransversalResolutionPlan {
  const orderedOperationIds = recovery.graph.nodes.map((node) => node.operation.id);
  return {version: "1.0.0", plan: recovery.plan, decisions: [], orderedOperationIds, layers: [], decisionFingerprint: computeUniversalFingerprint({recovered: checkpoint.planFingerprint, graph: checkpoint.graphFingerprint}), inputFingerprint: computeUniversalFingerprint({recovered: checkpoint.caseFingerprint}), executionAllowed: false, writes: false};
}

export function buildTransversalInteractiveRecoveryEnvironment(checkpoint: GlobalResolutionCheckpoint): GlobalResolutionRecoveryEnvironment {
  const known = new Map(pilotCapabilityRegistry.list().map((capability) => [capability.id, capability.support]));
  for (const requirement of checkpoint.plan.capabilityRequirements) if (!known.has(requirement.id)) known.set(requirement.id, requirement.support);
  return {capabilities: [...known].map(([id, support]) => ({id, support})).sort((left, right) => left.id.localeCompare(right.id)), executors: checkpoint.plan.executorRequirements.map((executor) => ({...executor})), producers: checkpoint.producerManifest ? [checkpoint.producerManifest] : []};
}

export function recoverTransversalPlanView(reviewCase: ReviewCase): TransversalPlanView {
  if (!reviewCase.globalResolution) return {source: "recovered", status: "absent", operations: [], blockers: [], recoveryReasons: [], readyOperationIds: [], executionAllowed: false, writes: false};
  const recovery = recoverGlobalResolutionCheckpoint(reviewCase, buildTransversalInteractiveRecoveryEnvironment(reviewCase.globalResolution));
  if (recovery.status !== "valid") return {source: "recovered", status: recovery.status, checkpoint: recovery.status === "stale" ? {id: recovery.checkpoint.id, phase: recovery.checkpoint.phase, fingerprint: recovery.checkpoint.checkpointFingerprint, updatedAt: recovery.checkpoint.updatedAt} : undefined, operations: [], blockers: [], recoveryReasons: recovery.status === "absent" ? [] : recovery.reasons, readyOperationIds: [], executionAllowed: false, writes: false};
  return viewFrom(recoveredTransversal(recovery.checkpoint, recovery), recovery.checkpoint, "recovered", recovery);
}

/** Builds a read-only plan and an AU3-compatible planned checkpoint. Persistence is deliberately left to the caller. */
export function generateTransversalPlanForReviewCase(reviewCase: ReviewCase, now?: () => string): TransversalInteractiveGeneration {
  const requirements = deriveTransversalPlanningRequirements(reviewCase);
  const finalEntityType = contentTypeByUniversal[entityType(reviewCase.subject.type)];
  const capabilityIds = unique([...pilotCapabilityRegistry.list().map((capability) => capability.id), "resume:review_center", "validate:noticia", "validate:evento", "validate:combate", "validate:organizacion", "validate:categoriaPeso", "validate:disciplina"]);
  const result = buildTransversalResolutionPlan({reviewCase, requirements, producer: "review_center", originalOperation: "transversal_resolution", completionMode: reviewCase.resumeAction ? "resume_producer" : "entity_resolution", finalEntityType, policy: {availableCapabilities: capabilityIds}, now});
  if (!result.ok) throw new Error(`transversal_plan_blocked:${result.blockers.map((blocker) => blocker.code).join(",")}`);
  const checkpoint = createGlobalResolutionCheckpoint({reviewCase, plan: result.value.plan, capabilities: capabilitiesFor(result.value), phase: "planned", history: [{id: `planned:${result.value.plan.fingerprint.slice(-16)}`, kind: "planned", status: "planned", occurredAt: (now ?? (() => new Date().toISOString()))()}], now});
  return {transversal: result.value, checkpoint, view: viewFrom(result.value, checkpoint, "generated")};
}

export const transversalInteractiveSecurity = Object.freeze({writes: false, executes: false, automaticOperations: false, persistsOnlyCheckpoint: true, payloadsExposed: false});
