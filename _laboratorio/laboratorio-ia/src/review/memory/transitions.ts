import type {DecisionMemoryEvent, DecisionMemoryRecord} from "./types";

export function reduceDecisionMemoryEvent(current: DecisionMemoryRecord | undefined, event: DecisionMemoryEvent): DecisionMemoryRecord {
  if (event.type === "memory_created") {
    const snapshot = event.payload?.snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("memory_created_snapshot_required");
    const created = structuredClone(snapshot) as DecisionMemoryRecord;
    if (created.id !== event.memoryId) throw new Error("memory_created_identity_mismatch");
    return {...created, eventIds: [event.id], updatedAt: event.occurredAt};
  }
  if (!current) throw new Error("memory_event_without_snapshot");
  let status = current.status; let editorialDecision = current.editorialDecision; let supersededBy = current.supersededBy; let notes = current.notes;
  if (event.type === "memory_confirmed") { status = "confirmed"; editorialDecision = "confirmed"; }
  if (event.type === "memory_rejected") { status = "rejected"; editorialDecision = "rejected"; }
  if (event.type === "memory_invalidated") status = "invalidated";
  if (event.type === "memory_deprecated") status = "deprecated";
  if (event.type === "memory_obsolete") status = "obsolete";
  if (event.type === "memory_superseded") { status = "superseded"; supersededBy = String(event.payload?.replacementMemoryId ?? ""); }
  if (event.type === "memory_restored") { if (current.status === "superseded") throw new Error("superseded_memory_cannot_restore"); status = current.editorialDecision; }
  if (event.type === "memory_noted") notes = [...notes, event.reason];
  const lifecycle = event.type === "memory_invalidated" ? {invalidatedAt: event.occurredAt, invalidatedReason: event.reason} : event.type === "memory_deprecated" ? {deprecatedAt: event.occurredAt, deprecatedReason: event.reason} : event.type === "memory_obsolete" ? {obsoleteAt: event.occurredAt, obsoleteReason: event.reason} : {};
  const synchronized = event.type === "memory_confirmed" || event.type === "memory_rejected" ? {memoryFingerprint: String(event.payload?.memoryFingerprint ?? current.memoryFingerprint), evidenceFingerprint: String(event.payload?.evidenceFingerprint ?? current.evidenceFingerprint), editorialOutcome: String(event.payload?.editorialOutcome ?? editorialDecision), reusePolicy: event.payload?.reusePolicy === "never" ? "never" as const : current.reusePolicy, reusable: event.payload?.reusable === true, reuseBlockedReasons: Array.isArray(event.payload?.reuseBlockedReasons) ? event.payload.reuseBlockedReasons.filter((item): item is string => typeof item === "string") : current.reuseBlockedReasons} : {};
  return {...current, ...lifecycle, ...synchronized, status, editorialDecision, supersededBy, notes, updatedAt: event.occurredAt, eventIds: [...current.eventIds, event.id]};
}

export function rebuildDecisionMemoryRecords(events: DecisionMemoryEvent[]): DecisionMemoryRecord[] {
  const records = new Map<string, DecisionMemoryRecord>();
  [...events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)).forEach((event) => records.set(event.memoryId, reduceDecisionMemoryEvent(records.get(event.memoryId), event)));
  return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
}
