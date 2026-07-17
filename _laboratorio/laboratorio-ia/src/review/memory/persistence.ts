import {MAX_MEMORY_EVENTS, MAX_MEMORY_RECORDS, MEMORY_STORAGE_KEY} from "./constants";
import {buildMemoryClusters} from "./clusters";
import type {DecisionMemoryLedger} from "./types";
import {validateDecisionMemoryLedger} from "./validation";

export type MemoryRepository = {load(): DecisionMemoryLedger; save(ledger: DecisionMemoryLedger): void};
export const emptyMemoryLedger = (): DecisionMemoryLedger => ({schemaVersion: 1, records: [], events: [], clusters: [], clusterEvents: []});
export function migrateMemoryLedger(value: unknown): DecisionMemoryLedger {
  if (!value || typeof value !== "object") return emptyMemoryLedger();
  const candidate = value as Partial<DecisionMemoryLedger>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records) || !Array.isArray(candidate.events) || !Array.isArray(candidate.clusters) || !Array.isArray(candidate.clusterEvents)) return emptyMemoryLedger();
  const ledger = candidate as DecisionMemoryLedger;
  return validateDecisionMemoryLedger(ledger).valid ? ledger : emptyMemoryLedger();
}
function boundLedger(ledger: DecisionMemoryLedger): DecisionMemoryLedger {
  const selected = [] as DecisionMemoryLedger["records"]; let eventCount = 0;
  [...ledger.records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_MEMORY_RECORDS).forEach((record) => {
    const count = ledger.events.filter((event) => event.memoryId === record.id).length;
    if (eventCount + count <= MAX_MEMORY_EVENTS) { selected.push(record); eventCount += count; }
  });
  const ids = new Set(selected.map((record) => record.id)); const events = ledger.events.filter((event) => ids.has(event.memoryId));
  const clusters = buildMemoryClusters(selected, selected.reduce((latest, record) => record.updatedAt > latest ? record.updatedAt : latest, "1970-01-01T00:00:00.000Z"));
  const clusterIds = new Set(clusters.map((cluster) => cluster.id));
  return {schemaVersion: 1, records: selected, events, clusters, clusterEvents: ledger.clusterEvents.filter((event) => clusterIds.has(event.clusterId)).slice(-MAX_MEMORY_EVENTS)};
}
export function createLocalStorageMemoryRepository(): MemoryRepository {
  return {
    load() { if (typeof window === "undefined") return emptyMemoryLedger(); try { const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY); return raw ? migrateMemoryLedger(JSON.parse(raw) as unknown) : emptyMemoryLedger(); } catch { return emptyMemoryLedger(); } },
    save(ledger) { if (typeof window === "undefined") return; const validation = validateDecisionMemoryLedger(ledger); if (!validation.valid) throw new Error(validation.errors.join(" ")); const bounded = boundLedger(ledger); const boundedValidation = validateDecisionMemoryLedger(bounded); if (!boundedValidation.valid) throw new Error(boundedValidation.errors.join(" ")); window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(bounded)); },
  };
}
export function createMemoryRepository(initial = emptyMemoryLedger()): MemoryRepository & {snapshot(): DecisionMemoryLedger} { let ledger = structuredClone(initial); return {load: () => structuredClone(ledger), save: (next) => { ledger = structuredClone(next); }, snapshot: () => structuredClone(ledger)}; }
export const localStorageMemoryRepository = createLocalStorageMemoryRepository();
