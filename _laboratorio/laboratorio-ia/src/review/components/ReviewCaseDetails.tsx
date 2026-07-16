import {useState, type ReactElement} from "react";
import {
  formatReviewDate,
  REVIEW_MODULE_LABELS,
  REVIEW_PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
} from "../formatters";
import type {ReviewCase, ReviewJsonValue, ReviewResolution} from "../types";
import ReviewIssueDetails from "./ReviewIssueDetails";
import ReviewIssueEditor from "./ReviewIssueEditor";
import ReviewCaseResolutionStatus from "./ReviewCaseResolutionStatus";
import ReviewResolutionSummary from "./ReviewResolutionSummary";
import AutonomousReviewPanel from "./AutonomousReviewPanel";
import ExternalNewsResumePreviewPanel from "./ExternalNewsResumePreviewPanel";
import AutonomousInvestigationPanel from "../investigation/components/AutonomousInvestigationPanel";
import PreparedEntityMaterializationPanel from "../materialization/components/PreparedEntityMaterializationPanel";
import PreparedEntitySchemaRequirementsPanel from "../schemaRequirements/components/PreparedEntitySchemaRequirementsPanel";
import DecisionOutcomePanel from "../outcomes/components/DecisionOutcomePanel";

type ReviewCaseDetailsProps = {
  reviewCase: ReviewCase;
  onMarkInReview(): void;
  onReopen(): void;
  onDismiss(): void;
  onRemove(): void;
  onSaveResolution(resolution: ReviewResolution): void;
  onRemoveResolution(issueId: string): void;
  onMarkResolved(): void;
};

const SECRET_KEY_PATTERN = /(token|secret|authorization|cookie|password|api[_-]?key)/i;

function redactSensitiveValue(value: ReviewJsonValue, key = ""): ReviewJsonValue {
  if (SECRET_KEY_PATTERN.test(key)) return "[OCULTO]";
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactSensitiveValue(childValue, childKey),
      ]),
    );
  }
  return value;
}

function safeJson(value: ReviewJsonValue): string {
  try {
    return JSON.stringify(redactSensitiveValue(value), null, 2);
  } catch {
    return "Contenido no disponible";
  }
}

function resolutionSummary(resolution: ReviewResolution): string {
  const compactValue = (value: unknown): string => {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
  };

  switch (resolution.type) {
    case "set_value":
      return `Valor: ${compactValue(resolution.value)}`;
    case "select_candidate": return `Candidato: ${resolution.candidateId}`;
    case "link_reference": return `Referencia Sanity: ${resolution.sanityId}`;
    case "create_entity": return `Crear entidad: ${resolution.entityType}`;
    case "select_image": return resolution.assetId ? `Asset: ${resolution.assetId}` : `URL: ${resolution.url ?? "—"}`;
    case "confirm_duplicate": return `Duplicado confirmado: ${resolution.duplicateId}`;
    case "reject_duplicate": return `Duplicado rechazado${resolution.reason ? `: ${resolution.reason}` : ""}`;
    case "accept_value": return `Valor aceptado${resolution.reason ? `: ${resolution.reason}` : ""}`;
    case "discard": return `Descartado: ${resolution.reason}`;
    case "retry": return "Reintento registrado";
  }
}

function DetailField({label, value}: {label: string; value?: string | number}): ReactElement | null {
  if (value === undefined || value === "") return null;
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

export default function ReviewCaseDetails({
  reviewCase,
  onMarkInReview,
  onReopen,
  onDismiss,
  onRemove,
  onSaveResolution,
  onRemoveResolution,
  onMarkResolved,
}: ReviewCaseDetailsProps): ReactElement {
  const [contextOpen, setContextOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const canEdit = ["open", "in_review", "stale", "resume_failed"].includes(reviewCase.status);
  const canMarkResolved = ["open", "in_review"].includes(reviewCase.status);
  const canReopen = ["in_review", "stale", "resume_failed", "resolved"].includes(reviewCase.status);
  const canDismiss = ["open", "in_review", "resolved", "resume_failed", "stale"].includes(reviewCase.status);
  const canRemove = ["resumed", "dismissed"].includes(reviewCase.status);
  const readOnlyReason = reviewCase.status === "resolved"
    ? "El caso está resuelto. Vuelve a abierto para cambiar sus resoluciones."
    : reviewCase.status === "resuming"
      ? "El caso está en reanudación y sus resoluciones están bloqueadas."
      : reviewCase.status === "resumed"
        ? "El caso ya fue reanudado y se muestra en modo lectura."
        : reviewCase.status === "dismissed"
          ? "El caso está descartado y se muestra en modo lectura."
          : null;

  function saveResolution(nextResolution: ReviewResolution, previous?: ReviewResolution): void {
    if (previous && !window.confirm("La resolución actual se sustituirá por la nueva. ¿Quieres continuar?")) return;
    try {
      onSaveResolution(nextResolution);
      setFeedback(previous ? "Resolución actualizada" : "Corrección guardada");
      setOpenIssueId(null);
    } catch (error) {
      setFeedback("No se pudo guardar");
      throw error;
    }
  }

  function deleteResolution(issueId: string): void {
    if (!window.confirm("¿Quieres eliminar esta resolución? La incidencia volverá a quedar pendiente.")) return;
    try {
      onRemoveResolution(issueId);
      setFeedback("Resolución eliminada");
      setOpenIssueId(null);
    } catch {
      setFeedback("No se pudo guardar");
    }
  }

  return (
    <article className="review-details" aria-label={`Detalle de ${reviewCase.title}`}>
      <div className="review-row review-row-wrap review-details-header">
        <div>
          <p className="review-kicker">Detalle del caso</p>
          <h3 className="review-details-title">{reviewCase.title}</h3>
        </div>
        <div className="review-badges">
          <span className={`review-priority review-priority-${reviewCase.priority}`}>{REVIEW_PRIORITY_LABELS[reviewCase.priority]}</span>
          <span className="review-badge">{REVIEW_STATUS_LABELS[reviewCase.status]}</span>
        </div>
      </div>

      <dl className="review-definition-grid">
        <DetailField label="ID" value={reviewCase.id} />
        <DetailField label="Clave de deduplicación" value={reviewCase.dedupeKey} />
        <DetailField label="Módulo" value={REVIEW_MODULE_LABELS[reviewCase.module]} />
        <DetailField label="Fuente" value={reviewCase.source} />
        <DetailField label="Creado" value={formatReviewDate(reviewCase.createdAt)} />
        <DetailField label="Actualizado" value={formatReviewDate(reviewCase.updatedAt)} />
        <DetailField label="Versión" value={reviewCase.version} />
        <DetailField label="Intentos de reanudación" value={reviewCase.resumeAttempts} />
        <DetailField label="Último error" value={reviewCase.lastResumeError} />
        <DetailField label="Motivo de descarte" value={reviewCase.dismissReason} />
      </dl>

      <section className="review-subsection">
        <h4 className="review-subtitle">Sujeto</h4>
        <dl className="review-definition-grid">
          <DetailField label="Tipo" value={reviewCase.subject.type} />
          <DetailField label="ID de origen" value={reviewCase.subject.id} />
          <DetailField label="Etiqueta" value={reviewCase.subject.label} />
          <DetailField label="URL de origen" value={reviewCase.subject.sourceUrl} />
          <DetailField label="Sanity ID" value={reviewCase.subject.sanityId} />
          <DetailField label="Revisión Sanity" value={reviewCase.subject.sanityRevision} />
        </dl>
      </section>

      <section className="review-subsection">
        <h4 className="review-subtitle">Incidencias ({reviewCase.issues.length})</h4>
        <ReviewCaseResolutionStatus reviewCase={reviewCase} onMarkResolved={canMarkResolved ? onMarkResolved : undefined} />
        {readOnlyReason ? <p className="review-readonly-message" role="status">{readOnlyReason}</p> : null}
        {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}
        <div className="review-issues">
          {reviewCase.issues.map((issue) => {
            const resolution = reviewCase.resolutions.find((item) => item.issueId === issue.id);
            return (
              <div className="review-issue-wrapper" key={issue.id}>
                <ReviewIssueDetails issue={issue} resolution={resolution} />
                <div className="review-issue-controls">
                  {resolution ? <ReviewResolutionSummary resolution={resolution} updatedAt={reviewCase.updatedAt} /> : <span className="review-badge">Pendiente</span>}
                  {canEdit ? (
                    <div className="review-actions">
                      <button
                        className="review-button review-button-secondary"
                        type="button"
                        aria-expanded={openIssueId === issue.id}
                        aria-controls={`review-issue-editor-${issue.id}`}
                        onClick={() => { setOpenIssueId((current) => current === issue.id ? null : issue.id); setFeedback(null); }}
                      >
                        {openIssueId === issue.id ? "Cerrar editor" : resolution ? "Cambiar resolución" : "Corregir"}
                      </button>
                      {resolution ? <button className="review-button review-button-danger" type="button" onClick={() => deleteResolution(issue.id)}>Eliminar resolución</button> : null}
                    </div>
                  ) : null}
                  {openIssueId === issue.id && canEdit ? (
                    <div id={`review-issue-editor-${issue.id}`}>
                      <ReviewIssueEditor
                        key={`${JSON.stringify(issue)}-${JSON.stringify(resolution ?? null)}`}
                        issue={issue}
                        resolution={resolution}
                        onSave={(next) => saveResolution(next, resolution)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AutonomousReviewPanel caseId={reviewCase.id} editable={canEdit} />
      <AutonomousInvestigationPanel caseId={reviewCase.id} editable={canEdit} investigable={reviewCase.issues.some((issue) => ["missing_entity", "missing_reference", "ambiguous_reference", "contradictory_data", "low_confidence", "recoverable_error"].includes(issue.kind) && (!reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id) || reviewCase.resolutions.some((resolution) => resolution.issueId === issue.id && resolution.type === "retry")))} />
      <PreparedEntityMaterializationPanel reviewCase={reviewCase} />
      <PreparedEntitySchemaRequirementsPanel reviewCase={reviewCase} />
      <ExternalNewsResumePreviewPanel reviewCase={reviewCase} />
      <DecisionOutcomePanel reviewCase={reviewCase} />

      {reviewCase.resolutions.length ? (
        <section className="review-subsection">
          <h4 className="review-subtitle">Resoluciones registradas</h4>
          <div className="review-resolution-list">
            {reviewCase.resolutions.map((resolution) => (
              <div className="review-resolution" key={resolution.issueId}>
                <strong>{resolution.type}</strong>
                <span>Incidencia: {resolution.issueId}</span>
                <span>{resolutionSummary(resolution)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="review-subsection">
        <button
          className="review-disclosure"
          type="button"
          aria-expanded={contextOpen}
          aria-controls={`review-context-${reviewCase.id}`}
          onClick={() => setContextOpen((current) => !current)}
        >
          {contextOpen ? "Ocultar contexto técnico" : "Ver contexto técnico"}
        </button>
        {contextOpen ? <pre className="review-json" id={`review-context-${reviewCase.id}`}>{safeJson(reviewCase.context)}</pre> : null}
      </section>

      {reviewCase.resumeAction ? (
        <section className="review-subsection">
          <button
            className="review-disclosure"
            type="button"
            aria-expanded={resumeOpen}
            aria-controls={`review-resume-${reviewCase.id}`}
            onClick={() => setResumeOpen((current) => !current)}
          >
            {resumeOpen ? "Ocultar acción prevista" : "Acción de reanudación prevista"}
          </button>
          {resumeOpen ? <pre className="review-json" id={`review-resume-${reviewCase.id}`}>{safeJson(reviewCase.resumeAction as unknown as ReviewJsonValue)}</pre> : null}
        </section>
      ) : null}

      <div className="review-actions" aria-label="Acciones del caso">
        {reviewCase.status === "open" ? <button className="review-button" type="button" onClick={onMarkInReview}>Marcar en revisión</button> : null}
        {canReopen ? <button className="review-button review-button-secondary" type="button" onClick={onReopen}>Volver a abierto</button> : null}
        {canDismiss ? <button className="review-button review-button-danger" type="button" onClick={onDismiss}>Descartar</button> : null}
        {canRemove ? <button className="review-button review-button-danger" type="button" onClick={onRemove}>Eliminar definitivamente</button> : null}
      </div>
    </article>
  );
}
