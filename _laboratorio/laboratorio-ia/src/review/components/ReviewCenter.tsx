import {useEffect, useMemo, useState, type ReactElement} from "react";
import "../../styles.css";
import {
  REVIEW_MODULE_LABELS,
  REVIEW_PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
} from "../formatters";
import {useReviewCases} from "../hooks/useReviewCases";
import {useReviewClock} from "../hooks/useReviewClock";
import {
  dismissReviewCase,
  addReviewResolution,
  removeReviewResolution,
  removeReviewCase,
  transitionReviewCase,
} from "../store/reviewStore";
import type {ReviewCaseStatus, ReviewModule, ReviewPriority} from "../types";
import ReviewCaseDetails from "./ReviewCaseDetails";
import ReviewCaseList from "./ReviewCaseList";
import ReconciliationScanControls from "../entityReconciliation/components/ReconciliationScanControls";
import EntityIdentityLookupControls from "../entityResolution/components/EntityIdentityLookupControls";

type StatusFilter = "all" | ReviewCaseStatus;
type PriorityFilter = "all" | ReviewPriority;
type ModuleFilter = "all" | ReviewModule;

const STATUS_OPTIONS = Object.entries(REVIEW_STATUS_LABELS) as [ReviewCaseStatus, string][];
const PRIORITY_OPTIONS = Object.entries(REVIEW_PRIORITY_LABELS) as [ReviewPriority, string][];
const MODULE_OPTIONS = Object.entries(REVIEW_MODULE_LABELS) as [ReviewModule, string][];
const ACTIVE_STATUSES = new Set<ReviewCaseStatus>([
  "open", "in_review", "resolved", "resuming", "resume_failed", "stale",
]);

export default function ReviewCenter(): ReactElement {
  const reviewCases = useReviewCases();
  const now = useReviewClock();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const hasFilters = statusFilter !== "all" || priorityFilter !== "all" || moduleFilter !== "all" || normalizedSearch.length > 0;

  const {metrics, filteredCases} = useMemo(() => {
    const counts: Record<ReviewCaseStatus, number> = {
      open: 0, in_review: 0, resolved: 0, resuming: 0,
      resumed: 0, resume_failed: 0, stale: 0, dismissed: 0,
    };
    let active = 0;
    const filtered = [];

    for (const reviewCase of reviewCases) {
      counts[reviewCase.status] += 1;
      if (ACTIVE_STATUSES.has(reviewCase.status)) active += 1;

      const searchable = [
        reviewCase.title,
        reviewCase.source,
        reviewCase.subject.label,
        reviewCase.subject.id,
        reviewCase.dedupeKey,
        ...reviewCase.issues.map((issue) => issue.message),
      ].filter(Boolean).join(" ").toLocaleLowerCase("es");

      if (
        (statusFilter === "all" || reviewCase.status === statusFilter) &&
        (priorityFilter === "all" || reviewCase.priority === priorityFilter) &&
        (moduleFilter === "all" || reviewCase.module === moduleFilter) &&
        (!normalizedSearch || searchable.includes(normalizedSearch))
      ) filtered.push(reviewCase);
    }

    return {metrics: {...counts, active}, filteredCases: filtered};
  }, [moduleFilter, normalizedSearch, priorityFilter, reviewCases, statusFilter]);

  const selectedCase = selectedId
    ? reviewCases.find((reviewCase) => reviewCase.id === selectedId)
    : undefined;

  useEffect(() => {
    if (selectedId && !reviewCases.some((reviewCase) => reviewCase.id === selectedId)) {
      setSelectedId(null);
    }
  }, [reviewCases, selectedId]);

  function clearFilters(): void {
    setStatusFilter("all");
    setPriorityFilter("all");
    setModuleFilter("all");
    setSearch("");
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

  return (
    <section className="review-center" id="review-center" aria-labelledby="review-center-title">
      <header className="review-center-header">
        <div>
          <p className="review-kicker">Revisión editorial transversal</p>
          <h2 id="review-center-title">Centro de revisión</h2>
          <p>Inspecciona casos persistidos y sus decisiones pendientes. Las noticias externas listas pueden reanudarse manualmente con confirmación explícita.</p>
        </div>
      </header>

      <EntityIdentityLookupControls />
      <ReconciliationScanControls />

      <div className="review-metrics" aria-label="Resumen de casos">
        <div><strong>{metrics.open}</strong><span>Abiertos</span></div>
        <div><strong>{metrics.in_review}</strong><span>En revisión</span></div>
        <div><strong>{metrics.resolved}</strong><span>Resueltos</span></div>
        <div><strong>{metrics.resuming}</strong><span>Reanudando</span></div>
        <div><strong>{metrics.resume_failed}</strong><span>Fallidos al reanudar</span></div>
        <div><strong>{metrics.stale}</strong><span>Obsoletos</span></div>
        <div><strong>{metrics.dismissed}</strong><span>Descartados</span></div>
        <div className="review-metric-primary"><strong>{metrics.active}</strong><span>Total activo</span></div>
        <div><strong>{metrics.resumed}</strong><span>Reanudados</span></div>
      </div>

      <div className="review-filters">
        <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Todos</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Prioridad<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}><option value="all">Todas</option>{PRIORITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label[0]}{label.slice(1).toLocaleLowerCase("es")}</option>)}</select></label>
        <label>Módulo<select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value as ModuleFilter)}><option value="all">Todos</option>{MODULE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="review-search">Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, fuente, ID o incidencia" /></label>
        {hasFilters ? <button className="review-button review-button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button> : null}
      </div>

      {reviewCases.length === 0 ? (
        <div className="review-empty">No hay casos de revisión.</div>
      ) : filteredCases.length === 0 ? (
        <div className="review-empty"><p>No hay casos que coincidan con los filtros actuales.</p><button className="review-button review-button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button></div>
      ) : (
        <div className="review-workspace">
          <ReviewCaseList reviewCases={filteredCases} selectedId={selectedId} now={now} onSelect={setSelectedId} />
          {selectedCase ? (
            <ReviewCaseDetails
              key={selectedCase.id}
              reviewCase={selectedCase}
              onMarkInReview={() => transitionReviewCase(selectedCase.id, "in_review")}
              onReopen={() => transitionReviewCase(selectedCase.id, "open")}
              onDismiss={dismissSelected}
              onRemove={removeSelected}
              onSaveResolution={(resolution) => addReviewResolution(selectedCase.id, resolution)}
              onRemoveResolution={(issueId) => removeReviewResolution(selectedCase.id, issueId)}
              onMarkResolved={() => transitionReviewCase(selectedCase.id, "resolved")}
            />
          ) : <div className="review-empty review-detail-empty">Selecciona un caso para inspeccionar sus incidencias y contexto.</div>}
        </div>
      )}
    </section>
  );
}
