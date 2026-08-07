import {buildEntityOperation, type EntityOperation} from "../entityOperations";
import {buildEntityIdentity, type FighterIdentityInput, type IdentityProvenance} from "../entityIdentity";
import {
  type CandidateDiscoveryResolutionStatus, type CandidateDiscoveryResult, type CandidateDiscoveryService, type CandidateDiscoveryStatus,
} from "../entityIdentity/discovery";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {createEntityResolutionEngine} from "../entityResolution/factory";
import type {GlobalResolutionPlan} from "./types";

export const FIGHTER_IDENTITY_GUARD_CAPABILITY = "resolve_identity:fighter" as const;
export const FIGHTER_IDENTITY_GUARD_VERSION = "1.0.0" as const;
export const FIGHTER_IDENTITY_GUARD_TTL_MS = 15 * 60 * 1_000;
export type FighterIdentityGuardDecision = "create_new" | "reuse_existing" | "ambiguous" | "blocked";
export type FighterIdentityGuardReasonCode =
  | "create_new_authorized" | "existing_identity" | "ambiguous_candidate" | "conflicting_identity"
  | "insufficient_identity" | "discovery_incomplete" | "discovery_unavailable" | "discovery_cancelled"
  | "identity_input_missing" | "fingerprint_mismatch" | "guard_missing" | "authorization_expired";

export type FighterIdentityGuardAuthorization = Readonly<{
  authorizationVersion: typeof FIGHTER_IDENTITY_GUARD_VERSION;
  capability: typeof FIGHTER_IDENTITY_GUARD_CAPABILITY;
  guardOperationId: string;
  creationOperationId: string;
  planFingerprint: string;
  caseId: string;
  caseVersion: number;
  producer: string;
  source: string;
  decision: FighterIdentityGuardDecision;
  reasonCode: FighterIdentityGuardReasonCode;
  identityFingerprint: string;
  creationPayloadFingerprint: string;
  requestFingerprint: string;
  discoveryStatus: CandidateDiscoveryStatus;
  discoveryResultFingerprint: string;
  candidateIds: readonly string[];
  strategyIds: readonly string[];
  warningCodes: readonly string[];
  resolvedEntityId?: string;
  contextFingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  authorizationFingerprint: string;
  entityType?: "fighter";
  schemaType?: "luchador";
  createCapability?: "create:luchador";
  planId?: string;
  rulesVersion?: "1.0.0";
  nonce?: string;
}>;

const object = (value: unknown): value is ReviewJsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const values = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 12) : [];
const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const creationIdFrom = (operation: EntityOperation): string | undefined => {
  const payload = object(operation.payload) ? operation.payload : undefined;
  return text(payload?.creationOperationId);
};

function guardIdentityInput(create: EntityOperation, producer: string): FighterIdentityInput | undefined {
  const payload = object(create.payload) ? create.payload : undefined;
  const name = text(payload?.name) ?? text(payload?.nombre);
  if (!name) return undefined;
  const provenance: IdentityProvenance = Object.freeze({
    producer, source: "global_resolution_plan", field: "create_entity.payload",
    extractionMethod: "explicit", confidence: Math.max(0, Math.min(1, create.confidence)), verified: true,
  });
  const slugValue = object(payload?.slug) ? text(payload.slug.current) : text(payload?.slug);
  return {
    entityType: "fighter", source: producer, primaryLabel: name,
    aliases: values(payload?.aliases).map((value) => ({value, aliasType: "editorial" as const, source: producer, confidence: .8, verified: false, provenance})),
    externalIdentifiers: Array.isArray(payload?.externalIdentifiers) ? payload.externalIdentifiers.flatMap((item) => {
      if (!object(item)) return [];
      const namespace = text(item.namespace); const value = text(item.value);
      return namespace && value ? [{source: producer, namespace, value, confidence: .95, verified: true}] : [];
    }).slice(0, 12) : [],
    nickname: text(payload?.nickname) ?? text(payload?.apodo),
    birthDate: text(payload?.birthDate) ?? text(payload?.fechaNacimiento),
    nationality: text(payload?.nationality) ?? text(payload?.nacionalidad),
    organizations: values(payload?.organizationIds),
    discipline: text(payload?.disciplineId),
    weightCategory: text(payload?.weightCategoryId),
    slug: slugValue,
    provenance: [provenance],
  };
}

function guardOperation(create: EntityOperation, producer: string): EntityOperation {
  const identityInput = guardIdentityInput(create, producer);
  return buildEntityOperation({
    id: `identity-guard:${create.id}`,
    kind: "find_entity",
    entityType: "luchador",
    target: create.target,
    payload: {
      scope: "identity_guard",
      guardVersion: FIGHTER_IDENTITY_GUARD_VERSION,
      source: "sanity",
      creationOperationId: create.id,
      identityInput: identityInput as unknown as ReviewJsonValue ?? null,
    },
    source: "global_resolution",
    evidence: create.evidence,
    confidence: create.confidence,
    risk: "none",
    preconditions: [],
    postconditions: [{id: `post:identity-guard:${create.id}`, kind: "no_ambiguity", description: "La identidad autoriza explícitamente crear o reutilizar.", required: true}],
    dependencyIds: create.dependencyIds,
    requiredCapability: FIGHTER_IDENTITY_GUARD_CAPABILITY,
    compensatable: false,
    explanation: "Resolver obligatoriamente la identidad del luchador antes de cualquier creación.",
  });
}

export function ensureFighterIdentityGuardOperations(operations: readonly EntityOperation[], producer: string): EntityOperation[] {
  const byId = new Map(operations.map((operation) => [operation.id, operation]));
  const result = [...operations];
  for (const create of operations.filter((operation) => operation.kind === "create_entity" && operation.entityType === "luchador")) {
    const expectedId = `identity-guard:${create.id}`;
    const existing = operations.find((operation) => operation.id === expectedId || operation.requiredCapability === FIGHTER_IDENTITY_GUARD_CAPABILITY && creationIdFrom(operation) === create.id);
    const guard = existing ?? guardOperation(create, producer);
    if (!byId.has(guard.id)) { result.push(guard); byId.set(guard.id, guard); }
    const current = byId.get(create.id)!;
    const dependencies = [...new Set([...current.dependencyIds, guard.id])].sort();
    byId.set(create.id, buildEntityOperation({...current, id: current.id, idempotencyKey: undefined, dependencyIds: dependencies}));
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function fighterIdentityGuardForCreation(operations: readonly EntityOperation[], creationOperationId: string): EntityOperation | undefined {
  return operations.find((operation) => operation.requiredCapability === FIGHTER_IDENTITY_GUARD_CAPABILITY && creationIdFrom(operation) === creationOperationId);
}

function reason(discovery: CandidateDiscoveryResult, status: CandidateDiscoveryResolutionStatus): {decision: FighterIdentityGuardDecision; reasonCode: FighterIdentityGuardReasonCode} {
  if (discovery.status === "unavailable") return {decision: "blocked", reasonCode: "discovery_unavailable"};
  if (discovery.status === "cancelled") return {decision: "blocked", reasonCode: "discovery_cancelled"};
  if (discovery.status !== "complete" || discovery.truncated) return {decision: "blocked", reasonCode: "discovery_incomplete"};
  if (status === "create_new") return {decision: "create_new", reasonCode: "create_new_authorized"};
  if (status === "reuse") return {decision: "reuse_existing", reasonCode: "existing_identity"};
  if (status === "ambiguous" || status === "probable_match") return {decision: "ambiguous", reasonCode: "ambiguous_candidate"};
  if (status === "conflicting_identity") return {decision: "blocked", reasonCode: "conflicting_identity"};
  return {decision: "blocked", reasonCode: "insufficient_identity"};
}

function authorizationSemantic(value: Omit<FighterIdentityGuardAuthorization, "authorizationFingerprint">) {
  return {...value, candidateIds: [...value.candidateIds].sort(), strategyIds: [...value.strategyIds].sort(), warningCodes: [...value.warningCodes].sort()};
}

async function resolveFighterIdentityGuardCore(input: {
  plan: GlobalResolutionPlan;
  guardOperationId: string;
  service: CandidateDiscoveryService;
  source?: string;
  signal?: AbortSignal;
  now?: () => string;
}): Promise<{authorization: FighterIdentityGuardAuthorization; discovery: CandidateDiscoveryResult}> {
  const guard = input.plan.operations.find((operation) => operation.id === input.guardOperationId);
  const payload = guard && object(guard.payload) ? guard.payload : undefined;
  const creationOperationId = text(payload?.creationOperationId);
  const create = creationOperationId ? input.plan.operations.find((operation) => operation.id === creationOperationId && operation.kind === "create_entity" && operation.entityType === "luchador") : undefined;
  const identityInput = create ? guardIdentityInput(create, input.plan.producer) : undefined;
  if (!guard || guard.requiredCapability !== FIGHTER_IDENTITY_GUARD_CAPABILITY || !create || !identityInput) throw new Error("fighter_identity_guard_input_missing");
  const identity = buildEntityIdentity(identityInput);
  const source = input.source ?? text(payload?.source) ?? "sanity";
  const lookupService = Object.freeze({discover: (request: Parameters<CandidateDiscoveryService["discover"]>[0]) => input.service.discover(request, {signal: input.signal}), supportedEntityTypes: () => Object.freeze(["fighter"])}) as CandidateDiscoveryService;
  const lookupEngine = createEntityResolutionEngine({candidateDiscoveryService: lookupService}, {clock: () => new Date((input.now ?? (() => new Date().toISOString()))()), monotonic: () => 0});
  const lookup = await lookupEngine.resolve({version: 1, mode: "identity_lookup", entityType: "fighter", producer: input.plan.producer, source: "sanity", identity, producerContext: {producerId: input.plan.producer, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion}});
  if (lookup.mode !== "identity_lookup" || !lookup.identityLookup) throw new Error("fighter_identity_lookup_failed");
  const {discovery, resolution: resolved} = lookup.identityLookup;
  const verdict = reason(discovery, resolved.status);
  const resolvedEntityId = verdict.decision === "reuse_existing" ? resolved.resolution.candidateId : undefined;
  const contextFingerprint = fp({planFingerprint: input.plan.fingerprint, caseId: input.plan.caseId, caseVersion: input.plan.caseVersion, producer: input.plan.producer, source, capability: FIGHTER_IDENTITY_GUARD_CAPABILITY});
  const authorizedAt = (input.now ?? (() => new Date().toISOString()))();
  const semantic: Omit<FighterIdentityGuardAuthorization, "authorizationFingerprint"> = {
    authorizationVersion: FIGHTER_IDENTITY_GUARD_VERSION, capability: FIGHTER_IDENTITY_GUARD_CAPABILITY,
    guardOperationId: guard.id, creationOperationId: create.id, planFingerprint: input.plan.fingerprint,
    caseId: input.plan.caseId, caseVersion: input.plan.caseVersion, producer: input.plan.producer, source,
    decision: verdict.decision, reasonCode: verdict.reasonCode, identityFingerprint: identity.fingerprint,
    creationPayloadFingerprint: fp(create.payload),
    requestFingerprint: discovery.requestFingerprint, discoveryStatus: discovery.status,
    discoveryResultFingerprint: discovery.resultFingerprint,
    candidateIds: Object.freeze(discovery.candidates.map((candidate) => candidate.candidateId).sort()),
    strategyIds: Object.freeze(discovery.executedStrategies.map((strategy) => strategy.strategyId).sort()),
    warningCodes: Object.freeze(discovery.warnings.map((warning) => warning.code).sort()),
    resolvedEntityId, contextFingerprint, authorizedAt,
    expiresAt: new Date(Date.parse(authorizedAt) + FIGHTER_IDENTITY_GUARD_TTL_MS).toISOString(),
    entityType: "fighter", schemaType: "luchador", createCapability: "create:luchador", planId: input.plan.id, rulesVersion: "1.0.0",
    nonce: fp({planId: input.plan.id, creationOperationId: create.id, requestFingerprint: discovery.requestFingerprint, identityFingerprint: identity.fingerprint}),
  };
  return {authorization: Object.freeze({...semantic, authorizationFingerprint: fp(authorizationSemantic(semantic))}), discovery};
}

export async function resolveFighterIdentityGuard(input: {
  plan: GlobalResolutionPlan;
  guardOperationId: string;
  service: CandidateDiscoveryService;
  source?: string;
  signal?: AbortSignal;
  now?: () => string;
}): Promise<{authorization: FighterIdentityGuardAuthorization; discovery: CandidateDiscoveryResult}> {
  const resolvedAt = input.now ? new Date(input.now()) : new Date();
  const engine = createEntityResolutionEngine({
    candidateDiscoveryService: input.service,
    creationPreflight: (request, context) => resolveFighterIdentityGuardCore({plan: request.plan, guardOperationId: request.guardOperationId, service: input.service, source: request.source, signal: input.signal ?? context.signal, now: () => context.now.toISOString()}),
  }, {clock: () => resolvedAt, monotonic: () => 0});
  const result = await engine.resolve({version: 1, mode: "creation_preflight", entityType: "fighter", producer: input.plan.producer, source: "sanity", plan: input.plan, guardOperationId: input.guardOperationId});
  if (result.mode !== "creation_preflight" || !result.creationPreflight || !("authorizationFingerprint" in result.creationPreflight.authorization)) throw new Error("fighter_identity_guard_resolution_failed");
  return {authorization: result.creationPreflight.authorization, discovery: result.creationPreflight.discovery};
}

export function validateFighterIdentityGuardAuthorization(value: FighterIdentityGuardAuthorization | undefined, input: {
  plan: GlobalResolutionPlan; creationOperationId: string; now?: () => string;
}): {valid: boolean; reasonCode: FighterIdentityGuardReasonCode} {
  const evidence = validateFighterIdentityGuardEvidence(value, input);
  if (!evidence.valid) return evidence;
  if (input.now && Date.parse(value!.expiresAt) <= Date.parse(input.now())) return {valid: false, reasonCode: "authorization_expired"};
  if (value!.discoveryStatus !== "complete" || value!.decision !== "create_new") return {valid: false, reasonCode: value!.reasonCode};
  return {valid: true, reasonCode: "create_new_authorized"};
}

export function validateFighterIdentityGuardToken(value: FighterIdentityGuardAuthorization | undefined, input: {
  creationOperationId: string; planFingerprint: string; caseId: string; caseVersion: number;
  producer: string; creationPayload: ReviewJsonObject; now: string;
}): boolean {
  if (!value) return false;
  const {authorizationFingerprint: _authorizationFingerprint, ...semantic} = value;
  return value.creationOperationId === input.creationOperationId && value.capability === FIGHTER_IDENTITY_GUARD_CAPABILITY
    && value.planFingerprint === input.planFingerprint && value.caseId === input.caseId
    && value.caseVersion === input.caseVersion && value.producer === input.producer
    && value.creationPayloadFingerprint === fp(input.creationPayload)
    && (!value.entityType || value.entityType === "fighter") && (!value.schemaType || value.schemaType === "luchador")
    && (!value.createCapability || value.createCapability === "create:luchador")
    && value.decision === "create_new" && value.discoveryStatus === "complete"
    && Number.isFinite(Date.parse(value.authorizedAt)) && Number.isFinite(Date.parse(value.expiresAt))
    && Date.parse(value.authorizedAt) < Date.parse(value.expiresAt) && Date.parse(input.now) < Date.parse(value.expiresAt)
    && fp(authorizationSemantic(semantic)) === value.authorizationFingerprint;
}

export function validateFighterIdentityGuardEvidence(value: FighterIdentityGuardAuthorization | undefined, input: {
  plan: GlobalResolutionPlan; creationOperationId: string;
}): {valid: boolean; reasonCode: FighterIdentityGuardReasonCode} {
  if (!value) return {valid: false, reasonCode: "guard_missing"};
  const guard = fighterIdentityGuardForCreation(input.plan.operations, input.creationOperationId);
  const {authorizationFingerprint: _authorizationFingerprint, ...semantic} = value;
  if (!guard || value.authorizationVersion !== FIGHTER_IDENTITY_GUARD_VERSION || value.capability !== FIGHTER_IDENTITY_GUARD_CAPABILITY
    || value.guardOperationId !== guard.id || value.creationOperationId !== input.creationOperationId
    || value.planFingerprint !== input.plan.fingerprint || value.caseId !== input.plan.caseId
    || value.caseVersion !== input.plan.caseVersion || value.producer !== input.plan.producer
    || value.entityType !== undefined && value.entityType !== "fighter" || value.schemaType !== undefined && value.schemaType !== "luchador"
    || value.createCapability !== undefined && value.createCapability !== "create:luchador" || value.planId !== undefined && value.planId !== input.plan.id
    || value.creationPayloadFingerprint !== fp(input.plan.operations.find((operation) => operation.id === input.creationOperationId)?.payload ?? null)
    || fp(authorizationSemantic(semantic)) !== value.authorizationFingerprint) return {valid: false, reasonCode: "fingerprint_mismatch"};
  return {valid: true, reasonCode: value.reasonCode};
}

export const fighterIdentityGuardSecurity = Object.freeze({failClosed: true, writes: false, sanity: false, arbitraryDecision: false, executorBypass: false});
