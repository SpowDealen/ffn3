import type {ReactElement} from "react";
import {adaptNavigationInteraction} from "../interactions/adapters";
import {InteractionLink} from "../interactions/InteractionPrimitives";
import type {OperatorDestination, OperatorExperienceModel, OperatorSignal} from "./model";

const DESTINATION_LABELS: Readonly<Record<OperatorDestination, string>> = Object.freeze({
  "/editorial": "Abrir PanelIA",
  "/telegram": "Abrir diagnóstico Telegram",
  "/actividad": "Abrir Activity Center",
  "/revision": "Abrir Centro de Revisión",
});

function SignalCard({entry, next, onNavigate}: {entry: OperatorSignal; next: boolean; onNavigate: (path: string) => void}): ReactElement {
  return <li>
    <article className={`les7-operator-signal les7-operator-signal-${entry.kind}`} data-operator-origin={entry.source} data-operator-temporal={entry.temporal} data-operator-next={next || undefined}>
      <header><strong>{entry.title}</strong><span>{entry.kind === "blocker" ? "Bloqueo actual" : entry.kind === "action" ? "Acción en origen" : entry.kind === "attention" ? "Atención actual" : "En curso"}</span></header>
      <p>{entry.summary}</p>
      {entry.reason ? <small>Razón: {entry.reason.replaceAll("_", " ")}</small> : null}
      <footer><span>{entry.sourceLabel}</span>{entry.destination ? <InteractionLink capability={adaptNavigationInteraction({id: `operator-${entry.id}`, label: DESTINATION_LABELS[entry.destination], href: entry.destination, source: `LES 7 · ${entry.authoritySource}`})} onNavigate={onNavigate} /> : null}</footer>
    </article>
  </li>;
}

export default function OperatorSummary({model, onNavigate}: {model: OperatorExperienceModel; onNavigate: (path: string) => void}): ReactElement {
  return <section className={`les7-operator-summary les7-operator-${model.state}`} aria-labelledby="les7-operator-title">
    <header className="les7-operator-heading">
      <div><p className="review-kicker">LES 7 · VISTA DEL OPERADOR</p><h3 id="les7-operator-title">Prioridad operativa</h3><p><strong>{model.label}.</strong> {model.summary}</p></div>
      <dl aria-label="Resumen de prioridad operativa">
        <div><dt>Atención actual</dt><dd>{model.currentAttentionCount}</dd></div>
        <div><dt>En curso</dt><dd>{model.activeCount}</dd></div>
        <div><dt>Review pendiente</dt><dd>{model.reviewPendingCount}</dd></div>
      </dl>
    </header>

    {model.attention.length ? <section className="les7-operator-section" aria-labelledby="les7-attention-title"><h4 id="les7-attention-title">Requiere atención</h4><p className="les7-operator-guidance">Ordenado por impacto actual. Abrir un destino no ejecuta acciones.</p><ol>{model.attention.slice(0, 4).map((entry) => <SignalCard key={entry.id} entry={entry} next={entry.id === model.nextBest?.id} onNavigate={onNavigate} />)}</ol></section> : <div className={`les7-operator-empty les7-operator-empty-${model.state}`} data-operator-empty={model.state}><strong>{model.state === "unknown" ? "Todavía sin confirmar" : "Todo comprobado, sin atención pendiente"}</strong><p>{model.state === "unknown" ? "Espera o actualiza Global Status antes de asumir que todo está sano." : "Puedes continuar operando; el histórico permanece separado en Activity Center."}</p></div>}

    {model.active.length ? <section className="les7-operator-section les7-operator-active" aria-labelledby="les7-active-title"><h4 id="les7-active-title">En curso</h4><p className="les7-operator-guidance">Actividad viva; no implica intervención ni autorización automática.</p><ol>{model.active.slice(0, 3).map((entry) => <SignalCard key={entry.id} entry={entry} next={false} onNavigate={onNavigate} />)}</ol></section> : null}

    <footer className="les7-operator-history"><span>{model.historicalCount} registros históricos fuera de la prioridad actual.</span><InteractionLink capability={adaptNavigationInteraction({id: "operator-open-history", label: "Consultar histórico", href: "/actividad", source: "LES 7 · Operator Experience"})} onNavigate={onNavigate} /></footer>
  </section>;
}

export const operatorSummarySecurity = Object.freeze({subscribes: false, createsLiveRegion: false, createsAuthority: false, executes: false, retries: false} as const);
