import type {AgentDiagnosis, AgentDiagnosisConfidence, AgentObservationEvent, AgentObservationSeverity, AgentReasoningContext, AgentReasoningFact} from "./model";

const RESOLUTION_EVENTS = new Set(["blocker_resolved", "review_resolved", "dependency_recovered", "process_finished", "capability_available"]);

function confidenceFor(event: AgentObservationEvent): AgentDiagnosisConfidence {
  const evidenceCount = 1 + (event.current?.evidenceReferences?.length ?? 0) + (event.current?.checkpointId ? 1 : 0) + (event.current?.checkpointFingerprint ? 1 : 0);
  return evidenceCount >= 3 ? "high" : event.previous && event.current ? "high" : "medium";
}

function titleFor(event: AgentObservationEvent): string {
  const titles: Readonly<Record<AgentObservationEvent["type"], string>> = Object.freeze({
    blocker_added: "Nuevo bloqueo observado",
    blocker_resolved: "Bloqueo resuelto",
    process_added: "Nuevo proceso observado",
    process_finished: "Proceso terminado",
    review_pending: "Review pendiente",
    review_resolved: "Review resuelto",
    dependency_degraded: "Dependencia degradada",
    dependency_recovered: "Dependencia recuperada",
    capability_available: "Capability disponible",
    capability_blocked: "Capability bloqueada",
    priority_changed: "Prioridad modificada",
    temporal_changed: "Temporalidad modificada",
  });
  return titles[event.type];
}

function evidenceForEvent(event: AgentObservationEvent): readonly Readonly<{id: string; source: string}>[] {
  const ids = [event.id, ...(event.current?.evidenceReferences ?? []), ...(event.current?.checkpointId ? [event.current.checkpointId] : []), ...(event.current?.checkpointFingerprint ? [event.current.checkpointFingerprint] : []), ...(event.current?.transactionId ? [event.current.transactionId] : []), ...(event.current?.supervisedLoopId ? [event.current.supervisedLoopId] : [])];
  return Object.freeze([...new Set(ids)].sort().map((id) => Object.freeze({id, source: event.source})));
}

function diagnosisFromEvent(event: AgentObservationEvent): AgentDiagnosis {
  const resolved = RESOLUTION_EVENTS.has(event.type);
  return Object.freeze({
    id: `ag1-diagnosis:event:${event.type}:${event.entity}:${event.entityId}`,
    category: event.type,
    severity: event.severity,
    title: titleFor(event),
    summary: `${event.entity}:${event.entityId} presenta ${event.type}.`,
    evidence: evidenceForEvent(event),
    confidence: confidenceFor(event),
    authority: event.authority,
    actionable: !resolved,
    conclusive: true,
  });
}

function compositeDiagnosis(context: AgentReasoningContext, factIds: readonly string[]): AgentDiagnosis {
  const facts = new Map(context.facts.map((fact) => [fact.id, fact]));
  const evidence = factIds.flatMap((id) => {
    const fact = facts.get(id);
    return fact ? fact.evidenceIds.map((evidenceId) => Object.freeze({id: evidenceId, source: fact.source})) : [];
  });
  return Object.freeze({
    id: `ag1-diagnosis:dependency_blocks_review:${factIds.join("+")}`,
    category: "dependency_blocks_review",
    severity: "critical" as AgentObservationSeverity,
    title: "Dependencia bloquea un review pendiente",
    summary: "La evidencia combinada muestra una dependencia no saludable y un caso de revisión todavía pendiente.",
    evidence: Object.freeze([...new Map(evidence.map((item) => [`${item.source}:${item.id}`, item])).values()].sort((left, right) => left.id.localeCompare(right.id))),
    confidence: evidence.length >= 3 ? "high" as const : "medium" as const,
    authority: "review_center" as const,
    actionable: true,
    conclusive: true,
  });
}

function inconclusiveDiagnosis(fact?: AgentReasoningFact): AgentDiagnosis {
  return Object.freeze({
    id: `ag1-diagnosis:inconclusive:${fact?.subject ?? "observation"}:${fact?.subjectId ?? "none"}`,
    category: "insufficient_evidence",
    severity: fact?.severity ?? "low",
    title: "Evidencia insuficiente",
    summary: "La observación aislada no permite concluir una causa ni recomendar ejecución.",
    evidence: Object.freeze(fact ? fact.evidenceIds.slice(0, 1).map((id) => Object.freeze({id, source: fact.source})) : []),
    confidence: "low" as const,
    authority: fact?.authority,
    actionable: false,
    conclusive: false,
  });
}

export function diagnoseAgentContext(context: AgentReasoningContext): readonly AgentDiagnosis[] {
  const diagnoses: AgentDiagnosis[] = context.diff.events.map(diagnosisFromEvent);
  for (const pattern of context.patterns) if (pattern.kind === "dependency_blocks_review") diagnoses.push(compositeDiagnosis(context, pattern.factIds));
  if (diagnoses.length === 0) diagnoses.push(inconclusiveDiagnosis(context.facts[0]));
  return Object.freeze(diagnoses.sort((left, right) => left.id.localeCompare(right.id)));
}

export const agentDiagnosisSecurity = Object.freeze({pure: true, deterministic: true, evidenceBased: true, fabricatesCertainty: false, fetches: false, persists: false, writes: false, executes: false, usesClock: false, usesRandomness: false} as const);
