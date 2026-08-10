import {useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import {
  applyKnowledgeCenterLifecycleAction,
  buildKnowledgeCenterViewModel,
  readKnowledgeCenterSnapshot,
  withKnowledgeCenterSnapshot,
  type KnowledgeCenterLifecycleAction,
  type KnowledgeValidityState,
} from "../knowledge";
import {updateReviewCaseContextIfCurrent} from "../store/reviewStore";
import type {ReviewCase} from "../types";

type Feedback = Readonly<{kind: "status" | "error"; message: string}>;
type Filter = "all" | KnowledgeValidityState;

const lifecycleLabel: Readonly<Record<KnowledgeValidityState, string>> = Object.freeze({
  current: "Vigente", temporal: "Temporal", expired: "Caducado", invalidated: "Invalidado", superseded: "Sustituido", contradictory: "Contradictorio", under_review: "En revisión",
});
const short = (value: string): string => value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
const now = (): string => new Date().toISOString();

/** AU9 B6 is a safe projection of persisted AU9 contracts. It does not extract, retrieve or execute. */
export default function KnowledgeCenter({reviewCase}: {reviewCase: ReviewCase}): ReactElement {
  const [snapshot, setSnapshot] = useState(() => readKnowledgeCenterSnapshot(reviewCase.context));
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [replacementIds, setReplacementIds] = useState<Record<string, string>>({});
  const [provenanceId, setProvenanceId] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const conflictRef = useRef<HTMLElement>(null);
  const model = useMemo(() => buildKnowledgeCenterViewModel(snapshot, now(), [reviewCase.subject.type]), [snapshot, reviewCase.subject.type]);

  useEffect(() => { setSnapshot(readKnowledgeCenterSnapshot(reviewCase.context)); setFeedback(undefined); setBusy(false); }, [reviewCase]);
  useEffect(() => { if (feedback?.kind === "error") errorRef.current?.focus(); }, [feedback]);

  function persist(action: KnowledgeCenterLifecycleAction, success: string): void {
    if (!snapshot || !model.safeToAct) { setFeedback({kind: "error", message: "El snapshot está ausente o stale. Regenera gobernanza AU9 antes de modificar el ciclo de vida."}); return; }
    setBusy(true);
    try {
      const next = applyKnowledgeCenterLifecycleAction(snapshot, action);
      const saved = updateReviewCaseContextIfCurrent(reviewCase.id, reviewCase.version, withKnowledgeCenterSnapshot(reviewCase.context, next));
      if (!saved) throw new Error("knowledge_center_case_not_found");
      setSnapshot(next);
      setFeedback({kind: "status", message: `${success} Se invalidaron las recomendaciones recuperadas; vuelve a recuperar con evidencia actual.`});
    } catch (error) {
      setFeedback({kind: "error", message: error instanceof Error ? `No se aplicó el cambio: ${error.message}.` : "No se aplicó el cambio."});
    } finally { setBusy(false); }
  }

  function review(id: string): void {
    if (!window.confirm("Marcar este conocimiento para revisión no ejecuta ninguna operación editorial. ¿Continuar?")) return;
    persist({kind: "mark_review", knowledgeId: id, occurredAt: now(), reasonCode: "operator_review_requested"}, "Conocimiento marcado para revisión.");
  }
  function invalidate(id: string): void {
    const reason = window.prompt("Motivo seguro de invalidación (código breve):", "operator_invalidated");
    if (!reason?.trim() || !window.confirm("La invalidación conserva la revisión anterior y no elimina historial. ¿Continuar?")) return;
    persist({kind: "invalidate", knowledgeId: id, occurredAt: now(), reasonCode: reason.trim()}, "Conocimiento invalidado.");
  }
  function supersede(id: string): void {
    const replacement = replacementIds[id];
    if (!replacement) { setFeedback({kind: "error", message: "Selecciona una revisión de reemplazo del mismo sujeto antes de sustituir."}); return; }
    if (!window.confirm("La sustitución conserva el historial y no modifica evidencia actual. ¿Continuar?")) return;
    persist({kind: "supersede", knowledgeId: id, supersededByKnowledgeId: replacement, occurredAt: now(), reasonCode: "operator_superseded"}, "Conocimiento sustituido.");
  }
  function requestRegeneration(): void {
    setFeedback({kind: "status", message: "Regeneración solicitada: aporta un nuevo snapshot desde los contratos AU9 B1–B5 y evidencia actual. El Centro no lo genera ni ejecuta automáticamente."});
  }

  const entries = filter === "all" ? model.entries : model.entries.filter((entry) => entry.validity.effectiveState === filter);
  return <section className="review-subsection knowledge-center" aria-labelledby={`knowledge-center-title-${reviewCase.id}`} aria-busy={busy}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">AU9 · CONOCIMIENTO GOBERNADO</p><h4 className="review-subtitle" id={`knowledge-center-title-${reviewCase.id}`}>Centro de Conocimiento</h4><p className="review-muted">Recupera conocimiento advisory-only. Abrir el caso no aprende, no recupera de red y no ejecuta operaciones.</p></div>
      <strong className={`review-mode-label knowledge-center-state knowledge-center-state-${model.availability}`} role="status">{model.availability === "ready" ? "Disponible" : model.availability === "stale" ? "Stale" : "Sin snapshot"}</strong>
    </div>

    <p className="knowledge-center-notice" role="status">{model.advisoryNotice}</p>
    {feedback ? <p ref={feedback.kind === "error" ? errorRef : undefined} tabIndex={feedback.kind === "error" ? -1 : undefined} className={feedback.kind === "error" ? "global-resolution-error" : "review-feedback"} role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"}>{feedback.message}</p> : null}
    {model.reasonCodes.length ? <div className="global-resolution-alert" role="alert"><strong>Acción requerida.</strong><p>{model.reasonCodes.join(" · ")}</p></div> : null}
    {model.availability !== "ready" ? <div className="review-actions"><button className="review-button review-button-secondary" type="button" disabled={busy} onClick={requestRegeneration}>Solicitar regeneración AU9</button></div> : null}

    <dl className="global-resolution-summary" aria-label="Resumen seguro de conocimiento">
      <div><dt>Items</dt><dd>{model.entries.length}</dd></div><div><dt>Recomendaciones</dt><dd>{model.recommendations.length}</dd></div><div><dt>Conflictos</dt><dd>{model.conflicts.length}</dd></div><div><dt>Feedback</dt><dd>{model.feedback.length}</dd></div>
      {Object.entries(model.lifecycleCounts).map(([state, count]) => <div key={state}><dt>{lifecycleLabel[state as KnowledgeValidityState]}</dt><dd>{count}</dd></div>)}
    </dl>

    <div className="knowledge-center-toolbar"><label htmlFor={`knowledge-filter-${reviewCase.id}`}>Filtrar ciclo de vida</label><select id={`knowledge-filter-${reviewCase.id}`} value={filter} onChange={(event) => setFilter(event.target.value as Filter)} disabled={busy}><option value="all">Todos</option>{Object.entries(lifecycleLabel).map(([state, label]) => <option key={state} value={state}>{label}</option>)}</select></div>
    {model.availability === "absent" ? <p className="review-muted">No hay contrato AU9 B1–B5 persistido en este caso. El panel queda cerrado de forma segura hasta que el flujo autoritativo aporte un snapshot.</p> : null}
    <div className="knowledge-center-list" aria-label="Conocimiento y revisiones">
      {entries.map((entry) => <article key={`${entry.item.id}:${entry.item.revision}:${entry.item.knowledgeFingerprint}`} className={`knowledge-center-item knowledge-state-${entry.validity.effectiveState}`}>
        <div className="review-row review-row-wrap"><div><h5>{entry.summary.domain} · {entry.summary.kind}</h5><p>{entry.summary.safeSummary}</p></div><strong className="review-badge">{lifecycleLabel[entry.validity.effectiveState]}</strong></div>
        <dl className="knowledge-center-meta"><div><dt>Revisión</dt><dd>v{entry.summary.revision}</dd></div><div><dt>Fingerprint</dt><dd>{entry.summary.fingerprint}</dd></div><div><dt>Provenance</dt><dd>{entry.summary.provenanceFingerprint}</dd></div><div><dt>Recurrencia</dt><dd>{entry.recurrence ? `${entry.recurrence.observationCount} obs. · ${entry.recurrence.independentSourceCount} fuentes independientes` : "No consolidada"}</dd></div></dl>
        {entry.predecessorIds.length || entry.successorIds.length ? <p className="review-muted">Historial enlazado: {entry.predecessorIds.length ? `deriva de ${entry.predecessorIds.map(short).join(", ")}` : "origen"}{entry.successorIds.length ? ` · revisiones posteriores ${entry.successorIds.map(short).join(", ")}` : ""}</p> : null}
        {entry.validity.reasonCodes.length ? <p className="review-muted">Estado: {entry.validity.reasonCodes.join(" · ")}</p> : null}
        <div className="review-actions knowledge-center-actions" aria-label={`Evidencia y provenance para ${entry.item.id}`}><button className="review-button review-button-secondary" type="button" aria-expanded={provenanceId === entry.item.id} onClick={() => setProvenanceId((current) => current === entry.item.id ? null : entry.item.id)}>{provenanceId === entry.item.id ? "Ocultar provenance" : "Ver provenance"}</button>{entry.conflicts.length ? <button className="review-button review-button-danger" type="button" onClick={() => { conflictRef.current?.scrollIntoView({behavior: "smooth", block: "start"}); conflictRef.current?.focus(); }}>Abrir conflicto</button> : null}</div>
        {provenanceId === entry.item.id ? <div className="knowledge-center-provenance" role="status"><strong>Provenance seguro</strong><span>Caso {entry.item.provenance.caseId} · versión {entry.item.provenance.caseVersion} · productor {entry.item.provenance.producerId}</span><span>Fuentes: {entry.item.sources.map((source) => `${source.kind}/${source.authority}/${short(source.provenanceFingerprint)}`).join(" · ") || "ninguna"}</span><span>Evidencia: {entry.item.observations.flatMap((observation) => observation.evidenceFingerprints).map(short).join(" · ") || "no disponible"}</span></div> : null}
        {entry.actionable && model.safeToAct ? <div className="review-actions knowledge-center-actions" aria-label={`Acciones de ciclo de vida para ${entry.item.id}`}><button className="review-button review-button-secondary" type="button" disabled={busy} onClick={() => review(entry.item.id)}>Marcar revisión</button><button className="review-button review-button-danger" type="button" disabled={busy} onClick={() => invalidate(entry.item.id)}>Invalidar</button><label>Reemplazo <select value={replacementIds[entry.item.id] ?? ""} onChange={(event) => setReplacementIds((current) => ({...current, [entry.item.id]: event.target.value}))} disabled={busy}><option value="">Elegir revisión</option>{model.entries.filter((candidate) => candidate.item.id !== entry.item.id && candidate.item.domain === entry.item.domain && candidate.item.subjectKey === entry.item.subjectKey && candidate.actionable).map((candidate) => <option key={candidate.item.id} value={candidate.item.id}>{candidate.item.id} · v{candidate.item.revision}</option>)}</select></label><button className="review-button review-button-secondary" type="button" disabled={busy} onClick={() => supersede(entry.item.id)}>Sustituir</button></div> : null}
      </article>)}
    </div>

    <section className="knowledge-center-panel" aria-labelledby={`knowledge-recommendations-${reviewCase.id}`}><h5 id={`knowledge-recommendations-${reviewCase.id}`}>Recomendaciones recuperadas</h5><p className="review-muted">La recomendación histórica no es evidencia actual ni se aplica automáticamente.</p>{model.recommendations.length ? <ol>{model.recommendations.map((entry) => <li key={entry.recommendationId}><strong>{entry.action}</strong> · {entry.safeExplanation}<br /><span>rank {entry.rank}; relevancia {entry.relevance}; independencia {entry.sourceIndependence}; recurrencia {entry.recurrence}; vigencia {entry.validity}; contexto {entry.contextualProximity}. {entry.reasonCodes.join(" · ")} · {entry.fingerprint}</span>{entry.limitations.length ? <small> Límites: {entry.limitations.join(" · ")}</small> : null}</li>)}</ol> : <p className="review-muted">No hay recomendaciones válidas recuperadas.</p>}</section>
    <section ref={conflictRef} tabIndex={-1} className="knowledge-center-panel" aria-labelledby={`knowledge-conflicts-${reviewCase.id}`}><h5 id={`knowledge-conflicts-${reviewCase.id}`}>Conflictos y revisión futura</h5>{model.conflicts.length ? <ul>{model.conflicts.map((entry) => <li key={entry.conflictId}><strong>{entry.severity}</strong> · {entry.reasonCodes.join(" · ")} · items {entry.knowledgeItemIds.map(short).join(", ")} · {entry.fingerprint}. Requiere evidencia actual; AU9 no elige ganador.</li>)}</ul> : <p className="review-muted">Sin candidatos de conflicto en el snapshot.</p>}</section>
    <section className="knowledge-center-panel" aria-labelledby={`knowledge-feedback-${reviewCase.id}`}><h5 id={`knowledge-feedback-${reviewCase.id}`}>Feedback y aprendizaje</h5><p className="review-muted">Una única experiencia nunca crea una regla. El feedback sigue siendo advisory-only.</p>{model.feedback.length ? <ul>{model.feedback.map((entry) => <li key={entry.feedbackId}><strong>{entry.classification}</strong> · {entry.status} · {entry.reasonCodes.join(" · ")} · elegible: {entry.learningEligible ? "sí" : "no"} · autoridad confirmada: {entry.outcomeAuthorityConfirmed ? "sí" : "no"} · {entry.fingerprint}</li>)}</ul> : <p className="review-muted">No hay feedback recuperado.</p>}</section>
    {model.unsupported.length ? <section className="knowledge-center-panel" aria-label="Límites de soporte"><h5>No soportado</h5><ul>{model.unsupported.map((entry) => <li key={entry}>{entry}</li>)}</ul></section> : null}
  </section>;
}
