import {resolveEntityIdentity} from "../core";
import type {EntityResolutionResult} from "../types";
import {fingerprintDiscoveryResult, fingerprintDiscoveryWarning} from "./fingerprint";
import {CandidateDiscoveryRegistry} from "./registry";
import type {
  CandidateDiscoveryAdapterResult, CandidateDiscoveryRequest, CandidateDiscoveryResolutionStatus,
  CandidateDiscoveryResult, CandidateDiscoveryWarning, SafeCandidateDiscoveryAdapterDescriptor,
} from "./types";

const unavailableDescriptor: SafeCandidateDiscoveryAdapterDescriptor = Object.freeze({
  adapterId: "unavailable", adapterVersion: "1.0.0", source: "none", capability: "none",
  entityTypes: [], priority: 0, specificity: 0, fingerprint: "sha256-v1:unavailable",
});
const warning = (code: string, message: string): CandidateDiscoveryWarning => {
  const value = {code, message: message.replace(/https?:\/\/\S+/gu, "[url]").replace(/(?:token|secret|password)\s*[=:]\s*\S+/giu, "$1=[redacted]").slice(0, 180)};
  return Object.freeze({...value, fingerprint: fingerprintDiscoveryWarning(value)});
};

function unavailable(request: CandidateDiscoveryRequest, code: string): CandidateDiscoveryResult {
  const base: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint"> = {
    status: "unavailable", candidates: [], executedStrategies: [], skippedStrategies: [],
    warnings: [warning(code, "Candidate Discovery no está disponible.")], truncated: false,
    reason: code === "adapter_unavailable" ? "adapter_unavailable" : "technical_failure",
    adapterFingerprint: unavailableDescriptor.fingerprint,
  };
  return Object.freeze({...base, resultFingerprint: fingerprintDiscoveryResult(base), requestFingerprint: request.requestFingerprint, adapterDescriptor: unavailableDescriptor});
}

export class CandidateDiscoveryService {
  constructor(private readonly registry: CandidateDiscoveryRegistry) {}

  async discover(request: CandidateDiscoveryRequest, options: {signal?: AbortSignal} = {}): Promise<CandidateDiscoveryResult> {
    if (options.signal?.aborted) return this.cancelled(request);
    let adapter;
    try { adapter = this.registry.resolveAdapter(request); } catch (error) {
      if (error instanceof Error && error.message === "candidate_discovery_adapter_ambiguous") throw error;
      return unavailable(request, "adapter_unavailable");
    }
    if (!adapter) return unavailable(request, "adapter_unavailable");
    try {
      const result = await adapter.discover(request, {signal: options.signal});
      if (result.adapterFingerprint !== adapter.descriptor.fingerprint) return unavailable(request, "adapter_result_invalid");
      return Object.freeze({...result, requestFingerprint: request.requestFingerprint, adapterDescriptor: adapter.descriptor});
    } catch (error) {
      if (options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") return this.cancelled(request, adapter.descriptor);
      return unavailable(request, "technical_failure");
    }
  }

  private cancelled(request: CandidateDiscoveryRequest, descriptor = unavailableDescriptor): CandidateDiscoveryResult {
    const base: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint"> = {
      status: "cancelled", candidates: [], executedStrategies: [], skippedStrategies: [],
      warnings: [warning("cancelled", "La búsqueda fue cancelada.")], truncated: false, reason: "cancelled",
      adapterFingerprint: descriptor.fingerprint,
    };
    return Object.freeze({...base, resultFingerprint: fingerprintDiscoveryResult(base), requestFingerprint: request.requestFingerprint, adapterDescriptor: descriptor});
  }
}

export type DiscoveryResolutionResult = Readonly<{
  status: CandidateDiscoveryResolutionStatus;
  discovery: CandidateDiscoveryResult;
  resolution: EntityResolutionResult;
  createAllowed: boolean;
  reasonCodes: readonly string[];
}>;

export function resolveDiscoveredIdentity(request: CandidateDiscoveryRequest, discovery: CandidateDiscoveryResult): DiscoveryResolutionResult {
  if (discovery.requestFingerprint !== request.requestFingerprint) throw new Error("candidate_discovery_stale_request");
  const complete = discovery.status === "complete" && !discovery.truncated;
  const resolution = resolveEntityIdentity(request.identity, discovery.candidates, {searchCompleted: complete});
  const status: CandidateDiscoveryResolutionStatus = discovery.status === "unavailable" ? "discovery_unavailable"
    : !complete ? "discovery_incomplete"
      : resolution.status === "unsupported" ? "insufficient_evidence"
        : resolution.status;
  return Object.freeze({
    status, discovery, resolution,
    createAllowed: complete && resolution.status === "create_new",
    reasonCodes: Object.freeze([...new Set([
      ...(complete ? [] : [`discovery_${discovery.status}`]),
      ...resolution.reasonCodes,
    ])].sort()),
  });
}

export function acceptsCandidateDiscoveryResponse(input: {
  request: CandidateDiscoveryRequest; result: CandidateDiscoveryResult; identityFingerprint: string;
  entityType: string; caseVersion?: number; generation?: number; producerId?: string;
}): boolean {
  const context = input.request.producerContext;
  return input.result.requestFingerprint === input.request.requestFingerprint
    && input.identityFingerprint === input.request.identity.fingerprint
    && input.entityType === input.request.entityType
    && (input.caseVersion === undefined || input.caseVersion === context?.caseVersion)
    && (input.generation === undefined || input.generation === context?.generation)
    && (input.producerId === undefined || input.producerId === context?.producerId);
}
