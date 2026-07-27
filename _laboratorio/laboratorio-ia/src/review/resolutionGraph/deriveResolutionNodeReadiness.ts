import type {ResolutionGraph, ResolutionNode, ResolutionNodeReadiness} from "./types";

const TERMINAL = new Set<ResolutionNode["state"]>(["succeeded", "blocked", "failed", "compensated", "reconciliation_required", "skipped"]);

function accepts(node: ResolutionNode, state: ResolutionNode["state"]): boolean {
  return state === "succeeded" || (state === "skipped" && Boolean(node.dependencyPolicy?.acceptedStates.includes("skipped")));
}

function dependenciesFor(node: ResolutionNode, graph: ResolutionGraph): ResolutionNode[] | undefined {
  const nodes = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const dependencies = node.dependencyIds.map((id) => nodes.get(id));
  return dependencies.some((dependency) => !dependency) ? undefined : dependencies as ResolutionNode[];
}

export function deriveResolutionNodeReadiness(graph: ResolutionGraph, nodeOrId: ResolutionNode | string): ResolutionNodeReadiness {
  const node = typeof nodeOrId === "string" ? graph.nodes.find((candidate) => candidate.id === nodeOrId) : nodeOrId;
  if (!node) return {nodeId: typeof nodeOrId === "string" ? nodeOrId : "unknown", ready: false, reasons: ["resolution_node_missing"]};
  if (TERMINAL.has(node.state)) return {nodeId: node.id, ready: false, reasons: ["resolution_node_terminal"]};
  if (node.state !== "pending" && node.state !== "ready") return {nodeId: node.id, ready: false, reasons: ["resolution_node_not_pending"]};
  const dependencies = dependenciesFor(node, graph);
  if (!dependencies) return {nodeId: node.id, ready: false, reasons: ["resolution_node_dependency_missing"]};
  const requiredDependencies = node.isResumeNode ? graph.nodes.filter((candidate) => candidate.requiredForCompletion && candidate.id !== node.id) : dependencies;
  const reasons = requiredDependencies.flatMap((dependency) => accepts(node, dependency.state) ? [] : [`dependency_${dependency.id}_${dependency.state}`]);
  return {nodeId: node.id, ready: reasons.length === 0, reasons};
}
