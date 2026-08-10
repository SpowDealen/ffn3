import {type ReactElement} from "react";
import type {OperatorExperienceViewModel, OperatorWorkspaceSection} from "../nucleus";

const actionFeedback = (kind: string): string => kind === "authorize" ? "Requiere autorización: se abrió el caso, sin autorizar nada automáticamente." : kind === "reconcile" ? "Requiere reconciliación: se abrió la autoridad AU4 del caso." : kind === "regenerate" ? "Contexto stale: se abrió el caso para regenerar evidencia explícitamente." : kind === "continue" ? "Continuar: se abrió la transacción autorizada; no se ejecutó ningún step." : kind === "human_review" ? "Revisión requerida: se abrió el caso para decisión humana." : "Caso abierto en su autoridad existente.";

export default function OperatorExperienceNavigation({model, onNavigate, onOpenCase, onFeedback}: {model: OperatorExperienceViewModel; onNavigate(section: OperatorWorkspaceSection): void; onOpenCase(caseId: string): void; onFeedback(message: string): void}): ReactElement {
  return <section className="operator-experience" aria-label="Navegación operativa" aria-busy={false}>
    <nav className="operator-breadcrumbs" aria-label="Breadcrumbs">{model.breadcrumbs.map((entry, index) => <span key={`${entry}:${index}`}>{entry}{index < model.breadcrumbs.length - 1 ? " / " : ""}</span>)}</nav>
    <div className="operator-nav" role="tablist" aria-label="Áreas operativas">{model.navigation.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={model.activeSection === entry.id} className={model.activeSection === entry.id ? "review-button" : "review-button review-button-secondary"} onClick={() => onNavigate(entry.id)}>{entry.label}<span>{entry.badge}</span></button>)}</div>
    {model.notifications.length ? <div className="operator-notifications" role="status" aria-live="polite">{model.notifications.map((entry) => <p key={entry.id} className={`operator-notification-${entry.priority}`}><strong>{entry.kind.replace(/_/g, " ")}</strong> · {entry.safeMessage}</p>)}</div> : null}
    <div className="operator-quick-actions" aria-label="Acciones rápidas autorizadas">{model.rows.slice(0, 4).map((row) => <button key={row.caseId} type="button" className="review-button review-button-secondary" disabled={!row.action.enabled} onClick={() => { onOpenCase(row.caseId); onFeedback(actionFeedback(row.action.kind)); }}><span className={row.live ? "operator-spinner" : undefined} aria-hidden="true" />{row.action.label}: {row.title}</button>)}</div>
  </section>;
}
