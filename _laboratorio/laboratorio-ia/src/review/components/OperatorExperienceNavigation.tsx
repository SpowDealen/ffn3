import {useRef, type KeyboardEvent, type ReactElement} from "react";
import type {OperatorExperienceViewModel, OperatorWorkspaceSection} from "../nucleus";

const actionFeedback = (kind: string): string => kind === "authorize" ? "Requiere autorización: se abrió el caso, sin autorizar nada automáticamente." : kind === "reconcile" ? "Requiere reconciliación: se abrió la autoridad AU4 del caso." : kind === "regenerate" ? "Contexto stale: se abrió el caso para regenerar evidencia explícitamente." : kind === "continue" ? "Continuar: se abrió la transacción autorizada; no se ejecutó ningún step." : kind === "human_review" ? "Revisión requerida: se abrió el caso para decisión humana." : "Caso abierto en su autoridad existente.";

const notificationLabel = (kind: string): string => ({authorization: "Autorización requerida", reconciliation: "Reconciliación requerida", failure: "Caso bloqueado", stale: "Información desactualizada", completed: "Completado", shared_blocker: "Bloqueo compartido"})[kind] ?? "Aviso operativo";

export default function OperatorExperienceNavigation({model, onNavigate, onOpenCase, onFeedback}: {model: OperatorExperienceViewModel; onNavigate(section: OperatorWorkspaceSection): void; onOpenCase(caseId: string): void; onFeedback(message: string): void}): ReactElement {
  const tabsRef = useRef<HTMLDivElement>(null);
  function moveTab(event: KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...(tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
    if (!tabs.length) return;
    event.preventDefault();
    const current = Math.max(0, tabs.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (current + 1) % tabs.length : (current - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    const section = tabs[next]?.dataset.section as OperatorWorkspaceSection | undefined;
    if (section) onNavigate(section);
  }
  return <section className="operator-experience" aria-label="Navegación operativa" aria-busy={false}>
    <nav className="operator-breadcrumbs" aria-label="Breadcrumbs">{model.breadcrumbs.map((entry, index) => <span key={`${entry}:${index}`}>{entry}{index < model.breadcrumbs.length - 1 ? " / " : ""}</span>)}</nav>
    <div ref={tabsRef} className="operator-nav" role="tablist" aria-label="Áreas operativas" onKeyDown={moveTab}>{model.navigation.map((entry) => <button key={entry.id} id={`review-tab-${entry.id}`} data-section={entry.id} type="button" role="tab" tabIndex={model.activeSection === entry.id ? 0 : -1} aria-selected={model.activeSection === entry.id} aria-controls={`review-panel-${entry.id}`} className={model.activeSection === entry.id ? "review-button" : "review-button review-button-secondary"} onClick={() => onNavigate(entry.id)}>{entry.label}<span>{entry.badge}</span></button>)}</div>
    {model.notifications.length ? <div className="operator-notifications" role="status" aria-live="polite">{model.notifications.map((entry) => <p key={entry.id} className={`operator-notification-${entry.priority}`}><strong>{notificationLabel(entry.kind)}</strong> · {entry.safeMessage}</p>)}</div> : null}
    <div className="operator-quick-actions" aria-label="Acciones rápidas autorizadas">{model.rows.slice(0, 4).map((row) => <button key={row.caseId} type="button" className="review-button review-button-secondary" disabled={!row.action.enabled} onClick={() => { onOpenCase(row.caseId); onFeedback(actionFeedback(row.action.kind)); }}><span className={row.live ? "operator-spinner" : undefined} aria-hidden="true" />{row.action.label}: {row.title}</button>)}</div>
  </section>;
}
