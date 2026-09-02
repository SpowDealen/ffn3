import type {ReactElement} from "react";
import {FeedbackBanner, FeedbackEmptyState, FeedbackSkeleton, ProcessingBadge} from "../../components/feedback/VisualFeedback";
import {adaptNavigationInteraction} from "../../interactions/adapters";
import {InteractionLink} from "../../interactions/InteractionPrimitives";
import type {AgentWorkspaceLoadState, AgentWorkspaceModel, AgentWorkspacePriorityItem} from "./types";

const FEEDBACK_STATE = Object.freeze({calm: "success", attention: "warning", blocked: "blocked", empty: "idle"} as const);

function PriorityItem({item, onNavigate}: {item: AgentWorkspacePriorityItem; onNavigate: (path: string) => void}): ReactElement {
  return <li>
    <article className={`agent-workspace-item agent-workspace-item-${item.kind}`}>
      <header>
        <div><span className="agent-workspace-item-status">{item.statusLabel}</span><h4>{item.title}</h4></div>
        <span className="agent-workspace-item-source">{item.sourceLabel}</span>
      </header>
      <p>{item.summary}</p>
      <p className="agent-workspace-item-meta">{item.entityLabel}</p>
      {item.recommendation ? <p className="agent-workspace-recommendation"><strong>Recomendación</strong><span>{item.recommendation}</span>{item.confidenceLabel ? <small>{item.confidenceLabel}</small> : null}</p> : null}
      {item.humanDecisionReason ? <p className="agent-workspace-human-reason"><strong>Necesita tu decisión.</strong> {item.humanDecisionReason}</p> : null}
      {item.blockedBy ? <p className="agent-workspace-blocked-reason"><strong>Qué falta:</strong> {item.blockedBy}</p> : null}
      {item.staleWarning ? <p className="agent-workspace-stale">{item.staleWarning}</p> : null}
      {item.href && item.actionLabel ? <footer><InteractionLink capability={adaptNavigationInteraction({id: `agent-workspace-${item.id}`, label: item.actionLabel, href: item.href, source: "AG3 · Decision Support"})} onNavigate={onNavigate} /></footer> : null}
    </article>
  </li>;
}

export default function AgentWorkspace({model, loadState = "ready", onNavigate}: {model: AgentWorkspaceModel; loadState?: AgentWorkspaceLoadState; onNavigate: (path: string) => void}): ReactElement {
  return <section className={`agent-workspace agent-workspace-${model.status}`} aria-labelledby="agent-workspace-title" aria-busy={loadState === "loading" || undefined}>
    <header className="agent-workspace-heading">
      <div><p className="review-kicker">Copiloto editorial</p><h2 id="agent-workspace-title">Agente Editorial</h2></div>
      <ProcessingBadge state={FEEDBACK_STATE[model.status]} label={model.statusLabel} announce={false} />
    </header>

    {loadState === "loading" ? <FeedbackSkeleton label="Actualizando el resumen del agente" lines={4} /> : null}
    {loadState === "error" ? <FeedbackBanner state="error" title="No he podido actualizar el resumen del agente.">El resto del laboratorio sigue disponible.</FeedbackBanner> : null}
    {loadState === "ready" ? <>
      <div className="agent-workspace-summary"><strong>{model.headline}</strong><p>{model.summary}</p></div>
      {model.status === "empty" ? <FeedbackEmptyState title="Sin asuntos relevantes" detail="El agente todavía no tiene asuntos relevantes que mostrar." announce={false} /> : <>
        <dl className="agent-workspace-metrics" aria-label="Resumen editorial del agente">
          <div><dt>Necesitan atención</dt><dd>{model.metrics.needsAttention}</dd></div>
          <div><dt>Recomendaciones claras</dt><dd>{model.metrics.clearRecommendations}</dd></div>
          <div><dt>Necesitan tu decisión</dt><dd>{model.metrics.humanDecisionRequired}</dd></div>
        </dl>
        {model.priorityItems.length ? <section className="agent-workspace-priorities" aria-labelledby="agent-workspace-priorities-title">
          <header><div><p className="review-kicker">Primero</p><h3 id="agent-workspace-priorities-title">Prioridades editoriales</h3></div>{model.metrics.noAction ? <span>{model.metrics.noAction} {model.metrics.noAction === 1 ? "asunto no requiere" : "asuntos no requieren"} intervención</span> : null}</header>
          <ol>{model.priorityItems.map((item) => <PriorityItem key={item.id} item={item} onNavigate={onNavigate} />)}</ol>
          {model.hiddenPriorityCount ? <footer className="agent-workspace-more"><span>Hay {model.hiddenPriorityCount} {model.hiddenPriorityCount === 1 ? "asunto adicional" : "asuntos adicionales"}.</span><InteractionLink capability={adaptNavigationInteraction({id: "agent-workspace-open-review", label: "Ver todas las prioridades", href: "/revision", source: "AG3 · Decision Support"})} onNavigate={onNavigate} /></footer> : null}
        </section> : null}
      </>}
    </> : null}
  </section>;
}

export const agentWorkspaceComponentSecurity = Object.freeze({presentationOnly: true, createsStore: false, subscribes: false, fetches: false, persists: false, writes: false, executes: false, mutatesReview: false} as const);
