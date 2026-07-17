import {assertSafeSerializable} from "./security";
import type {InvestigationLedger} from "./types";

export const INVESTIGATION_STORAGE_KEY = "ffn3.lab.review.investigation.v1";
const empty = (): InvestigationLedger => ({schemaVersion: 1, requests: [], plans: [], results: [], events: []});
export function migrateInvestigationLedger(value: unknown): InvestigationLedger {
  if (!value || typeof value !== "object") return empty();
  const candidate = value as Partial<InvestigationLedger>;
  if (candidate.schemaVersion !== 1) return empty();
  return {schemaVersion: 1, requests: Array.isArray(candidate.requests) ? candidate.requests : [], plans: Array.isArray(candidate.plans) ? candidate.plans : [], results: Array.isArray(candidate.results) ? candidate.results : [], events: Array.isArray(candidate.events) ? candidate.events : []};
}
export function validateInvestigationLedger(ledger: InvestigationLedger): {valid: boolean; errors: string[]} {
  const errors: string[] = []; const eventIds = new Set(ledger.events.map((item) => item.id)); const idempotency = new Map<string, string>();
  ledger.results.forEach((result) => { if (result.request.id !== result.id) errors.push(`request_result_mismatch:${result.id}`); result.eventIds.filter((id) => !eventIds.has(id)).forEach((id) => errors.push(`missing_event:${id}`)); });
  ledger.events.forEach((item) => { const serialized = JSON.stringify(item.payload); const existing = idempotency.get(item.idempotencyKey); if (existing && existing !== serialized) errors.push(`idempotency_collision:${item.idempotencyKey}`); idempotency.set(item.idempotencyKey, serialized); });
  try { assertSafeSerializable(ledger, 2_000_000); } catch (error) { errors.push(error instanceof Error ? error.message : "invalid_ledger"); }
  return {valid: errors.length === 0, errors};
}
export type InvestigationRepository = {load(): InvestigationLedger; save(ledger: InvestigationLedger): void};
export class MemoryInvestigationRepository implements InvestigationRepository { private ledger = empty(); load() { return structuredClone(this.ledger); } save(ledger: InvestigationLedger) { assertSafeSerializable(ledger, 2_000_000); this.ledger = structuredClone(ledger); } }
export const localStorageInvestigationRepository: InvestigationRepository = {
  load() { if (typeof localStorage === "undefined") return empty(); const raw = localStorage.getItem(INVESTIGATION_STORAGE_KEY); if (!raw) return empty(); try { const migrated = migrateInvestigationLedger(JSON.parse(raw)); return validateInvestigationLedger(migrated).valid ? migrated : empty(); } catch { return empty(); } },
  save(ledger) { const validation = validateInvestigationLedger(ledger); if (!validation.valid) throw new Error(`invalid_investigation_ledger:${validation.errors.join(",")}`); if (typeof localStorage !== "undefined") localStorage.setItem(INVESTIGATION_STORAGE_KEY, JSON.stringify(ledger)); },
};
