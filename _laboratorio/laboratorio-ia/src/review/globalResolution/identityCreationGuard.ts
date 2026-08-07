import {buildEntityOperation, type EntityOperation, type EntityOperationEntityType} from "../entityOperations";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal/fingerprints";
import {buildEntityIdentity, type EntityResolutionResult, type IdentityProvenance, type UniversalEntityIdentityInput, type UniversalEntityType} from "../entityIdentity";
import {buildCandidateDiscoveryRequest, resolveDiscoveredIdentity, type CandidateDiscoveryResult, type CandidateDiscoveryService, type CandidateDiscoveryStatus} from "../entityIdentity/discovery";
import type {FighterIdentityGuardAuthorization, FighterIdentityGuardReasonCode} from "./identityGuard";
import {ensureFighterIdentityGuardOperations, validateFighterIdentityGuardAuthorization} from "./identityGuard";
import type {GlobalResolutionPlan} from "./types";

export const IDENTITY_CREATION_GUARD_VERSION = "1.0.0" as const;
export type IdentityResolutionDecision = "create_new" | "reuse_existing" | "ambiguous" | "blocked" | "unsupported";
export type IdentityGuardStatus = "pending" | "authorized" | "reuse_required" | "blocked" | "unsupported" | "stale" | "expired";
export type IdentityGuardReasonCode = FighterIdentityGuardReasonCode | "identity_resolution_unsupported" | "create_operation_unregistered" | "authorization_type_mismatch";
export type IdentityCreationGuardState =
  | "safe_to_reuse" | "safe_to_create"
  | "blocked_probable_match" | "blocked_ambiguous" | "blocked_conflict" | "blocked_insufficient_evidence"
  | "blocked_discovery_partial" | "blocked_discovery_truncated" | "blocked_discovery_unavailable" | "blocked_discovery_cancelled" | "blocked_discovery_timeout"
  | "blocked_stale_identity" | "blocked_stale_discovery" | "blocked_stale_resolution"
  | "blocked_wrong_entity_type" | "blocked_unsupported_entity" | "blocked_missing_preflight";
export type IdentityCreationBlocker = Readonly<{code: IdentityCreationGuardState; message: string}>;
export type IdentityCreationWarning = Readonly<{code: string; message: string}>;
export type IdentityCreationPreflight = Readonly<{
  version: typeof IDENTITY_CREATION_GUARD_VERSION;
  entityType: UniversalEntityType;
  operationId: string;
  operationFingerprint: string;
  identityFingerprint: string;
  discovery: Readonly<{status: CandidateDiscoveryStatus; resultFingerprint: string; completeEnoughForCreation: boolean}>;
  resolution: Readonly<{status: EntityResolutionResult["status"]; resolutionFingerprint: string; candidateId?: string}>;
  decision: "reuse_existing" | "create_new" | "blocked";
  state: IdentityCreationGuardState;
  blockers: readonly IdentityCreationBlocker[];
  warnings: readonly IdentityCreationWarning[];
  contextFingerprint: string;
  guardFingerprint: string;
  provenance: Readonly<{producer: string; caseId: string; caseVersion: number; discoveryAdapter: string}>;
  authorizedAt: string;
  expiresAt: string;
}>;
export type IdentityCreationAuthorization = FighterIdentityGuardAuthorization | IdentityCreationPreflight;

export type IdentityCreationGuardProfile = Readonly<{
  entityType: "fighter" | "event" | "organization" | "weight_category" | "discipline" | "fight" | "news";
  schemaType: EntityOperationEntityType;
  createOperation: `create:${EntityOperationEntityType}`;
  guardCapability: `resolve_identity:${string}`;
  identityProfile: boolean;
  discoveryReadOnly: boolean;
  creationPreflight: boolean;
  executorGate: boolean;
  minimumIdentityFields: readonly string[];
  rulesVersion: typeof IDENTITY_CREATION_GUARD_VERSION;
  ttlMs: number;
  unsupportedReason?: "identity_profile_missing" | "discovery_adapter_missing" | "creation_preflight_missing" | "executor_gate_missing";
}>;

const profile = (value: Omit<IdentityCreationGuardProfile, "rulesVersion" | "ttlMs">): IdentityCreationGuardProfile => Object.freeze({...value, minimumIdentityFields: Object.freeze([...value.minimumIdentityFields]), rulesVersion: IDENTITY_CREATION_GUARD_VERSION, ttlMs: 15 * 60 * 1_000});

export const identityCreationGuardProfiles = Object.freeze([
  profile({entityType: "fighter", schemaType: "luchador", createOperation: "create:luchador", guardCapability: "resolve_identity:fighter", identityProfile: true, discoveryReadOnly: true, creationPreflight: true, executorGate: true, minimumIdentityFields: ["nombre", "disciplina", "organizacion"]}),
  profile({entityType: "event", schemaType: "evento", createOperation: "create:evento", guardCapability: "resolve_identity:event", identityProfile: true, discoveryReadOnly: true, creationPreflight: true, executorGate: true, minimumIdentityFields: ["nombre", "fecha", "organizacion", "disciplina"]}),
  profile({entityType: "organization", schemaType: "organizacion", createOperation: "create:organizacion", guardCapability: "resolve_identity:organization", identityProfile: true, discoveryReadOnly: true, creationPreflight: true, executorGate: true, minimumIdentityFields: ["nombre", "paisOrigen", "disciplinas"]}),
  profile({entityType: "weight_category", schemaType: "categoriaPeso", createOperation: "create:categoriaPeso", guardCapability: "resolve_identity:weight_category", identityProfile: true, discoveryReadOnly: true, creationPreflight: true, executorGate: true, minimumIdentityFields: ["nombre", "disciplina", "limitePeso", "unidad"]}),
  profile({entityType: "discipline", schemaType: "disciplina", createOperation: "create:disciplina", guardCapability: "resolve_identity:discipline", identityProfile: true, discoveryReadOnly: false, creationPreflight: false, executorGate: false, minimumIdentityFields: ["nombre", "slug"], unsupportedReason: "discovery_adapter_missing"}),
  profile({entityType: "fight", schemaType: "combate", createOperation: "create:combate", guardCapability: "resolve_identity:fight", identityProfile: true, discoveryReadOnly: false, creationPreflight: false, executorGate: false, minimumIdentityFields: ["evento", "luchadorRojo", "luchadorAzul", "categoriaPeso"], unsupportedReason: "discovery_adapter_missing"}),
  profile({entityType: "news", schemaType: "noticia", createOperation: "create:noticia", guardCapability: "resolve_identity:news", identityProfile: true, discoveryReadOnly: false, creationPreflight: false, executorGate: false, minimumIdentityFields: ["titulo", "slug", "fechaPublicacion", "disciplina"], unsupportedReason: "discovery_adapter_missing"}),
] as const);

const bySchema = new Map(identityCreationGuardProfiles.map((item) => [item.schemaType, item]));
export const identityCreationGuardProfileForSchema = (entityType: string): IdentityCreationGuardProfile | undefined => bySchema.get(entityType as EntityOperationEntityType);
export const identityCreationGuardProfileForCapability = (capability: string): IdentityCreationGuardProfile | undefined => identityCreationGuardProfiles.find((item) => item.guardCapability === capability);
export const isIdentityCreationSupported = (profileValue: IdentityCreationGuardProfile): boolean => profileValue.identityProfile && profileValue.discoveryReadOnly && profileValue.creationPreflight && profileValue.executorGate;

const object = (value: ReviewJsonValue | undefined): Record<string, ReviewJsonValue> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, ReviewJsonValue> : undefined;
const creationIdFrom = (operation: EntityOperation): string | undefined => {
  const payload = object(operation.payload);
  return typeof payload?.creationOperationId === "string" ? payload.creationOperationId : undefined;
};

function identityGuardOperation(create: EntityOperation, profileValue: IdentityCreationGuardProfile, producer: string): EntityOperation {
  const identity = identityInputForCreate(create, profileValue.entityType, producer);
  return buildEntityOperation({
    id: `identity-guard:${create.id}`, kind: "find_entity", entityType: create.entityType, target: create.target,
    payload: {scope: "identity_guard", guardVersion: IDENTITY_CREATION_GUARD_VERSION, source: "sanity", creationOperationId: create.id, creationPayloadFingerprint: computeUniversalFingerprint(create.payload ?? null), identityFingerprint: identity ? buildEntityIdentity(identity).fingerprint : null, profileEntityType: profileValue.entityType, profileSupported: isIdentityCreationSupported(profileValue), unsupportedReason: profileValue.unsupportedReason ?? null},
    source: "global_resolution", evidence: create.evidence, confidence: create.confidence, risk: "none", preconditions: [],
    postconditions: [{id: `post:identity-guard:${create.id}`, kind: "no_ambiguity", description: "La creación requiere un preflight de identidad soportado y vigente.", required: true}],
    dependencyIds: create.dependencyIds, requiredCapability: profileValue.guardCapability, compensatable: false,
    explanation: `Resolver obligatoriamente identidad y discovery de ${profileValue.schemaType} antes de crear.`,
  });
}

export function ensureIdentityCreationGuardOperations(operations: readonly EntityOperation[], producer: string): EntityOperation[] {
  const fighterGuarded = ensureFighterIdentityGuardOperations(operations, producer);
  const byId = new Map(fighterGuarded.map((operation) => [operation.id, operation]));
  for (const create of fighterGuarded.filter((operation) => operation.kind === "create_entity")) {
    const profileValue = identityCreationGuardProfileForSchema(create.entityType);
    if (!profileValue) throw new Error(`identity_creation_operation_unregistered:${create.entityType}`);
    if (profileValue.schemaType === "luchador") continue;
    const expectedId = `identity-guard:${create.id}`;
    const existing = fighterGuarded.find((operation) => operation.id === expectedId || operation.requiredCapability === profileValue.guardCapability && creationIdFrom(operation) === create.id);
    const guard = existing ?? identityGuardOperation(create, profileValue, producer);
    if (!byId.has(guard.id)) byId.set(guard.id, guard);
    const current = byId.get(create.id)!;
    byId.set(create.id, buildEntityOperation({...current, id: current.id, idempotencyKey: undefined, dependencyIds: [...new Set([...current.dependencyIds, guard.id])].sort()}));
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function identityCreationGuardForCreation(operations: readonly EntityOperation[], creationOperationId: string): EntityOperation | undefined {
  return operations.find((operation) => object(operation.payload)?.scope === "identity_guard" && creationIdFrom(operation) === creationOperationId);
}

export function validateIdentityCreationAuthorization(value: IdentityCreationAuthorization | undefined, input: {plan: GlobalResolutionPlan; creationOperationId: string; now?: () => string}): {valid: boolean; reasonCode: IdentityGuardReasonCode | IdentityCreationGuardState} {
  const create = input.plan.operations.find((operation) => operation.id === input.creationOperationId && operation.kind === "create_entity");
  if (!create) return {valid: false, reasonCode: "create_operation_unregistered"};
  const profileValue = identityCreationGuardProfileForSchema(create.entityType);
  if (!profileValue) return {valid: false, reasonCode: "create_operation_unregistered"};
  if (!isIdentityCreationSupported(profileValue)) return {valid: false, reasonCode: "identity_resolution_unsupported"};
  if (isFighterAuthorization(value)) return profileValue.schemaType === "luchador" ? validateFighterIdentityGuardAuthorization(value, input) : {valid: false, reasonCode: "authorization_type_mismatch"};
  return validateIdentityCreationPreflight(value, input);
}

export function legacyIdentityCreationBlock(entityType: EntityOperationEntityType): Readonly<{ok: false; reasonCode: "identity_resolution_unsupported"; error: string; entityType: EntityOperationEntityType; requiredCapability: string}> {
  const profileValue = identityCreationGuardProfileForSchema(entityType);
  return Object.freeze({ok: false, reasonCode: "identity_resolution_unsupported", error: "La creación directa está cerrada hasta disponer de preflight de identidad y executor gate universales.", entityType, requiredCapability: profileValue?.guardCapability ?? `resolve_identity:${entityType}`});
}

export const identityCreationGuardSecurity = Object.freeze({failClosed: true, defaultProfile: false, automaticReuse: false, reconciliationAuthorization: false, callerDecision: false, callerToken: false});

const asObject = (value: ReviewJsonValue | undefined): ReviewJsonObject | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as ReviewJsonObject : undefined;
const asText = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
const ref = (value: unknown): string | undefined => asObject(value as ReviewJsonValue) ? asText((value as ReviewJsonObject)._ref) : asText(value);
const list = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((item) => asText(item) ?? ref(item) ?? []).slice(0, 12) : [];
const aliases = (value: unknown, producer: string, provenance: IdentityProvenance) => list(value).map((value) => ({value, aliasType: "editorial" as const, source: producer, confidence: .8, verified: false, provenance}));
const schemaToUniversal = (schemaType: EntityOperationEntityType): UniversalEntityType | undefined => identityCreationGuardProfileForSchema(schemaType)?.entityType;

/** The only payload-to-identity bridge used by guarded creates. It deliberately accepts no caller-supplied decision. */
export function identityInputForCreate(create: EntityOperation, entityType: UniversalEntityType, producer: string): UniversalEntityIdentityInput | undefined {
  const payload = asObject(create.payload); const primaryLabel = asText(payload?.nombre) ?? asText(payload?.name) ?? asText(payload?.titulo);
  if (!payload || !primaryLabel) return undefined;
  const provenance: IdentityProvenance = {producer, source: "global_resolution_plan", field: "create_entity.payload", extractionMethod: "explicit", confidence: Math.max(0, Math.min(1, create.confidence)), verified: true};
  const common = {entityType, source: producer, primaryLabel, aliases: aliases(payload.aliases, producer, provenance), externalIdentifiers: [], provenance: [provenance]};
  const slug = ref(payload.slug);
  if (entityType === "fighter") return {...common, entityType, nickname: asText(payload.apodo) ?? asText(payload.nickname), birthDate: asText(payload.fechaNacimiento) ?? asText(payload.birthDate), nationality: asText(payload.nacionalidad) ?? asText(payload.nationality), organizations: list(payload.organizationIds).concat(ref(payload.organizacion) ?? []), discipline: ref(payload.disciplina) ?? asText(payload.disciplineId), weightCategory: ref(payload.categoriaPeso) ?? asText(payload.weightCategoryId), slug} as UniversalEntityIdentityInput;
  if (entityType === "event") return {...common, entityType, baseName: asText(payload.nombreBase), edition: asText(payload.edicion) ?? asNumber(payload.edicion), organization: ref(payload.organizacion) ?? asText(payload.organizationId), date: asText(payload.fecha) ?? asText(payload.date), city: asText(payload.ciudad), venue: asText(payload.recinto) ?? asText(payload.venue), country: asText(payload.pais), discipline: ref(payload.disciplina), slug} as UniversalEntityIdentityInput;
  if (entityType === "organization") return {...common, entityType, officialName: primaryLabel, abbreviation: asText(payload.sigla) ?? asText(payload.abbreviation), officialDomain: asText(payload.sitioWeb) ?? asText(payload.website), country: asText(payload.paisOrigen) ?? asText(payload.country), primaryDiscipline: ref(payload.disciplina), slug} as UniversalEntityIdentityInput;
  if (entityType === "weight_category") return {...common, entityType, limit: asNumber(payload.limitePeso) ?? asNumber(payload.limit), unit: asText(payload.unidad) === "lb" ? "lb" : "kg", discipline: ref(payload.disciplina) ?? asText(payload.disciplineId), organization: ref(payload.organizacion), division: asText(payload.division), ruleset: asText(payload.reglamento) ?? asText(payload.ruleset), modality: asText(payload.modalidad), ageGroup: asText(payload.grupoEdad), sex: asText(payload.sexo), limitType: asText(payload.tipoLimite), slug} as UniversalEntityIdentityInput;
  return undefined;
}

function stateFor(discovery: CandidateDiscoveryResult, resolution: EntityResolutionResult): {state: IdentityCreationGuardState; decision: IdentityCreationPreflight["decision"]} {
  if (discovery.status === "partial") return {state: "blocked_discovery_partial", decision: "blocked"};
  if (discovery.status === "truncated" || discovery.truncated) return {state: "blocked_discovery_truncated", decision: "blocked"};
  if (discovery.status === "unavailable") return {state: discovery.reason === "timeout" ? "blocked_discovery_timeout" : "blocked_discovery_unavailable", decision: "blocked"};
  if (discovery.status === "cancelled") return {state: "blocked_discovery_cancelled", decision: "blocked"};
  if (resolution.status === "reuse") return {state: "safe_to_reuse", decision: "reuse_existing"};
  if (resolution.status === "probable_match") return {state: "blocked_probable_match", decision: "blocked"};
  if (resolution.status === "ambiguous") return {state: "blocked_ambiguous", decision: "blocked"};
  if (resolution.status === "conflicting_identity") return {state: "blocked_conflict", decision: "blocked"};
  if (resolution.status !== "create_new") return {state: "blocked_insufficient_evidence", decision: "blocked"};
  return {state: "safe_to_create", decision: "create_new"};
}

const preflightSemantic = (value: Omit<IdentityCreationPreflight, "guardFingerprint">) => ({...value, blockers: [...value.blockers].sort((a, b) => a.code.localeCompare(b.code)), warnings: [...value.warnings].sort((a, b) => a.code.localeCompare(b.code))});
const isFighterAuthorization = (value: IdentityCreationAuthorization | undefined): value is FighterIdentityGuardAuthorization => Boolean(value && "authorizationFingerprint" in value);

export async function resolveIdentityCreationPreflight(input: {plan: GlobalResolutionPlan; guardOperationId: string; service: CandidateDiscoveryService; source?: string; signal?: AbortSignal; now?: () => string}): Promise<IdentityCreationPreflight> {
  const guard = input.plan.operations.find((operation) => operation.id === input.guardOperationId);
  const creationOperationId = guard && asText(asObject(guard.payload)?.creationOperationId);
  const create = creationOperationId ? input.plan.operations.find((operation) => operation.id === creationOperationId && operation.kind === "create_entity") : undefined;
  const profileValue = create ? identityCreationGuardProfileForSchema(create.entityType) : undefined;
  const now = (input.now ?? (() => new Date().toISOString()))();
  if (!guard || !create || !profileValue || !isIdentityCreationSupported(profileValue) || guard.requiredCapability !== profileValue.guardCapability) throw new Error("identity_creation_preflight_input_invalid");
  const identityInput = identityInputForCreate(create, profileValue.entityType, input.plan.producer);
  if (!identityInput) throw new Error("identity_creation_preflight_identity_missing");
  const identity = buildEntityIdentity(identityInput);
  const request = buildCandidateDiscoveryRequest({identity, source: input.source ?? "sanity", producerContext: {producerId: input.plan.producer, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion}});
  const discovery = await input.service.discover(request, {signal: input.signal});
  const resolved = resolveDiscoveredIdentity(request, discovery).resolution;
  const verdict = stateFor(discovery, resolved);
  const contextFingerprint = computeUniversalFingerprint({planFingerprint: input.plan.fingerprint, planId: input.plan.id, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion, producer: input.plan.producer, operationId: create.id, capability: profileValue.guardCapability});
  const blockers = verdict.state.startsWith("safe_") ? [] : [{code: verdict.state, message: "La evidencia de identidad no permite crear."}];
  const semantic: Omit<IdentityCreationPreflight, "guardFingerprint"> = {version: IDENTITY_CREATION_GUARD_VERSION, entityType: profileValue.entityType, operationId: create.id, operationFingerprint: computeUniversalFingerprint(create as unknown as ReviewJsonValue), identityFingerprint: identity.fingerprint, discovery: {status: discovery.status, resultFingerprint: discovery.resultFingerprint, completeEnoughForCreation: discovery.status === "complete" && !discovery.truncated}, resolution: {status: resolved.status, resolutionFingerprint: resolved.resolutionFingerprint, candidateId: resolved.candidateId}, decision: verdict.decision, state: verdict.state, blockers: Object.freeze(blockers), warnings: Object.freeze(discovery.warnings.map((warning) => ({code: warning.code, message: warning.message}))), contextFingerprint, provenance: {producer: input.plan.producer, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion, discoveryAdapter: discovery.adapterDescriptor.adapterId}, authorizedAt: now, expiresAt: new Date(Date.parse(now) + profileValue.ttlMs).toISOString()};
  return Object.freeze({...semantic, guardFingerprint: computeUniversalFingerprint(preflightSemantic(semantic) as unknown as ReviewJsonValue)});
}

export function validateIdentityCreationPreflight(value: IdentityCreationPreflight | undefined, input: {plan: GlobalResolutionPlan; creationOperationId: string; now?: () => string}): {valid: boolean; reasonCode: IdentityCreationGuardState} {
  if (!value || !Array.isArray(value.blockers) || !Array.isArray(value.warnings) || !value.discovery || !value.resolution || !value.provenance || typeof value.guardFingerprint !== "string") return {valid: false, reasonCode: "blocked_missing_preflight"};
  const create = input.plan.operations.find((operation) => operation.id === input.creationOperationId && operation.kind === "create_entity");
  const profileValue = create && identityCreationGuardProfileForSchema(create.entityType);
  const guard = identityCreationGuardForCreation(input.plan.operations, input.creationOperationId);
  if (!create || !profileValue || !guard || value.entityType !== profileValue.entityType) return {valid: false, reasonCode: "blocked_wrong_entity_type"};
  const identityInput = identityInputForCreate(create, profileValue.entityType, input.plan.producer);
  if (!identityInput) return {valid: false, reasonCode: "blocked_stale_identity"};
  const expectedContext = computeUniversalFingerprint({planFingerprint: input.plan.fingerprint, planId: input.plan.id, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion, producer: input.plan.producer, operationId: create.id, capability: profileValue.guardCapability});
  const validFingerprint = computeUniversalFingerprint(preflightSemantic(({...value, guardFingerprint: undefined} as unknown as Omit<IdentityCreationPreflight, "guardFingerprint">)) as unknown as ReviewJsonValue) === value.guardFingerprint;
  if (!validFingerprint || value.operationId !== create.id || value.operationFingerprint !== computeUniversalFingerprint(create as unknown as ReviewJsonValue) || value.contextFingerprint !== expectedContext) return {valid: false, reasonCode: "blocked_stale_resolution"};
  if (value.identityFingerprint !== buildEntityIdentity(identityInput).fingerprint) return {valid: false, reasonCode: "blocked_stale_identity"};
  if (input.now && Date.parse(value.expiresAt) <= Date.parse(input.now())) return {valid: false, reasonCode: "blocked_stale_resolution"};
  if (value.discovery.status !== "complete" || !value.discovery.completeEnoughForCreation) return {valid: false, reasonCode: value.state.startsWith("blocked_discovery_") ? value.state : "blocked_stale_discovery"};
  if (value.resolution.status !== "create_new" || value.decision !== "create_new" || value.state !== "safe_to_create") return {valid: false, reasonCode: value.state};
  return {valid: true, reasonCode: "safe_to_create"};
}

export function validateIdentityCreationPreflightToken(value: IdentityCreationPreflight | undefined, input: {entityType: EntityOperationEntityType; operationId: string; operationFingerprint: string; contextFingerprint: string; now: string}): boolean {
  return Boolean(value && value.operationId === input.operationId && value.operationFingerprint === input.operationFingerprint && value.contextFingerprint === input.contextFingerprint && value.decision === "create_new" && value.state === "safe_to_create" && value.discovery.status === "complete" && value.discovery.completeEnoughForCreation && value.resolution.status === "create_new" && Date.parse(value.expiresAt) > Date.parse(input.now) && computeUniversalFingerprint(preflightSemantic(({...value, guardFingerprint: undefined} as unknown as Omit<IdentityCreationPreflight, "guardFingerprint">)) as unknown as ReviewJsonValue) === value.guardFingerprint && schemaToUniversal(input.entityType) === value.entityType);
}
