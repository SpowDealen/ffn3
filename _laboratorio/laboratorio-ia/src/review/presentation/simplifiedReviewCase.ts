import {canResolveReviewCase} from "../cases/validateResolution";
import {getConfidenceLevel, REVIEW_MODULE_LABELS, REVIEW_PRIORITY_LABELS} from "../formatters";
import {deriveReviewCaseHumanLabels} from "../intake";
import type {
  ReviewCandidate,
  ReviewCase,
  ReviewIssue,
  ReviewJsonObject,
  ReviewResolution,
} from "../types";

export const SIMPLIFIED_REVIEW_CASE_VERSION = "1.0.0" as const;

export const SIMPLIFIED_REVIEW_QUESTIONS = Object.freeze([
  "¿Qué pasa?",
  "¿Por qué?",
  "¿Qué recomienda el Lab?",
  "¿Qué ocurrirá si apruebo?",
] as const);

export type SimplifiedReviewConfidence = Readonly<{
  value: number;
  label: "Baja" | "Media" | "Alta";
}>;

export type SimplifiedReviewCandidate = Readonly<{
  id: string;
  label: string;
  confidence?: SimplifiedReviewConfidence;
  role: "recommended" | "alternative" | "possible";
}>;

export type SimplifiedReviewCasePresentation = Readonly<{
  version: typeof SIMPLIFIED_REVIEW_CASE_VERSION;
  sourceLabel: string;
  entityLabel: string;
  priorityLabel: string;
  statusLabel: string;
  problem: Readonly<{title: string; summary: string}>;
  why: Readonly<{
    summary: string;
    candidates: readonly SimplifiedReviewCandidate[];
    evidence: readonly string[];
  }>;
  recommendation: Readonly<{
    available: boolean;
    summary: string;
    confidence?: SimplifiedReviewConfidence;
    alternative?: string;
  }>;
  expectedEffect: Readonly<{
    available: boolean;
    summary: string;
    resumePending: boolean;
  }>;
  actions: Readonly<{
    approve: boolean;
    change: boolean;
    dismiss: boolean;
    beginReview: boolean;
    reopen: boolean;
    remove: boolean;
    unavailableReason?: string;
  }>;
  presentationOnly: true;
  writes: false;
}>;

const TECHNICAL_TEXT = /\b(?:au[2-9]|checkpoint|fingerprint|payload|sufficiency|capability|transaction(?:al)?|idempotency|inspection id)\b/i;
const SECRET_TEXT = /(?:bearer\s+|token|secret|authorization|cookie|password|api[_-]?key)/i;

const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  open: "Pendiente de revisión",
  in_review: "En revisión",
  resolved: "Resuelto",
  resuming: "Resolviendo",
  resumed: "Resuelto",
  resume_failed: "No se pudo continuar el flujo",
  stale: "Información desactualizada",
  dismissed: "Descartado",
  reconciliation_required: "Necesita verificar el resultado",
  compensation_required: "Necesita corregir una operación parcial",
  unsupported: "Este caso no puede resolverse automáticamente",
  blocked: "Necesita una decisión antes de continuar",
  ready: "Listo para resolver",
  executing: "Resolviendo",
  executed: "Resuelto",
  completed: "Resuelto",
  awaiting_authorization: "Necesita autorización humana",
  human_review_required: "Necesita revisión humana",
});

const ISSUE_REASONS: Readonly<Record<ReviewIssue["kind"], string>> = Object.freeze({
  required_field: "Falta un dato obligatorio para completar este caso.",
  invalid_value: "El dato disponible no cumple las condiciones editoriales esperadas.",
  missing_image: "Falta una imagen válida para completar el contenido.",
  invalid_url: "El enlace disponible no es válido.",
  missing_reference: "Falta la relación editorial necesaria para continuar.",
  ambiguous_reference: "Hay más de una relación posible y no se puede elegir con seguridad.",
  missing_entity: "No encontramos la entidad editorial necesaria.",
  duplicate_candidate: "Hay indicios de que dos registros podrían representar lo mismo.",
  contradictory_data: "Las fuentes disponibles no coinciden entre sí.",
  low_confidence: "La evidencia disponible todavía no permite decidir con seguridad.",
  insufficient_content: "El contenido disponible no aporta información suficiente.",
  recoverable_error: "La operación anterior no pudo completarse y requiere revisión.",
  partial_creation: "La operación quedó completada solo en parte.",
  blocked_dependency: "Falta resolver una dependencia necesaria antes de continuar.",
});

function object(value: unknown): ReviewJsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ReviewJsonObject
    : undefined;
}

function safeHumanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || SECRET_TEXT.test(compact) || TECHNICAL_TEXT.test(compact)) return undefined;
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact;
}

function candidateLabel(candidate: ReviewCandidate): string {
  return safeHumanText(candidate.label) ?? "una opción identificada";
}

function normalizedConfidence(candidate: ReviewCandidate | undefined): number | undefined {
  if (!candidate || typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence)) return undefined;
  const normalized = candidate.confidence <= 1 ? candidate.confidence * 100 : candidate.confidence;
  return normalized >= 0 && normalized <= 100 ? normalized : undefined;
}

function confidence(candidate: ReviewCandidate | undefined): SimplifiedReviewConfidence | undefined {
  const value = normalizedConfidence(candidate);
  return value === undefined ? undefined : Object.freeze({value, label: getConfidenceLevel(value)});
}

function confidenceValue(value: number | undefined): SimplifiedReviewConfidence | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = value <= 1 ? value * 100 : value;
  return normalized >= 0 && normalized <= 100
    ? Object.freeze({value: normalized, label: getConfidenceLevel(normalized)})
    : undefined;
}

function selectedCandidate(issue: ReviewIssue | undefined, resolution: ReviewResolution | undefined): ReviewCandidate | undefined {
  return resolution?.type === "select_candidate"
    ? issue?.candidates?.find((candidate) => candidate.id === resolution.candidateId)
    : undefined;
}

function recommendedCandidate(issue: ReviewIssue | undefined): ReviewCandidate | undefined {
  const candidates = [...(issue?.candidates ?? [])].sort((left, right) => {
    const confidenceDelta = (normalizedConfidence(right) ?? -1) - (normalizedConfidence(left) ?? -1);
    return confidenceDelta || left.id.localeCompare(right.id);
  });
  const first = candidates[0];
  const second = candidates[1];
  const firstConfidence = normalizedConfidence(first);
  const secondConfidence = normalizedConfidence(second);
  if (firstConfidence === undefined || firstConfidence < 80) return undefined;
  if (secondConfidence !== undefined && firstConfidence - secondConfidence < 15) return undefined;
  return first;
}

function recommendationFromResolution(
  issue: ReviewIssue | undefined,
  resolution: ReviewResolution,
): {summary: string; candidate?: ReviewCandidate} {
  const candidate = selectedCandidate(issue, resolution);
  switch (resolution.type) {
    case "select_candidate":
      return candidate
        ? {summary: `Recomendamos usar ${candidateLabel(candidate)}.`, candidate}
        : {summary: "Recomendamos usar la opción que ya está seleccionada."};
    case "link_reference": return {summary: "Recomendamos vincular la referencia que ya está seleccionada."};
    case "create_entity": return {summary: "Recomendamos crear o reutilizar la entidad necesaria con la propuesta existente."};
    case "select_image": return {summary: "Recomendamos usar la imagen ya seleccionada."};
    case "confirm_duplicate": return {summary: "Recomendamos tratar ambos registros como la misma entidad."};
    case "reject_duplicate": return {summary: "Recomendamos mantener los registros como entidades distintas."};
    case "set_value": return {summary: "Recomendamos aplicar la corrección ya preparada."};
    case "accept_value": return {summary: "Recomendamos conservar el valor actual."};
    case "discard": return {summary: "Recomendamos descartar esta incidencia con el motivo registrado."};
    case "retry": return {summary: "La propuesta existente solicita volver a intentar la operación desde su autoridad original."};
  }
}

function recommendationFromCheckpoint(reviewCase: ReviewCase): {summary: string; confidence?: SimplifiedReviewConfidence} | undefined {
  const plan = reviewCase.globalResolution?.plan;
  const operations = plan?.operations ?? [];
  const operation = operations.length === 1 ? operations[0] : undefined;
  if (!operation || !plan?.structurallyValid || plan.blockers.length > 0 || operation.evidence.length === 0 || (confidenceValue(operation.confidence)?.value ?? -1) < 80) return undefined;
  const operationConfidence = confidenceValue(operation.confidence);
  switch (operation.kind) {
    case "reuse_entity": return {summary: "Recomendamos reutilizar la entidad identificada por la propuesta existente.", confidence: operationConfidence};
    case "create_entity": return {summary: "Recomendamos crear la entidad prevista por la propuesta existente.", confidence: operationConfidence};
    case "update_entity": return {summary: "Recomendamos aplicar la actualización editorial ya preparada.", confidence: operationConfidence};
    case "find_entity": return {summary: "Recomendamos comprobar la entidad indicada por la propuesta existente.", confidence: operationConfidence};
    case "merge_entities": return {summary: "Recomendamos unificar las entidades indicadas por la propuesta existente.", confidence: operationConfidence};
    case "replace_reference": return {summary: "Recomendamos sustituir la referencia indicada por la propuesta existente.", confidence: operationConfidence};
    case "remove_reference": return {summary: "Recomendamos retirar la referencia indicada por la propuesta existente.", confidence: operationConfidence};
    case "repair_relationship": return {summary: "Recomendamos corregir la relación editorial ya preparada.", confidence: operationConfidence};
    case "set_metadata": return {summary: "Recomendamos aplicar los datos editoriales ya preparados.", confidence: operationConfidence};
    case "replace_image": return {summary: "Recomendamos sustituir la imagen con la propuesta existente.", confidence: operationConfidence};
    case "validate_entity": return {summary: "Recomendamos validar la entidad con la comprobación ya preparada.", confidence: operationConfidence};
    default: return undefined;
  }
}

function recommendationFor(reviewCase: ReviewCase, issue: ReviewIssue | undefined, resolution: ReviewResolution | undefined): SimplifiedReviewCasePresentation["recommendation"] {
  if (resolution) {
    const existing = recommendationFromResolution(issue, resolution);
    const alternativeCandidate = issue?.candidates?.find((candidate) => candidate.id !== existing.candidate?.id);
    const alternative = alternativeCandidate ? candidateLabel(alternativeCandidate) : undefined;
    return Object.freeze({
      available: true,
      summary: existing.summary,
      confidence: confidence(existing.candidate),
      alternative: alternative ? `Como alternativa, puedes elegir ${alternative}.` : undefined,
    });
  }

  const checkpointRecommendation = recommendationFromCheckpoint(reviewCase);
  if (checkpointRecommendation) return Object.freeze({available: true, ...checkpointRecommendation});

  const candidate = recommendedCandidate(issue);
  if (candidate) {
    const alternativeCandidate = issue?.candidates?.find((item) => item.id !== candidate.id);
    const alternative = alternativeCandidate ? candidateLabel(alternativeCandidate) : undefined;
    return Object.freeze({
      available: true,
      summary: `La evidencia existente favorece ${candidateLabel(candidate)}.`,
      confidence: confidence(candidate),
      alternative: alternative ? `Como alternativa, puedes elegir ${alternative}.` : undefined,
    });
  }

  return Object.freeze({
    available: false,
    summary: "No hay una recomendación segura todavía. Necesitamos una decisión manual.",
  });
}

function hasResumePending(reviewCase: ReviewCase): boolean {
  const intake = object(reviewCase.context.unifiedReviewIntake);
  const resume = object(intake?.resume);
  const checkpointOutcome = reviewCase.globalResolution?.resume?.outcome;
  return Boolean(
    reviewCase.resumeAction ||
    (resume && Object.keys(resume).length > 0) ||
    (reviewCase.globalResolution?.resume && checkpointOutcome !== "resumed" && checkpointOutcome !== "already_resumed"),
  );
}

function resolutionEffect(issue: ReviewIssue | undefined, resolution: ReviewResolution): string {
  const candidate = selectedCandidate(issue, resolution);
  switch (resolution.type) {
    case "select_candidate": return candidate
      ? `La referencia quedará asociada a ${candidateLabel(candidate)} cuando la autoridad del flujo aplique esta decisión.`
      : "La referencia quedará asociada a la opción seleccionada cuando la autoridad del flujo aplique esta decisión.";
    case "link_reference": return "La referencia actual será sustituida por la seleccionada cuando el flujo correspondiente aplique la decisión.";
    case "create_entity": return "Quedará autorizada la propuesta de crear o reutilizar la entidad necesaria; esta pantalla no ejecutará esa operación.";
    case "select_image": return "La imagen seleccionada quedará registrada como resolución del caso.";
    case "confirm_duplicate": return "La decisión de tratar ambos registros como una misma entidad quedará registrada.";
    case "reject_duplicate": return "La decisión de mantener ambos registros separados quedará registrada.";
    case "set_value": return "La corrección preparada quedará registrada como resolución del dato pendiente.";
    case "accept_value": return "El valor actual quedará aceptado para esta incidencia.";
    case "discard": return "La incidencia quedará descartada con el motivo registrado.";
    case "retry": return "La solicitud de reintento quedará registrada; no se ejecutará desde esta pantalla.";
  }
}

function checkpointEffect(reviewCase: ReviewCase): string | undefined {
  const operations = reviewCase.globalResolution?.plan.operations ?? [];
  if (operations.length !== 1) return undefined;
  switch (operations[0].kind) {
    case "reuse_entity": return "La entidad existente quedará preparada para reutilizarse cuando la autoridad del flujo ejecute la propuesta.";
    case "create_entity": return "La entidad propuesta podrá crearse cuando la autoridad correspondiente autorice y ejecute la operación.";
    case "update_entity": return "La actualización preparada podrá aplicarse cuando la autoridad correspondiente la ejecute.";
    case "find_entity": return "La entidad indicada podrá comprobarse cuando la autoridad correspondiente ejecute la propuesta.";
    case "merge_entities": return "Las entidades indicadas podrán unificarse cuando la autoridad correspondiente ejecute la propuesta.";
    case "replace_reference": return "La referencia actual podrá sustituirse cuando la autoridad correspondiente ejecute la propuesta.";
    case "remove_reference": return "La referencia indicada podrá retirarse cuando la autoridad correspondiente ejecute la propuesta.";
    case "repair_relationship": return "La relación editorial podrá corregirse cuando la autoridad correspondiente ejecute la propuesta.";
    case "set_metadata": return "Los datos editoriales preparados podrán aplicarse cuando la autoridad correspondiente ejecute la propuesta.";
    case "replace_image": return "La imagen podrá sustituirse cuando la autoridad correspondiente ejecute la propuesta.";
    case "validate_entity": return "La entidad podrá validarse cuando la autoridad correspondiente ejecute la comprobación.";
    default: return undefined;
  }
}

function expectedEffectFor(reviewCase: ReviewCase, issue: ReviewIssue | undefined, resolution: ReviewResolution | undefined): SimplifiedReviewCasePresentation["expectedEffect"] {
  const resumePending = hasResumePending(reviewCase);
  const base = resolution
    ? resolutionEffect(issue, resolution)
    : checkpointEffect(reviewCase)
      ?? (reviewCase.issues.length === 0 ? "El caso quedará marcado como resuelto. No se ejecutará ninguna operación externa." : undefined);
  const pending = "Se resolverá la incidencia, pero el flujo original todavía requerirá reanudación posterior.";
  if (!base) {
    return Object.freeze({
      available: false,
      summary: `No se puede determinar el efecto hasta completar la información pendiente.${resumePending ? ` ${pending}` : ""}`,
      resumePending,
    });
  }
  return Object.freeze({
    available: true,
    summary: `${base}${resumePending ? ` ${pending}` : ""}`,
    resumePending,
  });
}

function whyFor(issue: ReviewIssue | undefined, resolution: ReviewResolution | undefined): SimplifiedReviewCasePresentation["why"] {
  if (!issue) return Object.freeze({summary: "Todavía no hay evidencia suficiente para explicar la causa con seguridad.", candidates: Object.freeze([]), evidence: Object.freeze([])});
  const selected = selectedCandidate(issue, resolution) ?? recommendedCandidate(issue);
  const candidates = Object.freeze((issue.candidates ?? []).slice(0, 5).map((candidate): SimplifiedReviewCandidate => Object.freeze({
    id: candidate.id,
    label: candidateLabel(candidate),
    confidence: confidence(candidate),
    role: candidate.id === selected?.id ? "recommended" : selected ? "alternative" : "possible",
  })));
  const evidence: string[] = [];
  for (const item of [...(issue.evidence ?? []), ...(issue.candidates?.flatMap((candidate) => candidate.reasons ?? []) ?? [])]) {
    const safe = safeHumanText(item);
    if (safe && !evidence.includes(safe)) evidence.push(safe);
    if (evidence.length >= 4) break;
  }
  const candidateSummary = candidates.length
    ? ` Encontramos ${candidates.length} ${candidates.length === 1 ? "candidato posible" : "candidatos posibles"}.`
    : "";
  return Object.freeze({summary: `${ISSUE_REASONS[issue.kind]}${candidateSummary}`, candidates, evidence: Object.freeze(evidence)});
}

function unavailableReason(reviewCase: ReviewCase): string | undefined {
  if (!["open", "in_review"].includes(reviewCase.status)) {
    return reviewCase.status === "resolved"
      ? "Este caso ya está resuelto. Vuelve a abrirlo para cambiar la decisión."
      : reviewCase.status === "resuming"
        ? "El caso está procesándose y no admite cambios ahora."
        : reviewCase.status === "resumed"
          ? "El flujo ya continuó y el caso está disponible solo para consulta."
          : reviewCase.status === "dismissed"
            ? "El caso está descartado."
            : "Primero hay que volver a abrir el caso.";
  }
  if (!canResolveReviewCase(reviewCase)) return "Completa primero las decisiones obligatorias pendientes.";
  return undefined;
}

export function translateReviewTechnicalState(value: string): string {
  return STATUS_LABELS[value] ?? "Estado pendiente de revisión";
}

export function buildSimplifiedReviewCasePresentation(reviewCase: ReviewCase): SimplifiedReviewCasePresentation {
  const labels = deriveReviewCaseHumanLabels(reviewCase);
  const issue = reviewCase.issues[0];
  const resolution = issue
    ? reviewCase.resolutions.find((item) => item.issueId === issue.id)
    : reviewCase.resolutions[0];
  const canEdit = ["open", "in_review", "stale", "resume_failed"].includes(reviewCase.status);
  const approve = ["open", "in_review"].includes(reviewCase.status) && canResolveReviewCase(reviewCase);
  const intake = reviewCase.context.unifiedReviewIntake;
  const awaitingOriginResume = reviewCase.status === "resolved" && (reviewCase.context.producer === "external_news" || Boolean(intake && typeof intake === "object" && !Array.isArray(intake) && intake.resume && typeof intake.resume === "object" && !Array.isArray(intake.resume)));

  return Object.freeze({
    version: SIMPLIFIED_REVIEW_CASE_VERSION,
    sourceLabel: safeHumanText(labels.sourceLabel) ?? REVIEW_MODULE_LABELS[reviewCase.module],
    entityLabel: safeHumanText(labels.entityLabel) ?? "Entidad editorial",
    priorityLabel: REVIEW_PRIORITY_LABELS[reviewCase.priority],
    statusLabel: awaitingOriginResume ? "Decisión aprobada · pendiente de continuar" : translateReviewTechnicalState(reviewCase.status),
    problem: Object.freeze({
      title: safeHumanText(labels.problemTitle) ?? "Caso pendiente de revisión",
      summary: safeHumanText(labels.problemSummary) ?? (issue ? ISSUE_REASONS[issue.kind] : "Este caso necesita una decisión humana."),
    }),
    why: whyFor(issue, resolution),
    recommendation: recommendationFor(reviewCase, issue, resolution),
    expectedEffect: expectedEffectFor(reviewCase, issue, resolution),
    actions: Object.freeze({
      approve,
      change: canEdit && reviewCase.issues.length > 0,
      dismiss: ["open", "in_review", "resolved", "resume_failed", "stale"].includes(reviewCase.status),
      beginReview: reviewCase.status === "open",
      reopen: ["in_review", "stale", "resume_failed", "resolved"].includes(reviewCase.status),
      remove: ["resumed", "dismissed"].includes(reviewCase.status),
      unavailableReason: approve ? undefined : unavailableReason(reviewCase),
    }),
    presentationOnly: true,
    writes: false,
  });
}

export const simplifiedReviewCaseSecurity = Object.freeze({
  pure: true,
  presentationOnly: true,
  createsStores: false,
  createsPlanners: false,
  createsExecutors: false,
  createsResumeEngines: false,
  invokesExecutors: false,
  persistsState: false,
  accessesNetwork: false,
  exposesRawPayloads: false,
  writes: false,
} as const);
