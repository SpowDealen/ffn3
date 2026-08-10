import {useMemo, useState, type ReactElement} from "react";
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
import {buildOperatorExperience, type OperatorFilters, type OperatorWorkspaceSection} from "../nucleus";
import ReviewCaseDetails from "./ReviewCaseDetails";
import ReviewCaseList from "./ReviewCaseList";
import ReconciliationScanControls from "../entityReconciliation/components/ReconciliationScanControls";
import EntityIdentityLookupControls from "../entityResolution/components/EntityIdentityLookupControls";
import NucleusGlobalDashboard from "./NucleusGlobalDashboard";
import OperatorExperienceNavigation from "./OperatorExperienceNavigation";

const STATUS_OPTIONS = Object.entries(REVIEW_STATUS_LABELS) as [ReviewCaseStatus, string][];
const ACTIVE_STATUSES = new Set<ReviewCaseStatus>([
  "open", "in_review", "resolved", "resuming", "resume_failed", "stale",
]);

export default function ReviewCenter(): ReactElement {
  const reviewCases = useReviewCases();
  const now = useReviewClock();
  const [operatorFilters, setOperatorFilters] = useState<OperatorFilters>({status: "all", severity: "all", producer: "all", entityType: "all", autonomy: "all", risk: "all", capability: "all", knowledgeState: "all", actionRequired: "all", query: "", page: 1, pageSize: 8});
  const [activeSection, setActiveSection] = useState<OperatorWorkspaceSection>("dashboard");
  const [feedback, setFeedback] = useState<string>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const operator = useMemo(() => buildOperatorExperience({cases: reviewCases, evaluatedAt: new Date(now).toISOString(), activeSection, selectedCaseId: selectedId ?? undefined, filters: operatorFilters}), [activeSection, now, operatorFilters, reviewCases, selectedId]);
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

  return (
    <section className="review-center" id="review-center" aria-labelledby="review-center-title">
      <header className="review-center-header">
        <div>
          <p className="review-kicker">Revisión editorial transversal</p>
          <h2 id="review-center-title">Centro de revisión</h2>
          <p>Inspecciona casos persistidos y sus decisiones pendientes. Las noticias externas listas pueden reanudarse manualmente con confirmación explícita.</p>
        </div>
      </header>

      <OperatorExperienceNavigation model={operator} onNavigate={setActiveSection} onOpenCase={(caseId) => { setSelectedId(caseId); setActiveSection("case"); }} onFeedback={setFeedback} />
      {feedback ? <p className="review-feedback" role="status">{feedback}</p> : null}

      <NucleusGlobalDashboard cases={reviewCases} evaluatedAt={new Date(now).toISOString()} onOpenCase={(caseId) => { setSelectedId(caseId); setActiveSection("case"); setFeedback("Caso abierto desde el dashboard; no se ejecutó ninguna operación."); }} />

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

      <div className="review-filters operator-filters">
        <label>Estado<select value={operatorFilters.status} onChange={(event) => setOperatorFilters((current) => ({...current, status: event.target.value as OperatorFilters["status"], page: 1}))}><option value="all">Todos</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {(["severity", "producer", "entityType", "autonomy", "risk", "capability", "knowledgeState", "actionRequired"] as const).map((key) => <label key={key}>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}<select value={String(operatorFilters[key] ?? "all")} onChange={(event) => setOperatorFilters((current) => ({...current, [key]: event.target.value, page: 1}))}><option value="all">Todos</option>{(key === "severity" ? operator.facets.severities : key === "producer" ? operator.facets.producers : key === "entityType" ? operator.facets.entityTypes : key === "autonomy" ? operator.facets.autonomies : key === "risk" ? operator.facets.risks : key === "capability" ? operator.facets.capabilities : key === "knowledgeState" ? operator.facets.knowledgeStates : operator.facets.actions).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
        <label className="review-search">Buscar<input type="search" value={operatorFilters.query} onChange={(event) => setOperatorFilters((current) => ({...current, query: event.target.value, page: 1}))} placeholder="Título, entidad, ID, productor o capability" /></label>
        {hasFilters ? <button className="review-button review-button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button> : null}
      </div>

      {reviewCases.length === 0 ? (
        <div className="review-empty">No hay casos de revisión.</div>
      ) : filteredCases.length === 0 ? (
        <div className="review-empty"><p>No hay casos que coincidan con los filtros actuales.</p><button className="review-button review-button-secondary" type="button" onClick={clearFilters}>Limpiar filtros</button></div>
      ) : (
        <div className="review-workspace">
          <div className="operator-pagination" role="status">{operator.filtered} casos · página {operator.page}/{operator.pageCount}<button type="button" className="review-button review-button-secondary" disabled={operator.page <= 1} onClick={() => setOperatorFilters((current) => ({...current, page: operator.page - 1}))}>Anterior</button><button type="button" className="review-button review-button-secondary" disabled={operator.page >= operator.pageCount} onClick={() => setOperatorFilters((current) => ({...current, page: operator.page + 1}))}>Siguiente</button></div>
          <ReviewCaseList reviewCases={filteredCases} selectedId={selectedCase ? selectedId : null} now={now} onSelect={setSelectedId} />
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
