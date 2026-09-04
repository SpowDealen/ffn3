import {useEffect, useRef, useState, type FormEvent, type ReactElement} from "react";
import {buildAgentConversationExchange, createAgentConversationContext, type AgentConversationContext, type AgentConversationMessage, type AgentConversationModel, type AgentConversationPromptId, type AgentConversationTurn} from "../conversation";
import {FeedbackBanner} from "../../components/feedback/VisualFeedback";
import {InteractionButton, InteractionLink} from "../../interactions/InteractionPrimitives";
import {buildInteractionCapability} from "../../interactions/model";
import {adaptNavigationInteraction} from "../../interactions/adapters";

const CONTEXTUAL_FOLLOW_UPS = Object.freeze([
  Object.freeze({id: "why", label: "¿Por qué?"}),
  Object.freeze({id: "evidence", label: "¿Qué evidencia tienes?"}),
  Object.freeze({id: "alternatives", label: "¿Qué alternativas hay?"}),
]);

function ConversationMessage({message, onNavigate}: {message: AgentConversationMessage; onNavigate: (path: string) => void}): ReactElement {
  const roleLabel = message.role === "agent" ? "Agente" : "Tú";
  return <article className={`agent-conversation-message agent-conversation-message-${message.role}`} aria-label={`Mensaje de ${roleLabel}`}>
    <header><strong>{roleLabel}</strong>{message.role === "agent" ? <span>Solo consulta</span> : null}</header>
    <p>{message.text}</p>
    {message.highlights.length ? <ul>{message.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
    {message.sections.map((section) => <section className="agent-conversation-section" aria-label={section.label} key={section.label}><strong>{section.label}</strong><ul>{section.items.map((item, index) => <li key={`${section.label}-${index}`}>{item}</li>)}</ul></section>)}
    {message.references.length ? <ul className="agent-conversation-references" aria-label="Casos relacionados">{message.references.map((reference) => <li key={reference.id}><span>{reference.sourceLabel} · {reference.entityLabel} · {reference.label}</span>{reference.href && reference.actionLabel ? <InteractionLink capability={adaptNavigationInteraction({id: `agent-conversation-${reference.id}`, label: reference.actionLabel, href: reference.href, source: "AG4 B4 · Explainability read-only"})} onNavigate={onNavigate} /> : null}</li>)}</ul> : null}
  </article>;
}

export default function AgentConversation({model, onNavigate}: {model: AgentConversationModel; onNavigate: (path: string) => void}): ReactElement {
  const [session, setSession] = useState<Readonly<{snapshotIdentity: string; turns: readonly AgentConversationTurn[]; context: AgentConversationContext; nextSequence: number}>>(() => Object.freeze({snapshotIdentity: model.snapshotIdentity, turns: Object.freeze([]), context: createAgentConversationContext(model), nextSequence: 0}));
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const turns = session.snapshotIdentity === model.snapshotIdentity ? session.turns : Object.freeze([]);

  useEffect(() => {
    setSession(Object.freeze({snapshotIdentity: model.snapshotIdentity, turns: Object.freeze([]), context: createAgentConversationContext(model), nextSequence: 0}));
    setQuery("");
    setFailed(false);
  }, [model.snapshotIdentity]);

  const ask = (input: string, promptId: AgentConversationPromptId | null = null): void => {
    if (!input.trim()) return;
    try {
      setSession((current) => {
        const active = current.snapshotIdentity === model.snapshotIdentity ? current : Object.freeze({snapshotIdentity: model.snapshotIdentity, turns: Object.freeze([]), context: createAgentConversationContext(model), nextSequence: 0});
        const exchange = buildAgentConversationExchange(model, input, active.context, active.nextSequence, promptId);
        const turn = exchange.turn;
        const previous = promptId ? active.turns.filter((entry) => entry.promptId !== promptId) : active.turns;
        return Object.freeze({snapshotIdentity: model.snapshotIdentity, turns: Object.freeze([...previous, turn].slice(-8)), context: exchange.context, nextSequence: active.nextSequence + 1});
      });
      setFailed(false);
      setQuery("");
      inputRef.current?.focus();
    } catch {
      setFailed(true);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    ask(query);
  };

  return <section className="agent-conversation" aria-labelledby="agent-conversation-title" data-conversation-mode="read-only">
    <header className="agent-conversation-heading"><div><p className="review-kicker">Conversación read-only</p><h3 id="agent-conversation-title">Consulta al Agente Editorial</h3></div><span>Sin ejecutar acciones</span></header>
    <ol className="agent-conversation-thread" aria-label="Conversación con el Agente Editorial" aria-live="polite" aria-relevant="additions">
      <li><ConversationMessage message={model.initialMessage} onNavigate={onNavigate} /></li>
      {turns.map((turn) => <li className="agent-conversation-turn" key={turn.id}><ConversationMessage message={turn.operatorMessage} onNavigate={onNavigate} /><ConversationMessage message={turn.agentMessage} onNavigate={onNavigate} /></li>)}
    </ol>
    {failed ? <FeedbackBanner state="error" title="No he podido preparar la respuesta.">El resto del laboratorio sigue disponible.</FeedbackBanner> : null}
    <div className="agent-conversation-prompts" aria-labelledby="agent-conversation-prompt-title">
      <strong id="agent-conversation-prompt-title">¿Qué quieres consultar?</strong>
      <div>{model.presets.map((preset) => <InteractionButton key={preset.id} capability={buildInteractionCapability({id: `agent-conversation-prompt-${preset.id}`, label: preset.label, kind: "secondary", intent: "filter", authority: {allowed: true, source: "AG4 B3 · Router local read-only"}})} onInvoke={() => ask(preset.label, preset.id)} showReason={false} />)}</div>
    </div>
    {turns.length && session.context.focusedDecisionSupportId ? <div className="agent-conversation-followups" aria-labelledby="agent-conversation-followup-title"><strong id="agent-conversation-followup-title">Profundiza en este asunto</strong><div>{CONTEXTUAL_FOLLOW_UPS.map((followUp) => <InteractionButton key={followUp.id} capability={buildInteractionCapability({id: `agent-conversation-followup-${followUp.id}`, label: followUp.label, kind: "subtle", intent: "filter", authority: {allowed: true, source: "AG4 B4 · Explainability local"}})} onInvoke={() => ask(followUp.label)} showReason={false} />)}</div></div> : null}
    <form className="agent-conversation-form" onSubmit={submit} data-router-mode="deterministic-read-only">
      <label htmlFor="agent-conversation-query">Escribe una consulta</label>
      <div><input ref={inputRef} id="agent-conversation-query" name="agent-conversation-query" type="text" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Pregunta por prioridades, bloqueos o una fuente…" maxLength={240} autoComplete="off" aria-describedby="agent-conversation-query-help" /><button type="submit" disabled={!query.trim()}>Enviar</button></div>
      <small id="agent-conversation-query-help">Puedo consultar y explicar el estado o llevarte a Revisión. No ejecuto acciones.</small>
    </form>
  </section>;
}

export const agentConversationComponentSecurity = Object.freeze({localStateOnly: true, ephemeral: true, contextIdsOnly: true, revalidatesReferences: true, boundedTurns: 8, readOnly: true, createsStore: false, persists: false, fetches: false, writes: false, executes: false, createsAuthority: false, mutatesReview: false, freeText: true} as const);
