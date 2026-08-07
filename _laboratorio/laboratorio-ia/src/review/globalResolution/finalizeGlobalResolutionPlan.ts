import type {EntityOperation} from "../entityOperations";
import {buildResolutionGraphFromOperations} from "./buildResolutionGraphFromOperations";
import {expectedGlobalResolutionPlanIdempotencyKey, fingerprintGlobalResolutionPlan} from "./fingerprintGlobalResolutionPlan";
import {ensureIdentityCreationGuardOperations, identityCreationGuardProfileForCapability, isIdentityCreationSupported} from "./identityCreationGuard";
import type {BuildGlobalResolutionPlanResult, GlobalResolutionAssumption, GlobalResolutionBlocker, GlobalResolutionPlan, GlobalResolutionPlanningPolicy, GlobalResolutionWarning} from "./types";
import {validateGlobalResolutionPlan} from "./validateGlobalResolutionPlan";

const basicBlocker = (message: string): GlobalResolutionBlocker => ({code: "invalid_planning_input", message, severity: "blocking", scope: "structure", evidence: [], explanation: message, requiredAction: "Corregir la entrada y volver a construir el plan."});

/** Shared AU2 finalization boundary. It adds guard capability blockers, builds the canonical graph and fingerprints the plan. */
export function finalizeGlobalResolutionPlan(input: {
  caseId: string;
  caseVersion: number;
  producer: string;
  originalOperation: string;
  operations: readonly EntityOperation[];
  blockers?: readonly GlobalResolutionBlocker[];
  warnings?: readonly GlobalResolutionWarning[];
  assumptions?: readonly GlobalResolutionAssumption[];
  policy: GlobalResolutionPlanningPolicy;
  graphMetadata?: Record<string, string | number | boolean | null>;
  now?: () => string;
}): BuildGlobalResolutionPlanResult {
  const operations = ensureIdentityCreationGuardOperations(input.operations, input.producer).sort((left, right) => left.id.localeCompare(right.id));
  const guardBlockers = operations.flatMap((operation): GlobalResolutionBlocker[] => {
    const profile = operation.requiredCapability ? identityCreationGuardProfileForCapability(operation.requiredCapability) : undefined;
    if (!profile || isIdentityCreationSupported(profile) && input.policy.availableCapabilities.includes(profile.guardCapability)) return [];
    return [{code: "missing_required_capability", severity: "blocking", scope: "execution", operationId: operation.id, entityType: operation.entityType, message: "La resolución de identidad obligatoria no está disponible.", evidence: operation.evidence, explanation: `${operation.requiredCapability ?? "identity_resolution"} no dispone de preflight y gate ejecutable completos.`, requiredAction: "Registrar profile, discovery, preflight y executor gate antes de habilitar la creación."}];
  });
  const blockers = [...(input.blockers ?? []), ...guardBlockers];
  let graph;
  try {
    graph = buildResolutionGraphFromOperations({caseId: input.caseId, caseVersion: input.caseVersion, producer: input.producer, originalOperation: input.originalOperation, operations, policy: input.policy, metadata: {policyVersion: "au6-b5", ...(input.graphMetadata ?? {})}, now: input.now});
  } catch (error) {
    return {ok: false, issues: [...blockers, basicBlocker(error instanceof Error ? error.message : "No se pudo construir el grafo de resolución.")]};
  }
  const guardedOperations = graph.nodes.map((node) => node.operation).sort((left, right) => left.id.localeCompare(right.id));
  const structuralBlocked = blockers.some((blocker) => blocker.scope === "structure" && blocker.severity === "blocking");
  const executionBlocked = blockers.some((blocker) => blocker.scope === "execution" && blocker.severity === "blocking");
  const requiredCapabilities = [...new Set(guardedOperations.flatMap((operation) => operation.requiredCapability ? [operation.requiredCapability] : []))].sort();
  const bare = {schemaVersion: 1 as const, caseId: input.caseId, caseVersion: input.caseVersion, producer: input.producer, originalOperation: input.originalOperation, operations: guardedOperations, graph, blockers, warnings: [...(input.warnings ?? [])], assumptions: [...(input.assumptions ?? [])], policy: input.policy, requiredCapabilities};
  const fingerprint = fingerprintGlobalResolutionPlan(bare);
  const plan: GlobalResolutionPlan = {...bare, id: `global-resolution-plan:${input.caseId}:${fingerprint.slice(-16)}`, fingerprint, idempotencyKey: expectedGlobalResolutionPlanIdempotencyKey(bare), createdAt: input.now?.() ?? new Date().toISOString(), structurallyValid: !structuralBlocked, executable: !structuralBlocked && !executionBlocked, status: structuralBlocked || executionBlocked ? "blocked" : "ready"};
  const validation = validateGlobalResolutionPlan(plan);
  if (!validation.valid) return {ok: false, issues: [...blockers, ...validation.errors.map((entry) => basicBlocker(entry.message))], partialPlan: {...plan, status: "invalid", structurallyValid: false, executable: false}};
  return {ok: true, plan};
}
