import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {EntityResolutionProfileRegistry} from "./registry";
import {ENTITY_RESOLUTION_ENGINE_VERSION, ENTITY_RESOLUTION_MODES, ENTITY_RESOLUTION_RULES_VERSION, type EngineRequest, type EngineResult, type EngineResolutionStatus, type EntityResolutionCapability, type EntityResolutionReadCompleteness, type ResolutionProfileDescriptor, type ResolutionProfileExecution, type ResolutionWarning} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clean = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback).replace(/https?:\/\/\S+/gu, "[url]").replace(/(?:token|secret|password)\s*[=:]\s*\S+/giu, "credential=[redacted]").slice(0, 180);
const capabilityFor = (mode: EngineRequest["mode"]): EntityResolutionCapability => mode === "identity_lookup" ? "identity_discovery" : mode === "creation_preflight" ? "guarded_creation" : "reconciliation_scan";
const statusCompleteness = (status: EngineResolutionStatus): EntityResolutionReadCompleteness => ["complete", "partial", "truncated", "unavailable", "cancelled"].includes(status) ? status as EntityResolutionReadCompleteness : "not_applicable";

function validateRequest(value: unknown): EngineRequest {
  if (!object(value) || value.version !== ENTITY_RESOLUTION_ENGINE_VERSION || !ENTITY_RESOLUTION_MODES.includes(value.mode as never) || !["fighter", "event", "organization", "weight_category"].includes(String(value.entityType))) throw new Error("entity_resolution_request_invalid");
  const common = ["version", "mode", "entityType", "producer", "source"];
  const allowed = value.mode === "identity_lookup" ? [...common, "identity", "producerContext", "limits", "cursor"] : value.mode === "creation_preflight" ? [...common, "plan", "guardOperationId"] : [...common, "scan"];
  if (Object.keys(value).some((field) => !allowed.includes(field))) throw new Error("entity_resolution_request_field_unexpected");
  if (typeof value.producer !== "string" || !/^[a-z0-9._:-]{1,80}$/iu.test(value.producer) || !["sanity", "dev.in-memory"].includes(String(value.source))) throw new Error("entity_resolution_context_invalid");
  if (value.mode === "identity_lookup" && (!object(value.identity) || value.identity.entityType !== value.entityType || value.source !== "sanity")) throw new Error("entity_resolution_identity_request_invalid");
  if (value.mode === "creation_preflight" && (!object(value.plan) || typeof value.guardOperationId !== "string" || value.source !== "sanity")) throw new Error("entity_resolution_preflight_request_invalid");
  if (value.mode === "existing_reconciliation" && (!object(value.scan) || value.scan.kind !== value.entityType)) throw new Error("entity_resolution_reconciliation_request_invalid");
  return structuredClone(value) as EngineRequest;
}

export function assessEntityResolutionFreshness(result: EngineResult, rawRequest: unknown, descriptor: ResolutionProfileDescriptor): "fresh" | "stale" {
  let request: EngineRequest;
  try { request = validateRequest(rawRequest); } catch { return "stale"; }
  return result.version === ENTITY_RESOLUTION_ENGINE_VERSION
    && result.rulesVersion === ENTITY_RESOLUTION_RULES_VERSION
    && result.entityType === request.entityType
    && result.mode === request.mode
    && result.requestFingerprint === fp(request)
    && result.provenance.profileId === descriptor.profileId
    && result.provenance.profileVersion === descriptor.profileVersion
    && descriptor.rulesVersion === ENTITY_RESOLUTION_RULES_VERSION
    ? "fresh" : "stale";
}

const unavailableDescriptor = (request: EngineRequest): ResolutionProfileDescriptor => Object.freeze({profileId: "unavailable", profileVersion: "1.0.0", rulesVersion: ENTITY_RESOLUTION_RULES_VERSION, entityType: request.entityType, schemaType: ({fighter: "luchador", event: "evento", organization: "organizacion", weight_category: "categoriaPeso"} as const)[request.entityType], modes: Object.freeze([]), capabilities: Object.freeze([]), sourcesByMode: Object.freeze({}), fingerprint: "sha256-v1:unavailable"});

export class EntityResolutionEngine {
  constructor(private readonly registry: EntityResolutionProfileRegistry, private readonly clock: () => Date = () => new Date(), private readonly monotonic: () => number = () => performance.now()) {}

  listCapabilities(): readonly ResolutionProfileDescriptor[] { return this.registry.listProfiles(); }

  async resolve(rawRequest: unknown, options: {signal?: AbortSignal} = {}): Promise<EngineResult> {
    const started = this.monotonic();
    let request: EngineRequest;
    try { request = validateRequest(rawRequest); } catch (error) {
      if (object(rawRequest) && ["fighter", "event", "organization", "weight_category"].includes(String(rawRequest.entityType)) && ENTITY_RESOLUTION_MODES.includes(rawRequest.mode as never)) {
        const safeEnvelope = rawRequest as unknown as EngineRequest;
        return this.failure(safeEnvelope, unavailableDescriptor(safeEnvelope), "blocked", "request_invalid", error, started);
      }
      return this.invalidRequest(started);
    }
    const profile = this.registry.resolve(request.entityType, request.mode);
    if (!profile) return this.failure(request, unavailableDescriptor(request), "unsupported", `mode_not_supported:${request.entityType}:${request.mode}`, undefined, started);
    if (!profile.descriptor.sourcesByMode[request.mode]?.includes(request.source)) return this.failure(request, profile.descriptor, "blocked", "source_not_allowed", undefined, started);
    if (options.signal?.aborted) return this.failure(request, profile.descriptor, "cancelled", "request_cancelled", undefined, started);
    try {
      const execution = await profile.execute(request, {signal: options.signal, now: this.clock()});
      return this.result(request, profile.descriptor, execution, started);
    } catch (error) {
      if (options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") return this.failure(request, profile.descriptor, "cancelled", "request_cancelled", undefined, started);
      return this.failure(request, profile.descriptor, "unavailable", "resolution_unavailable", error, started);
    }
  }

  private invalidRequest(started: number): EngineResult {
    const resolvedAt = this.clock().toISOString(); const durationMs = Math.max(0, Math.round(this.monotonic() - started));
    const semantic = {version: ENTITY_RESOLUTION_ENGINE_VERSION, rulesVersion: ENTITY_RESOLUTION_RULES_VERSION, entityType: "unknown" as const, mode: "invalid_request" as const, status: "blocked" as const, completeness: "not_applicable" as const, reasonCode: "request_invalid" as const, requestFingerprint: fp({invalid: true}), resolvedAt, durationMs, warnings: Object.freeze([{code: "request_invalid", message: "La solicitud de resolución no es válida."}]), provenance: Object.freeze({profileId: "unavailable" as const, profileVersion: "1.0.0" as const, source: "none" as const, capability: "identity_discovery" as const}), caseLinks: Object.freeze([]), error: Object.freeze({code: "resolution_failed", reasonCode: "request_invalid", message: "La solicitud de resolución no es válida.", retryable: false})};
    return Object.freeze({...semantic, resultFingerprint: fp({...semantic, resolvedAt: undefined, durationMs: undefined})});
  }

  private result(request: EngineRequest, descriptor: ResolutionProfileDescriptor, execution: ResolutionProfileExecution, started: number): EngineResult {
    const resolvedAt = this.clock().toISOString(); const durationMs = Math.max(0, Math.round(this.monotonic() - started)); const requestFingerprint = fp(request);
    const common = {version: ENTITY_RESOLUTION_ENGINE_VERSION, rulesVersion: ENTITY_RESOLUTION_RULES_VERSION, entityType: request.entityType, mode: request.mode, status: execution.status, completeness: execution.completeness, reasonCode: execution.reasonCode, requestFingerprint, resolvedAt, durationMs, warnings: Object.freeze([...execution.warnings]), provenance: Object.freeze({profileId: descriptor.profileId, profileVersion: descriptor.profileVersion, adapterId: execution.adapterId, source: request.source, capability: capabilityFor(request.mode)}), caseLinks: Object.freeze([...(execution.caseLinks ?? [])])};
    const payload = request.mode === "identity_lookup" ? {identityLookup: execution.identityLookup} : request.mode === "creation_preflight" ? {creationPreflight: execution.creationPreflight} : {existingReconciliation: execution.existingReconciliation};
    return Object.freeze({...common, ...payload, resultFingerprint: fp({...common, ...payload, durationMs: undefined, resolvedAt: undefined})}) as EngineResult;
  }

  private failure(request: EngineRequest, descriptor: ResolutionProfileDescriptor, status: EngineResolutionStatus, reasonCode: string, error: unknown, started: number): EngineResult {
    const warning: ResolutionWarning = Object.freeze({code: reasonCode, message: status === "unsupported" ? "La capacidad solicitada no está disponible para esta entidad." : status === "cancelled" ? "La resolución fue cancelada." : "La resolución quedó bloqueada de forma segura."});
    const execution: ResolutionProfileExecution = {status, completeness: statusCompleteness(status), reasonCode, warnings: [warning], ...(error ? {error: clean(error instanceof Error ? error.message : error, reasonCode)} : {})} as ResolutionProfileExecution;
    const result = this.result(request, descriptor, execution, started);
    return Object.freeze({...result, error: Object.freeze({code: status === "unsupported" ? "unsupported" : status === "cancelled" ? "cancelled" : "resolution_failed", reasonCode, message: warning.message, retryable: status === "unavailable"})}) as EngineResult;
  }
}
