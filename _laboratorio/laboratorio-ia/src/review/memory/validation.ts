import type {DecisionMemoryLedger, DecisionMemoryRecord} from "./types";
import {rebuildDecisionMemoryRecords} from "./transitions";

const sensitive = /(?:token|password|secret|authorization|cookie|api.?key|private.?key)/i;
function inspect(value: unknown, errors: string[], seen = new WeakSet<object>()): void {
  if (["function", "symbol", "bigint"].includes(typeof value)) { errors.push("memory_not_serializable"); return; }
  if (value === undefined || value === null || typeof value !== "object") return;
  if (seen.has(value as object)) { errors.push("memory_not_serializable"); return; }
  seen.add(value as object);
  if (value instanceof Error || value instanceof Date || value instanceof Map || value instanceof Set) errors.push("memory_not_plain_json");
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => { if (sensitive.test(key)) errors.push("sensitive_key_forbidden"); inspect(item, errors, seen); });
}
export function validateDecisionMemory(record: DecisionMemoryRecord) {
  const errors: string[] = [];
  if (!record.id || !record.outcomeId || !record.memoryFingerprint || !record.clusterFingerprint) errors.push("memory_identity_required");
  if (record.editorialDecision === "rejected" && record.reusePolicy !== "never") errors.push("rejected_memory_must_never_reuse");
  if (record.confidence.score < 0 || record.confidence.score > 100) errors.push("invalid_confidence");
  inspect(record, errors);
  try { JSON.stringify(record); } catch { errors.push("memory_not_serializable"); }
  return {valid: errors.length === 0, errors: [...new Set(errors)]};
}
export function validateDecisionMemoryLedger(ledger: DecisionMemoryLedger) {
  const errors = ledger.schemaVersion === 1 ? [] : ["unsupported_memory_schema"];
  ledger.records.forEach((record) => errors.push(...validateDecisionMemory(record).errors.map((error) => `${record.id}:${error}`)));
  const ids = new Set<string>(); ledger.events.forEach((event) => { if (ids.has(event.idempotencyKey)) errors.push(`duplicate_idempotency:${event.idempotencyKey}`); ids.add(event.idempotencyKey); });
  inspect(ledger.events, errors);
  try { const rebuilt = rebuildDecisionMemoryRecords(ledger.events); const current = [...ledger.records].sort((left, right) => left.id.localeCompare(right.id)); if (JSON.stringify(rebuilt) !== JSON.stringify(current)) errors.push("memory_snapshots_not_rebuildable"); } catch { errors.push("memory_event_history_invalid"); }
  try { JSON.stringify(ledger); } catch { errors.push("ledger_not_serializable"); }
  return {valid: errors.length === 0, errors};
}
