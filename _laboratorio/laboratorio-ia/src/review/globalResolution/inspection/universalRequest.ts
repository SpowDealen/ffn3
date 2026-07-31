import type {ReviewCase} from "../../types";
import {capabilityForOperation} from "../capabilities";
import {fingerprintGlobalResolutionInspectionOperation} from "./service";
import type {GlobalResolutionInspectionRequestBuildResult} from "./request";
import type {GlobalResolutionInspectionRequestContractRegistry} from "./requestContracts";

export function buildUniversalGlobalResolutionInspectionRequest(input: {
  reviewCase: ReviewCase;
  operationId: string;
  inspectorId?: string;
  inspectorVersion?: string;
  inspectionGeneration?: number;
  requestedAt: string;
  requireCompleteSubject?: boolean;
  contracts: GlobalResolutionInspectionRequestContractRegistry;
}): GlobalResolutionInspectionRequestBuildResult {
  const checkpoint = input.reviewCase.globalResolution;
  if (!checkpoint) return {ok: false, code: "checkpoint_missing"};
  const operation = checkpoint.plan.operations.find((candidate) => candidate.id === input.operationId);
  if (!operation) return {ok: false, code: "operation_missing"};
  const capability = capabilityForOperation(operation) ?? operation.requiredCapability ?? "";
  const contract = input.contracts.get(checkpoint.producer, capability);
  if (!contract) return {ok: false, code: "capability_unsupported"};
  const subject = contract.buildSubject({
    reviewCase: input.reviewCase,
    checkpoint,
    operation,
    requireCompleteSubject: input.requireCompleteSubject !== false,
  });
  if (!subject.ok) return subject;
  return {
    ok: true,
    request: {
      inspectorId: input.inspectorId,
      inspectorVersion: input.inspectorVersion,
      inspectionGeneration: input.inspectionGeneration,
      caseId: input.reviewCase.id,
      producer: checkpoint.producer,
      producerVersion: checkpoint.producerManifest?.producerVersion,
      manifestVersion: checkpoint.producerManifest?.manifestVersion,
      manifestFingerprint: checkpoint.producerManifest?.manifestFingerprint,
      capability,
      capabilityVersion: checkpoint.producerManifest?.capabilityVersions.find((entry) => entry.capabilityId === capability)?.capabilityVersion,
      operationId: input.operationId,
      operationFingerprint: fingerprintGlobalResolutionInspectionOperation(operation),
      checkpointFingerprint: checkpoint.checkpointFingerprint,
      checkpointVersion: checkpoint.storedAtCaseVersion,
      caseVersion: input.reviewCase.version,
      subject: subject.subject,
      requestedAt: input.requestedAt,
    },
  };
}
