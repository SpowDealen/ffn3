import {lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement} from "react";
import {buildNucleusCompletionSummary, buildNucleusSummary, buildOperationalWorkspaceViewModel, getOperationalWorkspaceZone, type NucleusPrimaryAction, type NucleusResolutionState, type OperationalWorkspaceZoneId} from "../nucleus";
import {useReviewCases} from "../hooks/useReviewCases";
import type {ReviewCase} from "../types";
import CrossCaseIntelligencePanel from "./CrossCaseIntelligencePanel";
import {FeedbackSkeleton, ProgressBar} from "../../components/feedback/VisualFeedback";

type NucleusSection = Exclude<OperationalWorkspaceZoneId, "summary">;
export type NucleusContextView = "overview" | "workspace" | "timeline";
type Feedback = Readonly<{kind: "status" | "alert"; message: string}>;

const LazyOperationalWorkspaceSection = lazy(() => import("./OperationalWorkspaceSection"));
const stateLabels: Readonly<Record<NucleusResolutionState, string>> = Object.freeze({idle: "En espera", analyzing: "Analizando", investigating: "Investigando", resolving_identity: "Resolviendo identidad", planning: "Planificando", awaiting_authorization: "Esperando autorización", executing: "Ejecutando", observing: "Observando", reconciliation_required: "Reconciliación requerida", compensation_required: "Compensación requerida", human_review_required: "Revisión humana requerida", blocked: "Bloqueado", completed: "Completado", stale: "Contexto obsoleto", unsupported: "No soportado todavía"});
const actionClassLabels: Readonly<Record<NucleusPrimaryAction["actionClass"], string>> = Object.freeze({read_only: "Sólo lectura", pure_transform: "Transformación pura", external_effect: "Posible efecto externo", human_decision: "Decisión humana"});
const riskLabels = Object.freeze({low: "bajo", medium: "medio", high: "alto", destructive: "destructivo"});
const sectionLabels: Readonly<Record<NucleusSection, string>> = Object.freeze({evidence: "Evidencia", resolution: "Resolución", execution: "Ejecución", knowledge: "Conocimiento editorial", history: "Historial"});
const contextLabels: Readonly<Record<NucleusContextView, string>> = Object.freeze({overview: "Resumen", workspace: "Workspace", timeline: "Timeline"});

export default function AIResolutionNucleus({reviewCase, canEdit, canFinalize, onFinalize, onContextChange}: {reviewCase: ReviewCase; canEdit: boolean; canFinalize: boolean; onFinalize(): void; onContextChange?(context: NucleusContextView): void}): ReactElement {
  const reviewCases = useReviewCases();
  const workspace = useMemo(() => buildOperationalWorkspaceViewModel({reviewCase}), [reviewCase]);
  const model = workspace.nucleus;
  const [activeContext, setActiveContext] = useState<NucleusContextView>("overview");
  const [activeSection, setActiveSection] = useState<NucleusSection | null>(null);
  const [feedback, setFeedback] = useState<Feedback>();
  const detailRef = useRef<HTMLDivElement>(null);
  const contextPanelRef = useRef<HTMLElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const contextNavigationRef = useRef<HTMLElement>(null);
  const busy = model.state === "analyzing" || model.state === "executing";

  useEffect(() => { if (activeSection) detailRef.current?.focus(); }, [activeSection]);
  useEffect(() => { if (activeContext !== "overview") contextPanelRef.current?.focus(); }, [activeContext]);
  useEffect(() => { if (feedback?.kind === "alert") alertRef.current?.focus(); }, [feedback]);
  function changeContext(context: NucleusContextView): void {
    setActiveContext(context);
    setFeedback(undefined);
    onContextChange?.(context);
  }

  function openWorkspaceSection(section: NucleusSection, message?: string): void {
    changeContext("workspace");
    setActiveSection(section);
    setFeedback(message ? {kind: "status", message} : undefined);
  }

  function primary(): void {
    const action = model.primaryAction;
    if (!action.enabled || action.kind === "none") return;
    if (action.kind === "finish") {
      if (!canFinalize) { setFeedback({kind: "alert", message: "El lifecycle del caso no permite finalizar desde este estado."}); return; }
      if (!window.confirm("Todos los gates resolutivos están satisfechos. ¿Marcar el caso como resuelto?")) return;
      onFinalize();
      return;
    }
    if (action.kind === "resolve_identity" || action.kind === "human_review") {
      document.getElementById(`review-issues-${reviewCase.id}`)?.scrollIntoView({behavior: "smooth", block: "start"});
      setFeedback({kind: "status", message: "Se abrió la decisión humana del caso. El Núcleo no fuerza ninguna resolución."});
      return;
    }
    const section: NucleusSection = action.target === "execution" ? "execution" : action.target === "resolution" ? "resolution" : "evidence";
    openWorkspaceSection(section, `${action.label}: se abrió la autoridad correspondiente. Ninguna operación se ejecutó automáticamente.`);
  }

  function moveContextNavigation(event: KeyboardEvent<HTMLElement>): void {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const buttons = [...(contextNavigationRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    event.preventDefault();
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowRight" ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length;
    const button = buttons[next];
    button?.focus();
    const context = button?.dataset.context as NucleusContextView | undefined;
    if (context) changeContext(context);
  }

  function moveNavigation(event: KeyboardEvent<HTMLElement>): void {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(navigationRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    event.preventDefault();
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  const contextPanelId = `nucleus-context-panel-${reviewCase.id}`;
  return <section className="review-subsection ai-resolution-nucleus" aria-labelledby={`nucleus-title-${reviewCase.id}`} aria-busy={busy}>
    <header className="nucleus-header">
      <div><p className="review-kicker">OPERACIÓN UNIFICADA</p><h4 className="review-subtitle" id={`nucleus-title-${reviewCase.id}`}>Núcleo Resolutivo IA</h4><p className="review-muted">Una vista, una prioridad y las autoridades existentes trabajando como un único flujo.</p></div>
      <span className={`review-mode-label nucleus-state nucleus-state-${model.state}`} role="status">{stateLabels[model.state]}</span>
    </header>

    <section className="nucleus-hero" aria-label="Resumen principal">
      <div><span>Problema</span><strong>{model.case.problem}</strong></div><div><span>Progreso</span><strong>{model.progress.percent}% · {model.progress.completed}/{model.progress.total}</strong></div><div><span>Severidad</span><strong>{model.severity}</strong></div><div><span>Necesita de ti</span><strong>{model.primaryAction.label}</strong></div>
    </section>
    <ProgressBar
      label="Progreso resolutivo"
      current={model.progress.completed}
      total={model.progress.total}
      state={model.state === "completed" ? "success" : model.state === "blocked" || model.state === "stale" || model.state === "unsupported" ? "warning" : "processing"}
      detail="Pasos derivados del plan, checkpoint y transacción existentes."
    />
    <div className="nucleus-primary-action">
      <button className={`review-button nucleus-cta nucleus-risk-${model.primaryAction.risk}`} type="button" disabled={!model.primaryAction.enabled} onClick={primary}>{model.primaryAction.label}</button>
      <button className="review-button review-button-secondary" type="button" onClick={() => changeContext("workspace")}>Abrir workspace</button>
      <span>{actionClassLabels[model.primaryAction.actionClass]} · riesgo {riskLabels[model.primaryAction.risk]}</span>
    </div>
    {model.primaryAction.risk === "high" || model.primaryAction.risk === "destructive" ? <p className="global-resolution-alert" role="alert">Esta acción requiere revisión explícita. El Núcleo no autoriza ni ejecuta efectos por sí solo.</p> : null}
    {feedback ? <p ref={feedback.kind === "alert" ? alertRef : undefined} tabIndex={feedback.kind === "alert" ? -1 : undefined} className={feedback.kind === "alert" ? "global-resolution-error" : "review-feedback"} role={feedback.kind === "alert" ? "alert" : "status"}>{feedback.message}</p> : null}
    {model.unsupported.length ? <div className="global-resolution-alert" role="alert"><strong>No soportado todavía.</strong><ul>{model.unsupported.map((entry) => <li key={entry}>{entry}</li>)}</ul></div> : null}

    <nav ref={contextNavigationRef} className="nucleus-context-nav" aria-label="Vistas del caso" role="tablist" onKeyDown={moveContextNavigation}>
      {(Object.keys(contextLabels) as NucleusContextView[]).map((context) => <button key={context} id={`nucleus-context-tab-${context}-${reviewCase.id}`} data-context={context} type="button" role="tab" tabIndex={activeContext === context ? 0 : -1} aria-selected={activeContext === context} aria-controls={contextPanelId} className={activeContext === context ? "review-button" : "review-button review-button-secondary"} onClick={() => changeContext(context)}>{contextLabels[context]}</button>)}
    </nav>

    <section ref={contextPanelRef} id={contextPanelId} role="tabpanel" aria-labelledby={`nucleus-context-tab-${activeContext}-${reviewCase.id}`} tabIndex={-1} className="nucleus-context-panel">
      {activeContext === "overview" ? <>
        <div className="nucleus-overview" aria-label="Resumen de zonas del workspace">{workspace.zones.filter((zone) => zone.id !== "summary").map((zone) => <article key={zone.id} className={`workspace-zone-card workspace-zone-${zone.state}`}><div className="review-row review-row-wrap"><h5>{zone.label}</h5><span className="review-badge">{zone.state}</span></div><p>{zone.safeSummary}</p><dl>{zone.metrics.map((entry) => <div key={entry.label} className={`workspace-metric-${entry.tone}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl><button type="button" className="review-button review-button-secondary" onClick={() => openWorkspaceSection(zone.id as NucleusSection, `Se abrió ${zone.label}; ninguna operación se ejecutó automáticamente.`)}>Abrir {zone.label}</button></article>)}</div>
        <CrossCaseIntelligencePanel reviewCase={reviewCase} cases={reviewCases.length ? reviewCases : [reviewCase]} />
        <details className="nucleus-details"><summary>Ver detalles seguros</summary><div className="nucleus-safe-summaries"><p>{buildNucleusSummary(model)}</p><p>{buildNucleusCompletionSummary(model)}</p><p>Autonomía: {model.autonomy.visibility} · riesgo {riskLabels[model.autonomy.risk]}.</p><p>Fingerprints: {model.fingerprints.join(" · ") || "no disponibles"}</p><p>Blockers: {model.reasonCodes.join(" · ") || "ninguno"}</p></div></details>
        <details className="nucleus-details"><summary>Ver resumen de finalización</summary><dl className="global-resolution-summary"><div><dt>Corregido</dt><dd>{model.completionSummary.corrected}</dd></div><div><dt>Reutilizado</dt><dd>{model.completionSummary.reused}</dd></div><div><dt>Creado</dt><dd>{model.completionSummary.created}</dd></div><div><dt>Validado</dt><dd>{model.completionSummary.validated}</dd></div><div><dt>Ejecutado</dt><dd>{model.completionSummary.executed}</dd></div><div><dt>Aprendido</dt><dd>{model.completionSummary.learned}</dd></div></dl></details>
      </> : null}

      {activeContext === "workspace" ? <>
        <header className="nucleus-context-header"><div><p className="review-kicker">WORKSPACE RESOLUTIVO</p><h5>Operaciones y autoridades del caso</h5><p className="review-muted">Selecciona sólo la zona que necesitas revisar. El contenido técnico se carga bajo demanda.</p></div></header>
        <div className="nucleus-overview" aria-label="Zonas del workspace">{workspace.zones.map((zone) => <article key={zone.id} className={`workspace-zone-card workspace-zone-${zone.state}`}><div className="review-row review-row-wrap"><h5>{zone.label}</h5><span className="review-badge">{zone.state}</span></div><p>{zone.safeSummary}</p><dl>{zone.metrics.map((entry) => <div key={entry.label} className={`workspace-metric-${entry.tone}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl>{zone.id === "knowledge" ? <small>Experiencia relevante. La evidencia actual prevalece.</small> : null}{zone.id === "summary" ? <small>Vista derivada de snapshots existentes.</small> : <button type="button" className="review-button review-button-secondary" onClick={() => openWorkspaceSection(zone.id as NucleusSection)}>Abrir {zone.label}</button>}</article>)}</div>
        <nav ref={navigationRef} className="nucleus-section-nav" aria-label="Secciones del workspace" onKeyDown={moveNavigation}>{workspace.navigation.map((section) => <button key={section} type="button" className={activeSection === section ? "review-button" : "review-button review-button-secondary"} aria-pressed={activeSection === section} aria-expanded={activeSection === section} aria-controls={`workspace-zone-${reviewCase.id}`} onClick={() => setActiveSection((current) => current === section ? null : section)}>{sectionLabels[section]}</button>)}</nav>
        {activeSection ? <div ref={detailRef} id={`workspace-zone-${reviewCase.id}`} tabIndex={-1} className="nucleus-authority-detail" aria-label={`${sectionLabels[activeSection]} · detalle autoritativo`}><div className="review-row review-row-wrap"><div><p className="review-kicker">WORKSPACE CONTEXTUAL</p><h5>{sectionLabels[activeSection]}</h5><p className="review-muted">{getOperationalWorkspaceZone(workspace, activeSection).safeSummary}</p></div><button type="button" className="review-button review-button-secondary" onClick={() => setActiveSection(null)}>Cerrar sección</button></div><details className="nucleus-details"><summary>Timeline contextual ({workspace.contextualTimeline[activeSection].length})</summary>{workspace.contextualTimeline[activeSection].length ? <ol className="nucleus-timeline">{workspace.contextualTimeline[activeSection].map((event) => <li key={event.id}><strong>{event.label}</strong><span>{event.safeSummary}</span><small>{event.fingerprint}</small></li>)}</ol> : <p className="review-empty">Este caso todavía no tiene actividad resolutiva.</p>}</details><Suspense fallback={<FeedbackSkeleton label={`Cargando ${sectionLabels[activeSection]}`} />}><LazyOperationalWorkspaceSection zone={activeSection} reviewCase={reviewCase} canEdit={canEdit} /></Suspense></div> : null}
      </> : null}

      {activeContext === "timeline" ? <section className="nucleus-timeline-context" aria-labelledby={`nucleus-timeline-title-${reviewCase.id}`}><header className="nucleus-context-header"><div><p className="review-kicker">ACTIVIDAD DEL CASO</p><h5 id={`nucleus-timeline-title-${reviewCase.id}`}>Timeline resolutivo</h5><p className="review-muted">Eventos derivados de los snapshots y checkpoints existentes; no es un log paralelo.</p></div></header>{model.timeline.length ? <ol className="nucleus-timeline">{model.timeline.map((event) => <li key={event.id}><strong>{event.label}</strong><span>{event.safeSummary}</span><small>{event.occurredAt ? `${new Date(event.occurredAt).toLocaleString("es-ES")} · ` : ""}{event.fingerprint}</small></li>)}</ol> : <p className="review-empty">Este caso todavía no tiene actividad resolutiva.</p>}</section> : null}
    </section>
  </section>;
}
