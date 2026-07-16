import type { AuditConfidence, DependencyUseType, LaboratoryAuditArea, LaboratoryDependencyEdge, LaboratoryDependencyFinding, LaboratoryDependencyGraph, LaboratoryDependencyNode } from "./types";

const AREAS: LaboratoryAuditArea[] = ["builders", "queries", "producers", "materialization", "preview", "resume", "review", "panel_ia", "laboratory", "public_web"];
const CONFIDENCE: Record<AuditConfidence, number> = { low: 1, medium: 2, high: 3 };
const highestConfidence = (values: AuditConfidence[]): AuditConfidence => values.sort((left, right) => CONFIDENCE[right] - CONFIDENCE[left])[0] ?? "low";
const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
};
const stable = (value: string): string => `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58)}-${hash(value)}`;

export function buildDependencyGraph(field: string, aliases: string[], findings: LaboratoryDependencyFinding[], sourceFileCount: number, generatedAt: string): LaboratoryDependencyGraph {
  const sorted = [...findings].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.area.localeCompare(right.area) || left.id.localeCompare(right.id));
  const fieldNodeId = `field:${stable(field)}`;
  const grouped = new Map<string, LaboratoryDependencyFinding[]>();
  for (const finding of sorted) {
    const key = `${finding.area}:${finding.file}:${finding.symbol}`;
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  }
  const nodes: LaboratoryDependencyNode[] = [{ id: fieldNodeId, kind: "field", label: field }];
  const edges: LaboratoryDependencyEdge[] = [];
  for (const [key, group] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const first = group[0];
    if (!first) continue;
    const consumerId = `consumer:${stable(key)}`;
    nodes.push({ id: consumerId, kind: "consumer", label: `${first.symbol} · ${first.file}`, area: first.area, file: first.file, symbol: first.symbol });
    edges.push({ id: `edge:${stable(`${fieldNodeId}:${consumerId}`)}`, from: fieldNodeId, to: consumerId, relation: "consumed_by", findingIds: group.map((item) => item.id), useTypes: [...new Set(group.map((item) => item.useType))].sort() as DependencyUseType[], confidence: highestConfidence(group.map((item) => item.confidence)) });
  }
  const areaSummary = Object.fromEntries(AREAS.map((area) => {
    const areaFindings = sorted.filter((item) => item.area === area);
    const consumers = new Set(areaFindings.map((item) => `${item.file}:${item.symbol}`));
    return [area, { findingCount: areaFindings.length, consumerCount: consumers.size, confidence: areaFindings.length ? highestConfidence(areaFindings.map((item) => item.confidence)) : "none" }];
  })) as LaboratoryDependencyGraph["areas"];
  return { version: 1, field, aliases: [...new Set(aliases)].sort(), generatedAt, sourceFileCount, findings: sorted, nodes, edges, areas: areaSummary, warnings: sorted.length ? [] : ["No se encontraron consumidores para el campo o sus aliases."] };
}
