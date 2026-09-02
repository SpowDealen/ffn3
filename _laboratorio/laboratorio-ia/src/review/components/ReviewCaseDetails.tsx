import {useState, type ReactElement, type ReactNode, type SyntheticEvent} from "react";
import {
  formatReviewDate,
  REVIEW_MODULE_LABELS,
} from "../formatters";
import {buildSimplifiedReviewCasePresentation} from "../presentation";
import type {ReviewCase, ReviewJsonValue, ReviewResolution} from "../types";
import ReviewIssueDetails from "./ReviewIssueDetails";
import ReviewIssueEditor from "./ReviewIssueEditor";
import ReviewCaseResolutionStatus from "./ReviewCaseResolutionStatus";
import ReviewResolutionSummary from "./ReviewResolutionSummary";
import AIResolutionNucleus, {type NucleusContextView} from "./AIResolutionNucleus";
import ReviewOriginResumePanel from "./ReviewOriginResumePanel";

/*
 * AU10 mantiene los contratos UI previos dentro del Núcleo, bajo demanda:
 * <GlobalResolutionControls reviewCase={reviewCase} />
 * ReconciliationCasePanel
 */

type ReviewCaseDetailsProps = {
  reviewCase: ReviewCase;
  onMarkInReview(): void;
  onReopen(): void;
  onDismiss(): void;
  onRemove(): void;
  onSaveResolution(resolution: ReviewResolution): void;
  onRemoveResolution(issueId: string): void;
  onMarkResolved(): void;
  onNucleusContextChange?(context: NucleusContextView): void;
  technicalNavigation?: ReactNode;
  technicalExtras?: ReactNode;
  readOnly?: boolean;
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
    case "set_value": return `Valor: ${compactValue(resolution.value)}`;
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
  onNucleusContextChange,
  technicalNavigation,
  technicalExtras,
  readOnly = false,
}: ReviewCaseDetailsProps): ReactElement {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const presentation = buildSimplifiedReviewCasePresentation(reviewCase);
  const canEdit = presentation.actions.change;
  const readOnlyReason = reviewCase.status === "resolved"
    ? "El caso está resuelto. Vuelve a abrirlo para cambiar sus decisiones."
    : reviewCase.status === "resuming"
      ? "El caso está en proceso y sus decisiones están bloqueadas."
      : reviewCase.status === "resumed"
        ? "El flujo ya continuó y este caso se muestra en modo lectura."
        : reviewCase.status === "dismissed"
          ? "El caso está descartado y se muestra en modo lectura."
          : null;
  const technicalId = `review-technical-${reviewCase.id}`;
  const choicesId = `review-choices-${reviewCase.id}`;

  function saveResolution(nextResolution: ReviewResolution, previous?: ReviewResolution): void {
    if (previous && !window.confirm("La resolución actual se sustituirá por la nueva. ¿Quieres continuar?")) return;
    try {
      onSaveResolution(nextResolution);
      setFeedback(previous ? "Decisión actualizada" : "Decisión guardada");
      setOpenIssueId(null);
    } catch (error) {
      setFeedback("No se pudo guardar la decisión");
      throw error;
    }
  }

  function deleteResolution(issueId: string): void {
    if (!window.confirm("¿Quieres eliminar esta decisión? La incidencia volverá a quedar pendiente.")) return;
    try {
      onRemoveResolution(issueId);
      setFeedback("Decisión eliminada");
      setOpenIssueId(null);
    } catch {
      setFeedback("No se pudo guardar la decisión");
    }
  }

  function syncTechnicalState(event: SyntheticEvent<HTMLDetailsElement>): void {
    setTechnicalOpen(event.currentTarget.open);
  }

  return (
    <article className="review-details review-details-simplified" aria-label={`Caso de revisión: ${presentation.problem.title}`}>
      <header className="review-row review-row-wrap review-details-header">
        <div>
          <p className="review-kicker">Caso de revisión</p>
          <h2 className="review-details-title">{presentation.problem.title}</h2>
        </div>
        <div className="review-badges" aria-label="Fuente, entidad, prioridad y estado">
          {readOnly ? <span className="review-badge">Fixture DEV · solo lectura</span> : null}
          <span className="review-badge">{presentation.sourceLabel}</span>
          <span className="review-badge">{presentation.entityLabel}</span>
          <span className={`review-priority review-priority-${reviewCase.priority}`}>{presentation.priorityLabel}</span>
          <span className="review-badge">{presentation.statusLabel}</span>
        </div>
      </header>

      <div className="review-human-case-flow">
        <section className="review-human-question" aria-labelledby={`review-what-${reviewCase.id}`}>
          <h3 id={`review-what-${reviewCase.id}`}>¿Qué pasa?</h3>
          <p className="review-human-answer review-human-answer-lead">{presentation.problem.summary}</p>
        </section>

        <section className="review-human-question" aria-labelledby={`review-why-${reviewCase.id}`}>
          <h3 id={`review-why-${reviewCase.id}`}>¿Por qué?</h3>
          <p className="review-human-answer">{presentation.why.summary}</p>
          {presentation.why.candidates.length ? (
            <ul className="review-human-candidates" aria-label="Candidatos considerados">
              {presentation.why.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <span><strong>{candidate.label}</strong>{candidate.confidence ? ` — ${candidate.confidence.value.toFixed(0)}%` : ""}</span>
                  <span className={`review-candidate-role review-candidate-role-${candidate.role}`}>
                    {candidate.role === "recommended" ? "Recomendado" : candidate.role === "alternative" ? "Alternativa" : "Posible"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {presentation.why.evidence.length ? (
            <ul className="review-human-evidence">
              {presentation.why.evidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>

        <section className="review-human-question" aria-labelledby={`review-recommendation-${reviewCase.id}`}>
          <h3 id={`review-recommendation-${reviewCase.id}`}>¿Qué recomienda el Lab?</h3>
          <p className="review-human-answer">{presentation.recommendation.summary}</p>
          {presentation.recommendation.confidence ? <p className="review-human-support">Confianza: {presentation.recommendation.confidence.label.toLocaleLowerCase("es-ES")} ({presentation.recommendation.confidence.value.toFixed(0)}%).</p> : null}
          {presentation.recommendation.alternative ? <p className="review-human-support">{presentation.recommendation.alternative}</p> : null}
        </section>

        <section className="review-human-question" aria-labelledby={`review-effect-${reviewCase.id}`}>
          <h3 id={`review-effect-${reviewCase.id}`}>¿Qué ocurrirá si apruebo?</h3>
          <p className="review-human-answer">{presentation.expectedEffect.summary}</p>
        </section>
      </div>

      <section className="review-human-actions" aria-labelledby={`review-actions-${reviewCase.id}`}>
        <h3 id={`review-actions-${reviewCase.id}`}>Tu decisión</h3>
        {readOnlyReason ? <p className="review-readonly-message">{readOnlyReason}</p> : null}
        {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}
        <div className="review-actions" aria-label="Acciones autorizadas del caso">
          {readOnly ? <button className="review-button" type="button" disabled aria-describedby={"review-readonly-" + reviewCase.id}>Aprobar resolución</button> : null}
          {!readOnly && presentation.actions.approve ? <button className="review-button" type="button" onClick={onMarkResolved}>Aprobar resolución</button> : null}
          {!readOnly && presentation.actions.change ? (
            <button
              className="review-button review-button-secondary"
              type="button"
              aria-expanded={choicesOpen}
              aria-controls={choicesId}
              onClick={() => { setChoicesOpen((current) => !current); setFeedback(null); }}
            >
              {choicesOpen ? "Cerrar opciones" : reviewCase.resolutions.length ? "Cambiar / elegir otra opción" : "Elegir una opción"}
            </button>
          ) : null}
          {!readOnly && presentation.actions.beginReview ? <button className="review-button review-button-secondary" type="button" onClick={onMarkInReview}>Empezar revisión</button> : null}
          {!readOnly && presentation.actions.reopen ? <button className="review-button review-button-secondary" type="button" onClick={onReopen}>Volver a abrir</button> : null}
          {!readOnly && presentation.actions.dismiss ? <button className="review-button review-button-danger" type="button" onClick={onDismiss}>Descartar caso</button> : null}
          {!readOnly && presentation.actions.remove ? <button className="review-button review-button-danger" type="button" onClick={onRemove}>Eliminar definitivamente</button> : null}
        </div>
        {readOnly ? <p className="review-action-unavailable" id={"review-readonly-" + reviewCase.id}>Acciones desactivadas: este fixture es solo para validación visual y no guarda cambios.</p> : null}
        {!readOnly && !presentation.actions.approve && presentation.actions.unavailableReason ? <p className="review-action-unavailable">No se puede aprobar todavía: {presentation.actions.unavailableReason}</p> : null}

        {choicesOpen && canEdit && !readOnly ? (
          <div className="review-human-choices" id={choicesId}>
            {reviewCase.issues.map((issue) => {
              const resolution = reviewCase.resolutions.find((item) => item.issueId === issue.id);
              return (
                <article className="review-human-choice" key={issue.id}>
                  <div>
                    <h4>{issue.label}</h4>
                    <p>{issue.message}</p>
                  </div>
                  {resolution ? <ReviewResolutionSummary resolution={resolution} updatedAt={reviewCase.updatedAt} /> : <span className="review-badge">Decisión pendiente</span>}
                  <div className="review-actions">
                    <button
                      className="review-button review-button-secondary"
                      type="button"
                      aria-expanded={openIssueId === issue.id}
                      aria-controls={`review-issue-editor-${issue.id}`}
                      onClick={() => { setOpenIssueId((current) => current === issue.id ? null : issue.id); setFeedback(null); }}
                    >
                      {openIssueId === issue.id ? "Cerrar editor" : resolution ? "Cambiar decisión" : "Resolver"}
                    </button>
                    {resolution ? <button className="review-button review-button-danger" type="button" onClick={() => deleteResolution(issue.id)}>Eliminar decisión</button> : null}
                  </div>
                  {openIssueId === issue.id ? (
                    <div id={`review-issue-editor-${issue.id}`}>
                      <ReviewIssueEditor
                        key={`${JSON.stringify(issue)}-${JSON.stringify(resolution ?? null)}`}
                        issue={issue}
                        resolution={resolution}
                        onSave={(next) => saveResolution(next, resolution)}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {!readOnly ? <ReviewOriginResumePanel reviewCase={reviewCase} /> : null}

      <details className="review-technical-details" onToggle={syncTechnicalState}>
        <summary aria-expanded={technicalOpen} aria-controls={technicalId}>Detalles técnicos</summary>
        <div className="review-technical-content" id={technicalId}>
          <p className="review-muted">Autoridades existentes: AU7, AU8 y AU9. Aquí permanecen checkpoints, fingerprints, reconciliación, compensación y diagnóstico sin cambiar su autoridad.</p>
          <p className="review-muted">La confianza de candidatos informa la recomendación humana; la suficiencia del Núcleo representa la readiness autónoma canónica.</p>
          <section className="review-subsection">
            <h3 className="review-subtitle">Identidad y estado interno</h3>
            <dl className="review-definition-grid">
              <DetailField label="ID" value={reviewCase.id} />
              <DetailField label="Clave de deduplicación" value={reviewCase.dedupeKey} />
              <DetailField label="Módulo" value={REVIEW_MODULE_LABELS[reviewCase.module]} />
              <DetailField label="Fuente" value={reviewCase.source} />
              <DetailField label="Estado técnico" value={reviewCase.status} />
              <DetailField label="Creado" value={formatReviewDate(reviewCase.createdAt)} />
              <DetailField label="Actualizado" value={formatReviewDate(reviewCase.updatedAt)} />
              <DetailField label="Versión / checkpoint" value={reviewCase.version} />
              <DetailField label="Intentos de reanudación" value={reviewCase.resumeAttempts} />
              <DetailField label="Último error" value={reviewCase.lastResumeError} />
              <DetailField label="Motivo de descarte" value={reviewCase.dismissReason} />
            </dl>
          </section>

          <section className="review-subsection">
            <h3 className="review-subtitle">Sujeto técnico</h3>
            <dl className="review-definition-grid">
              <DetailField label="Tipo" value={reviewCase.subject.type} />
              <DetailField label="ID de origen" value={reviewCase.subject.id} />
              <DetailField label="Etiqueta" value={reviewCase.subject.label} />
              <DetailField label="URL de origen" value={reviewCase.subject.sourceUrl} />
              <DetailField label="Sanity ID" value={reviewCase.subject.sanityId} />
              <DetailField label="Revisión Sanity" value={reviewCase.subject.sanityRevision} />
            </dl>
          </section>

          <section className="review-subsection" id={`review-issues-${reviewCase.id}`}>
            <h3 className="review-subtitle">Incidencias técnicas ({reviewCase.issues.length})</h3>
            <ReviewCaseResolutionStatus reviewCase={reviewCase} />
            <div className="review-issues">
              {reviewCase.issues.map((issue) => {
                const resolution = reviewCase.resolutions.find((item) => item.issueId === issue.id);
                return <ReviewIssueDetails key={issue.id} issue={issue} resolution={resolution} />;
              })}
            </div>
          </section>

          {reviewCase.resolutions.length ? (
            <section className="review-subsection">
              <h3 className="review-subtitle">Resoluciones registradas</h3>
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
            <details>
              <summary>Contexto y diagnóstico</summary>
              <pre className="review-json">{safeJson(reviewCase.context)}</pre>
            </details>
          </section>

          {reviewCase.resumeAction ? (
            <section className="review-subsection">
              <details>
                <summary>Acción de reanudación prevista</summary>
                <pre className="review-json">{safeJson(reviewCase.resumeAction as unknown as ReviewJsonValue)}</pre>
              </details>
            </section>
          ) : null}

          <AIResolutionNucleus key={`${reviewCase.id}:${reviewCase.version}`} reviewCase={reviewCase} canEdit={canEdit && !readOnly} canFinalize={presentation.actions.approve && !readOnly} onFinalize={onMarkResolved} onContextChange={onNucleusContextChange} />
          {technicalNavigation ? <section className="review-subsection review-technical-navigation" aria-label="Herramientas avanzadas del caso"><h3 className="review-subtitle">Herramientas avanzadas</h3>{technicalNavigation}</section> : null}
          {technicalExtras}
        </div>
      </details>
    </article>
  );
}
