import {assertSafeSerializable, assertSerializedSize} from "./security";
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
  const validateUnit = (value: unknown, label: string, maxBytes: number): void => { try { assertSafeSerializable(value, maxBytes); } catch (error) { errors.push(`${label}:${error instanceof Error ? error.message : "invalid_value"}`); } };
  validateUnit({schemaVersion: ledger.schemaVersion, requestIds: ledger.requests.map((item) => item.id), planIds: ledger.plans.map((item) => item.id), resultIds: ledger.results.map((item) => item.id), eventIds: ledger.events.map((item) => item.id)}, "ledger_index", 200_000);
  const requests = new Map(ledger.requests.map((item) => [item.id, item])); ledger.results.forEach((item) => { if (!requests.has(item.request.id)) requests.set(item.request.id, item.request); });
  requests.forEach((item, id) => validateUnit(item, `request:${id}`, 500_000));
  ledger.plans.forEach((item) => validateUnit(item, `plan:${item.id}`, 100_000));
  ledger.results.forEach((item) => {
    const {evidence, dependencyGraph, claims, conflicts, candidateAssessments, findings, providerRuns} = item;
    const excluded = new Set(["request", "plan", "evidence", "dependencyGraph", "claims", "conflicts", "candidateAssessments", "findings", "providerRuns"]); const metadata = Object.fromEntries(Object.entries(item).filter(([key]) => !excluded.has(key)));
    validateUnit(metadata, `result:${item.id}:metadata`, 200_000); validateUnit(dependencyGraph, `result:${item.id}:dependency_graph`, 300_000);
    evidence.forEach((entry) => validateUnit(entry, `evidence:${entry.id}`, item.request.policy.maxEvidenceBytes)); claims.forEach((entry) => validateUnit(entry, `claim:${entry.id}`, 64_000)); conflicts.forEach((entry) => validateUnit(entry, `conflict:${entry.id}`, 64_000)); candidateAssessments.forEach((entry) => validateUnit(entry, `candidate:${entry.candidateId}`, 64_000)); findings.forEach((entry) => validateUnit(entry, `finding:${entry.id}`, 64_000)); providerRuns.forEach((entry) => validateUnit(entry, `provider_run:${entry.id}`, 32_000));
  });
  ledger.events.forEach((item) => validateUnit(item, `event:${item.id}`, 64_000));
  try { assertSerializedSize(ledger, 2_000_000); } catch (error) { errors.push(error instanceof Error ? error.message : "invalid_ledger"); }
  return {valid: errors.length === 0, errors};
}
export type InvestigationRepository = {load(): InvestigationLedger; save(ledger: InvestigationLedger): void};
export class MemoryInvestigationRepository implements InvestigationRepository { private ledger = empty(); load() { return structuredClone(this.ledger); } save(ledger: InvestigationLedger) { const validation = validateInvestigationLedger(ledger); if (!validation.valid) throw new Error(`invalid_investigation_ledger:${validation.errors.join(",")}`); this.ledger = structuredClone(ledger); } }
export const localStorageInvestigationRepository: InvestigationRepository = {
  load() { if (typeof localStorage === "undefined") return empty(); const raw = localStorage.getItem(INVESTIGATION_STORAGE_KEY); if (!raw) return empty(); try { const migrated = migrateInvestigationLedger(JSON.parse(raw)); return validateInvestigationLedger(migrated).valid ? migrated : empty(); } catch { return empty(); } },
  save(ledger) { const validation = validateInvestigationLedger(ledger); if (!validation.valid) throw new Error(`invalid_investigation_ledger:${validation.errors.join(",")}`); if (typeof localStorage !== "undefined") localStorage.setItem(INVESTIGATION_STORAGE_KEY, JSON.stringify(ledger)); },
};
