import {isSerializableReviewValue} from "../cases/validateResolution";
import {entityOperationRegistry} from "../entityOperations";
import {buildResolutionGraphFromOperations} from "./buildResolutionGraphFromOperations";
import {appendFinalValidationAndResume, deriveEntityOperations} from "./deriveEntityOperations";
import {expectedGlobalResolutionPlanIdempotencyKey, fingerprintGlobalResolutionPlan} from "./fingerprintGlobalResolutionPlan";
import {resolveGlobalResolutionPlanningPolicy} from "./planningPolicies";
import type {BuildGlobalResolutionPlanResult, GlobalResolutionBlocker, GlobalResolutionPlan, GlobalResolutionPlanningInput, PlanningContext} from "./types";
import {validateGlobalResolutionPlan} from "./validateGlobalResolutionPlan";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const basicBlocker = (code: GlobalResolutionBlocker["code"], message: string): GlobalResolutionBlocker => ({code, message, severity: "blocking", scope: "structure", evidence: [], explanation: message, requiredAction: "Corregir la entrada y volver a construir el plan."});

function contextFrom(input: GlobalResolutionPlanningInput): PlanningContext {
  const reviewCase = input.reviewCase;
  const contextProducer = text(reviewCase.context.producer);
  const contextOperation = text(reviewCase.context.operation);
  return {
    reviewCase,
    resolutions: input.resolutions ?? reviewCase.resolutions,
    effects: input.effects ?? [],
    evidence: input.evidence ?? [],
    preparedEntities: input.preparedEntities ?? [],
    dependencyHints: input.dependencyHints ?? [],
    producer: text(input.producer) || contextProducer,
    originalOperation: text(input.originalOperation) || contextOperation,
    finalEntityType: input.finalEntityType,
    policy: resolveGlobalResolutionPlanningPolicy(input.policy),
    entityRegistry: input.entityRegistry ?? entityOperationRegistry,
    metadata: {},
  };
}

export function buildGlobalResolutionPlan(input: GlobalResolutionPlanningInput): BuildGlobalResolutionPlanResult {
  if (!input.reviewCase || !isSerializableReviewValue(input.reviewCase) || !text(input.reviewCase.id) || !Number.isInteger(input.reviewCase.version) || input.reviewCase.version < 1) return {ok: false, issues: [basicBlocker("invalid_planning_input", "El ReviewCase de entrada no es serializable o no tiene identidad válida.")]};
  const context = contextFrom(input);
  const first = deriveEntityOperations(context);
  const derived = appendFinalValidationAndResume(context, first);
  let graph;
  try {
    graph = buildResolutionGraphFromOperations({caseId: context.reviewCase.id, caseVersion: context.reviewCase.version, producer: context.producer || "missing-producer", originalOperation: context.originalOperation || "missing-operation", operations: derived.operations, policy: context.policy, metadata: {policyVersion: "au2-b2"}, now: input.now});
  } catch (error) {
    return {ok: false, issues: [...derived.blockers, basicBlocker("invalid_planning_input", error instanceof Error ? error.message : "No se pudo construir el grafo de resolución.")]};
  }
  const structuralBlocked = derived.blockers.some((blocker) => blocker.scope === "structure" && blocker.severity === "blocking");
  const executionBlocked = derived.blockers.some((blocker) => blocker.scope === "execution" && blocker.severity === "blocking");
  const capabilities = [...new Set(derived.operations.flatMap((operation) => operation.requiredCapability ? [operation.requiredCapability] : []))].sort();
  const bare = {schemaVersion: 1 as const, caseId: context.reviewCase.id, caseVersion: context.reviewCase.version, producer: context.producer || "missing-producer", originalOperation: context.originalOperation || "missing-operation", operations: derived.operations, graph, blockers: derived.blockers, warnings: derived.warnings, assumptions: derived.assumptions, policy: context.policy, requiredCapabilities: capabilities};
  const fingerprint = fingerprintGlobalResolutionPlan(bare);
  const plan: GlobalResolutionPlan = {...bare, id: `global-resolution-plan:${context.reviewCase.id}:${fingerprint.slice(-16)}`, fingerprint, idempotencyKey: expectedGlobalResolutionPlanIdempotencyKey(bare), createdAt: input.now?.() ?? new Date().toISOString(), structurallyValid: !structuralBlocked, executable: !structuralBlocked && !executionBlocked, status: structuralBlocked || executionBlocked ? "blocked" : "ready"};
  const validation = validateGlobalResolutionPlan(plan);
  if (!validation.valid) return {ok: false, issues: [...derived.blockers, ...validation.errors.map((entry) => basicBlocker("invalid_planning_input", entry.message))], partialPlan: {...plan, status: "invalid", structurallyValid: false, executable: false}};
  return {ok: true, plan};
}
