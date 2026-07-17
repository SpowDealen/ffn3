import {buildMemoryClusters} from "./clusters";
import {hashMemoryValue} from "./fingerprints";
import {localStorageMemoryRepository, type MemoryRepository} from "./persistence";
import type {DecisionMemoryEvent, DecisionMemoryLedger, DecisionMemoryRecord, MemoryEventType} from "./types";
import {validateDecisionMemory, validateDecisionMemoryLedger} from "./validation";
import {reduceDecisionMemoryEvent} from "./transitions";

let repository: MemoryRepository = localStorageMemoryRepository; let version = 0; const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((listener) => listener()); };
function save(ledger: DecisionMemoryLedger, occurredAt: string): void {
  const clusters = buildMemoryClusters(ledger.records, occurredAt);
  const prior = new Map(ledger.clusters.map((item) => [item.id, item.memoryIds.join("|")]));
  const clusterEvents = [...ledger.clusterEvents];
  clusters.forEach((cluster) => { if (prior.get(cluster.id) !== cluster.memoryIds.join("|")) clusterEvents.push({schemaVersion: 1, id: `cluster-event:${hashMemoryValue([cluster.id, cluster.memoryIds, occurredAt])}`, clusterId: cluster.id, occurredAt, type: "cluster_rebuilt", memoryIds: cluster.memoryIds}); });
  repository.save({...ledger, clusters, clusterEvents}); emit();
}
export const subscribeMemoryStore = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getMemoryStoreVersion = () => version;
export const getMemoryLedger = () => repository.load();
export const getDecisionMemories = () => repository.load().records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
export const getDecisionMemoryById = (id: string) => repository.load().records.find((item) => item.id === id);
export const getDecisionMemory = getDecisionMemoryById;
export const getMemoriesForCase = (caseId: string) => getDecisionMemories().filter((item) => item.caseId === caseId);
export const getDecisionMemoriesForCase = getMemoriesForCase;
export const getDecisionMemoriesForOutcome = (outcomeId: string) => getDecisionMemories().filter((item) => item.outcomeId === outcomeId);
export const getMemoriesForOutcome = getDecisionMemoriesForOutcome;
export const getMemoriesForIssue = (issueId: string) => getDecisionMemories().filter((item) => item.issueId === issueId);
export const getMemoriesByDecisionFingerprint = (fingerprint: string) => getDecisionMemories().filter((item) => item.decisionFingerprint === fingerprint);
export const getMemoriesByCluster = (clusterId: string) => getDecisionMemories().filter((item) => item.clusterId === clusterId);
export const getMemoryEvents = (memoryId: string) => repository.load().events.filter((item) => item.memoryId === memoryId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
export const getMemoryClusters = () => repository.load().clusters.sort((a, b) => b.confidence.score - a.confidence.score || a.id.localeCompare(b.id));
export const getDecisionMemoryClusters = getMemoryClusters;
export const getDecisionMemoryCluster = (id: string) => getMemoryClusters().find((item) => item.id === id);
export function insertDecisionMemory(record: DecisionMemoryRecord, actor: DecisionMemoryEvent["actor"] = {type: "system"}): {record: DecisionMemoryRecord; created: boolean} { const ledger = repository.load(); const existing = ledger.records.find((item) => item.id === record.id); if (existing) { if (existing.outcomeId !== record.outcomeId || existing.decisionFingerprint !== record.decisionFingerprint) throw new Error("memory_identity_conflict"); return {record: existing, created: false}; } const checked = validateDecisionMemory(record); if (!checked.valid) throw new Error(checked.errors.join(" ")); const occurredAt = record.createdAt; const event: DecisionMemoryEvent = {schemaVersion: 1, engineVersion: "5d.1", id: `memory-event:${hashMemoryValue([record.id, `memory-created:${record.outcomeId}`])}`, memoryId: record.id, type: "memory_created", occurredAt, timestamp: occurredAt, idempotencyKey: `memory-created:${record.outcomeId}`, actor, provenance: actor.type, module: "review.memory", operation: "memory_created", reason: "Memoria derivada de un outcome editorial elegible.", payload: {outcomeId: record.outcomeId, snapshot: record}}; const created = reduceDecisionMemoryEvent(undefined, event); save({...ledger, records: [...ledger.records, created], events: [...ledger.events, event]}, occurredAt); return {record: created, created: true}; }
export function appendMemoryEvent(memoryId: string, type: MemoryEventType, reason: string, actor: DecisionMemoryEvent["actor"], idempotencyKey: string, payload?: DecisionMemoryEvent["payload"]) {
  if (!reason.trim()) throw new Error("memory_event_reason_required"); const ledger = repository.load(); const duplicate = ledger.events.find((item) => item.idempotencyKey === idempotencyKey); if (duplicate) { if (duplicate.memoryId !== memoryId || duplicate.type !== type || JSON.stringify(duplicate.payload ?? {}) !== JSON.stringify(payload ?? {})) throw new Error("memory_idempotency_conflict"); return {record: ledger.records.find((item) => item.id === memoryId)!, event: duplicate, duplicate: true}; }
  const index = ledger.records.findIndex((item) => item.id === memoryId); if (index < 0) throw new Error("memory_not_found"); const now = new Date().toISOString(); const previous = ledger.records[index].updatedAt; const occurredAt = now > previous ? now : new Date(Date.parse(previous) + 1).toISOString(); const event: DecisionMemoryEvent = {schemaVersion: 1, engineVersion: "5d.1", id: `memory-event:${hashMemoryValue([memoryId, idempotencyKey])}`, memoryId, type, occurredAt, timestamp: occurredAt, idempotencyKey, actor, provenance: actor.type, module: "review.memory", operation: type, reason, payload};
  const record = reduceDecisionMemoryEvent(ledger.records[index], event); const records = [...ledger.records]; records[index] = record; save({...ledger, records, events: [...ledger.events, event]}, occurredAt); return {record, event, duplicate: false};
}
export const exportDecisionMemory = (): DecisionMemoryLedger => structuredClone(repository.load());
export const validateDecisionMemoryStore = () => validateDecisionMemoryLedger(repository.load());
export function setMemoryRepositoryForTests(next: MemoryRepository) { const previous = repository; repository = next; emit(); return () => { repository = previous; emit(); }; }
