import type {AgentSnapshot} from "../agent-ready/model";
import type {AgentObservationDiff, AgentObservationEvent, AgentReasoningContext, AgentReasoningFact, AgentReasoningPattern} from "./model";

function factFromEvent(event: AgentObservationEvent): AgentReasoningFact {
  return Object.freeze({
    id: `ag1-fact:${event.id}`,
    kind: "change" as const,
    subject: event.entity,
    subjectId: event.entityId,
    predicate: event.type,
    value: event.current?.state ?? event.current?.priority ?? event.previous?.state ?? event.previous?.priority ?? "observed",
    severity: event.severity,
    temporal: event.temporal,
    source: event.source,
    authority: event.authority,
    evidenceIds: Object.freeze([event.id, ...(event.current?.evidenceReferences ?? []), ...(event.current?.checkpointId ? [event.current.checkpointId] : []), ...(event.current?.checkpointFingerprint ? [event.current.checkpointFingerprint] : [])]),
  });
}

function currentFacts(snapshot: AgentSnapshot): AgentReasoningFact[] {
  const facts: AgentReasoningFact[] = [];
  for (const dependency of snapshot.dependencies) {
    if (!["unavailable", "blocked", "degraded"].includes(dependency.state)) continue;
    facts.push(Object.freeze({id: `ag1-fact:current:dependency:${dependency.id}`, kind: "current_state", subject: "dependency", subjectId: dependency.id, predicate: "dependency_unhealthy", value: dependency.state, severity: dependency.state === "degraded" ? "high" : "critical", temporal: "current", source: "LES 4:global_status", authority: "les4_live_checks", evidenceIds: Object.freeze([dependency.id, ...(dependency.reason?.code ? [dependency.reason.code] : [])])}));
  }
  for (const review of snapshot.review) {
    if (review.temporal !== "current") continue;
    facts.push(Object.freeze({id: `ag1-fact:current:review:${review.id}`, kind: "current_state", subject: "review", subjectId: review.id, predicate: "review_pending", value: review.status, severity: review.priority === "critical" ? "critical" : "high", temporal: "current", source: "LES 8:review", authority: review.authority[0]?.owner ?? "review_center", evidenceIds: Object.freeze([review.id, ...review.evidenceReferences, ...(review.checkpoint?.id ? [review.checkpoint.id] : []), ...(review.checkpoint?.checkpointFingerprint ? [review.checkpoint.checkpointFingerprint] : [])])}));
  }
  for (const process of snapshot.processes) {
    if (process.temporal === "historical") continue;
    facts.push(Object.freeze({id: `ag1-fact:current:process:${process.id}`, kind: "current_state", subject: "process", subjectId: process.id, predicate: process.active ? "process_active" : "process_idle", value: process.state, severity: process.state === "blocked" || process.state === "error" ? "high" : "low", temporal: "current", source: process.source, authority: process.authority.owner, evidenceIds: Object.freeze([process.id, ...(process.reason?.code ? [process.reason.code] : [])])}));
  }
  for (const capability of snapshot.capabilities) {
    if (!capability.blocked) continue;
    facts.push(Object.freeze({id: `ag1-fact:current:capability:${capability.id}`, kind: "current_state", subject: "capability", subjectId: capability.id, predicate: "capability_blocked", value: capability.availability, severity: "medium", temporal: "current", source: `LES 5:${capability.authority.source}`, authority: capability.authority.owner, evidenceIds: Object.freeze([capability.id, ...(capability.reason?.code ? [capability.reason.code] : [])])}));
  }
  return facts;
}

function buildPatterns(facts: readonly AgentReasoningFact[]): AgentReasoningPattern[] {
  const patterns: AgentReasoningPattern[] = [];
  const dependency = facts.find((fact) => fact.temporal === "current" && fact.subject === "dependency" && (fact.predicate === "dependency_unhealthy" || fact.predicate === "dependency_degraded"));
  const review = facts.find((fact) => fact.temporal === "current" && fact.subject === "review" && fact.predicate === "review_pending");
  if (dependency && review) {
    patterns.push(Object.freeze({
      id: `ag1-pattern:dependency_blocks_review:${dependency.subjectId}:${review.subjectId}`,
      kind: "dependency_blocks_review",
      factIds: Object.freeze([dependency.id, review.id].sort()),
      statement: "Existe un bloqueo de dependencia que puede impedir resolver correctamente un caso pendiente.",
    }));
  }
  for (const fact of facts.filter((item) => item.temporal === "current" && item.predicate === "capability_blocked")) {
    patterns.push(Object.freeze({id: `ag1-pattern:blocked_capability:${fact.subjectId}`, kind: "blocked_capability", factIds: Object.freeze([fact.id]), statement: "La autoridad existente mantiene bloqueada una capability observada."}));
  }
  const changes = facts.filter((fact) => fact.kind === "change");
  if (changes.length > 0) patterns.push(Object.freeze({id: `ag1-pattern:state_change:${changes.map((fact) => fact.id).sort().join("+")}`, kind: "state_change", factIds: Object.freeze(changes.map((fact) => fact.id).sort()), statement: "El snapshot actual contiene cambios estructurados respecto a la observación anterior."}));
  return patterns.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildReasoningContext(diff: AgentObservationDiff, current: AgentSnapshot): AgentReasoningContext {
  const merged = [...diff.events.map(factFromEvent), ...currentFacts(current)];
  const unique = new Map(merged.map((fact) => [fact.id, fact]));
  const facts = Object.freeze([...unique.values()].sort((left, right) => left.id.localeCompare(right.id)));
  return Object.freeze({
    contractVersion: diff.contractVersion,
    observationId: current.observationId,
    observationFingerprint: current.observationFingerprint,
    diff,
    facts,
    patterns: Object.freeze(buildPatterns(facts)),
    snapshot: current,
    boundary: Object.freeze({readOnly: true as const, executes: false as const, persists: false as const}),
  });
}

export const agentReasoningContextSecurity = Object.freeze({pure: true, deterministic: true, structuredFacts: true, textOnlyReasoning: false, fetches: false, persists: false, writes: false, executes: false, usesClock: false, usesRandomness: false} as const);
