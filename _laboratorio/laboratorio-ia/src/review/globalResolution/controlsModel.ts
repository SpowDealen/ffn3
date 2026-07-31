import {validatePreparedEntity} from "../materialization";
import {getExternalNewsResumeSnapshot} from "../resume/externalNews";
import type {ReviewCase, ReviewJsonObject, ReviewJsonValue} from "../types";
import {capabilityForOperation} from "./capabilities";
import type {ExternalNewsApplicationRecovery, ExternalNewsPlanningInput} from "./externalNewsApplication";
import type {GlobalResolutionSimulationContext} from "./simulateGlobalResolutionPlan";
import {
  buildGlobalResolutionInspectionRequest,
  type GlobalResolutionInspectionEvidence,
  type GlobalResolutionObservation,
} from "./inspection";
import type {GlobalResolutionReconciliationAssessment, GlobalResolutionReconciliationEvidence} from "./reconciliation";

export const GLOBAL_RESOLUTION_CAPABILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "create:luchador": "Crear o reutilizar luchador",
  "replace_reference:noticia:luchador": "Aplicar referencia del luchador",
  "validate:noticia": "Validar noticia",
  "resume:external_news": "Guardar borrador y reanudar",
  "validate:luchador_prepared": "Comprobar datos del luchador",
  "find:luchador": "Buscar luchador existente",
  "resolve_identity:fighter": "Resolver identidad del luchador",
  "reuse:luchador": "Reutilizar luchador existente",
});

export const GLOBAL_RESOLUTION_PHASE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  planned: "Inicializado",
  simulated: "Simulado",
  partially_executed: "Parcialmente ejecutado",
  ready_to_resume: "Listo para reanudar",
  completed: "Completado",
  blocked: "Bloqueado",
  failed: "Fallido",
  reconciliation_required: "Reconciliación necesaria",
});

export const GLOBAL_RESOLUTION_NODE_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  pending: "Pendiente",
  blocked: "Bloqueada",
  ready: "Lista",
  executing: "Ejecutando",
  succeeded: "Completada",
  failed: "Fallida",
  reconciliation_required: "Reconciliación necesaria",
  compensated: "Compensada",
  skipped: "Omitida",
});

export type GlobalResolutionOperationView = {
  operationId: string;
  shortId: string;
  capability: string;
  label: string;
  state: string;
  stateLabel: string;
  dependencyLabels: string[];
  blocker?: string;
  outcome?: string;
  documentId?: string;
  identity?: string;
  support: "contract_only" | "simulatable" | "executable" | "missing";
  canExecute: boolean;
  isPureValidation: boolean;
  isResume: boolean;
};

export type GlobalResolutionControlsView = {
  visible: boolean;
  compatible: boolean;
  recoveryStatus: "absent" | "valid" | "stale" | "invalid";
  recoveryLabel: string;
  phase?: string;
  phaseLabel: string;
  producer: string;
  caseVersion: number;
  updatedAt?: string;
  checkpointFingerprint?: string;
  total: number;
  completed: number;
  ready: number;
  blocked: number;
  reconciliation: number;
  requiresAuthorization: boolean;
  requiresRegeneration: boolean;
  canInitialize: boolean;
  canRegenerate: boolean;
  canDiscardInvalid: boolean;
  canSimulate: boolean;
  canPrepareResume: boolean;
  completedProcess: boolean;
  reasons: string[];
  operations: GlobalResolutionOperationView[];
};

export type GlobalResolutionInspectionUiState =
  | {status: "idle"}
  | {status: "confirming"; operationId: string}
  | {status: "inspecting"; operationId: string}
  | {status: "succeeded"; operationId: string; evidence: GlobalResolutionInspectionEvidence; assessment: GlobalResolutionReconciliationAssessment}
  | {status: "failed"; operationId: string; code: string; message: string; retryable: boolean; assessment?: GlobalResolutionReconciliationAssessment};

export type GlobalResolutionInspectionObservationView = {
  kind: GlobalResolutionObservation["kind"];
  label: string;
  detail?: string;
  fullValue?: string;
};

export type GlobalResolutionInspectionControlView = {
  visible: boolean;
  capability: string;
  capabilityLabel: string;
  state: GlobalResolutionInspectionUiState["status"];
  canConfirm: boolean;
  canCancel: boolean;
  canRetry: boolean;
  canRepair: boolean;
  canEnableRetry: boolean;
  assessmentLabel?: string;
  observations: GlobalResolutionInspectionObservationView[];
  blockers: string[];
  responsive: {wrapLongValues: true; stackActionsBelow: 560};
};

export const GLOBAL_RESOLUTION_ASSESSMENT_LABELS: Readonly<Record<GlobalResolutionReconciliationAssessment["status"], string>> = Object.freeze({
  confirmed_succeeded: "Efecto confirmado",
  confirmed_not_applied: "Efecto no aplicado",
  conflicting_evidence: "Evidencias contradictorias",
  insufficient_evidence: "Evidencia insuficiente",
  already_reconciled: "Operación ya reconciliada",
  technical_failure: "Fallo técnico",
  unsupported: "Inspección no compatible",
  stale_context: "Contexto obsoleto",
});
export const GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS = Object.freeze({
  repair_checkpoint: "Reparar checkpoint",
  enable_retry: "Habilitar nuevo intento",
  inspect_again: "Volver a comprobar",
  none: "",
} as const);

const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const short = (value?: string): string => value ? value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value : "—";

export function abbreviateGlobalResolutionValue(value?: string): string {
  return short(value);
}

export function summarizeGlobalResolutionInspectionObservation(observation: GlobalResolutionObservation): GlobalResolutionInspectionObservationView {
  if (observation.kind === "entity_exists") return {kind: observation.kind, label: observation.entityType === "luchador" ? "Sanity confirma que existe el luchador" : "Sanity confirma que existe la noticia", detail: short(observation.entityId), fullValue: observation.entityId};
  if (observation.kind === "entity_missing") return {kind: observation.kind, label: observation.entityType === "luchador" ? "Sanity no encontró el luchador esperado" : "Sanity no encontró la noticia esperada", detail: observation.expectedId ? short(observation.expectedId) : undefined, fullValue: observation.expectedId};
  if (observation.kind === "reference_exists") return {kind: observation.kind, label: "La noticia contiene la referencia al luchador", detail: short(observation.targetId), fullValue: observation.targetId};
  if (observation.kind === "reference_missing") return {kind: observation.kind, label: "La noticia no contiene la referencia esperada", detail: short(observation.targetId), fullValue: observation.targetId};
  if (observation.kind === "payload_matches") return {kind: observation.kind, label: "El contenido coincide con el fingerprint preparado"};
  if (observation.kind === "payload_differs") return {kind: observation.kind, label: "El documento existe, pero su contenido no coincide completamente"};
  if (observation.kind === "multiple_candidates") return {kind: observation.kind, label: "Se encontraron varias entidades compatibles", detail: `${observation.candidateIds.length} candidatas`};
  return {kind: observation.kind, label: "No fue posible comprobar Sanity en este momento"};
}

export function splitGlobalResolutionReconciliationEvidence(evidence: readonly GlobalResolutionReconciliationEvidence[]): {
  local: GlobalResolutionReconciliationEvidence[];
  sanity: GlobalResolutionReconciliationEvidence[];
} {
  return {
    local: evidence.filter((item) => item.source !== "external_inspector"),
    sanity: evidence.filter((item) => item.source === "external_inspector"),
  };
}

export function buildGlobalResolutionInspectionControlView(input: {
  reviewCase: ReviewCase;
  controls: GlobalResolutionControlsView;
  operationId: string;
  state: GlobalResolutionInspectionUiState;
}): GlobalResolutionInspectionControlView {
  const operation = input.reviewCase.globalResolution?.plan.operations.find((candidate) => candidate.id === input.operationId);
  const node = input.reviewCase.globalResolution?.graph.nodes.find((candidate) => candidate.operationId === input.operationId);
  const capability = operation ? capabilityForOperation(operation) ?? operation.requiredCapability ?? "" : "";
  const criticalResume = input.reviewCase.status === "resumed"
    && input.reviewCase.globalResolution?.phase !== "completed"
    && input.reviewCase.globalResolution?.resume?.operationId === input.operationId;
  const blockers: string[] = [];
  if (input.reviewCase.globalResolution?.producer !== input.reviewCase.context.producer) blockers.push("El productor del checkpoint no coincide con el caso.");
  if (input.controls.recoveryStatus !== "valid") blockers.push("El checkpoint no está vigente.");
  if (node?.state !== "reconciliation_required" && !criticalResume) blockers.push("La operación no está en reconciliación.");
  const request = buildGlobalResolutionInspectionRequest({
    reviewCase: input.reviewCase,
    operationId: input.operationId,
    requestedAt: input.reviewCase.updatedAt,
  });
  if (!request.ok) blockers.push(request.code === "subject_incomplete" ? "Faltan IDs de dominio para construir una inspección cerrada." : "No se puede construir la solicitud de inspección.");
  const current = "operationId" in input.state && input.state.operationId === input.operationId ? input.state : {status: "idle"} as const;
  const assessment = current.status === "succeeded" || current.status === "failed" ? current.assessment : undefined;
  const allowedActions = assessment?.allowedActions ?? [];
  return {
    visible: blockers.length === 0,
    capability,
    capabilityLabel: GLOBAL_RESOLUTION_CAPABILITY_LABELS[capability] ?? "Operación universal",
    state: current.status,
    canConfirm: blockers.length === 0 && ["idle", "confirming", "succeeded", "failed"].includes(current.status),
    canCancel: current.status === "confirming" || current.status === "inspecting",
    canRetry: current.status === "failed" && (allowedActions.includes("inspect_again") || current.retryable),
    canRepair: allowedActions.includes("repair_checkpoint") || assessment?.repairAllowed === true,
    canEnableRetry: allowedActions.includes("enable_retry") || assessment?.retryAllowed === true,
    assessmentLabel: assessment ? GLOBAL_RESOLUTION_ASSESSMENT_LABELS[assessment.status] : undefined,
    observations: current.status === "succeeded" ? current.evidence.observations.map(summarizeGlobalResolutionInspectionObservation) : [],
    blockers,
    responsive: {wrapLongValues: true, stackActionsBelow: 560},
  };
}

function evidenceFor(reviewCase: ReviewCase, issueId: string, draft: ReviewJsonObject) {
  const raw = Array.isArray(draft.sourceEvidence) ? draft.sourceEvidence.filter(object) : [];
  return raw.map((item, index) => ({
    id: `external-news-control:${reviewCase.id}:${issueId}:${index}`,
    kind: typeof item.kind === "string" ? item.kind : "editorial_source",
    source: typeof item.source === "string" ? item.source : typeof item.sourceName === "string" ? item.sourceName : reviewCase.source ?? "ReviewCase",
    value: structuredClone(item) as ReviewJsonValue,
    confidence: typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : .95,
    limitations: Array.isArray(item.limitations) ? item.limitations.filter((value): value is string => typeof value === "string") : [],
  }));
}

export function buildExternalNewsControlPlanningInput(reviewCase: ReviewCase): ExternalNewsPlanningInput {
  const preparedEntities = reviewCase.resolutions.flatMap((resolution) => {
    if (resolution.type !== "create_entity") return [];
    const checked = validatePreparedEntity({issueId: resolution.issueId, entityType: resolution.entityType, draft: resolution.draft});
    const evidence = evidenceFor(reviewCase, resolution.issueId, resolution.draft);
    return [{
      issueId: resolution.issueId,
      entityType: resolution.entityType,
      draft: structuredClone(resolution.draft),
      identityKey: checked.entity?.identityKey ?? (typeof resolution.draft.identityKey === "string" ? resolution.draft.identityKey : undefined),
      valid: checked.valid,
      evidence,
    }];
  });
  return {preparedEntities, evidence: preparedEntities.flatMap((prepared) => prepared.evidence.map((item) => ({...item, issueId: prepared.issueId}))), finalEntityType: "noticia"};
}

export function buildExternalNewsControlSimulationContext(reviewCase: ReviewCase): GlobalResolutionSimulationContext {
  const snapshot = getExternalNewsResumeSnapshot(reviewCase.context);
  const producer = typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : "";
  if (producer === "external_news" && (!snapshot.complete || !snapshot.snapshot)) throw new Error(`Snapshot incompleto: ${snapshot.missingFields.join(", ")}.`);
  const planning = buildExternalNewsControlPlanningInput(reviewCase);
  return {
    reviewCase,
    preparedEntities: planning.preparedEntities.filter((item) => item.entityType === "fighter").map((item) => ({issueId: item.issueId, entityType: "fighter", draft: structuredClone(item.draft)})),
    fighterCandidates: [],
    newsPayload: snapshot.snapshot ? structuredClone(snapshot.snapshot.payload) : undefined,
    producerContracts: [{producer, supportsSimulation: true, allowsProjectedReferences: producer === "external_news"}],
  };
}

function recoveryLabel(status: GlobalResolutionControlsView["recoveryStatus"]): string {
  if (status === "absent") return "Resolución universal no inicializada";
  if (status === "stale") return "El checkpoint ya no coincide con el caso actual";
  if (status === "invalid") return "Checkpoint inválido";
  return "Checkpoint vigente";
}

export function buildGlobalResolutionControlsView(reviewCase: ReviewCase, integrated?: ExternalNewsApplicationRecovery): GlobalResolutionControlsView {
  const producer = typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : "";
  const compatible = ["external_news", "ufc_events", "one_events", "bkfc_events", "fekm_participants"].includes(producer);
  const recoveryStatus = integrated?.checkpointStatus ?? (reviewCase.globalResolution ? "invalid" : "absent");
  const valid = integrated?.recovery.status === "valid" ? integrated.recovery : undefined;
  const checkpoint = valid?.checkpoint;
  const capabilitySupport = new Map(integrated?.catalog.capabilities.map((item) => [item.id, item.support]) ?? []);
  const operations: GlobalResolutionOperationView[] = valid ? valid.graph.nodes.map((node) => {
    const capability = capabilityForOperation(node.operation) ?? node.operation.requiredCapability ?? "capability:unknown";
    const support = capabilitySupport.get(capability) ?? "missing";
    const execution = checkpoint?.execution?.operations.filter((item) => item.operationId === node.operation.id).at(-1);
    const reference = checkpoint?.referenceResolution?.operationId === node.operation.id || checkpoint?.referenceResolution?.replacementOperationId === node.operation.id ? checkpoint.referenceResolution : undefined;
    const dependencyLabels = node.dependencyIds.map((dependencyId) => {
      const dependency = valid.graph.nodes.find((candidate) => candidate.id === dependencyId);
      if (!dependency) return "Dependencia no disponible";
      const dependencyCapability = capabilityForOperation(dependency.operation) ?? dependency.operation.requiredCapability ?? dependency.operation.kind;
      return GLOBAL_RESOLUTION_CAPABILITY_LABELS[dependencyCapability] ?? dependency.operation.kind;
    });
    return {
      operationId: node.operation.id,
      shortId: short(node.operation.id),
      capability,
      label: GLOBAL_RESOLUTION_CAPABILITY_LABELS[capability] ?? "Operación editorial",
      state: node.state,
      stateLabel: GLOBAL_RESOLUTION_NODE_STATE_LABELS[node.state] ?? node.state,
      dependencyLabels,
      blocker: node.error?.message,
      outcome: execution?.outcome ?? (object(node.result?.output) && typeof node.result.output.outcome === "string" ? node.result.output.outcome : undefined),
      documentId: execution?.documentId ?? reference?.documentId,
      identity: reference?.identityKey ?? (typeof node.operation.target?.identityKey === "string" ? node.operation.target.identityKey : undefined),
      support,
      canExecute: node.state === "ready" && (support === "executable" || capability === "resolve_identity:fighter") && !node.isResumeNode && checkpoint?.phase !== "reconciliation_required",
      isPureValidation: capability === "validate:noticia",
      isResume: node.isResumeNode,
    };
  }) : [];
  const completed = operations.filter((item) => ["succeeded", "compensated", "skipped"].includes(item.state)).length;
  const ready = operations.filter((item) => item.state === "ready").length;
  const blocked = operations.filter((item) => ["blocked", "failed"].includes(item.state)).length;
  const storedReconciliationIds = reviewCase.globalResolution?.graph.nodes.filter((item) => item.state === "reconciliation_required").map((item) => item.operationId) ?? [];
  if (reviewCase.status === "resumed" && reviewCase.globalResolution?.phase !== "completed" && reviewCase.globalResolution?.resume?.operationId) storedReconciliationIds.push(reviewCase.globalResolution.resume.operationId);
  const reconciliation = Math.max(operations.filter((item) => item.state === "reconciliation_required").length, new Set(storedReconciliationIds).size);
  const resumeReady = operations.some((item) => item.isResume && item.state === "ready");
  const reasons = [...new Set(integrated?.reasons ?? (recoveryStatus === "invalid" ? ["El checkpoint no supera la validación de integridad."] : []))];
  return {
    visible: compatible,
    compatible,
    recoveryStatus,
    recoveryLabel: recoveryLabel(recoveryStatus),
    phase: checkpoint?.phase,
    phaseLabel: checkpoint ? GLOBAL_RESOLUTION_PHASE_LABELS[checkpoint.phase] ?? checkpoint.phase : recoveryLabel(recoveryStatus),
    producer: producer || "no disponible",
    caseVersion: reviewCase.version,
    updatedAt: checkpoint?.updatedAt,
    checkpointFingerprint: checkpoint?.checkpointFingerprint,
    total: operations.length,
    completed,
    ready,
    blocked,
    reconciliation,
    requiresAuthorization: integrated?.authorizationRequired ?? false,
    requiresRegeneration: integrated?.regenerationRequired ?? recoveryStatus === "stale",
    canInitialize: compatible && recoveryStatus === "absent" && !["resuming", "resumed", "dismissed"].includes(reviewCase.status),
    canRegenerate: compatible && recoveryStatus === "stale" && !["resuming", "resumed", "dismissed"].includes(reviewCase.status),
    canDiscardInvalid: compatible && recoveryStatus === "invalid" && Boolean(reviewCase.globalResolution) && !["resuming", "resumed", "dismissed"].includes(reviewCase.status),
    canSimulate: Boolean(valid?.continuation.canSimulate && checkpoint?.phase !== "completed" && checkpoint?.phase !== "reconciliation_required"),
    canPrepareResume: Boolean(valid && resumeReady && checkpoint?.phase !== "completed"),
    completedProcess: checkpoint?.phase === "completed" || reviewCase.status === "resumed",
    reasons,
    operations,
  };
}

export type GlobalResolutionRequestToken = {id: number; caseId: string};

export class GlobalResolutionRequestGate {
  private sequence = 0;
  private active?: GlobalResolutionRequestToken;

  begin(caseId: string): GlobalResolutionRequestToken | undefined {
    if (this.active) return undefined;
    const token = {id: ++this.sequence, caseId};
    this.active = token;
    return token;
  }

  isCurrent(token: GlobalResolutionRequestToken, caseId: string): boolean {
    return this.active?.id === token.id && token.caseId === caseId;
  }

  finish(token: GlobalResolutionRequestToken): void {
    if (this.active?.id === token.id) this.active = undefined;
  }

  cancel(): void {
    this.active = undefined;
    this.sequence += 1;
  }

  get busy(): boolean {
    return Boolean(this.active);
  }
}
