import type {ReviewCase, ReviewJsonValue} from "../../types";
import {getExternalNewsResumeSnapshot} from "../../resume/externalNews";
import {computeUniversalFingerprint} from "../../universal";
import type {GlobalResolutionCheckpoint, SerializedResolutionGraph} from "./types";

export function fingerprintGlobalResolutionCase(reviewCase: ReviewCase): string {
  const input = {
    schemaVersion: reviewCase.schemaVersion,
    id: reviewCase.id,
    dedupeKey: reviewCase.dedupeKey,
    module: reviewCase.module,
    title: reviewCase.title,
    status: reviewCase.status,
    priority: reviewCase.priority,
    source: reviewCase.source,
    subject: reviewCase.subject,
    issues: reviewCase.issues,
    resolutions: reviewCase.resolutions,
    context: reviewCase.context,
    resumeAction: reviewCase.resumeAction,
    resumeExecution: reviewCase.resumeExecution,
    entityMaterialization: reviewCase.entityMaterialization,
  };
  return computeUniversalFingerprint(input as unknown as ReviewJsonValue);
}

export function fingerprintGlobalResolutionSnapshot(reviewCase: ReviewCase): string | undefined {
  if (reviewCase.context.producer !== "external_news") return undefined;
  const snapshot = getExternalNewsResumeSnapshot(reviewCase.context).snapshot;
  return snapshot ? computeUniversalFingerprint(snapshot as unknown as ReviewJsonValue) : undefined;
}

export function fingerprintSerializedResolutionGraph(graph: Omit<SerializedResolutionGraph, "fingerprint">): string {
  return computeUniversalFingerprint({
    schemaVersion: graph.schemaVersion,
    graphId: graph.graphId,
    planId: graph.planId,
    caseId: graph.caseId,
    caseVersion: graph.caseVersion,
    producer: graph.producer,
    originalOperation: graph.originalOperation,
    nodes: [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id)).map((node) => ({
      ...node,
      dependencyIds: [...node.dependencyIds].sort(),
      result: node.result ? {...node.result, references: [...node.result.references].sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`))} : undefined,
    })),
    state: graph.state,
    intentFingerprint: graph.intentFingerprint,
    idempotencyKey: graph.idempotencyKey,
    metadata: graph.metadata,
  } as unknown as ReviewJsonValue);
}

export function fingerprintGlobalResolutionCheckpoint(checkpoint: Omit<GlobalResolutionCheckpoint, "id" | "checkpointFingerprint" | "createdAt" | "updatedAt">): string {
  const simulation = checkpoint.simulation ? {
    inputFingerprint: checkpoint.simulation.inputFingerprint,
    simulatedOperationIds: checkpoint.simulation.simulatedOperationIds,
    blockedOperationIds: checkpoint.simulation.blockedOperationIds,
    blockerCodes: checkpoint.simulation.blockerCodes,
    finalReadiness: checkpoint.simulation.finalReadiness,
    resultFingerprint: checkpoint.simulation.resultFingerprint,
  } : undefined;
  const execution = checkpoint.execution ? {
    planFingerprint: checkpoint.execution.planFingerprint,
    simulationFingerprint: checkpoint.execution.simulationFingerprint,
    status: checkpoint.execution.status,
    operations: checkpoint.execution.operations.map(({startedAt: _startedAt, completedAt: _completedAt, ...operation}) => operation),
    resultFingerprint: checkpoint.execution.resultFingerprint,
  } : undefined;
  const referenceResolution = checkpoint.referenceResolution ? {
    ...checkpoint.referenceResolution,
    resolvedAt: undefined,
  } : undefined;
  const resume = checkpoint.resume ? {
    ...checkpoint.resume,
    preparedAt: undefined,
    completedAt: undefined,
    referenceIds: [...checkpoint.resume.referenceIds].sort(),
    validation: {
      ...checkpoint.resume.validation,
      blockerCodes: [...checkpoint.resume.validation.blockerCodes].sort(),
    },
  } : undefined;
  return computeUniversalFingerprint({
    schemaVersion: checkpoint.schemaVersion,
    caseId: checkpoint.caseId,
    caseVersion: checkpoint.caseVersion,
    storedAtCaseVersion: checkpoint.storedAtCaseVersion,
    producer: checkpoint.producer,
    plan: checkpoint.plan,
    graph: checkpoint.graph,
    planFingerprint: checkpoint.planFingerprint,
    graphFingerprint: checkpoint.graphFingerprint,
    caseFingerprint: checkpoint.caseFingerprint,
    snapshotFingerprint: checkpoint.snapshotFingerprint,
    phase: checkpoint.phase,
    simulation,
    execution,
    referenceResolution,
    resume,
    history: checkpoint.history.map(({occurredAt: _occurredAt, ...entry}) => entry),
  } as unknown as ReviewJsonValue);
}
