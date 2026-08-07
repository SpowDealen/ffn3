import {buildCandidateDiscoveryRequest, type CandidateDiscoveryResult, type CandidateDiscoveryService, resolveDiscoveredIdentity} from "../entityIdentity/discovery";
import {buildReconciliationReviewCases} from "../entityReconciliation/cases";
import {scanExistingEntities} from "../entityReconciliation/service";
import type {EntityCorpusReadAdapter, EntityKind} from "../entityReconciliation/types";
import type {IdentityCreationAuthorization} from "../globalResolution/identityCreationGuard";
import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import type {CreationPreflightEngineRequest, EngineRequest, EntityResolutionCapability, EntityResolutionMode, ResolutionCaseLink, ResolutionProfile, ResolutionProfileDescriptor, ResolutionProfileExecution, ResolutionWarning} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const frozenWarning = (code: string, message: string): ResolutionWarning => Object.freeze({code, message});
const modeCapability: Record<EntityResolutionMode, EntityResolutionCapability> = {identity_lookup: "identity_discovery", creation_preflight: "guarded_creation", existing_reconciliation: "reconciliation_scan"};
const schemaTypes = {fighter: "luchador", event: "evento", organization: "organizacion", weight_category: "categoriaPeso"} as const;
type CreationPreflightDelegate = (request: CreationPreflightEngineRequest, context: {signal?: AbortSignal; now: Date}) => Promise<{authorization: IdentityCreationAuthorization; discovery: CandidateDiscoveryResult}>;
export type EntityResolutionProfileDependencies = Readonly<{candidateDiscoveryService?: CandidateDiscoveryService; reconciliationAdapter?: EntityCorpusReadAdapter; creationPreflight?: CreationPreflightDelegate}>;

function descriptor(entityType: EntityKind, modes: readonly EntityResolutionMode[]): ResolutionProfileDescriptor {
  const semantic = {profileId: `canonical.${entityType}`, profileVersion: "1.0.0", rulesVersion: "1.0.0", entityType, schemaType: schemaTypes[entityType], modes: Object.freeze([...modes]), capabilities: Object.freeze(modes.map((mode) => modeCapability[mode])), sourcesByMode: Object.freeze(Object.fromEntries(modes.map((mode) => [mode, Object.freeze(mode === "existing_reconciliation" ? ["sanity", "dev.in-memory"] : ["sanity"])])))};
  return Object.freeze({...semantic, fingerprint: fp(semantic)});
}

const completenessStatus = (status: "complete" | "partial" | "truncated" | "unavailable" | "cancelled") => status;

function caseLinks(entityType: EntityKind, mode: "existing_reconciliation", cases: readonly ReturnType<typeof buildReconciliationReviewCases>[number][], rulesVersion: string): readonly ResolutionCaseLink[] {
  return Object.freeze(cases.map((reviewCase) => Object.freeze({caseId: reviewCase.id, caseVersion: reviewCase.version, entityType, mode, contextFingerprint: fp(reviewCase.context), snapshotVersion: reviewCase.schemaVersion, rulesVersion})));
}

function unavailable(reasonCode: string): ResolutionProfileExecution {
  return Object.freeze({status: "unavailable", completeness: "unavailable", reasonCode, warnings: Object.freeze([frozenWarning(reasonCode, "La dependencia read-only requerida no está disponible.")])});
}

export function createCanonicalEntityResolutionProfiles(dependencies: EntityResolutionProfileDependencies): readonly ResolutionProfile[] {
  const discoveryTypes = new Set(dependencies.candidateDiscoveryService?.supportedEntityTypes() ?? []);
  const handlers = {
    async identity_lookup(request: EngineRequest, context: {signal?: AbortSignal; now: Date}): Promise<ResolutionProfileExecution> {
      if (request.mode !== "identity_lookup") throw new Error("identity_lookup_request_mismatch");
      if (!dependencies.candidateDiscoveryService) return unavailable("identity_discovery_adapter_unavailable");
      const discoveryRequest = buildCandidateDiscoveryRequest({identity: request.identity, source: request.source, producerContext: request.producerContext, limits: request.limits, cursor: request.cursor});
      const discovery = await dependencies.candidateDiscoveryService.discover(discoveryRequest, {signal: context.signal});
      const resolution = resolveDiscoveredIdentity(discoveryRequest, discovery);
      const status = discovery.status === "complete" && !discovery.truncated ? resolution.status === "ambiguous" || resolution.status === "probable_match" ? "needs_review" : "complete" : completenessStatus(discovery.status);
      return Object.freeze({status, completeness: completenessStatus(discovery.status), reasonCode: resolution.status, warnings: Object.freeze(discovery.warnings.map((warning) => frozenWarning(warning.code, warning.message))), adapterId: discovery.adapterDescriptor.adapterId, identityLookup: Object.freeze({discovery, resolution})});
    },
    async creation_preflight(request: EngineRequest, context: {signal?: AbortSignal; now: Date}): Promise<ResolutionProfileExecution> {
      if (request.mode !== "creation_preflight") throw new Error("creation_preflight_request_mismatch");
      if (!dependencies.creationPreflight) return unavailable("fighter_creation_preflight_unavailable");
      const resolved = await dependencies.creationPreflight(request, context);
      const createAuthorized = resolved.authorization.decision === "create_new" && ("discoveryStatus" in resolved.authorization ? resolved.authorization.discoveryStatus === "complete" : resolved.authorization.discovery.status === "complete" && resolved.authorization.state === "safe_to_create");
      const status = createAuthorized ? "complete" : resolved.discovery.status === "complete" ? "blocked" : completenessStatus(resolved.discovery.status);
      const reasonCode = "reasonCode" in resolved.authorization ? resolved.authorization.reasonCode : resolved.authorization.state;
      return Object.freeze({status, completeness: completenessStatus(resolved.discovery.status), reasonCode, warnings: Object.freeze(resolved.discovery.warnings.map((warning) => frozenWarning(warning.code, warning.message))), adapterId: resolved.discovery.adapterDescriptor.adapterId, creationPreflight: Object.freeze({...resolved, createAuthorized})});
    },
    async existing_reconciliation(request: EngineRequest, context: {signal?: AbortSignal; now: Date}): Promise<ResolutionProfileExecution> {
      if (request.mode !== "existing_reconciliation") throw new Error("existing_reconciliation_request_mismatch");
      if (!dependencies.reconciliationAdapter) return unavailable("reconciliation_adapter_unavailable");
      const scan = await scanExistingEntities(dependencies.reconciliationAdapter, request.scan, context.signal, context.now);
      const cases = Object.freeze(buildReconciliationReviewCases(scan));
      const status = scan.status === "complete" ? cases.length ? "needs_review" : "complete" : completenessStatus(scan.status);
      return Object.freeze({status, completeness: completenessStatus(scan.status), reasonCode: cases.length ? "duplicate_candidates_require_human_review" : `scan_${scan.status}`, warnings: Object.freeze(scan.warnings.map((message, index) => frozenWarning(`scan_warning_${index + 1}`, message))), adapterId: dependencies.reconciliationAdapter.adapterId, caseLinks: caseLinks(request.entityType, request.mode, cases, scan.rulesVersion), existingReconciliation: Object.freeze({scan, cases})});
    },
  } satisfies Record<EntityResolutionMode, (request: EngineRequest, context: {signal?: AbortSignal; now: Date}) => Promise<ResolutionProfileExecution>>;

  const profile = (entityType: EntityKind, modes: readonly EntityResolutionMode[]): ResolutionProfile => {
    const safeDescriptor = descriptor(entityType, modes);
    return Object.freeze({descriptor: safeDescriptor, async execute(request: EngineRequest, context: {signal?: AbortSignal; now: Date}) {
      if (request.entityType !== entityType || !modes.includes(request.mode)) throw new Error("entity_resolution_profile_request_mismatch");
      return handlers[request.mode](request, context);
    }});
  };
  return Object.freeze([
    profile("fighter", [...(discoveryTypes.has("fighter") ? ["identity_lookup" as const] : []), "creation_preflight", "existing_reconciliation"]),
    profile("event", [...(discoveryTypes.has("event") ? ["identity_lookup" as const] : []), "creation_preflight", "existing_reconciliation"]),
    profile("organization", [...(discoveryTypes.has("organization") ? ["identity_lookup" as const] : []), "creation_preflight", "existing_reconciliation"]),
    profile("weight_category", [...(discoveryTypes.has("weight_category") ? ["identity_lookup" as const] : []), "creation_preflight", "existing_reconciliation"]),
  ]);
}
