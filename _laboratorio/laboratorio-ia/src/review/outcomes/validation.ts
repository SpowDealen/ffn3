import {isSerializableReviewValue} from "../cases/validateResolution";
import type {DecisionOutcomeEvent, DecisionOutcomeRecord, OutcomeLedger} from "./types";

const SENSITIVE = /(token|secret|password|authorization|cookie|api[_-]?key|headers?)/i;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function hasSensitiveKey(value: unknown): boolean { if (Array.isArray(value)) return value.some(hasSensitiveKey); if (!isObject(value)) return false; return Object.entries(value).some(([key, child]) => SENSITIVE.test(key) || hasSensitiveKey(child)); }
export function validateOutcomeEvent(event: DecisionOutcomeEvent): {valid: boolean; errors: string[]} {
  const errors: string[] = [];
  if (!event.id || !event.outcomeId || !event.caseId || !event.type || !event.idempotencyKey || !event.correlationKey) errors.push("El evento carece de identidad obligatoria.");
  if (!Number.isFinite(Date.parse(event.occurredAt))) errors.push("occurredAt no es una fecha válida.");
  if (!isSerializableReviewValue(event)) errors.push("El evento no es JSON serializable.");
  if (hasSensitiveKey(event.payload)) errors.push("El payload contiene claves sensibles.");
  return {valid: errors.length === 0, errors};
}
export function validateOutcomeRecord(record: DecisionOutcomeRecord): {valid: boolean; errors: string[]} {
  const errors: string[] = [];
  if (!record.id || !record.caseId || !record.issueId || !record.resolutionId || !record.decisionFingerprint) errors.push("El record carece de identidad obligatoria.");
  if (new Set(record.eventIds).size !== record.eventIds.length) errors.push("El record contiene eventos duplicados.");
  if (!isSerializableReviewValue(record)) errors.push("El record no es JSON serializable.");
  return {valid: errors.length === 0, errors};
}
export function validateOutcomeLedger(ledger: OutcomeLedger): {valid: boolean; errors: string[]} {
  const errors: string[] = [];
  const eventIds = new Set(ledger.events.map((event) => event.id));
  const idempotencyKeys = new Set<string>();
  for (const event of ledger.events) { const result = validateOutcomeEvent(event); errors.push(...result.errors.map((error) => `${event.id}: ${error}`)); if (idempotencyKeys.has(event.idempotencyKey)) errors.push(`Idempotency key duplicada: ${event.idempotencyKey}.`); idempotencyKeys.add(event.idempotencyKey); }
  for (const record of ledger.records) { const result = validateOutcomeRecord(record); errors.push(...result.errors.map((error) => `${record.id}: ${error}`)); for (const id of record.eventIds) if (!eventIds.has(id)) errors.push(`${record.id} apunta al evento inexistente ${id}.`); }
  return {valid: errors.length === 0, errors};
}
