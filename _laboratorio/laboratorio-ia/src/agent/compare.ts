import type {AgentCapability, AgentDependency, AgentNotification, AgentOperatorSignal, AgentProcess, AgentReview, AgentSnapshot} from "../agent-ready/model";
import {AGENT_REASONING_CONTRACT_VERSION, type AgentObservationDiff, type AgentObservationEntity, type AgentObservationEvent, type AgentObservationEventType, type AgentObservationSeverity, type AgentObservationValue} from "./model";

const DEGRADED_STATES = new Set(["unavailable", "blocked", "degraded"]);
const TERMINAL_REVIEW_STATES = new Set(["resolved", "resumed", "dismissed"]);
const TERMINAL_PROCESS_STATES = new Set(["completed", "partial", "warning", "error", "blocked", "cancelled"]);
const PRIORITY_RANK: Readonly<Record<string, number>> = Object.freeze({critical: 5, immediate: 5, high: 4, normal: 3, medium: 3, low: 2, info: 1});

function byId<T extends Readonly<{id: string}>>(items: readonly T[]): Map<string, T> {
  return new Map([...items].sort((left, right) => left.id.localeCompare(right.id)).map((item) => [item.id, item]));
}

function eventSeverity(type: AgentObservationEventType, previous?: AgentObservationValue, current?: AgentObservationValue): AgentObservationSeverity {
  if (type === "dependency_degraded" && ["unavailable", "blocked"].includes(current?.state ?? "")) return "critical";
  if (type === "blocker_added" || type === "review_pending" || type === "capability_blocked" || type === "dependency_degraded") return "high";
  if (type === "priority_changed") {
    const rank = PRIORITY_RANK[current?.priority ?? ""] ?? 0;
    return rank >= 4 ? "high" : rank >= 3 ? "medium" : "low";
  }
  if (type === "process_added" || type === "process_finished" || type === "temporal_changed") return "medium";
  if (type === "blocker_resolved" || type === "review_resolved" || type === "dependency_recovered" || type === "capability_available") return "info";
  return previous || current ? "low" : "info";
}

function makeEvent(input: Readonly<{
  type: AgentObservationEventType;
  entity: AgentObservationEntity;
  entityId: string;
  source: string;
  previous?: AgentObservationValue;
  current?: AgentObservationValue;
  authority?: AgentObservationEvent["authority"];
  reason?: string;
}>): AgentObservationEvent {
  const temporal = input.current?.temporal === "historical" || (!input.current && input.previous) ? "historical" : "current";
  return Object.freeze({
    id: `ag1-event:${input.type}:${input.entity}:${input.entityId}`,
    ...input,
    severity: eventSeverity(input.type, input.previous, input.current),
    temporal,
  });
}

function signalValue(item: AgentOperatorSignal): AgentObservationValue {
  return Object.freeze({entity: "operator_signal", id: item.id, state: item.kind, priority: item.priority, temporal: item.temporal, authorityOwner: item.authority.owner, destination: item.destination, reasonCode: item.reason?.code});
}

function processValue(item: AgentProcess): AgentObservationValue {
  return Object.freeze({entity: "process", id: item.id, state: item.state, temporal: item.temporal, authorityOwner: item.authority.owner, destination: item.destination, reasonCode: item.reason?.code});
}

function reviewValue(item: AgentReview): AgentObservationValue {
  return Object.freeze({
    entity: "review",
    id: item.id,
    state: item.status,
    priority: item.priority,
    temporal: item.temporal,
    authorityOwner: item.authority[0]?.owner,
    destination: item.destination,
    reasonCode: item.reasonCodes[0],
    evidenceReferences: Object.freeze([...item.evidenceReferences]),
    checkpointId: item.checkpoint?.id,
    checkpointFingerprint: item.checkpoint?.checkpointFingerprint,
    transactionId: item.checkpoint?.transaction?.id,
    supervisedLoopId: item.checkpoint?.supervisedLoop?.id,
  });
}

function dependencyValue(item: AgentDependency): AgentObservationValue {
  return Object.freeze({entity: "dependency", id: item.id, state: item.state, temporal: item.current ? "current" : "historical", destination: item.destination, reasonCode: item.reason?.code});
}

function capabilityValue(item: AgentCapability): AgentObservationValue {
  return Object.freeze({entity: "capability", id: item.id, state: item.availability, temporal: "current", authorityOwner: item.authority.owner, destination: item.destination, reasonCode: item.reason?.code, requiresAuthorization: item.requiresAuthorization, destructive: item.destructive});
}

function notificationValue(item: AgentNotification): AgentObservationValue {
  return Object.freeze({entity: "notification", id: item.id, state: item.deliveryStatus, priority: item.priority, temporal: item.temporal, authorityOwner: item.authority.owner, destination: item.destination});
}

function priorityEvents<T extends Readonly<{id: string; priority: string}>>(entity: AgentObservationEntity, previous: readonly T[], current: readonly T[], value: (item: T) => AgentObservationValue, source: (item: T) => string, authority: (item: T) => AgentObservationEvent["authority"]): AgentObservationEvent[] {
  const before = byId(previous);
  return [...current].sort((left, right) => left.id.localeCompare(right.id)).flatMap((item) => {
    const old = before.get(item.id);
    if (!old || old.priority === item.priority) return [];
    return [makeEvent({type: "priority_changed", entity, entityId: item.id, source: source(item), previous: value(old), current: value(item), authority: authority(item), reason: `${old.priority}->${item.priority}`})];
  });
}

function temporalEvents<T extends Readonly<{id: string; temporal: "current" | "recent" | "historical"}>>(entity: AgentObservationEntity, previous: readonly T[], current: readonly T[], value: (item: T) => AgentObservationValue, source: (item: T) => string, authority: (item: T) => AgentObservationEvent["authority"]): AgentObservationEvent[] {
  const before = byId(previous);
  return [...current].sort((left, right) => left.id.localeCompare(right.id)).flatMap((item) => {
    const old = before.get(item.id);
    if (!old || old.temporal === item.temporal) return [];
    return [makeEvent({type: "temporal_changed", entity, entityId: item.id, source: source(item), previous: value(old), current: value(item), authority: authority(item), reason: `${old.temporal}->${item.temporal}`})];
  });
}

export function compareAgentSnapshots(previous: AgentSnapshot, current: AgentSnapshot): AgentObservationDiff {
  const events: AgentObservationEvent[] = [];

  const previousSignals = byId(previous.operator.attention);
  const currentSignals = byId(current.operator.attention);
  for (const item of [...current.operator.attention].sort((a, b) => a.id.localeCompare(b.id))) {
    const old = previousSignals.get(item.id);
    if (item.kind === "blocker" && old?.kind !== "blocker") events.push(makeEvent({type: "blocker_added", entity: "operator_signal", entityId: item.id, source: `LES 7:${item.source}`, previous: old ? signalValue(old) : undefined, current: signalValue(item), authority: item.authority.owner, reason: item.reason?.code}));
  }
  for (const item of [...previous.operator.attention].sort((a, b) => a.id.localeCompare(b.id))) {
    const next = currentSignals.get(item.id);
    if (item.kind === "blocker" && next?.kind !== "blocker") events.push(makeEvent({type: "blocker_resolved", entity: "operator_signal", entityId: item.id, source: `LES 7:${item.source}`, previous: signalValue(item), current: next ? signalValue(next) : undefined, authority: item.authority.owner, reason: item.reason?.code}));
  }
  events.push(...priorityEvents("operator_signal", previous.operator.attention, current.operator.attention, signalValue, (item) => `LES 7:${item.source}`, (item) => item.authority.owner));
  events.push(...temporalEvents("operator_signal", previous.operator.attention, current.operator.attention, signalValue, (item) => `LES 7:${item.source}`, (item) => item.authority.owner));

  const previousProcesses = byId(previous.processes);
  const currentProcesses = byId(current.processes);
  for (const item of [...current.processes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!previousProcesses.has(item.id) || (!previousProcesses.get(item.id)?.active && item.active)) events.push(makeEvent({type: "process_added", entity: "process", entityId: item.id, source: item.source, previous: previousProcesses.get(item.id) ? processValue(previousProcesses.get(item.id)!) : undefined, current: processValue(item), authority: item.authority.owner}));
  }
  for (const item of [...previous.processes].sort((a, b) => a.id.localeCompare(b.id))) {
    const next = currentProcesses.get(item.id);
    if (item.active && (!next || (!next.active && TERMINAL_PROCESS_STATES.has(next.state)))) events.push(makeEvent({type: "process_finished", entity: "process", entityId: item.id, source: item.source, previous: processValue(item), current: next ? processValue(next) : undefined, authority: item.authority.owner, reason: next?.state ?? "absent"}));
  }
  events.push(...temporalEvents("process", previous.processes, current.processes, processValue, (item) => item.source, (item) => item.authority.owner));

  const previousReview = byId(previous.review);
  const currentReview = byId(current.review);
  for (const item of [...current.review].sort((a, b) => a.id.localeCompare(b.id))) {
    const old = previousReview.get(item.id);
    if (item.temporal === "current" && (!old || TERMINAL_REVIEW_STATES.has(old.status) || old.temporal !== "current")) events.push(makeEvent({type: "review_pending", entity: "review", entityId: item.id, source: "LES 8:review", previous: old ? reviewValue(old) : undefined, current: reviewValue(item), authority: item.authority[0]?.owner ?? "review_center", reason: item.reasonCodes[0]}));
  }
  for (const item of [...previous.review].sort((a, b) => a.id.localeCompare(b.id))) {
    const next = currentReview.get(item.id);
    if (item.temporal === "current" && (!next || next.temporal === "historical" || TERMINAL_REVIEW_STATES.has(next.status))) events.push(makeEvent({type: "review_resolved", entity: "review", entityId: item.id, source: "LES 8:review", previous: reviewValue(item), current: next ? reviewValue(next) : undefined, authority: item.authority[0]?.owner ?? "review_center", reason: next?.status ?? "absent"}));
  }
  events.push(...priorityEvents("review", previous.review, current.review, reviewValue, () => "LES 8:review", (item) => item.authority[0]?.owner ?? "review_center"));
  events.push(...temporalEvents("review", previous.review, current.review, reviewValue, () => "LES 8:review", (item) => item.authority[0]?.owner ?? "review_center"));

  const previousDependencies = byId(previous.dependencies);
  for (const item of [...current.dependencies].sort((a, b) => a.id.localeCompare(b.id))) {
    const old = previousDependencies.get(item.id);
    if (!old) continue;
    if (!DEGRADED_STATES.has(old.state) && DEGRADED_STATES.has(item.state)) events.push(makeEvent({type: "dependency_degraded", entity: "dependency", entityId: item.id, source: "LES 4:global_status", previous: dependencyValue(old), current: dependencyValue(item), authority: "les4_live_checks", reason: item.reason?.code}));
    if (DEGRADED_STATES.has(old.state) && !DEGRADED_STATES.has(item.state)) events.push(makeEvent({type: "dependency_recovered", entity: "dependency", entityId: item.id, source: "LES 4:global_status", previous: dependencyValue(old), current: dependencyValue(item), authority: "les4_live_checks", reason: item.reason?.code}));
    if (old.current && !item.current) events.push(makeEvent({type: "temporal_changed", entity: "dependency", entityId: item.id, source: "LES 4:global_status", previous: dependencyValue(old), current: dependencyValue(item), authority: "les4_live_checks", reason: "current->historical"}));
  }

  const previousCapabilities = byId(previous.capabilities);
  for (const item of [...current.capabilities].sort((a, b) => a.id.localeCompare(b.id))) {
    const old = previousCapabilities.get(item.id);
    if (old?.availability === item.availability) continue;
    if (item.available) events.push(makeEvent({type: "capability_available", entity: "capability", entityId: item.id, source: `LES 5:${item.authority.source}`, previous: old ? capabilityValue(old) : undefined, current: capabilityValue(item), authority: item.authority.owner}));
    else if (item.blocked) events.push(makeEvent({type: "capability_blocked", entity: "capability", entityId: item.id, source: `LES 5:${item.authority.source}`, previous: old ? capabilityValue(old) : undefined, current: capabilityValue(item), authority: item.authority.owner, reason: item.reason?.code}));
  }

  events.push(...priorityEvents("notification", previous.notifications.filter((item): item is AgentNotification & {priority: NonNullable<AgentNotification["priority"]>} => Boolean(item.priority)), current.notifications.filter((item): item is AgentNotification & {priority: NonNullable<AgentNotification["priority"]>} => Boolean(item.priority)), notificationValue, (item) => item.source, (item) => item.authority.owner));
  events.push(...temporalEvents("notification", previous.notifications, current.notifications, notificationValue, (item) => item.source, (item) => item.authority.owner));

  events.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    contractVersion: AGENT_REASONING_CONTRACT_VERSION,
    fromObservationId: previous.observationId,
    fromFingerprint: previous.observationFingerprint,
    toObservationId: current.observationId,
    toFingerprint: current.observationFingerprint,
    changed: previous.observationFingerprint !== current.observationFingerprint,
    events: Object.freeze(events),
  });
}

export const agentObservationComparisonSecurity = Object.freeze({pure: true, deterministic: true, serializable: true, fetches: false, persists: false, writes: false, executes: false, usesClock: false, usesRandomness: false} as const);
