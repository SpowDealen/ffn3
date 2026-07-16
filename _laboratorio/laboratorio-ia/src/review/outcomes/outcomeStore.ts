import {OUTCOME_ENGINE_VERSION, OUTCOME_SCHEMA_VERSION} from "./constants";
import {localStorageOutcomeRepository, type OutcomeRepository} from "./persistence";
import {reduceOutcomeEvent} from "./transitions";
import type {AppendOutcomeEventInput, CreateOutcomeRecordInput, DecisionOutcomeEvent, DecisionOutcomeRecord, OutcomeAppendResult, OutcomeLedger} from "./types";
import {validateOutcomeEvent, validateOutcomeLedger, validateOutcomeRecord} from "./validation";
import {canonicalizeOutcomeValue} from "./fingerprints";
import type {ReviewJsonObject} from "../types";

let repository: OutcomeRepository = localStorageOutcomeRepository;
let storeVersion = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const hash = (value: string): string => { let result = 2166136261; for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619); return (result >>> 0).toString(36); };
const eventId = (input: AppendOutcomeEventInput): string => `outcome-event:${hash(`${input.outcomeId}:${input.idempotencyKey}`)}`;
function save(ledger: OutcomeLedger): void { repository.save(ledger); storeVersion += 1; emit(); }
export const getOutcomeStoreVersion = (): number => storeVersion;
export const getOutcomeLedger = (): OutcomeLedger => repository.load();
export const getOutcomeRecords = (): DecisionOutcomeRecord[] => [...repository.load().records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
export const getOutcomeById = (id: string): DecisionOutcomeRecord | undefined => repository.load().records.find((item) => item.id === id);
export const getOutcomesForCase = (caseId: string): DecisionOutcomeRecord[] => getOutcomeRecords().filter((item) => item.caseId === caseId);
export const getOutcomeEvents = (outcomeId: string): DecisionOutcomeEvent[] => repository.load().events.filter((item) => item.outcomeId === outcomeId).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
export const subscribeOutcomeStore = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function ensureOutcomeRecord(input: CreateOutcomeRecordInput): DecisionOutcomeRecord {
  const ledger = repository.load();
  const existing = ledger.records.find((item) => item.id === input.id);
  if (existing) {
    if (existing.decisionFingerprint !== input.decisionFingerprint) throw new Error("outcome_identity_conflict");
    return existing;
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  const record: DecisionOutcomeRecord = {...input, schemaVersion: OUTCOME_SCHEMA_VERSION, engineVersion: OUTCOME_ENGINE_VERSION, currentStatus: "pending", technicalStatus: "unknown", structuralStatus: "unknown", editorialStatus: "unknown", operationalStatus: "unknown", createdAt, updatedAt: createdAt, reconciliationRequired: false, conflicts: [], eventIds: []};
  const validation = validateOutcomeRecord(record); if (!validation.valid) throw new Error(validation.errors.join(" "));
  save({...ledger, records: [...ledger.records, record]});
  return record;
}
export function appendOutcomeEvent(input: AppendOutcomeEventInput): OutcomeAppendResult {
  const ledger = repository.load();
  const normalizedPayload = input.payload ? canonicalizeOutcomeValue(input.payload) as ReviewJsonObject : undefined;
  const duplicate = ledger.events.find((item) => item.idempotencyKey === input.idempotencyKey);
  if (duplicate) {
    if (duplicate.outcomeId !== input.outcomeId || duplicate.type !== input.type || JSON.stringify(duplicate.payload ?? {}) !== JSON.stringify(normalizedPayload ?? {})) throw new Error("outcome_idempotency_conflict");
    const record = ledger.records.find((item) => item.id === duplicate.outcomeId); if (!record) throw new Error("outcome_record_missing");
    return {record, event: duplicate, duplicate: true};
  }
  const index = ledger.records.findIndex((item) => item.id === input.outcomeId); if (index === -1) throw new Error("outcome_record_missing");
  const event: DecisionOutcomeEvent = {...input, schemaVersion: OUTCOME_SCHEMA_VERSION, engineVersion: OUTCOME_ENGINE_VERSION, id: input.id ?? eventId(input), occurredAt: input.occurredAt ?? new Date().toISOString(), payload: normalizedPayload, evidence: (input.evidence ?? []).map((item) => ({...item, value: item.value === undefined ? undefined : canonicalizeOutcomeValue(item.value)})), references: (input.references ?? []).map((item) => ({...item, id: item.id.trim()}))};
  const validation = validateOutcomeEvent(event); if (!validation.valid) throw new Error(validation.errors.join(" "));
  const record = reduceOutcomeEvent(ledger.records[index], event);
  const records = [...ledger.records]; records[index] = record;
  save({...ledger, records, events: [...ledger.events, event]});
  return {record, event, duplicate: false};
}
export const validateOutcomeStore = () => validateOutcomeLedger(repository.load());
export const exportOutcomeLedger = (): OutcomeLedger => structuredClone(repository.load());
export function setOutcomeRepositoryForTests(next: OutcomeRepository): () => void { const previous = repository; repository = next; storeVersion += 1; return () => { repository = previous; storeVersion += 1; }; }
