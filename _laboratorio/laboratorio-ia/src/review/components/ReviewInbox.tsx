import {useMemo, useRef, useState, type KeyboardEvent, type ReactElement} from "react";
import {selectReviewInbox, type ReviewInboxBucket, type ReviewInboxFilters, type ReviewInboxItem} from "../inbox";
import type {ReviewCase, ReviewPriority} from "../types";

const TABS: readonly Readonly<{id: ReviewInboxBucket; label: string}>[] = Object.freeze([
  {id: "needs_attention", label: "Necesitan atención"},
  {id: "in_process", label: "En proceso"},
  {id: "resolved", label: "Resueltos"},
]);

const EMPTY_STATES: Readonly<Record<ReviewInboxBucket, string>> = Object.freeze({
  needs_attention: "No hay nada que requiera tu atención.",
  in_process: "No hay revisiones en proceso.",
  resolved: "Todavía no hay casos resueltos.",
});

function fixtureHref(item: ReviewInboxItem, fixtureQuery?: string): string {
  return fixtureQuery
    ? `/revision?fixture=${encodeURIComponent(fixtureQuery)}&case=${encodeURIComponent(item.caseId)}`
    : item.primaryAction.href;
}

function InboxCard({item, fixtureQuery}: {item: ReviewInboxItem; fixtureQuery?: string}): ReactElement {
  return <article className="review-inbox-card" aria-labelledby={`review-inbox-case-${item.caseId}`}>
    <header>
      <p>{item.sourceLabel} · {item.entityLabel}</p>
      <span className="review-inbox-status">{item.humanStatus}</span>
    </header>
    <p className={`review-inbox-priority review-inbox-priority-${item.priority}`}>Prioridad {item.priorityLabel}</p>
    <h4 id={`review-inbox-case-${item.caseId}`}>{item.problemTitle}</h4>
    <div className="review-inbox-recommendation">
      <strong>Recomendación</strong>
      <p>{item.recommendationSummary}</p>
    </div>
    <a className="review-button review-inbox-primary-action" href={fixtureHref(item, fixtureQuery)}>{item.primaryAction.label}</a>
  </article>;
}

export default function ReviewInbox({reviewCases, fixtureQuery}: {reviewCases: readonly ReviewCase[]; fixtureQuery?: string}): ReactElement {
  const [activeBucket, setActiveBucket] = useState<ReviewInboxBucket>("needs_attention");
  const [filters, setFilters] = useState<ReviewInboxFilters>({source: "all", entity: "all", priority: "all"});
  const tabsRef = useRef<HTMLDivElement>(null);
  const inbox = useMemo(() => selectReviewInbox(reviewCases, filters), [filters, reviewCases]);
  const activeItems = inbox.groups[activeBucket];

  function setFilter(key: keyof ReviewInboxFilters, value: string): void {
    setFilters((current) => ({...current, [key]: value}));
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>): void {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const tabs = [...(tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    if (!tabs.length) return;
    event.preventDefault();
    const current = Math.max(0, tabs.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
    const bucket = tabs[next]?.dataset.bucket as ReviewInboxBucket | undefined;
    tabs[next]?.focus();
    if (bucket) setActiveBucket(bucket);
  }

  return <section className="review-inbox" aria-labelledby="review-inbox-heading">
    <header className="review-inbox-heading">
      <div><p className="review-kicker">Bandeja unificada</p><h3 id="review-inbox-heading">Review Inbox</h3></div>
      <p>Decide qué revisar ahora, qué sigue en curso y qué ya terminó.</p>
    </header>

    <div ref={tabsRef} className="review-inbox-tabs" role="tablist" aria-label="Estado de los casos" onKeyDown={moveTab}>
      {TABS.map((tab) => <button key={tab.id} id={`review-inbox-tab-${tab.id}`} data-bucket={tab.id} type="button" role="tab" tabIndex={activeBucket === tab.id ? 0 : -1} aria-selected={activeBucket === tab.id} aria-controls={`review-inbox-panel-${tab.id}`} onClick={() => setActiveBucket(tab.id)}><span>{tab.label}</span><strong>{inbox.counts[tab.id]}</strong></button>)}
    </div>

    <div className="review-inbox-filters" aria-label="Filtros de la Inbox">
      <label>Fuente<select value={filters.source} onChange={(event) => setFilter("source", event.target.value)}><option value="all">Todas</option>{inbox.facets.sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
      <label>Tipo<select value={filters.entity} onChange={(event) => setFilter("entity", event.target.value)}><option value="all">Todos</option>{inbox.facets.entities.map((entity) => <option key={entity} value={entity}>{entity}</option>)}</select></label>
      <label>Prioridad<select value={filters.priority} onChange={(event) => setFilter("priority", event.target.value as ReviewPriority | "all")}><option value="all">Todas</option>{inbox.facets.priorities.map((priority) => <option key={priority} value={priority}>{priority === "critical" ? "Crítica" : priority === "high" ? "Alta" : priority === "normal" ? "Normal" : "Baja"}</option>)}</select></label>
    </div>

    <div id={`review-inbox-panel-${activeBucket}`} className="review-inbox-panel" role="tabpanel" tabIndex={-1} aria-labelledby={`review-inbox-tab-${activeBucket}`}>
      {activeItems.length ? <div className="review-inbox-grid">{activeItems.map((item) => <InboxCard key={item.caseId} item={item} fixtureQuery={fixtureQuery} />)}</div> : <p className="review-inbox-empty">{EMPTY_STATES[activeBucket]}</p>}
    </div>
  </section>;
}
