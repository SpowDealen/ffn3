import {deriveResolutionNodeReadiness} from "./deriveResolutionNodeReadiness";
import {expectedResolutionGraphIdempotencyKey, fingerprintResolutionGraph} from "./fingerprintResolutionGraph";
import type {BuildResolutionGraphInput, ResolutionGraph, ResolutionGraphState, ResolutionNode} from "./types";
import {validateResolutionGraph} from "./validateResolutionGraph";

function node(input: BuildResolutionGraphInput["nodes"][number]): ResolutionNode {
  const dependencyIds = [...new Set(input.operation.dependencyIds)].sort();
  return {
    id: input.id?.trim() || input.operation.id,
    operation: {...input.operation, dependencyIds},
    dependencyIds,
    state: input.state ?? "pending",
    evidence: input.operation.evidence,
    risk: input.operation.risk,
    confidence: input.operation.confidence,
    preconditions: input.operation.preconditions,
    postconditions: input.operation.postconditions,
    idempotencyKey: input.operation.idempotencyKey,
    isResumeNode: input.isResumeNode ?? false,
    requiredForCompletion: input.requiredForCompletion ?? true,
    dependencyPolicy: input.dependencyPolicy ? {...input.dependencyPolicy, acceptedStates: [...new Set(input.dependencyPolicy.acceptedStates)].sort()} : undefined,
  };
}

function deriveGraphState(graph: ResolutionGraph): ResolutionGraphState {
  if (graph.nodes.some((candidate) => candidate.state === "reconciliation_required")) return "reconciliation_required";
  if (graph.nodes.some((candidate) => candidate.state === "failed")) return "failed";
  if (graph.nodes.some((candidate) => candidate.state === "blocked")) return "blocked";
  if (graph.nodes.every((candidate) => !candidate.requiredForCompletion || candidate.state === "succeeded" || (candidate.state === "skipped" && candidate.dependencyPolicy?.acceptedStates.includes("skipped")))) return "succeeded";
  if (graph.nodes.some((candidate) => candidate.state === "executing")) return "executing";
  if (graph.nodes.some((candidate) => candidate.state === "simulated")) return "simulated";
  return graph.nodes.some((candidate) => deriveResolutionNodeReadiness(graph, candidate).ready) ? "ready" : "draft";
}

export function buildResolutionGraph(input: BuildResolutionGraphInput): ResolutionGraph {
  const createdAt = input.now?.() ?? new Date().toISOString();
  const nodes = input.nodes.map(node);
  const base = {schemaVersion: 1 as const, caseId: input.caseId, caseVersion: input.caseVersion, producerId: input.producerId, originalOperation: input.originalOperation, nodes, metadata: input.metadata ?? {}};
  const fingerprint = fingerprintResolutionGraph(base);
  const preliminary = {...base, id: input.id?.trim() || `resolution-graph:${input.caseId}:${fingerprint.slice(-16)}`, fingerprint, idempotencyKey: input.idempotencyKey?.trim() || expectedResolutionGraphIdempotencyKey(base), createdAt, state: "draft" as const};
  const graph: ResolutionGraph = {...preliminary, state: deriveGraphState(preliminary)};
  const validation = validateResolutionGraph(graph);
  if (!validation.valid) throw new Error(`invalid_resolution_graph:${validation.errors.map((item) => item.code).join(",")}`);
  return graph;
}
