import type {ResolutionGraph, ResolutionGraphTopologicalSortResult, ResolutionGraphValidationIssue} from "./types";

const issue = (code: string, message: string, nodeId?: string, dependencyId?: string): ResolutionGraphValidationIssue => ({code, severity: "error", message, nodeId, dependencyId});

export function topologicalSortResolutionGraph(graph: Pick<ResolutionGraph, "nodes">): ResolutionGraphTopologicalSortResult {
  const nodes = [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const known = new Set(nodes.map((node) => node.id));
  const errors: ResolutionGraphValidationIssue[] = [];
  const incoming = new Map(nodes.map((node) => [node.id, new Set(node.dependencyIds)]));
  const dependents = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const node of nodes) for (const dependencyId of node.dependencyIds) {
    if (!known.has(dependencyId)) errors.push(issue("missing_dependency", `La dependencia ${dependencyId} no existe.`, node.id, dependencyId));
    else dependents.get(dependencyId)?.push(node.id);
  }
  if (errors.length) return {valid: false, nodeIds: [], layers: [], errors};
  const ready = nodes.filter((node) => !incoming.get(node.id)?.size).map((node) => node.id).sort();
  const nodeIds: string[] = [];
  const layers: string[][] = [];
  while (ready.length) {
    const layer = [...ready];
    ready.length = 0;
    layers.push(layer);
    for (const id of layer) {
      nodeIds.push(id);
      for (const dependentId of (dependents.get(id) ?? []).sort()) {
        const dependencies = incoming.get(dependentId);
        dependencies?.delete(id);
        if (dependencies?.size === 0) ready.push(dependentId);
      }
    }
    ready.sort();
  }
  if (nodeIds.length !== nodes.length) {
    const unresolved = nodes.filter((node) => !nodeIds.includes(node.id));
    return {valid: false, nodeIds, layers, errors: unresolved.map((node) => issue("resolution_graph_cycle", `El nodo ${node.id} participa en un ciclo de dependencias.`, node.id))};
  }
  return {valid: true, nodeIds, layers, errors: []};
}
