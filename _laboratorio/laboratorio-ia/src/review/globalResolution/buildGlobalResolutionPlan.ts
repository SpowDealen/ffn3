import {isSerializableReviewValue} from "../cases/validateResolution";
import {entityOperationRegistry} from "../entityOperations";
import {appendFinalValidationAndResume, deriveEntityOperations} from "./deriveEntityOperations";
import {resolveGlobalResolutionPlanningPolicy} from "./planningPolicies";
import type {BuildGlobalResolutionPlanResult, GlobalResolutionBlocker, GlobalResolutionPlanningInput, PlanningContext} from "./types";
import {ensureIdentityCreationGuardOperations} from "./identityCreationGuard";
import {finalizeGlobalResolutionPlan} from "./finalizeGlobalResolutionPlan";

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
    completionMode: input.completionMode ?? "resume_producer",
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
  const rawDerived = appendFinalValidationAndResume(context, first);
  const guardedOperations = ensureIdentityCreationGuardOperations(rawDerived.operations, context.producer || "missing-producer");
  return finalizeGlobalResolutionPlan({caseId: context.reviewCase.id, caseVersion: context.reviewCase.version, producer: context.producer || "missing-producer", originalOperation: context.originalOperation || "missing-operation", operations: guardedOperations, blockers: rawDerived.blockers, warnings: rawDerived.warnings, assumptions: rawDerived.assumptions, policy: context.policy, graphMetadata: {policyVersion: "au2-b2", completionMode: context.completionMode}, now: input.now});
}
