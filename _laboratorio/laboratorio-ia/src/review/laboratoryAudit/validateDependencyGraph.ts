import type { LaboratoryDependencyGraph } from "./types";

export function validateDependencyGraph(graph: LaboratoryDependencyGraph): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIds = graph.nodes.map((item) => item.id);
  const findingIds = graph.findings.map((item) => item.id);
  const edgeIds = graph.edges.map((item) => item.id);
  if (!graph.field.trim()) errors.push("missing_field");
  if (new Set(nodeIds).size !== nodeIds.length) errors.push("duplicate_node_ids");
  if (new Set(findingIds).size !== findingIds.length) errors.push("duplicate_finding_ids");
  if (new Set(edgeIds).size !== edgeIds.length) errors.push("duplicate_edge_ids");
  if (graph.edges.some((edge) => !nodeIds.includes(edge.from) || !nodeIds.includes(edge.to))) errors.push("dangling_edge");
  if (graph.edges.some((edge) => !edge.findingIds.length || edge.findingIds.some((id) => !findingIds.includes(id)))) errors.push("invalid_edge_evidence");
  if (graph.findings.some((item) => !item.file || !item.symbol || !item.evidence || item.line < 1 || item.column < 1)) errors.push("invalid_finding");
  try { JSON.stringify(graph); } catch { errors.push("not_json_serializable"); }
  return { valid: errors.length === 0, errors };
}
