import {isSerializableReviewValue} from "../cases/validateResolution";
import {validateEntityOperation} from "../entityOperations";
import {validateResolutionGraph} from "../resolutionGraph";
import {expectedGlobalResolutionPlanIdempotencyKey, fingerprintGlobalResolutionPlan} from "./fingerprintGlobalResolutionPlan";
import type {GlobalResolutionPlan, GlobalResolutionPlanValidationIssue, GlobalResolutionPlanValidationResult} from "./types";

const issue = (code: string, message: string, severity: GlobalResolutionPlanValidationIssue["severity"] = "error", operationId?: string): GlobalResolutionPlanValidationIssue => ({code, message, severity, operationId});

export function validateGlobalResolutionPlan(value: unknown): GlobalResolutionPlanValidationResult {
  const errors: GlobalResolutionPlanValidationIssue[] = [];
  const warnings: GlobalResolutionPlanValidationIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {valid: false, errors: [issue("global_resolution_plan_object_required", "El plan debe ser un objeto.")], warnings};
  const plan = value as Partial<GlobalResolutionPlan>;
  if (plan.schemaVersion !== 1 || !plan.id?.trim() || !plan.caseId?.trim() || !Number.isInteger(plan.caseVersion) || Number(plan.caseVersion) < 1 || !plan.producer?.trim() || !plan.originalOperation?.trim()) errors.push(issue("global_resolution_plan_header_invalid", "La cabecera del plan es inválida."));
  if (!Array.isArray(plan.operations) || !Array.isArray(plan.blockers) || !Array.isArray(plan.warnings) || !Array.isArray(plan.assumptions) || !Array.isArray(plan.requiredCapabilities) || !plan.policy || !plan.graph) errors.push(issue("global_resolution_plan_shape_invalid", "Faltan colecciones o contratos obligatorios del plan."));
  if (!["ready", "blocked", "invalid"].includes(String(plan.status)) || typeof plan.structurallyValid !== "boolean" || typeof plan.executable !== "boolean" || !plan.fingerprint?.trim() || !plan.idempotencyKey?.trim() || !plan.createdAt?.trim()) errors.push(issue("global_resolution_plan_state_invalid", "El estado, fingerprint o idempotencia del plan son inválidos."));
  if (!isSerializableReviewValue(value)) errors.push(issue("global_resolution_plan_not_serializable", "El plan debe ser serializable."));
  if (errors.length || !Array.isArray(plan.operations) || !plan.graph || !plan.policy) return {valid: false, errors, warnings};
  const full = plan as GlobalResolutionPlan;
  const operationIds = new Set<string>();
  const keys = new Set<string>();
  for (const operation of full.operations) {
    if (!validateEntityOperation(operation).valid) errors.push(issue("global_resolution_plan_operation_invalid", "El plan contiene una operación inválida.", "error", operation.id));
    if (operationIds.has(operation.id)) errors.push(issue("global_resolution_plan_duplicate_operation", "El plan contiene operaciones duplicadas.", "error", operation.id));
    operationIds.add(operation.id);
    if (keys.has(operation.idempotencyKey)) errors.push(issue("global_resolution_plan_duplicate_idempotency", "El plan contiene idempotencia duplicada.", "error", operation.id));
    keys.add(operation.idempotencyKey);
  }
  const graphValidation = validateResolutionGraph(full.graph);
  graphValidation.errors.forEach((entry) => errors.push(issue(`global_graph_${entry.code}`, entry.message, "error", entry.nodeId)));
  const graphOperationIds = new Set(full.graph.nodes.map((node) => node.operation.id));
  full.operations.forEach((operation) => { if (!graphOperationIds.has(operation.id)) errors.push(issue("global_resolution_plan_operation_missing_from_graph", "Una operación no aparece en el grafo.", "error", operation.id)); });
  full.graph.nodes.forEach((node) => { if (!operationIds.has(node.operation.id)) errors.push(issue("global_resolution_plan_graph_operation_unknown", "El grafo contiene una operación desconocida.", "error", node.operation.id)); });
  const resumeNodes = full.graph.nodes.filter((node) => node.isResumeNode);
  if (resumeNodes.length > 1) errors.push(issue("global_resolution_plan_multiple_resume", "El plan no puede incluir más de una reanudación."));
  if (full.operations.length && !resumeNodes.length && !full.blockers.some((blocker) => blocker.scope === "structure" && blocker.severity === "blocking")) errors.push(issue("global_resolution_plan_resume_missing", "Un plan estructuralmente preparado necesita una reanudación explícita."));
  if (full.status === "ready" && (full.blockers.length || !full.executable || !full.structurallyValid)) errors.push(issue("global_resolution_plan_ready_inconsistent", "Un plan ready no puede tener bloqueos ni capacidades ausentes."));
  if (full.executable && full.blockers.some((blocker) => blocker.scope === "execution" && blocker.severity === "blocking")) errors.push(issue("global_resolution_plan_executable_inconsistent", "Un plan ejecutable contiene bloqueos de ejecución."));
  const capabilities = [...new Set(full.operations.flatMap((operation) => operation.requiredCapability ? [operation.requiredCapability] : []))].sort();
  if (JSON.stringify(capabilities) !== JSON.stringify([...full.requiredCapabilities].sort())) errors.push(issue("global_resolution_plan_capability_inventory_invalid", "El inventario de capacidades no coincide con las operaciones."));
  const base: Omit<GlobalResolutionPlan, "id" | "fingerprint" | "idempotencyKey" | "createdAt" | "status" | "executable" | "structurallyValid"> = {schemaVersion: full.schemaVersion, caseId: full.caseId, caseVersion: full.caseVersion, producer: full.producer, originalOperation: full.originalOperation, operations: full.operations, graph: full.graph, blockers: full.blockers, warnings: full.warnings, assumptions: full.assumptions, policy: full.policy, requiredCapabilities: full.requiredCapabilities};
  if (full.fingerprint !== fingerprintGlobalResolutionPlan(base)) errors.push(issue("global_resolution_plan_fingerprint_mismatch", "El fingerprint del plan no coincide."));
  if (full.idempotencyKey !== expectedGlobalResolutionPlanIdempotencyKey(base)) errors.push(issue("global_resolution_plan_idempotency_mismatch", "La clave de idempotencia no coincide."));
  return {valid: !errors.length, errors, warnings};
}
