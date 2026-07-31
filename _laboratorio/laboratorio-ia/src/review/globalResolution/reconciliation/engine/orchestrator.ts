import type {ReviewCase} from "../../../types";
import type {GlobalResolutionInspectionCaseReader, GlobalResolutionInspectionEvidence, GlobalResolutionInspectionRequest} from "../../inspection";
import type {GlobalResolutionInspectionService} from "../../inspection/service";
import {assessReconciliation, buildUniversalReconciliationContext, collectReconciliationEvidence} from "../service";
import type {GlobalResolutionReconciliationAssessment} from "../types";
import type {UniversalReconciliationContractRegistry} from "./registry";
import type {UniversalReconciliationContextBinding} from "./types";

export type UniversalReconciliationInspectionResult =
  | {accepted: true; assessment: GlobalResolutionReconciliationAssessment; evidence?: GlobalResolutionInspectionEvidence}
  | {accepted: false; code: "superseded" | "context_missing"; assessment?: GlobalResolutionReconciliationAssessment};

function expectedContext(request: GlobalResolutionInspectionRequest, inspector?: {id: string; version: string}): UniversalReconciliationContextBinding {
  return {
    producerId: request.producer,
    producerVersion: request.producerVersion,
    manifestVersion: request.manifestVersion,
    manifestFingerprint: request.manifestFingerprint,
    caseVersion: request.caseVersion,
    checkpointVersion: request.checkpointVersion,
    checkpointFingerprint: request.checkpointFingerprint,
    operationId: request.operationId,
    operationFingerprint: request.operationFingerprint,
    payloadFingerprint: request.subject.expectedPayloadFingerprint,
    capabilityId: request.capability,
    capabilityVersion: request.capabilityVersion,
    inspectorId: request.inspectorId ?? inspector?.id,
    inspectorVersion: request.inspectorVersion ?? inspector?.version,
    inspectionGeneration: request.inspectionGeneration,
  };
}

function inspectable(reviewCase: ReviewCase | undefined, operationId: string): reviewCase is ReviewCase & {globalResolution: NonNullable<ReviewCase["globalResolution"]>} {
  return Boolean(reviewCase?.globalResolution?.plan.operations.some((operation) => operation.id === operationId));
}

export class UniversalReconciliationInspectionEngine {
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly inspectionService: GlobalResolutionInspectionService,
    private readonly readCase: GlobalResolutionInspectionCaseReader,
    private readonly contracts: UniversalReconciliationContractRegistry,
    private readonly inspectionEvidenceAdapter?: (evidence: GlobalResolutionInspectionEvidence) => readonly import("../types").GlobalResolutionReconciliationEvidence[],
  ) {}

  async inspectAndAssess(request: GlobalResolutionInspectionRequest, options: {signal?: AbortSignal} = {}): Promise<UniversalReconciliationInspectionResult> {
    const key = `${request.caseId}:${request.operationId}`;
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    const inspected = await this.inspectionService.inspect(request, options);
    const current = await this.readCase(request.caseId);
    if (!inspectable(current, request.operationId)) return {accepted: false, code: "context_missing"};
    const reconciliationCase = await collectReconciliationEvidence({
      reviewCase: current,
      operationId: request.operationId,
      inspectionEvidence: inspected.ok ? [inspected.evidence] : undefined,
      inspectionEvidenceAdapter: this.inspectionEvidenceAdapter,
    });
    const stale = !inspected.ok && (inspected.code === "checkpoint_conflict" || inspected.code === "operation_conflict");
    const unsupported = !inspected.ok && ["unsupported", "inspector_not_found", "inspector_ambiguous"].includes(inspected.code);
    const assessment = assessReconciliation(reconciliationCase, current.globalResolution, {
      registry: this.contracts,
      expectedContext: expectedContext(request, inspected.ok ? inspected.inspector : undefined),
      currentContext: buildUniversalReconciliationContext(reconciliationCase, current.globalResolution, {
        inspectorId: inspected.ok ? inspected.inspector.id : request.inspectorId,
        inspectorVersion: inspected.ok ? inspected.inspector.version : request.inspectorVersion,
        inspectionGeneration: request.inspectionGeneration,
        payloadFingerprint: request.subject.expectedPayloadFingerprint,
      }),
      inspectorId: inspected.ok ? inspected.inspector.id : request.inspectorId,
      inspectedAt: inspected.ok ? inspected.evidence.inspectedAt : undefined,
      technicalFailure: (
        !inspected.ok && !stale && !unsupported && inspected.code !== "aborted"
        || inspected.ok && inspected.evidence.status === "unavailable"
      ) ? {code: inspected.ok ? "service_unavailable" : inspected.code} : undefined,
      unsupported: unsupported ? {code: inspected.ok ? "unsupported" : inspected.code} : undefined,
    });
    if (this.generations.get(key) !== generation || options.signal?.aborted || !inspected.ok && inspected.code === "aborted") {
      return {accepted: false, code: "superseded", assessment};
    }
    return {accepted: true, assessment, evidence: inspected.ok ? inspected.evidence : undefined};
  }

  invalidate(caseId: string, operationId: string): void {
    const key = `${caseId}:${operationId}`;
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
  }
}
