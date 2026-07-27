import {isSerializableReviewValue} from "../cases/validateResolution";
import {validateEntityOperation} from "../entityOperations";
import {expectedResolutionGraphIdempotencyKey, fingerprintResolutionGraph} from "./fingerprintResolutionGraph";
import {deriveResolutionNodeReadiness} from "./deriveResolutionNodeReadiness";
import {topologicalSortResolutionGraph} from "./topologicalSortResolutionGraph";
import type {ResolutionGraph, ResolutionGraphValidationIssue, ResolutionGraphValidationResult, ResolutionNode, ResolutionNodeState} from "./types";

const NODE_STATES = new Set<ResolutionNodeState>(["pending", "ready", "simulated", "executing", "succeeded", "blocked", "failed", "compensated", "reconciliation_required", "skipped"]);
const GRAPH_STATES = new Set<ResolutionGraph["state"]>(["draft", "invalid", "ready", "simulated", "executing", "succeeded", "blocked", "failed", "reconciliation_required"]);
const issue = (code: string, message: string, options: Omit<ResolutionGraphValidationIssue, "code" | "message" | "severity"> = {}, severity: ResolutionGraphValidationIssue["severity"] = "error"): ResolutionGraphValidationIssue => ({code, message, severity, ...options});
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());

function closure(graph: ResolutionGraph, node: ResolutionNode): Set<string> {
  const nodes = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    nodes.get(id)?.dependencyIds.forEach(visit);
  };
  node.dependencyIds.forEach(visit);
  return visited;
}

function terminalSuccess(node: ResolutionNode): boolean {
  return node.state === "succeeded" || (node.state === "skipped" && Boolean(node.dependencyPolicy?.acceptedStates.includes("skipped")));
}

function validateNode(node: ResolutionNode, index: number, errors: ResolutionGraphValidationIssue[]): void {
  const path = `nodes[${index}]`;
  if (!text(node?.id)) errors.push(issue("resolution_node_id_required", "El nodo necesita un ID estable.", {path}));
  if (!NODE_STATES.has(node?.state)) errors.push(issue("resolution_node_state_invalid", "El estado del nodo no es válido.", {nodeId: node?.id, path}));
  if (!Array.isArray(node?.dependencyIds) || node.dependencyIds.some((dependencyId) => !text(dependencyId))) errors.push(issue("resolution_node_dependencies_invalid", "Las dependencias del nodo son inválidas.", {nodeId: node?.id, path}));
  else if (new Set(node.dependencyIds).size !== node.dependencyIds.length) errors.push(issue("resolution_node_dependencies_duplicated", "El nodo contiene dependencias duplicadas.", {nodeId: node.id, path}));
  if (!node?.operation || !validateEntityOperation(node.operation).valid) errors.push(issue("resolution_node_operation_invalid", "El nodo no contiene una operación editorial válida.", {nodeId: node?.id, path}));
  if (!Number.isFinite(node?.confidence) || node.confidence < 0 || node.confidence > 1 || !Array.isArray(node?.evidence) || !Array.isArray(node?.preconditions) || !Array.isArray(node?.postconditions)) errors.push(issue("resolution_node_contract_invalid", "La evidencia, confianza o condiciones del nodo no son válidas.", {nodeId: node?.id, path}));
  if (!text(node?.idempotencyKey) || node.idempotencyKey !== node.operation?.idempotencyKey) errors.push(issue("resolution_node_idempotency_mismatch", "La clave de idempotencia del nodo debe coincidir con la operación.", {nodeId: node?.id, path}));
  if (node?.dependencyIds?.includes(node.id)) errors.push(issue("self_dependency", "Un nodo no puede depender de sí mismo.", {nodeId: node.id, dependencyId: node.id}));
  if (node?.isResumeNode && !node.dependencyIds.length) errors.push(issue("resume_node_without_dependencies", "El nodo de reanudación necesita dependencias explícitas.", {nodeId: node.id}));
  if (node?.dependencyPolicy && (!node.dependencyPolicy.explanation.trim() || !node.dependencyPolicy.acceptedStates.length || node.dependencyPolicy.acceptedStates.some((state) => state !== "succeeded" && state !== "skipped"))) errors.push(issue("resolution_node_dependency_policy_invalid", "La política de dependencias no es válida.", {nodeId: node.id, path}));
}

export function validateResolutionGraph(value: unknown): ResolutionGraphValidationResult {
  const errors: ResolutionGraphValidationIssue[] = [];
  const warnings: ResolutionGraphValidationIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, errors: [issue("resolution_graph_object_required", "El grafo debe ser un objeto.")], warnings};
  const graph = value as Partial<ResolutionGraph>;
  if (graph.schemaVersion !== 1) errors.push(issue("resolution_graph_schema_invalid", "La versión del schema del grafo no es compatible."));
  if (!text(graph.id)) errors.push(issue("resolution_graph_id_required", "El grafo necesita un ID estable.", {path: "id"}));
  if (!text(graph.caseId) || !Number.isInteger(graph.caseVersion) || Number(graph.caseVersion) < 1) errors.push(issue("resolution_graph_case_invalid", "El caso o su versión no son válidos."));
  if (!text(graph.producerId) || !text(graph.originalOperation)) errors.push(issue("resolution_graph_origin_invalid", "El productor u operación original faltan."));
  if (!GRAPH_STATES.has(graph.state as ResolutionGraph["state"])) errors.push(issue("resolution_graph_state_invalid", "El estado agregado del grafo no es válido."));
  if (!text(graph.idempotencyKey) || !text(graph.fingerprint) || !text(graph.createdAt) || !graph.metadata || typeof graph.metadata !== "object" || Array.isArray(graph.metadata)) errors.push(issue("resolution_graph_metadata_invalid", "Faltan metadatos obligatorios del grafo."));
  if (!Array.isArray(graph.nodes)) errors.push(issue("resolution_graph_nodes_invalid", "El grafo debe contener nodos."));
  if (!isSerializableReviewValue(value)) errors.push(issue("resolution_graph_not_serializable", "El grafo debe ser serializable."));
  if (errors.length || !Array.isArray(graph.nodes)) return {valid: false, errors, warnings};
  const full = graph as ResolutionGraph;
  const nodeIds = new Set<string>();
  const operationKeys = new Set<string>();
  full.nodes.forEach((node, index) => {
    validateNode(node, index, errors);
    if (nodeIds.has(node.id)) errors.push(issue("duplicate_node_id", "Existen dos nodos con el mismo ID.", {nodeId: node.id}));
    nodeIds.add(node.id);
    if (operationKeys.has(node.operation.idempotencyKey)) errors.push(issue("duplicate_operation_idempotency_key", "Existen dos operaciones con la misma clave de idempotencia.", {nodeId: node.id}));
    operationKeys.add(node.operation.idempotencyKey);
    if (JSON.stringify(node.dependencyIds) !== JSON.stringify(node.operation.dependencyIds)) errors.push(issue("resolution_node_operation_dependencies_mismatch", "Las dependencias del nodo y la operación deben coincidir.", {nodeId: node.id}));
  });
  full.nodes.forEach((node) => node.dependencyIds.forEach((dependencyId) => {
    if (!nodeIds.has(dependencyId)) errors.push(issue("missing_dependency", `La dependencia ${dependencyId} no existe.`, {nodeId: node.id, dependencyId}));
  }));
  const topology = topologicalSortResolutionGraph(full);
  errors.push(...topology.errors);
  const resumes = full.nodes.filter((node) => node.isResumeNode);
  if (resumes.length > 1) errors.push(issue("multiple_resume_nodes", "Un grafo de una operación original solo puede tener un nodo de reanudación.", {nodeId: resumes[1].id}));
  for (const resume of resumes) {
    const required = full.nodes.filter((node) => node.requiredForCompletion && node.id !== resume.id);
    const available = closure(full, resume);
    for (const node of required) if (!available.has(node.id)) errors.push(issue("resume_missing_required_dependency", `La reanudación no espera el cierre del nodo obligatorio ${node.id}.`, {nodeId: resume.id, dependencyId: node.id}));
  }
  if (resumes.length === 1) {
    const dependents = new Set(full.nodes.flatMap((node) => node.dependencyIds));
    full.nodes.filter((node) => !node.isResumeNode && !dependents.has(node.id)).forEach((node) => errors.push(issue("orphan_node", `El nodo ${node.id} no conduce a la reanudación.`, {nodeId: node.id})));
  }
  full.nodes.filter((node) => node.state === "ready").forEach((node) => {
    const readiness = deriveResolutionNodeReadiness(full, node);
    if (!readiness.ready) errors.push(issue("ready_node_dependencies_incomplete", `El nodo ready tiene dependencias incompletas: ${readiness.reasons.join(", ")}.`, {nodeId: node.id}));
  });
  if (full.state === "succeeded") full.nodes.filter((node) => node.requiredForCompletion && !terminalSuccess(node)).forEach((node) => errors.push(issue("succeeded_graph_incomplete", `El grafo está marcado como completado pero ${node.id} no terminó correctamente.`, {nodeId: node.id})));
  const base: Omit<ResolutionGraph, "id" | "fingerprint" | "idempotencyKey" | "state" | "createdAt" | "updatedAt"> = {schemaVersion: full.schemaVersion, caseId: full.caseId, caseVersion: full.caseVersion, producerId: full.producerId, originalOperation: full.originalOperation, nodes: full.nodes, metadata: full.metadata};
  if (full.fingerprint !== fingerprintResolutionGraph(base)) errors.push(issue("resolution_graph_fingerprint_mismatch", "El fingerprint de intención no coincide."));
  if (full.idempotencyKey !== expectedResolutionGraphIdempotencyKey(base)) errors.push(issue("resolution_graph_idempotency_key_mismatch", "La clave de idempotencia del grafo no coincide."));
  return {valid: !errors.length, errors, warnings};
}
