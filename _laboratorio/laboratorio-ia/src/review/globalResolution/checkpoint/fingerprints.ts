import type {ReviewCase, ReviewJsonValue} from "../../types";
import {getExternalNewsResumeSnapshot} from "../../resume/externalNews";
import {computeUniversalFingerprint} from "../../universal";
import type {GlobalResolutionCheckpoint, SerializedResolutionGraph} from "./types";

function normalizeIdentityGuard(guard: NonNullable<GlobalResolutionCheckpoint["identityGuard"]>) {
  return "authorizationFingerprint" in guard
    ? {...guard, authorizedAt: undefined, candidateIds: [...guard.candidateIds].sort(), strategyIds: [...guard.strategyIds].sort(), warningCodes: [...guard.warningCodes].sort()}
    : {...guard, authorizedAt: undefined, blockers: [...guard.blockers].sort((left, right) => left.code.localeCompare(right.code)), warnings: [...guard.warnings].sort((left, right) => left.code.localeCompare(right.code))};
}

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
    operations: checkpoint.execution.operations.map((operation) => Object.fromEntries(Object.entries(operation).filter(([key]) => key !== "startedAt" && key !== "completedAt"))),
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
    producerManifest: checkpoint.producerManifest,
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
    identityGuard: checkpoint.identityGuard ? normalizeIdentityGuard(checkpoint.identityGuard) : undefined,
    identityGuards: checkpoint.identityGuards?.map(normalizeIdentityGuard).sort((left, right) => ("authorizationFingerprint" in left ? left.creationOperationId : left.operationId).localeCompare("authorizationFingerprint" in right ? right.creationOperationId : right.operationId)),
    transaction: checkpoint.transaction ? {schemaVersion: checkpoint.transaction.schemaVersion, transactionId: checkpoint.transaction.transactionId, transactionFingerprint: checkpoint.transaction.transactionFingerprint, sourcePlanFingerprint: checkpoint.transaction.sourcePlanFingerprint, sourceCheckpointFingerprint: checkpoint.transaction.sourceCheckpointFingerprint, phase: checkpoint.transaction.phase, checkpointFingerprint: checkpoint.transaction.checkpointFingerprint} : undefined,
    autonomousLoop: checkpoint.autonomousLoop ? {...checkpoint.autonomousLoop, history: [...checkpoint.autonomousLoop.history].sort((left, right) => left.iteration - right.iteration)} : undefined,
    resume,
    history: checkpoint.history.map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "occurredAt"))),
  } as unknown as ReviewJsonValue);
}

/** Fingerprint of the resolution context excluding the mutable AU7 transaction projection. */
export function fingerprintGlobalResolutionCheckpointSource(checkpoint: GlobalResolutionCheckpoint): string {
  return fingerprintGlobalResolutionCheckpoint({...checkpoint, transaction: undefined, autonomousLoop: undefined});
}
