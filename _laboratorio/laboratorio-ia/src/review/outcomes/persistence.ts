import {MAX_OUTCOME_EVENTS, MAX_OUTCOME_RECORDS, OUTCOME_SCHEMA_VERSION, OUTCOME_STORAGE_KEY} from "./constants";
import type {OutcomeLedger} from "./types";
import {validateOutcomeLedger} from "./validation";

export type OutcomeRepository = {load(): OutcomeLedger; save(ledger: OutcomeLedger): void};
const empty = (): OutcomeLedger => ({schemaVersion: OUTCOME_SCHEMA_VERSION, records: [], events: []});
export function migrateOutcomeLedger(value: unknown): OutcomeLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty();
  const candidate = value as Partial<OutcomeLedger>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records) || !Array.isArray(candidate.events)) return empty();
  const ledger: OutcomeLedger = {schemaVersion: 1, records: candidate.records, events: candidate.events};
  return validateOutcomeLedger(ledger).valid ? ledger : empty();
}
function canUseStorage(): boolean { return typeof window !== "undefined" && "localStorage" in window; }
export function createLocalStorageOutcomeRepository(): OutcomeRepository {
  return {
    load() { if (!canUseStorage()) return empty(); try { const value = window.localStorage.getItem(OUTCOME_STORAGE_KEY); return value ? migrateOutcomeLedger(JSON.parse(value) as unknown) : empty(); } catch { return empty(); } },
    save(ledger) { if (!canUseStorage()) return; const validation = validateOutcomeLedger(ledger); if (!validation.valid) throw new Error(validation.errors.join(" ")); const records = ledger.records.slice(-MAX_OUTCOME_RECORDS); const retainedIds = new Set(records.map((record) => record.id)); const relatedEvents = ledger.events.filter((event) => retainedIds.has(event.outcomeId)); const overflowOutcomeIds = new Set(relatedEvents.slice(0, Math.max(0, relatedEvents.length - MAX_OUTCOME_EVENTS)).map((event) => event.outcomeId)); const boundedRecords = records.filter((record) => !overflowOutcomeIds.has(record.id)); const boundedIds = new Set(boundedRecords.map((record) => record.id)); const bounded: OutcomeLedger = {schemaVersion: 1, records: boundedRecords, events: relatedEvents.filter((event) => boundedIds.has(event.outcomeId))}; window.localStorage.setItem(OUTCOME_STORAGE_KEY, JSON.stringify(bounded)); },
  };
}
export function createMemoryOutcomeRepository(initial: OutcomeLedger = empty()): OutcomeRepository & {snapshot(): OutcomeLedger} {
  let ledger = structuredClone(initial);
  return {load: () => structuredClone(ledger), save: (next) => { ledger = structuredClone(next); }, snapshot: () => structuredClone(ledger)};
}
export const localStorageOutcomeRepository = createLocalStorageOutcomeRepository();
