import {buildResolutionGraph, type ResolutionGraph} from "../resolutionGraph";
import type {EntityOperation} from "../entityOperations";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import type {GlobalResolutionPlanningPolicy} from "./types";

function object(value: ReviewJsonValue | undefined): ReviewJsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

export function isResumeOperation(operation: EntityOperation): boolean {
  return object(operation.payload)?.scope === "resume";
}

export function buildResolutionGraphFromOperations(input: {caseId: string; caseVersion: number; producer: string; originalOperation: string; operations: readonly EntityOperation[]; policy: GlobalResolutionPlanningPolicy; metadata?: ReviewJsonObject; now?: () => string}): ResolutionGraph {
  return buildResolutionGraph({
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    producerId: input.producer,
    originalOperation: input.originalOperation,
    now: input.now,
    metadata: {planner: "global_resolution", ...(input.metadata ?? {})},
    nodes: [...input.operations].sort((left, right) => left.id.localeCompare(right.id)).map((operation) => ({
      id: operation.id,
      operation,
      isResumeNode: isResumeOperation(operation),
      requiredForCompletion: true,
      dependencyPolicy: isResumeOperation(operation) ? {acceptedStates: input.policy.allowSkippedDependencyForResume ? ["succeeded", "skipped"] : ["succeeded"], explanation: "La reanudación solo acepta dependencias terminadas por la política de planificación."} : undefined,
    })),
  });
}
