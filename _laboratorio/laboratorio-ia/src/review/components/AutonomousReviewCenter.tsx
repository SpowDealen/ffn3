import {useEffect, useRef, useState, type ReactElement} from "react";
import {
  buildAutonomySummary,
  buildAutonomousDecisionSummary,
  buildAutonomousReviewCenterModel,
  buildEvidenceSummary,
  buildLoopSummary,
  buildStrategySummary,
  createReviewStoreAutonomousReviewCenterRuntime,
  pauseAutonomousReviewCenter,
  regenerateAutonomousReviewCenter,
  runAutonomousSupervisedLoop,
  stampAutonomousReviewCenterContext,
  type AutonomousReviewCenterModel,
} from "../editorialDecision";
import {getReviewCase} from "../store/reviewStore";
import type {ReviewCase} from "../types";
import ProcessExperienceSummary from "../../processes/ProcessExperienceSummary";
import {buildAutonomousProcessPresentation} from "../../processes/presentation";

type Feedback = Readonly<{kind: "status" | "error"; message: string}>;
const STATE_LABELS: Readonly<Record<AutonomousReviewCenterModel["state"], string>> = Object.freeze({not_initialized: "No iniciado", evaluating: "Evaluando", investigating: "Investigando", planning: "Planificando", preparing_transaction: "Preparando transacción", executing_supervised: "Ejecutando supervisado", observing: "Observando", paused: "Pausado", authorization_required: "Autorización requerida", reconciliation_required: "Reconciliación requerida", compensation_required: "Compensación requerida", human_review: "Revisión humana", blocked: "Bloqueado", completed: "Completado", stale: "Stale"});
const ACTION_LABELS: Readonly<Record<AutonomousReviewCenterModel["actionRequired"], string>> = Object.freeze({none: "Sin acción requerida", continue: "Continuar ciclo", investigate: "Investigar", authorize: "Abrir autorización", reconcile: "Abrir reconciliación", compensate: "Abrir compensación", human_review: "Solicitar revisión humana", regenerate: "Regenerar inteligencia"});
const short = (value?: string): string => value ? `${value.slice(0, 12)}…${value.slice(-8)}` : "—";
const safeCodes = (codes: readonly string[]): string => codes.map((code) => code.replace(/[^a-z0-9:_-]/gi, "").slice(0, 80)).filter(Boolean).join(" · ") || "operación_no_disponible";

function recover(reviewCase: ReviewCase): AutonomousReviewCenterModel {
  return buildAutonomousReviewCenterModel(getReviewCase(reviewCase.id) ?? reviewCase);
}

/** B6 presentation only. AU7 is rendered separately and remains the transaction authority. */
export default function AutonomousReviewCenter({reviewCase}: {reviewCase: ReviewCase}): ReactElement {
  const [model, setModel] = useState<AutonomousReviewCenterModel>(() => recover(reviewCase));
  const [feedback, setFeedback] = useState<Feedback>();
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const handoffRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setModel(recover(reviewCase)); setFeedback(undefined); setBusy(false); }, [reviewCase]);
  useEffect(() => { if (feedback?.kind === "error") errorRef.current?.focus(); }, [feedback]);

  function refresh(message?: Feedback): AutonomousReviewCenterModel {
    const next = recover(reviewCase);
    setModel(next);
    if (message) setFeedback(message);
    return next;
  }

  function scrollTo(id: string): void { document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"}); }

  function regenerate(): void {
    if (!window.confirm("Se regenerarán los resúmenes AU8 y el checkpoint de plan AU6. No se ejecutará ningún step ni se conservarán autorizaciones runtime. ¿Continuar?")) return;
    const result = regenerateAutonomousReviewCenter(reviewCase.id);
    refresh(result.ok ? {kind: "status", message: "Inteligencia regenerada. No se ejecutó ningún step; inicia o continúa sólo de forma explícita."} : {kind: "error", message: `No se pudo regenerar: ${safeCodes(result.reasonCodes)}.`});
  }

  async function run(intent: "start" | "continue"): Promise<void> {
    const current = getReviewCase(reviewCase.id) ?? reviewCase;
    if (!current.globalResolution) { setFeedback({kind: "error", message: "Primero regenera la inteligencia para crear el plan AU6; no se ejecutó nada."}); return; }
    setBusy(true);
    setFeedback({kind: "status", message: intent === "start" ? "Evaluación supervisada en curso…" : "Continuación supervisada en curso…"});
    try {
      const result = await runAutonomousSupervisedLoop({caseId: reviewCase.id, intent, maxIterations: 3, runtime: createReviewStoreAutonomousReviewCenterRuntime()});
      const next = refresh({kind: "status", message: result.phase === "completed" ? "Ciclo completado." : `Ciclo detenido de forma segura: ${result.stopReason ?? result.phase}.`});
      stampAutonomousReviewCenterContext(reviewCase.id, next.contextFingerprint);
      refresh();
    } catch {
      refresh({kind: "error", message: "El ciclo no pudo continuar. Se mantuvo bloqueado de forma segura."});
    } finally { setBusy(false); }
  }

  function pause(): void {
    const result = pauseAutonomousReviewCenter(reviewCase.id);
    refresh(result.ok ? {kind: "status", message: "Ciclo pausado en AU3. Reanudar será siempre una acción explícita."} : {kind: "error", message: `No se pudo pausar: ${safeCodes(result.reasonCodes)}.`});
  }

  function handoff(kind: "authorize" | "reconcile" | "compensate" | "human_review"): void {
    if (kind === "authorize" || kind === "compensate") scrollTo(`transaction-center-title-${reviewCase.id}`);
    if (kind === "reconcile") scrollTo(`global-resolution-${reviewCase.id}`);
    setFeedback({kind: "status", message: kind === "human_review" ? "Revisión humana solicitada: valida motivo, evidencia y riesgo antes de continuar." : "Se abrió el flujo autoritativo correspondiente; el Centro Autónomo no ejecuta esta acción."});
    window.setTimeout(() => handoffRef.current?.focus(), 0);
  }

  const cta = model.actionRequired;
  const processPresentation = buildAutonomousProcessPresentation(model, busy);
  return <section className="review-subsection autonomous-operational-center" aria-labelledby={`autonomous-center-title-${reviewCase.id}`} aria-busy={busy}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">AU8 · CENTRO AUTÓNOMO</p><h4 className="review-subtitle" id={`autonomous-center-title-${reviewCase.id}`}>Centro Autónomo</h4><p className="review-muted">Recupera y explica. Abrir el caso no inicia evaluaciones, transacciones ni efectos.</p></div>
      <strong className={`review-mode-label autonomous-center-state autonomous-center-state-${model.state}`} role="status">{STATE_LABELS[model.state]}</strong>
    </div>

    <dl className="global-resolution-summary" aria-label="Resumen autónomo seguro">
      <div><dt>Estado</dt><dd>{STATE_LABELS[model.state]}</dd></div><div><dt>Acción requerida</dt><dd>{ACTION_LABELS[cta]}</dd></div>
      <div><dt>Evidencia</dt><dd>{model.sufficiency?.status ?? "—"}</dd></div><div><dt>Decisión</dt><dd>{model.decision?.kind ?? "—"}</dd></div>
      <div><dt>Autonomía</dt><dd>{model.autonomy?.level ?? "—"}</dd></div><div><dt>Estrategia</dt><dd>{model.strategy?.status ?? "—"}</dd></div>
      <div><dt>Transacción</dt><dd>{model.transaction.completed}/{model.transaction.total}</dd></div><div><dt>Iteración</dt><dd>{model.loop?.iteration ?? "—"}</dd></div>
    </dl>

    <ProcessExperienceSummary process={processPresentation} />

    <div className="review-actions autonomous-center-actions" aria-label="Controles explícitos del Centro Autónomo">
      {model.state === "not_initialized" ? <button className="review-button" type="button" disabled={busy} onClick={regenerate}>Iniciar evaluación</button> : null}
      {model.state !== "not_initialized" && model.state !== "completed" ? <button className="review-button" type="button" disabled={busy || cta !== "continue"} onClick={() => void run("start")}>Iniciar evaluación</button> : null}
      {model.state !== "not_initialized" && model.state !== "completed" ? <button className="review-button review-button-secondary" type="button" disabled={busy || !["continue", "investigate"].includes(cta)} onClick={() => void run("continue")}>Continuar ciclo</button> : null}
      {model.loop && model.state !== "completed" ? <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={pause}>Pausar</button> : null}
      {model.state === "paused" ? <button className="review-button" type="button" disabled={busy} onClick={() => void run("continue")}>Reanudar</button> : null}
      <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={regenerate}>Regenerar inteligencia</button>
      {cta === "authorize" ? <button className="review-button" type="button" disabled={busy} onClick={() => handoff("authorize")}>Abrir autorización</button> : null}
      {cta === "reconcile" ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={() => handoff("reconcile")}>Abrir reconciliación</button> : null}
      {cta === "compensate" ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={() => handoff("compensate")}>Abrir compensación</button> : null}
      {cta === "human_review" ? <button className="review-button review-button-danger" type="button" disabled={busy} onClick={() => handoff("human_review")}>Solicitar revisión humana</button> : null}
    </div>

    {feedback ? <p ref={feedback.kind === "error" ? errorRef : undefined} tabIndex={feedback.kind === "error" ? -1 : undefined} className={feedback.kind === "error" ? "global-resolution-error" : "review-feedback"} role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"}>{feedback.message}</p> : null}
    {model.staleReasons.length ? <div className="global-resolution-alert" role="alert"><strong>Regeneración requerida.</strong><p>{model.staleReasons.join(" · ")}</p></div> : null}

    <div className="autonomous-center-explanations" aria-label="Explicación segura">
      <article><h5>Evidencia</h5><p>{buildEvidenceSummary(model)}</p></article><article><h5>Decisión</h5><p>{buildAutonomousDecisionSummary(model)}</p></article>
      <article><h5>Autonomía</h5><p>{buildAutonomySummary(model)}</p></article><article><h5>Estrategia</h5><p>{buildStrategySummary(model)}</p></article>
      <article><h5>Loop</h5><p>{buildLoopSummary(model)}</p></article>
    </div>

    <details className="autonomous-center-details"><summary>Evidencia y provenance ({model.evidence.length})</summary><ul>{model.evidence.map((item) => <li key={item.id}>{item.source}: {item.summary} <span title={item.fingerprint}>{short(item.fingerprint)}</span></li>)}</ul></details>
    <details className="autonomous-center-details"><summary>Pasos de estrategia ({model.strategy?.steps.length ?? 0})</summary><ol>{model.strategy?.steps.map((step) => <li key={step.id}><strong>{step.kind}</strong> · {step.objective} · dependencias: {step.dependencyIds.length || "ninguna"} · riesgo {step.risk}</li>)}</ol></details>
    <details className="autonomous-center-details"><summary>Historial compacto ({model.history.length}/25)</summary><ol>{model.history.map((entry) => <li key={entry.iteration}>#{entry.iteration} · {entry.decisionKind} · {entry.sufficiencyStatus} · {entry.autonomyLevel} · {entry.result}{entry.stopReason ? ` · ${entry.stopReason}` : ""} · <span title={entry.strategyFingerprint}>{short(entry.strategyFingerprint)}</span>{entry.occurredAt ? ` · ${new Date(entry.occurredAt).toLocaleString("es-ES")}` : ""}</li>)}</ol></details>
    <details className="autonomous-center-details"><summary>Intents de investigación</summary><p>Sólo lectura autónoma si B3 permite <code>autonomous_safe</code> y existe adapter registrado.</p><ul><li>inspect_sanity</li><li>inspect_source</li><li>search_candidates</li><li>compare_entities</li><li>wait_for_evidence</li></ul></details>
    <div ref={handoffRef} tabIndex={-1} className="autonomous-center-handoff" role="status"><strong>Handoffs seguros:</strong> autorizaciones no se persisten; reconciliación se resuelve en AU4; compensación en AU7; las capacidades no soportadas permanecen bloqueadas.</div>
  </section>;
}
