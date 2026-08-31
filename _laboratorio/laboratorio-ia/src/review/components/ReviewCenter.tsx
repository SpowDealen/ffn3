import {useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import "../../styles.css";
import {REVIEW_STATUS_LABELS} from "../formatters";
import {useReviewCases} from "../hooks/useReviewCases";
import {useReviewClock} from "../hooks/useReviewClock";
import {
  dismissReviewCase,
  addReviewResolution,
  removeReviewResolution,
  removeReviewCase,
  transitionReviewCase,
} from "../store/reviewStore";
import type {ReviewCaseStatus} from "../types";
import {buildGlobalResolutionDashboard, buildOperatorExperience, type OperatorCaseContext, type OperatorFilters, type OperatorWorkspaceSection} from "../nucleus";
import ReviewCaseDetails from "./ReviewCaseDetails";
import ReviewCaseList from "./ReviewCaseList";
import ReconciliationScanControls from "../entityReconciliation/components/ReconciliationScanControls";
import EntityIdentityLookupControls from "../entityResolution/components/EntityIdentityLookupControls";
import {FeedbackEmptyState} from "../../components/feedback/VisualFeedback";
import NucleusGlobalDashboard from "./NucleusGlobalDashboard";
import OperatorExperienceNavigation from "./OperatorExperienceNavigation";
import KnowledgeCenter from "./KnowledgeCenter";
import {resolveReviewCaseDeepLink} from "../intake";

const STATUS_OPTIONS = Object.entries(REVIEW_STATUS_LABELS) as [ReviewCaseStatus, string][];
const ACTIVE_STATUSES = new Set<ReviewCaseStatus>([
  "open", "in_review", "resolved", "resuming", "resume_failed", "stale",
]);

export default function ReviewCenter({initialCaseId}: {initialCaseId?: string | null}): ReactElement {
  const reviewCases = useReviewCases();
  const now = useReviewClock();
  const initialDeepLink = resolveReviewCaseDeepLink(reviewCases, initialCaseId);
  const [operatorFilters, setOperatorFilters] = useState<OperatorFilters>({status: "all", severity: "all", producer: "all", entityType: "all", autonomy: "all", risk: "all", capability: "all", knowledgeState: "all", actionRequired: "all", query: "", page: 1, pageSize: 8});
  const [activeSection, setActiveSection] = useState<OperatorWorkspaceSection>(initialDeepLink.section);
  const [feedback, setFeedback] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(initialDeepLink.caseId ?? null);
  const [caseContext, setCaseContext] = useState<OperatorCaseContext>("overview");
  const handledDeepLink = useRef<string>();

  useEffect(() => {
    const requested = initialCaseId?.trim() ?? "";
    if (!requested || handledDeepLink.current === requested) return;
    handledDeepLink.current = requested;
    const resolved = resolveReviewCaseDeepLink(reviewCases, requested);
    if (resolved.found && resolved.caseId) {
      setSelectedId(resolved.caseId);
      setActiveSection("case");
      setCaseContext("overview");
      setFeedback("Caso abierto desde el enlace directo; no se ejecutó ninguna operación.");
      return;
    }
    setSelectedId(null);
    setActiveSection("dashboard");
    setCaseContext("overview");
    setFeedback("El caso indicado no existe o ya no está disponible. Se mantiene la navegación normal.");
  }, [initialCaseId, reviewCases]);

  const metrics = useMemo(() => {
    const counts: Record<ReviewCaseStatus, number> = {
      open: 0, in_review: 0, resolved: 0, resuming: 0,
      resumed: 0, resume_failed: 0, stale: 0, dismissed: 0,
    };
    let active = 0;
    for (const reviewCase of reviewCases) {
      counts[reviewCase.status] += 1;
      if (ACTIVE_STATUSES.has(reviewCase.status)) active += 1;

    }
    return {...counts, active};
  }, [reviewCases]);
  const operator = useMemo(() => buildOperatorExperience({cases: reviewCases, evaluatedAt: new Date(now).toISOString(), activeSection, selectedCaseId: selectedId ?? undefined, caseContext: activeSection === "case" ? caseContext : "overview", filters: operatorFilters}), [activeSection, caseContext, now, operatorFilters, reviewCases, selectedId]);
  const globalDashboard = useMemo(() => buildGlobalResolutionDashboard({cases: reviewCases, evaluatedAt: new Date(now).toISOString(), limits: {priorityCases: 10, activity: 20, timeline: 30, relations: 12, bottlenecks: 12}}), [now, reviewCases]);
  const filteredCases = operator.rows.map((row) => reviewCases.find((entry) => entry.id === row.caseId)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const hasFilters = Object.entries(operatorFilters).some(([key, value]) => key !== "page" && key !== "pageSize" && value !== "all" && value !== "");

  const selectedCase = selectedId
    ? reviewCases.find((reviewCase) => reviewCase.id === selectedId)
    : undefined;

  function clearFilters(): void {
    setOperatorFilters({status: "all", severity: "all", producer: "all", entityType: "all", autonomy: "all", risk: "all", capability: "all", knowledgeState: "all", actionRequired: "all", query: "", page: 1, pageSize: 8});
  }

  function dismissSelected(): void {
    if (!selectedCase || !window.confirm("¿Quieres descartar este caso de revisión?")) return;
    const reason = window.prompt("Motivo opcional del descarte:", "") ?? undefined;
    dismissReviewCase(selectedCase.id, reason);
  }

  function removeSelected(): void {
    if (!selectedCase || !window.confirm("Esta eliminación es definitiva. ¿Quieres continuar?")) return;
    removeReviewCase(selectedCase.id);
  }

  function openCase(caseId: string, message?: string): void {
    setSelectedId(caseId);
    setActiveSection("case");
    setCaseContext("overview");
    if (message) setFeedback(message);
  }

  function navigate(section: OperatorWorkspaceSection): void {
    setActiveSection(section);
    if (section !== "case") setCaseContext("overview");
  }

  return (
    <section className="review-center" id="review-center" aria-labelledby="review-center-title">
      <header className="review-center-header">
        <div>
          <p className="review-kicker">Revisión editorial transversal</p>
          <h2 id="review-center-title">Centro de revisión</h2>
          <p>Inspecciona casos persistidos y sus decisiones pendientes. Las noticias externas listas pueden reanudarse manualmente con confirmación explícita.</p>
        </div>
      </header>

      <OperatorExperienceNavigation model={operator} onNavigate={navigate} onOpenCase={(caseId) => openCase(caseId)} onFeedback={setFeedback} />
      {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}

      <div id={`review-panel-${activeSection}`} role="tabpanel" aria-labelledby={`review-tab-${activeSection}`} tabIndex={-1} className="review-section-panel">
        {activeSection === "dashboard" ? <NucleusGlobalDashboard cases={reviewCases} evaluatedAt={new Date(now).toISOString()} onOpenCase={(caseId) => openCase(caseId, "Caso abierto desde el dashboard; no se ejecutó ninguna operación.")} /> : null}

        {activeSection === "priorities" ? <section aria-labelledby="review-priorities-title">
          <header className="review-section-header"><p className="review-kicker">PRIORIZACIÓN EXPLICABLE</p><h3 id="review-priorities-title">Casos prioritarios</h3><p className="review-muted">Ranking derivado del Dashboard Global; abrir un caso no ejecuta ninguna operación.</p></header>
          <div className="review-metrics" aria-label="Resumen de casos">
            <div><strong>{metrics.open}</strong><span>Abiertos</span></div><div><strong>{metrics.in_review}</strong><span>En revisión</span></div><div><strong>{metrics.resolved}</strong><span>Resueltos</span></div><div><strong>{metrics.resuming}</strong><span>Reanudando</span></div><div><strong>{metrics.resume_failed}</strong><span>Fallidos al reanudar</span></div><div><strong>{metrics.stale}</strong><span>Obsoletos</span></div><div><strong>{metrics.dismissed}</strong><span>Descartados</span></div><div className="review-metric-primary"><strong>{metrics.active}</strong><span>Total activo</span></div><div><strong>{metrics.resumed}</strong><span>Reanudados</span></div>
          </div>
          <div className="review-filters operator-filters">
            <label>Estado<select value={operatorFilters.status} onChange={(event) => setOperatorFilters((current) => ({...current, status: event.target.value as OperatorFilters["status"], page: 1}))}><option value="all">Todos</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {(["severity", "producer", "entityType", "autonomy", "risk", "capability", "knowledgeState", "actionRequired"] as const).map((key) => <label key={key}>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}<select value={String(operatorFilters[key] ?? "all")} onChange={(event) => setOperatorFilters((current) => ({...current, [key]: event.target.value, page: 1}))}><option value="all">Todos</option>{(key === "severity" ? operator.facets.severities : key === "producer" ? operator.facets.producers : key === "entityType" ? operator.facets.entityTypes : key === "autonomy" ? operator.facets.autonomies : key === "risk" ? operator.facets.risks : key === "capability" ? operator.facets.capabilities : key === "knowledgeState" ? operator.facets.knowledgeStates : operator.facets.actions).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
            <label className="review-search">Buscar<input type="search" value={operatorFilters.query} onChange={(event) => setOperatorFilters((current) => ({...current, query: event.target.value, page: 1}))} placeholder="Título, entidad, ID, productor o capability" /></label>{hasFilters ? <button className="review-button review-button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button> : null}
          </div>
          {reviewCases.length === 0 ? <FeedbackEmptyState title="No hay casos prioritarios" detail="Cuando llegue un caso, aparecerá aquí con su acción requerida." /> : filteredCases.length === 0 ? <FeedbackEmptyState title="Sin coincidencias" detail="No hay casos que coincidan con los filtros actuales." action={{label: "Limpiar filtros", onClick: clearFilters}} /> : <div className="review-workspace"><div className="operator-pagination" role="status">{operator.filtered} casos · página {operator.page}/{operator.pageCount}<button type="button" className="review-button review-button-secondary" disabled={operator.page <= 1} onClick={() => setOperatorFilters((current) => ({...current, page: operator.page - 1}))}>Anterior</button><button type="button" className="review-button review-button-secondary" disabled={operator.page >= operator.pageCount} onClick={() => setOperatorFilters((current) => ({...current, page: operator.page + 1}))}>Siguiente</button></div><ReviewCaseList reviewCases={filteredCases} selectedId={selectedCase ? selectedId : null} now={now} onSelect={openCase} /></div>}
        </section> : null}

        {activeSection === "case" ? <section aria-labelledby="review-nucleus-title">{selectedCase ? <><h3 id="review-nucleus-title" className="sr-only">Núcleo Resolutivo IA</h3><ReviewCaseDetails key={selectedCase.id} reviewCase={selectedCase} onMarkInReview={() => transitionReviewCase(selectedCase.id, "in_review")} onReopen={() => transitionReviewCase(selectedCase.id, "open")} onDismiss={dismissSelected} onRemove={removeSelected} onSaveResolution={(resolution) => addReviewResolution(selectedCase.id, resolution)} onRemoveResolution={(issueId) => removeReviewResolution(selectedCase.id, issueId)} onMarkResolved={() => transitionReviewCase(selectedCase.id, "resolved")} onNucleusContextChange={setCaseContext} /><EntityIdentityLookupControls /><ReconciliationScanControls /></> : <div><h3 id="review-nucleus-title" className="sr-only">Workspace resolutivo</h3><FeedbackEmptyState title="Selecciona un caso para abrir el workspace resolutivo." detail="El Núcleo muestra el workspace del caso elegido; no inventa contexto ni ejecuta acciones al abrirse." />{operator.rows.length ? <div className="review-actions">{operator.rows.slice(0, 5).map((row) => <button key={row.caseId} type="button" className="review-button review-button-secondary" onClick={() => openCase(row.caseId)}>{row.title}</button>)}</div> : null}</div>}</section> : null}

        {activeSection === "activity" ? <section className="review-subsection" aria-labelledby="review-activity-title"><header><p className="review-kicker">ACTIVIDAD DERIVADA</p><h3 id="review-activity-title">Actividad, procesos e incidencias</h3><p className="review-muted">Timeline existente derivado de snapshots; no es un segundo log.</p></header><dl className="global-dashboard-mini-metrics">{Object.entries(globalDashboard.activity.counts).map(([kind, count]) => <div key={kind}><dt>{kind.replace(/_/g, " ")}</dt><dd>{count}</dd></div>)}</dl>{globalDashboard.timeline.length ? <ol className="global-dashboard-timeline">{globalDashboard.timeline.map((entry) => <li key={entry.eventId}><strong>{entry.caseTitle}</strong><span>{entry.safeSummary}</span><small>{new Date(entry.occurredAt).toLocaleString("es-ES")} · {entry.kind.replace(/_/g, " ")}</small><button type="button" className="review-button review-button-secondary" onClick={() => openCase(entry.caseId)}>Abrir caso</button></li>)}</ol> : <p className="review-empty">Todavía no hay actividad registrada.</p>}</section> : null}

        {activeSection === "knowledge" ? <section aria-labelledby="review-knowledge-title">{selectedCase ? <KnowledgeCenter reviewCase={selectedCase} /> : <div className="review-empty"><h3 id="review-knowledge-title">Todavía no hay conocimiento relevante seleccionado.</h3><p>Selecciona un caso para ver sus recomendaciones AU9, siempre advisory-only.</p>{operator.rows.length ? <div className="review-actions">{operator.rows.slice(0, 5).map((row) => <button key={row.caseId} type="button" className="review-button review-button-secondary" onClick={() => setSelectedId(row.caseId)}>Seleccionar {row.title}</button>)}</div> : null}</div>}</section> : null}
      </div>
    </section>
  );
}
