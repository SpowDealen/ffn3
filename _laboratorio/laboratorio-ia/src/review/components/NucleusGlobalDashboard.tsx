import {lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import {buildGlobalResolutionDashboard, type GlobalDashboardFilters, type GlobalResolutionDashboardViewModel} from "../nucleus";
import type {ReviewCase} from "../types";

const LazyDashboardDetails = lazy(() => import("./GlobalResolutionDashboardDetails"));
const healthLabels = Object.freeze({healthy: "Saludable", attention: "Atención", degraded: "Degradado", critical: "Crítico"});
const defaultFilters: GlobalDashboardFilters = Object.freeze({status: "all", producer: "all", entityType: "all", severity: "all", autonomy: "all", risk: "all", capability: "all", knowledgeState: "all"});

function Filter({label, value, options, onChange}: {label: string; value: string; options: readonly string[]; onChange(value: string): void}): ReactElement {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Todos</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function Summary({model}: {model: GlobalResolutionDashboardViewModel}): ReactElement {
  const values = [["Total", model.summary.totalCases], ["Abiertos", model.summary.open], ["Resueltos", model.summary.resolved], ["Bloqueados", model.summary.blocked], ["Stale", model.summary.stale], ["Unsupported", model.summary.unsupported], ["Autorización", model.summary.authorizationRequired], ["Reconciliación", model.summary.reconciliationRequired], ["Compensación", model.summary.compensationRequired], ["Revisión humana", model.summary.humanReviewRequired], ["Autónomo seguro", model.summary.autonomousSafe], ["Supervisado", model.summary.autonomousSupervised]] as const;
  return <div className="global-dashboard-summary" aria-label="Estado general">{values.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>;
}

export default function NucleusGlobalDashboard({cases, evaluatedAt, onOpenCase}: {cases: readonly ReviewCase[]; evaluatedAt: string; onOpenCase(caseId: string): void}): ReactElement {
  const [filters, setFilters] = useState<GlobalDashboardFilters>(defaultFilters);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildGlobalResolutionDashboard({cases, evaluatedAt, filters, limits: {priorityCases: 10, activity: 20, timeline: 30, relations: 12, bottlenecks: 12}}), [cases, evaluatedAt, filters]);
  const filtered = model.filteredCaseCount !== model.summary.totalCases;
  const busy = false;
  const update = <K extends keyof GlobalDashboardFilters>(key: K, value: string): void => setFilters((current) => ({...current, [key]: value}));
  useEffect(() => { if (detailsOpen) detailsRef.current?.focus(); }, [detailsOpen]);

  return <section className="nucleus-global-dashboard" aria-labelledby="global-dashboard-title" aria-busy={busy}>
    <header className="global-dashboard-header"><div><p className="review-kicker">NÚCLEO RESOLUTIVO IA · VISIÓN GLOBAL</p><h3 id="global-dashboard-title">Global Resolution Dashboard</h3><p className="review-muted">Estado operativo derivado de los snapshots existentes. Ninguna acción se ejecuta desde esta vista.</p></div><span className={`global-dashboard-health health-${model.health.state}`} role="status">{healthLabels[model.health.state]}</span></header>
    {(model.health.state === "critical" || model.health.state === "degraded") ? <p className="global-resolution-alert" role="alert">{model.health.safeExplanation}</p> : <p className="review-feedback" role="status">{model.health.safeExplanation}</p>}
    <Summary model={model} />

    <details className="global-dashboard-filters"><summary>Filtrar dashboard {filtered ? `· ${model.filteredCaseCount}/${model.summary.totalCases}` : ""}</summary><div className="global-dashboard-filter-grid">
      <Filter label="Estado" value={filters.status ?? "all"} options={model.facets.statuses} onChange={(value) => update("status", value)} />
      <Filter label="Productor" value={filters.producer ?? "all"} options={model.facets.producers} onChange={(value) => update("producer", value)} />
      <Filter label="Entidad" value={filters.entityType ?? "all"} options={model.facets.entityTypes} onChange={(value) => update("entityType", value)} />
      <Filter label="Severidad" value={filters.severity ?? "all"} options={model.facets.severities} onChange={(value) => update("severity", value)} />
      <Filter label="Autonomía" value={filters.autonomy ?? "all"} options={model.facets.autonomies} onChange={(value) => update("autonomy", value)} />
      <Filter label="Riesgo" value={filters.risk ?? "all"} options={model.facets.risks} onChange={(value) => update("risk", value)} />
      <Filter label="Capability" value={filters.capability ?? "all"} options={model.facets.capabilities} onChange={(value) => update("capability", value)} />
      <Filter label="Knowledge" value={filters.knowledgeState ?? "all"} options={model.facets.knowledgeStates} onChange={(value) => update("knowledgeState", value)} />
      {filtered ? <button className="review-button review-button-secondary" type="button" onClick={() => setFilters(defaultFilters)}>Limpiar filtros</button> : null}
    </div></details>

    <section className="global-dashboard-attention" aria-labelledby="global-dashboard-attention-title"><div className="review-row review-row-wrap"><div><p className="review-kicker">PRIORIZACIÓN EXPLICABLE</p><h4 id="global-dashboard-attention-title">Requieren atención</h4></div><span className="review-badge">{model.filteredCaseCount} casos en alcance</span></div>{model.priorityCases.length ? <ol>{model.priorityCases.slice(0, 6).map((entry) => <li key={entry.caseId}><div className="review-row review-row-wrap"><strong>{entry.title}</strong><span className="review-badge">impacto {entry.impact}</span></div><p>{entry.actionRequired} · {entry.state}</p><small>{entry.relatedCases} relacionados · blockers: {entry.blockers.join(" · ") || "ninguno"}</small><details><summary>Cómo se priorizó</summary><ul>{entry.explanation.map((reason) => <li key={reason}>{reason}</li>)}</ul></details><button className="review-button review-button-secondary" type="button" onClick={() => onOpenCase(entry.caseId)}>Abrir caso</button></li>)}</ol> : <p className="review-muted">No hay casos en el alcance actual.</p>}{model.priorityCases.length > 6 ? <p className="review-muted">Se muestran 6 de {model.priorityCases.length}; ajusta filtros para reducir el alcance.</p> : null}</section>

    <section className="global-dashboard-progress" aria-labelledby="global-dashboard-progress-title"><h4 id="global-dashboard-progress-title">En progreso</h4><p>{model.scopedSummary.open} abiertos · {model.scopedSummary.autonomousSafe} autónomos seguros · {model.scopedSummary.autonomousSupervised} supervisados · {model.activity.counts.transactions} transacciones registradas.</p></section>

    <button className="review-button review-button-secondary global-dashboard-details-toggle" type="button" aria-expanded={detailsOpen} aria-controls="global-dashboard-heavy" onClick={() => setDetailsOpen((current) => !current)}>{detailsOpen ? "Ocultar inteligencia global" : "Ver inteligencia, cuellos de botella y actividad"}</button>
    {detailsOpen ? <div ref={detailsRef} id="global-dashboard-heavy" tabIndex={-1}><Suspense fallback={<div className="workspace-skeleton" role="status" aria-live="polite" aria-label="Cargando dashboard global"><span /><span /><span /><strong>Cargando secciones globales…</strong></div>}><LazyDashboardDetails model={model} /></Suspense></div> : null}
    <footer className="global-dashboard-footer">{model.filteredCaseCount}/{model.summary.totalCases} casos · fingerprint {model.dashboardFingerprint.slice(0, 12)}… · filtros efímeros · AU7 única vía de efectos.</footer>
  </section>;
}
