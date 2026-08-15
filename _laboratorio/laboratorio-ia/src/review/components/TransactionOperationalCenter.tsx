import {useEffect, useRef, useState, type ReactElement} from "react";
import type {ReviewCase} from "../types";
import {
  authorizeReviewCenterTransactionStep,
  initializeReviewCenterTransaction,
  recoverReviewCenterTransaction,
  runReviewCenterTransaction,
  setReviewCenterTransactionPaused,
  type TransactionCenterState,
  type TransactionCenterView,
  type TransactionExecutionAuthorization,
  type TransactionIncident,
} from "../transactions";
import {getReviewCase} from "../store/reviewStore";
import {ProgressBar, StepProgress, type FeedbackStep} from "../../components/feedback/VisualFeedback";

type Feedback = Readonly<{kind: "status" | "error"; message: string}>;

const STATE_LABELS: Readonly<Record<TransactionCenterState, string>> = Object.freeze({
  planned: "Planned",
  ready: "Ready",
  executing: "Executing",
  paused: "Paused",
  blocked: "Blocked",
  reconciliation_required: "Reconciliation required",
  compensation_required: "Compensation required",
  completed: "Completed",
  failed: "Failed",
  stale: "Stale",
});

const STEP_LABELS = Object.freeze({pending: "Pendiente", blocked: "Bloqueado", ready: "Preparado", executing: "En ejecución", succeeded: "Completado", reused: "Reutilizado", failed: "Fallido", reconciliation_required: "Reconciliación", compensating: "Compensando", compensated: "Compensado", compensation_failed: "Compensación fallida", skipped: "Omitido", cancelled: "Cancelado"});
const EVENT_LABELS: Readonly<Record<string, string>> = Object.freeze({transaction_planned: "Transacción planificada", transaction_ready: "Transacción preparada", transaction_paused: "Transacción pausada", transaction_resumed: "Transacción reanudada", step_started: "Step iniciado", step_succeeded: "Step completado", step_failed: "Step fallido", step_reconciliation_required: "Reconciliación requerida", compensation_started: "Compensación iniciada", step_compensated: "Step compensado", compensation_succeeded: "Compensación completada", compensation_failed: "Compensación fallida", compensation_reconciliation_required: "Reconciliación de compensación", compensation_skipped: "Compensación omitida", manual_compensation_required: "Compensación manual", transaction_completed: "Transacción completada", transaction_failed: "Transacción fallida", step_cancelled: "Step cancelado", step_retry_prepared: "Reintento preparado", step_reconciliation_applied: "Reconciliación aplicada", compensation_planned: "Compensación planificada"});

function short(value?: string): string { return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "—"; }
function recover(reviewCase: ReviewCase, incidents: readonly TransactionIncident[] = []): TransactionCenterView { return recoverReviewCenterTransaction(getReviewCase(reviewCase.id) ?? reviewCase, {}, incidents); }
function feedbackStepState(state: string): FeedbackStep["state"] {
  if (["succeeded", "reused", "compensated"].includes(state)) return "completed";
  if (["executing", "compensating"].includes(state)) return "active";
  if (["reconciliation_required", "blocked"].includes(state)) return "warning";
  if (["failed", "compensation_failed"].includes(state)) return "error";
  if (state === "cancelled") return "cancelled";
  return "pending";
}

export default function TransactionOperationalCenter({reviewCase}: {reviewCase: ReviewCase}): ReactElement {
  const [view, setView] = useState<TransactionCenterView>(() => recover(reviewCase));
  const [incidents, setIncidents] = useState<readonly TransactionIncident[]>([]);
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const [compensationOpen, setCompensationOpen] = useState(false);
  const abort = useRef<AbortController>();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const compensationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    abort.current?.abort();
    setIncidents([]);
    setFeedback(undefined);
    setBusy(false);
    setView(recover(reviewCase));
  }, [reviewCase]);

  useEffect(() => { if (feedback?.kind === "error") errorRef.current?.focus(); }, [feedback]);
  useEffect(() => () => abort.current?.abort(), []);

  function refresh(nextIncidents: readonly TransactionIncident[] = incidents): void {
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    setView(recoverReviewCenterTransaction(current, {}, nextIncidents));
  }

  function initialize(regenerate = false): void {
    if (regenerate && !window.confirm("Se regenerará únicamente el checkpoint transaccional desde el plan AU2/AU3 vigente. No se ejecutará ningún step. ¿Continuar?")) return;
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    const result = initializeReviewCenterTransaction(current, {regenerate});
    refresh([]);
    setIncidents([]);
    setFeedback(result.status === "initialized" || result.status === "already_initialized"
      ? {kind: "status", message: result.status === "initialized" ? "Transacción iniciada. Ningún step se ejecutó." : "La transacción vigente ya estaba recuperada."}
      : {kind: "error", message: `No se pudo ${regenerate ? "regenerar" : "iniciar"}: ${result.reasons.join(" · ")}.`});
  }

  async function pause(paused: boolean): Promise<void> {
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    if (!view.transaction) return;
    setBusy(true);
    try {
      const result = await setReviewCenterTransactionPaused({reviewCase: current, transaction: view.transaction, paused});
      refresh();
      setFeedback(result.persisted ? {kind: "status", message: paused ? "Transacción pausada en checkpoint." : "Transacción reanudada; todavía no se ejecutó ningún step."} : {kind: "error", message: `No se pudo actualizar la pausa: ${result.reasons?.join(" · ") ?? "conflicto de checkpoint"}.`});
    } finally { setBusy(false); }
  }

  async function execute(mode: "single_step" | "safe_batch"): Promise<void> {
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    const transaction = view.transaction;
    const globalFingerprint = view.globalCheckpointFingerprint;
    const ready = view.operational?.nextReadySteps ?? [];
    if (!transaction || !globalFingerprint || !ready.length) return;
    const first = transaction.steps.find((step) => step.stepId === ready[0].stepId);
    if (!first) return;
    let authorizations: TransactionExecutionAuthorization[] = [];
    if (mode === "single_step" && first.authorization !== "none") {
      if (!window.confirm(`Autorizar una sola ejecución de ${first.capability} (${first.risk}). La autorización caduca y no se guarda. ¿Continuar?`)) return;
      const authorization = authorizeReviewCenterTransactionStep({reviewCase: current, transaction, stepId: first.stepId, globalCheckpointFingerprint: globalFingerprint});
      if (!authorization) { setFeedback({kind: "error", message: "No se pudo crear la autorización efímera."}); return; }
      authorizations = [authorization];
    } else if (mode === "safe_batch" && !window.confirm("Se ejecutarán secuencialmente solo los steps low/medium preparados que no requieran autorización. El batch se detendrá ante cualquier incidencia. ¿Continuar?")) return;
    const stepIds = ready.filter((descriptor) => {
      const step = transaction.steps.find((item) => item.stepId === descriptor.stepId);
      return step?.authorization === "none" && ["low", "medium"].includes(step.risk);
    }).map((step) => step.stepId);
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setFeedback({kind: "status", message: "Ejecución supervisada en curso…"});
    try {
      const result = await runReviewCenterTransaction({reviewCase: current, mode, stepId: mode === "single_step" ? first.stepId : undefined, stepIds: mode === "safe_batch" ? stepIds : undefined, maxSteps: mode === "safe_batch" ? stepIds.length : 1, authorizations, signal: controller.signal});
      if ("reasons" in result) { setFeedback({kind: "error", message: result.reasons.join(" · ")}); return; }
      setIncidents(result.incidents);
      refresh(result.incidents);
      setFeedback(result.status === "blocked" ? {kind: "error", message: `La ejecución se detuvo de forma segura: ${result.stopReason}.`} : {kind: "status", message: result.status === "completed" ? "Transacción completada." : `Límite seguro alcanzado: ${result.stopReason}.`});
    } catch (error) {
      setFeedback({kind: "error", message: error instanceof Error ? error.message : "La ejecución supervisada no pudo completarse."});
    } finally { abort.current = undefined; setBusy(false); }
  }

  function openReconciliation(): void {
    const target = document.getElementById(`global-resolution-${reviewCase.id}`);
    target?.scrollIntoView({behavior: "smooth", block: "start"});
    target?.focus();
  }

  function openCompensation(): void {
    setCompensationOpen(true);
    window.setTimeout(() => compensationRef.current?.focus(), 0);
  }

  const progress = view.operational?.progress;
  const ready = view.operational?.nextReadySteps ?? [];
  const authorizationRequired = view.operational?.authorizationRequired ?? [];
  const feedbackSteps = view.steps.map((step) => ({
    id: step.stepId,
    label: step.capability,
    state: feedbackStepState(step.state),
    detail: STEP_LABELS[step.state],
  }));

  return <section className="review-subsection transaction-center" aria-labelledby={`transaction-center-title-${reviewCase.id}`} aria-busy={busy}>
    <div className="review-row review-row-wrap">
      <div>
        <p className="review-kicker">AU7 · CONTROL TRANSACCIONAL</p>
        <h4 className="review-subtitle" id={`transaction-center-title-${reviewCase.id}`}>Centro operativo transaccional</h4>
        <p className="review-muted">Recupera el checkpoint al abrir. Cada ejecución, reconciliación, compensación o regeneración requiere una acción explícita.</p>
      </div>
      <strong className={`review-mode-label transaction-state transaction-state-${view.state}`} role="status">{STATE_LABELS[view.state]}</strong>
    </div>

    <dl className="global-resolution-summary" aria-label="Resumen operativo transaccional">
      <div><dt>Estado global</dt><dd>{STATE_LABELS[view.state]}</dd></div>
      <div><dt>Recuperación</dt><dd>{view.recovery}</dd></div>
      <div><dt>Progreso</dt><dd>{progress ? `${progress.completed}/${progress.total}` : "—"}</dd></div>
      <div><dt>Step actual</dt><dd>{view.operational?.currentStep?.capability ?? "Ninguno"}</dd></div>
      <div><dt>Siguientes preparados</dt><dd>{ready.length}</dd></div>
      <div><dt>Incidencias</dt><dd>{view.operational?.incidents.length ?? 0}</dd></div>
      <div><dt>Reconciliación</dt><dd>{view.operational?.reconciliationRequired.length ?? 0}</dd></div>
      <div><dt>Compensación</dt><dd>{view.operational?.compensationRequired.length ?? 0}</dd></div>
      <div><dt>Autorizaciones</dt><dd>{authorizationRequired.length}</dd></div>
      <div><dt>Transacción</dt><dd title={view.transaction?.transactionFingerprint}>{short(view.transaction?.transactionFingerprint)}</dd></div>
      <div><dt>Checkpoint AU7</dt><dd title={view.transactionCheckpointFingerprint}>{short(view.transactionCheckpointFingerprint)}</dd></div>
      <div><dt>Checkpoint AU3</dt><dd title={view.globalCheckpointFingerprint}>{short(view.globalCheckpointFingerprint)}</dd></div>
    </dl>
    {progress ? <ProgressBar label="Progreso de la transacción" current={progress.completed} total={progress.total} state={view.state === "completed" ? "success" : view.state === "failed" ? "error" : view.state === "blocked" || view.state === "stale" ? "warning" : "processing"} detail="Contador derivado de los steps AU7." /> : null}
    {feedbackSteps.length ? <StepProgress label="Steps ordenados por dependencias" steps={feedbackSteps} /> : null}

    <div className="review-actions transaction-actions" aria-label="Acciones transaccionales explícitas">
      {view.canStart ? <button className="review-button" type="button" disabled={busy} onClick={() => initialize(false)}>Iniciar transacción</button> : null}
      {view.transaction && view.recovery !== "absent" ? <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={() => { refresh(); setFeedback({kind: "status", message: "Transacción y progreso recuperados. No se ejecutó ningún step."}); }}>Recuperar transacción</button> : null}
      {view.canExecuteNext ? <button className="review-button" type="button" disabled={busy} onClick={() => void execute("single_step")}>Ejecutar siguiente step</button> : null}
      {view.canExecuteSafeBatch ? <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={() => void execute("safe_batch")}>Ejecutar batch seguro</button> : null}
      {view.canPause ? <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={() => void pause(true)}>Pausar</button> : null}
      {view.canResume ? <button className="review-button" type="button" disabled={busy} onClick={() => void pause(false)}>Reanudar</button> : null}
      {view.canOpenReconciliation ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={openReconciliation}>Abrir reconciliación</button> : null}
      {view.canOpenCompensation ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={openCompensation}>Abrir compensación</button> : null}
      {view.canRegenerate ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={() => initialize(true)}>Regenerar si stale</button> : null}
      {busy ? <button className="review-button review-button-danger" type="button" onClick={() => abort.current?.abort()}>Cancelar en límite seguro</button> : null}
    </div>

    {busy ? <p className="review-feedback" role="status" aria-live="polite">Operación supervisada en curso. Los demás controles permanecen bloqueados.</p> : null}
    {feedback ? <p ref={feedback.kind === "error" ? errorRef : undefined} tabIndex={feedback.kind === "error" ? -1 : undefined} className={feedback.kind === "error" ? "global-resolution-error" : "review-feedback"} role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"}>{feedback.message}</p> : null}
    {view.reasons.length ? <div className="global-resolution-alert" role="alert"><strong>Operación bloqueada.</strong><ul>{view.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
    {incidents.length ? <div className="transaction-incidents" role="alert" aria-label="Incidencias transaccionales">{incidents.map((incident) => <article key={incident.incidentId}><strong>{incident.kind}</strong><span>{incident.safeSummary}</span><small>Acción: {incident.actionRequired} · {short(incident.fingerprint)}</small></article>)}</div> : null}

    {view.steps.length ? <div className="global-resolution-operations transaction-steps" aria-label="Steps ordenados por dependencias">
      {view.steps.map((step, index) => <article className="global-resolution-operation" key={step.stepId}>
        <header><div><strong>{index + 1}. {step.capability}</strong><small>{short(step.stepId)}</small></div><span className={`review-badge ${["failed", "reconciliation_required", "compensation_failed"].includes(step.state) ? "review-badge-danger" : ["succeeded", "reused", "compensated"].includes(step.state) ? "review-badge-ok" : ""}`}>{STEP_LABELS[step.state]}</span></header>
        <p><strong>Dependencias:</strong> {step.dependencies.length ? step.dependencies.map(short).join(", ") : "ninguna"}</p>
        <p><strong>Readiness:</strong> {step.ready ? "preparado" : "no preparado"} · <strong>Riesgo:</strong> {step.risk} · <strong>Modo:</strong> {step.mode}</p>
        <p><strong>Autorización:</strong> {step.authorization === "none" ? "no requerida" : "pendiente y efímera"}</p>
      </article>)}
    </div> : <p className="review-muted">Genera primero el plan AU6 para iniciar una transacción.</p>}

    {compensationOpen ? <div ref={compensationRef} tabIndex={-1} className="global-resolution-alert transaction-compensation" role="alert">
      <strong>Compensación controlada</strong>
      <p>La compensación no se ejecuta desde esta vista. Requiere revisar ownership, evidencia y decisión Saga antes de autorizar cada compensator.</p>
      <p>Steps: {view.operational?.compensationRequired.map(short).join(", ") || "ninguno"}</p>
      <button className="review-button review-button-secondary" type="button" onClick={() => setCompensationOpen(false)}>Cerrar compensación</button>
    </div> : null}

    <section className="transaction-timeline" aria-label="Timeline transaccional seguro">
      <h5>Timeline seguro</h5>
      {view.operational?.timeline.length ? <ol>{view.operational.timeline.map((event) => <li key={event.id}><strong>{EVENT_LABELS[event.kind] ?? event.kind}</strong><span>{event.stepId ? `${short(event.stepId)} · ` : ""}{event.status}</span><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("es-ES")}</time></li>)}</ol> : <p className="review-muted">Sin eventos transaccionales. Abrir el caso no inicia operaciones.</p>}
    </section>
  </section>;
}
