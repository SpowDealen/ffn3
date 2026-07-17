import {confidenceLevel} from "./policy";
import type {DecisionMemoryCluster, DecisionMemoryRecord} from "./types";

const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
export function buildMemoryClusters(records: DecisionMemoryRecord[], occurredAt = new Date().toISOString()): DecisionMemoryCluster[] {
  const groups = new Map<string, DecisionMemoryRecord[]>();
  records.forEach((record) => { const current = groups.get(record.clusterFingerprint) ?? []; current.push(record); groups.set(record.clusterFingerprint, current); });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fingerprint, members]) => {
    const active = members.filter((item) => item.status === "confirmed" || item.status === "rejected");
    const confirmed = active.filter((item) => item.editorialDecision === "confirmed");
    const rejected = active.filter((item) => item.editorialDecision === "rejected");
    const caseIds = unique(active.map((item) => item.caseId)); const sourceIds = unique(active.map((item) => item.source ?? item.producer));
    const contested = confirmed.length > 0 && rejected.length > 0;
    const status = active.length === 0 ? "inactive" : contested ? "contested" : confirmed.length >= 2 && caseIds.length >= 2 ? "supported" : "emerging";
    let score = contested ? 20 : confirmed.length === 0 ? 0 : Math.min(80, 35 + Math.max(0, caseIds.length - 1) * 15 + Math.max(0, sourceIds.length - 1) * 8);
    if (contested) score = Math.min(score, 25);
    const reasons = [`${confirmed.length} confirmadas, ${rejected.length} rechazadas, ${caseIds.length} casos independientes y ${sourceIds.length} fuentes.`];
    if (contested) reasons.push("La contradicción limita la confianza y bloquea cualquier candidatura futura.");
    return {schemaVersion: 1, id: fingerprint, fingerprint, status, memoryIds: unique(active.map((item) => item.id)), confirmedMemoryIds: unique(confirmed.map((item) => item.id)), rejectedMemoryIds: unique(rejected.map((item) => item.id)), caseIds, sourceIds, occurrenceCount: active.length, confidence: {score, level: confidenceLevel(score), reasons}, updatedAt: occurredAt};
  });
}
