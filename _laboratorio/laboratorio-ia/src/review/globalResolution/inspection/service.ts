import type {ReviewJsonValue} from "../../types";
import {computeUniversalFingerprint} from "../../universal";
import {inspectionFailure} from "./errors";
import {normalizeGlobalResolutionInspectionEvidence} from "./normalize";
import type {GlobalResolutionInspectorRegistry} from "./registry";
import type {
  GlobalResolutionInspectionCaseReader,
  GlobalResolutionInspectionRequest,
  GlobalResolutionInspectionResult,
} from "./types";
import type {ReviewCase} from "../../types";

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => text(value) && /^sha256-v1:[a-z0-9]+$/i.test(value);
const validDate = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));

export function fingerprintGlobalResolutionInspectionOperation(operation: unknown): string {
  return computeUniversalFingerprint(operation as ReviewJsonValue);
}

export function validateGlobalResolutionInspectionRequest(request: GlobalResolutionInspectionRequest): string[] {
  const reasons: string[] = [];
  if (!text(request.caseId) || !text(request.producer) || !text(request.capability) || !text(request.operationId)) reasons.push("inspection_identity_invalid");
  if (!fingerprint(request.operationFingerprint) || !fingerprint(request.checkpointFingerprint)) reasons.push("inspection_fingerprint_invalid");
  if (!Number.isInteger(request.caseVersion) || request.caseVersion < 1) reasons.push("inspection_case_version_invalid");
  if (request.checkpointVersion !== undefined && (!Number.isInteger(request.checkpointVersion) || request.checkpointVersion < 1)) reasons.push("inspection_checkpoint_version_invalid");
  if (request.inspectionGeneration !== undefined && (!Number.isInteger(request.inspectionGeneration) || request.inspectionGeneration < 1)) reasons.push("inspection_generation_invalid");
  if (request.manifestFingerprint !== undefined && !fingerprint(request.manifestFingerprint)) reasons.push("inspection_manifest_fingerprint_invalid");
  if (!validDate(request.requestedAt) || !request.subject || typeof request.subject !== "object" || Array.isArray(request.subject)) reasons.push("inspection_request_shape_invalid");
  if (request.subject.expectedReferences?.some((reference) => !text(reference.field) || !text(reference.targetId))) reasons.push("inspection_reference_invalid");
  return reasons;
}

function bindingFailure(reviewCase: ReviewCase | undefined, request: GlobalResolutionInspectionRequest): "checkpoint_conflict" | "operation_conflict" | undefined {
  if (!reviewCase || reviewCase.version !== request.caseVersion) return "checkpoint_conflict";
  const checkpoint = reviewCase.globalResolution;
  if (!checkpoint || checkpoint.checkpointFingerprint !== request.checkpointFingerprint || checkpoint.producer !== request.producer) return "checkpoint_conflict";
  if (request.checkpointVersion !== undefined && checkpoint.storedAtCaseVersion !== request.checkpointVersion) return "checkpoint_conflict";
  if (request.producerVersion !== undefined && checkpoint.producerManifest?.producerVersion !== request.producerVersion) return "checkpoint_conflict";
  if (request.manifestVersion !== undefined && checkpoint.producerManifest?.manifestVersion !== request.manifestVersion) return "checkpoint_conflict";
  if (request.manifestFingerprint !== undefined && checkpoint.producerManifest?.manifestFingerprint !== request.manifestFingerprint) return "checkpoint_conflict";
  if (request.capabilityVersion !== undefined && !checkpoint.producerManifest?.capabilityVersions.some((entry) => entry.capabilityId === request.capability && entry.capabilityVersion === request.capabilityVersion)) return "operation_conflict";
  const operation = checkpoint.plan.operations.find((candidate) => candidate.id === request.operationId);
  const node = checkpoint.graph.nodes.find((candidate) => candidate.operationId === request.operationId);
  if (!operation || !node || fingerprintGlobalResolutionInspectionOperation(operation) !== request.operationFingerprint || node.state === "succeeded") return "operation_conflict";
  return undefined;
}

export class GlobalResolutionInspectionService {
  private readonly active = new Map<string, Promise<GlobalResolutionInspectionResult>>();

  constructor(
    private readonly registry: GlobalResolutionInspectorRegistry,
    private readonly readCase: GlobalResolutionInspectionCaseReader,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  inspect(request: GlobalResolutionInspectionRequest, options: {signal?: AbortSignal} = {}): Promise<GlobalResolutionInspectionResult> {
    const key = computeUniversalFingerprint(request as unknown as ReviewJsonValue);
    const running = this.active.get(key);
    if (running) return running;
    const task = this.inspectOnce(request, options).finally(() => this.active.delete(key));
    this.active.set(key, task);
    return task;
  }

  private async inspectOnce(request: GlobalResolutionInspectionRequest, options: {signal?: AbortSignal}): Promise<GlobalResolutionInspectionResult> {
    if (validateGlobalResolutionInspectionRequest(request).length) return {ok: false, ...inspectionFailure("invalid_request")};
    if (options.signal?.aborted) return {ok: false, ...inspectionFailure("aborted", true)};
    const reviewCase = await this.readCase(request.caseId);
    const beforeFailure = bindingFailure(reviewCase, request);
    if (beforeFailure) return {ok: false, ...inspectionFailure(beforeFailure)};
    const selection = this.registry.select(request);
    if (!selection.ok) return {ok: false, ...inspectionFailure(selection.code, selection.code === "unsupported")};
    try {
      const evidence = await selection.inspector.inspect(request, {signal: options.signal, now: this.now});
      if (options.signal?.aborted) return {ok: false, ...inspectionFailure("aborted", true)};
      if (request.inspectorVersion && selection.inspector.version !== request.inspectorVersion) return {ok: false, ...inspectionFailure("incompatible_inspector")};
      if (evidence.producer !== request.producer) return {ok: false, ...inspectionFailure("wrong_producer_evidence")};
      if (evidence.operationId !== request.operationId || evidence.operationFingerprint !== request.operationFingerprint) return {ok: false, ...inspectionFailure("wrong_operation_evidence")};
      if (request.inspectionGeneration !== undefined && evidence.inspectionGeneration !== request.inspectionGeneration) return {ok: false, ...inspectionFailure("stale_generation")};
      const currentCase = await this.readCase(request.caseId);
      const afterFailure = bindingFailure(currentCase, request);
      if (afterFailure) return {ok: false, ...inspectionFailure(afterFailure)};
      const normalized = normalizeGlobalResolutionInspectionEvidence({request, inspector: selection.inspector, evidence, inspectedAt: this.now()});
      return {ok: true, evidence: normalized, inspector: {id: selection.inspector.id, version: selection.inspector.version}};
    } catch (error) {
      if (options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") return {ok: false, ...inspectionFailure("aborted", true)};
      return {ok: false, ...inspectionFailure("inspection_failed", true)};
    }
  }
}
