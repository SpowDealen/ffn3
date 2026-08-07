import {buildEntityIdentity, createEntityCandidate} from "../../core";
import {normalizeCanonicalUrl, normalizeDomain, normalizeEdition, normalizeIdentityDate, normalizeIdentityText} from "../../normalize";
import type {EntityAlias, ExternalEntityIdentifier, IdentityProvenance, UniversalEntityIdentityInput} from "../../types";
import {fingerprintAdapterDescriptor, fingerprintDiscoveryResult, fingerprintDiscoveryWarning, fingerprintStrategyResult} from "../fingerprint";
import type {DiscoveryEntityType} from "../profiles";
import type {CandidateDiscoveryAdapter, CandidateDiscoveryAdapterResult, CandidateDiscoveryRequest, CandidateDiscoveryStatus, CandidateDiscoveryStrategyId, CandidateDiscoveryWarning, SafeDiscoveredCandidate, SafeStrategyResult} from "../types";

export const SANITY_EVENT_CANDIDATE_QUERY = `*[
  _type == "evento" && (!defined($cursor) || _id > $cursor) && (
    slug.current in $slugs || lower(nombre) in $labels || lower(nombre) match $recall ||
    (organizacion._ref in $organizationIds && fecha in $dates)
  )
] | order(_id asc)[0...51]{_id,_type,nombre,slug,fecha,"organizacionId":organizacion._ref,"disciplinaId":disciplina._ref,recinto,ciudad,pais}`;

export const SANITY_ORGANIZATION_CANDIDATE_QUERY = `*[
  _type == "organizacion" && (!defined($cursor) || _id > $cursor) && (
    slug.current in $slugs || lower(nombre) in $labels || lower(nombre) match $recall ||
    sitioWeb in $officialUrls
  )
] | order(_id asc)[0...51]{_id,_type,nombre,slug,paisOrigen,sede,anioFundacion,sitioWeb,"disciplinaIds":disciplinas[]._ref,activa}`;

export const SANITY_WEIGHT_CATEGORY_CANDIDATE_QUERY = `*[
  _type == "categoriaPeso" && (!defined($cursor) || _id > $cursor) && (
    slug.current in $slugs || lower(nombre) in $labels || lower(nombre) match $recall ||
    (disciplina._ref in $disciplineIds && limitePeso in $weightLimits)
  )
] | order(_id asc)[0...51]{_id,_type,nombre,slug,"disciplinaId":disciplina._ref,modalidad,grupoEdad,sexo,tipoLimite,limitePeso,unidad}`;

export const SANITY_MULTI_ENTITY_CANDIDATE_QUERIES = Object.freeze({event: SANITY_EVENT_CANDIDATE_QUERY, organization: SANITY_ORGANIZATION_CANDIDATE_QUERY, weight_category: SANITY_WEIGHT_CATEGORY_CANDIDATE_QUERY});

export type SanityMultiEntityCandidateRecord = Readonly<Record<string, unknown> & {_id?: unknown; _type?: unknown; nombre?: unknown; slug?: unknown; aliases?: unknown; externalIds?: unknown}>;
export type SanityMultiEntityQueryInput = Readonly<{
  cursor?: string; slugs: readonly string[]; labels: readonly string[]; aliases: readonly string[];
  externalNamespaces: readonly string[]; externalValues: readonly string[]; recall: string;
  organizationIds: readonly string[]; dates: readonly string[]; officialUrls: readonly string[];
  disciplineIds: readonly string[]; weightLimits: readonly number[];
}>;
export type SanityMultiEntityReadResult = Readonly<{status: CandidateDiscoveryStatus; records: readonly SanityMultiEntityCandidateRecord[]; warnings?: readonly string[]}>;
export type SanityMultiEntityCandidateReader = Readonly<{readCandidates(entityType: Exclude<DiscoveryEntityType, "fighter">, input: SanityMultiEntityQueryInput, signal?: AbortSignal): Promise<SanityMultiEntityReadResult>}>;

const text = (value: unknown, max = 160): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const baseId = (value: string) => value.replace(/^drafts\./u, "");
const rawField = (request: CandidateDiscoveryRequest, field: string): string | undefined => request.identity.rawInput.find((item) => item.field === field)?.value;
const sameText = (left: unknown, right: unknown): boolean => Boolean(text(left) && text(right) && normalizeIdentityText(String(left)).normalizedValue === normalizeIdentityText(String(right)).normalizedValue);
const sameUrl = (left: unknown, right: unknown): boolean => Boolean(text(left) && text(right) && normalizeDomain(String(left)) === normalizeDomain(String(right)));
const strings = (value: unknown, max = 12): string[] => Array.isArray(value) ? value.map((item) => text(typeof item === "object" && item ? (item as {value?: unknown}).value : item)).filter((item): item is string => Boolean(item)).slice(0, max) : [];
const slug = (value: unknown) => value && typeof value === "object" ? text((value as {current?: unknown}).current, 96) : text(value, 96);
const ids = (value: unknown): Array<{namespace: string; value: string}> => Array.isArray(value) ? value.flatMap((item) => {
  if (!item || typeof item !== "object") return [];
  const namespace = text((item as {namespace?: unknown}).namespace, 80); const identifier = text((item as {value?: unknown}).value, 120);
  return namespace && identifier ? [{namespace, value: identifier}] : [];
}).slice(0, 16) : [];
const provenance = (field: string): IdentityProvenance => Object.freeze({producer: "candidate_discovery", source: "sanity", field, extractionMethod: "catalog", confidence: .9, verified: true});
const alias = (value: string, field: string, aliasType: "historical" | "abbreviation" | "slug"): Omit<EntityAlias, "aliasVersion" | "normalizedValue" | "fingerprint"> => ({value, aliasType, source: "sanity", confidence: aliasType === "slug" ? .7 : .85, verified: field === "aliases", provenance: provenance(field)});
const external = (value: {namespace: string; value: string}): Omit<ExternalEntityIdentifier, "identifierVersion" | "entityType" | "fingerprint"> => ({source: "sanity", namespace: value.namespace, value: value.value, confidence: .98, verified: true});

function identityInput(entityType: Exclude<DiscoveryEntityType, "fighter">, record: SanityMultiEntityCandidateRecord): UniversalEntityIdentityInput | undefined {
  const name = text(record.nombre); if (!name) return undefined;
  const persistedAliases = strings(record.aliases); const currentSlug = slug(record.slug);
  const common = {source: "sanity", primaryLabel: name, aliases: [...persistedAliases.map((value) => alias(value, "aliases", entityType === "organization" ? "abbreviation" : "historical")), ...(currentSlug ? [alias(currentSlug.replace(/-/gu, " "), "slug.current", "slug")] : [])], externalIdentifiers: ids(record.externalIds).map(external), provenance: [provenance("document")]};
  if (entityType === "event") return {...common, entityType, baseName: name, organization: text(record.organizacionId), date: text(record.fecha, 40), city: text(record.ciudad, 100), venue: text(record.recinto, 140), country: text(record.pais, 100), slug: currentSlug};
  if (entityType === "organization") {
    const disciplines = strings(record.disciplinaIds);
    return {...common, entityType, officialName: name, abbreviation: persistedAliases.find((value) => /^[A-Z0-9]{2,8}$/u.test(value)), officialDomain: text(record.sitioWeb, 180), country: text(record.paisOrigen, 80), primaryDiscipline: disciplines[0], slug: currentSlug};
  }
  const unit = record.unidad === "kg" || record.unidad === "lb" ? record.unidad : undefined;
  return {...common, entityType, limit: number(record.limitePeso), unit, discipline: text(record.disciplinaId), modality: text(record.modalidad), ageGroup: text(record.grupoEdad), sex: text(record.sexo), limitType: text(record.tipoLimite), slug: currentSlug};
}

function matchedStrategies(record: SanityMultiEntityCandidateRecord, request: CandidateDiscoveryRequest): CandidateDiscoveryStrategyId[] {
  const name = text(record.nombre) ?? ""; const normalized = normalizeIdentityText(name).normalizedValue; const aliases = strings(record.aliases); const currentSlug = slug(record.slug); const externalIds = ids(record.externalIds);
  const matched: CandidateDiscoveryStrategyId[] = [];
  if (externalIds.some((stored) => request.identity.externalIdentifiers.some((value) => value.namespace === stored.namespace && value.value === stored.value))) matched.push("external_id_exact");
  if (name === request.identity.primaryLabel) matched.push("canonical_label_exact");
  if (normalized === request.identity.normalizedPrimaryLabel) matched.push("normalized_label_exact");
  if (aliases.some((stored) => request.identity.aliases.some((value) => value.normalizedValue === normalizeIdentityText(stored).normalizedValue))) matched.push("alias_exact");
  if (currentSlug && sameText(request.identity.attributes.slug, currentSlug)) matched.push("slug_exact");
  const eventEdition = request.entityType === "event" ? normalizeEdition(name.match(/\b(\d+|[ivxlc]+)\b$/iu)?.[1]) : undefined;
  if (request.entityType === "event" && eventEdition && request.identity.attributes.edition === eventEdition && sameText(request.identity.attributes.organization, record.organizacionId)) matched.push("event_number");
  if (request.entityType === "event" && sameText(request.identity.attributes.organization, record.organizacionId) && request.identity.attributes.date === normalizeIdentityDate(text(record.fecha, 40))) matched.push("contextual_key");
  if (request.entityType === "organization" && request.identity.attributes.officialDomain && sameUrl(request.identity.attributes.officialDomain, record.sitioWeb)) matched.push("canonical_url");
  if (request.entityType === "organization" && /^[a-z0-9]{2,8}$/u.test(request.identity.normalizedPrimaryLabel.replace(/\s/gu, ""))) matched.push("organization_acronym");
  if (request.entityType === "weight_category" && sameText(request.identity.attributes.discipline, record.disciplinaId) && typeof request.identity.attributes.limitKg === "number" && typeof number(record.limitePeso) === "number") {
    const storedKg = record.unidad === "lb" ? number(record.limitePeso)! * .45359237 : number(record.limitePeso)!;
    if (Math.abs(request.identity.attributes.limitKg - storedKg) <= .05) matched.push("weight_limit");
  }
  if (!matched.length) matched.push("broad_recall");
  const order = new Map(request.strategies.map((strategy, index) => [strategy.strategyId, index]));
  return [...new Set(matched)].filter((strategy) => order.has(strategy)).sort((left, right) => order.get(left)! - order.get(right)!);
}

function project(record: SanityMultiEntityCandidateRecord, request: CandidateDiscoveryRequest): SafeDiscoveredCandidate | undefined {
  const id = text(record._id); const expected = {event: "evento", organization: "organizacion", weight_category: "categoriaPeso"}[request.entityType as Exclude<DiscoveryEntityType, "fighter">];
  if (!id || record._type !== expected || !["event", "organization", "weight_category"].includes(request.entityType)) return undefined;
  const input = identityInput(request.entityType as Exclude<DiscoveryEntityType, "fighter">, record); if (!input) return undefined;
  const identity = buildEntityIdentity(input); const strategies = matchedStrategies(record, request); if (!strategies.length) return undefined;
  const summaryParts = [identity.primaryLabel, request.entityType === "event" ? identity.attributes.date : request.entityType === "organization" ? identity.attributes.country : identity.attributes.discipline].filter(Boolean);
  const base = createEntityCandidate({candidateId: baseId(id), entityType: request.entityType, identity, safeSummary: summaryParts.join(" · "), source: "sanity", status: id.startsWith("drafts.") ? "draft" : "published"});
  return Object.freeze({...base, matchedByStrategies: Object.freeze(strategies), bestStrategy: strategies[0], variants: Object.freeze([{documentId: id, state: id.startsWith("drafts.") ? "draft" as const : "published" as const, identityFingerprint: identity.fingerprint}]), deduplicationReasons: Object.freeze(["logical_document_id"])});
}

function merge(values: readonly SafeDiscoveredCandidate[]): {candidates: SafeDiscoveredCandidate[]; warnings: CandidateDiscoveryWarning[]} {
  const groups = new Map<string, SafeDiscoveredCandidate[]>(); for (const value of values) groups.set(value.candidateId, [...(groups.get(value.candidateId) ?? []), value]);
  const warnings: CandidateDiscoveryWarning[] = [];
  const candidates = [...groups.values()].map((group) => {
    const preferred = group.find((item) => item.status === "draft") ?? group[0];
    if (new Set(group.map((item) => item.identity.fingerprint)).size > 1) { const value = {code: "draft_published_identity_difference", message: "Draft y publicado difieren en campos de identidad.", candidateId: preferred.candidateId}; warnings.push(Object.freeze({...value, fingerprint: fingerprintDiscoveryWarning(value)})); }
    if (preferred.bestStrategy === "broad_recall" || preferred.bestStrategy === "organization_acronym") { const value = {code: "candidate_context_required", message: "El nombre o sigla requiere contexto adicional.", candidateId: preferred.candidateId}; warnings.push(Object.freeze({...value, fingerprint: fingerprintDiscoveryWarning(value)})); }
    return Object.freeze({...preferred, matchedByStrategies: Object.freeze([...new Set(group.flatMap((item) => item.matchedByStrategies))].sort()), variants: Object.freeze([...new Map(group.flatMap((item) => item.variants).map((item) => [item.documentId, item])).values()].sort((left, right) => left.documentId.localeCompare(right.documentId))), deduplicationReasons: Object.freeze([...new Set([...preferred.deduplicationReasons, ...(group.length > 1 ? ["draft_published_grouped"] : [])])].sort())});
  }).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  return {candidates, warnings};
}

function queryInput(request: CandidateDiscoveryRequest, recall: boolean): SanityMultiEntityQueryInput {
  const identity = request.identity; const attributes = identity.attributes; const aliases = identity.aliases.map((item) => item.normalizedValue).slice(0, request.limits.maxAliases); const externalIds = identity.externalIdentifiers.slice(0, request.limits.maxKeys);
  const recallToken = identity.normalizedPrimaryLabel.split(" ").filter((item) => item.length >= 3).at(-1);
  const rawSlug = rawField(request, "slug"); const rawOrganization = rawField(request, "organization"); const rawDate = rawField(request, "date"); const rawDomain = rawField(request, "officialDomain"); const rawDiscipline = rawField(request, "discipline");
  const slugValues = [rawSlug, attributes.slug ? String(attributes.slug).replace(/\s+/gu, "-") : undefined].filter((item): item is string => Boolean(item));
  const officialUrl = rawDomain ?? (attributes.officialDomain ? String(attributes.officialDomain) : undefined); const canonicalUrl = officialUrl ? normalizeCanonicalUrl(officialUrl) : undefined;
  return {cursor: request.cursor, slugs: recall ? [] : [...new Set(slugValues)], labels: recall ? [] : [...new Set([identity.primaryLabel.toLocaleLowerCase("und"), identity.normalizedPrimaryLabel])], aliases: recall ? [] : aliases, externalNamespaces: recall ? [] : [...new Set(externalIds.map((item) => item.namespace))], externalValues: recall ? [] : [...new Set(externalIds.map((item) => item.value))], recall: recall && recallToken ? `*${recallToken}*` : "__no_recall__", organizationIds: !recall && (rawOrganization || attributes.organization) ? [rawOrganization ?? String(attributes.organization)] : [], dates: !recall && (rawDate || attributes.date) ? [rawDate ?? String(attributes.date)] : [], officialUrls: !recall ? [...new Set([officialUrl, canonicalUrl].filter((item): item is string => Boolean(item)))] : [], disciplineIds: !recall && (rawDiscipline || attributes.discipline) ? [rawDiscipline ?? String(attributes.discipline)] : [], weightLimits: !recall && typeof attributes.limitKg === "number" ? [attributes.limitKg, Number((attributes.limitKg / .45359237).toFixed(2))] : []};
}

export function createSanityMultiEntityCandidateDiscoveryAdapter(entityType: Exclude<DiscoveryEntityType, "fighter">, reader: SanityMultiEntityCandidateReader): CandidateDiscoveryAdapter {
  const semanticDescriptor = {adapterId: `sanity.${entityType}-candidates`, adapterVersion: "1.0.0", source: "sanity", capability: `resolve_identity:${entityType}`, entityTypes: [entityType], priority: 100, specificity: 100};
  const descriptor = Object.freeze({...semanticDescriptor, fingerprint: fingerprintAdapterDescriptor(semanticDescriptor)});
  return Object.freeze({descriptor, supports: (request: CandidateDiscoveryRequest) => request.entityType === entityType && request.source === "sanity", async discover(request: CandidateDiscoveryRequest, context: {signal?: AbortSignal}): Promise<CandidateDiscoveryAdapterResult> {
    if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const timeoutSignal = AbortSignal.timeout(request.limits.timeoutMs); const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
    try {
      const strong = await reader.readCandidates(entityType, queryInput(request, false), signal);
      const projectedStrong = strong.records.map((record) => project(record, request)).filter((item): item is SafeDiscoveredCandidate => Boolean(item));
      const definitive = projectedStrong.some((item) => item.matchedByStrategies.includes("external_id_exact"));
      const broadAllowed = request.strategies.some((item) => item.strategyId === "broad_recall") && !definitive && strong.status === "complete" && strong.records.length <= request.limits.maxTotal;
      const broad = broadAllowed ? await reader.readCandidates(entityType, queryInput(request, true), signal) : {status: "complete" as const, records: [], warnings: []};
      const allRecords = [...new Map([...strong.records, ...broad.records].map((record, index) => [text(record._id) ?? `invalid:${index}`, record])).values()]; const truncated = strong.status === "truncated" || broad.status === "truncated" || allRecords.length > request.limits.maxTotal;
      const status: CandidateDiscoveryStatus = context.signal?.aborted ? "cancelled" : timeoutSignal.aborted ? "unavailable" : truncated ? "truncated" : strong.status !== "complete" ? strong.status : broad.status;
      const merged = merge(allRecords.slice(0, request.limits.maxTotal).map((record) => project(record, request)).filter((item): item is SafeDiscoveredCandidate => Boolean(item)));
      const executed = request.strategies.filter((strategy) => strategy.strategyId !== "broad_recall" || broadAllowed).map((strategy): SafeStrategyResult => { const value = {strategyId: strategy.strategyId, status: "executed" as const, candidateCount: merged.candidates.filter((candidate) => candidate.matchedByStrategies.includes(strategy.strategyId)).length}; return Object.freeze({...value, fingerprint: fingerprintStrategyResult(value)}); });
      const skipped = request.strategies.filter((strategy) => strategy.strategyId === "broad_recall" && !broadAllowed).map((strategy): SafeStrategyResult => { const value = {strategyId: strategy.strategyId, status: "skipped" as const, candidateCount: 0, reason: definitive ? "early_exact_id" as const : "cost_policy" as const}; return Object.freeze({...value, fingerprint: fingerprintStrategyResult(value)}); });
      const readerWarnings = [...(strong.warnings ?? []), ...(broad.warnings ?? [])].map((message, index) => { const value = {code: `reader_warning_${index + 1}`, message: message.slice(0, 180)}; return Object.freeze({...value, fingerprint: fingerprintDiscoveryWarning(value)}); });
      const base: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint"> = {status, candidates: Object.freeze(merged.candidates), executedStrategies: Object.freeze(executed), skippedStrategies: Object.freeze(skipped), warnings: Object.freeze([...merged.warnings, ...readerWarnings]), truncated, reason: status === "truncated" ? "limit_reached" : status === "cancelled" ? "cancelled" : status === "unavailable" ? timeoutSignal.aborted ? "timeout" : "adapter_unavailable" : undefined, cursor: truncated ? text(allRecords[Math.min(request.limits.maxTotal, allRecords.length) - 1]?._id) : undefined, adapterFingerprint: descriptor.fingerprint};
      return Object.freeze({...base, resultFingerprint: fingerprintDiscoveryResult(base)});
    } catch (error) {
      if (context.signal?.aborted) throw error;
      if (!timeoutSignal.aborted) throw error;
      const warning = {code: "timeout", message: "La búsqueda superó el tiempo máximo permitido."};
      const safeWarning = Object.freeze({...warning, fingerprint: fingerprintDiscoveryWarning(warning)});
      const base: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint"> = {status: "unavailable", candidates: [], executedStrategies: [], skippedStrategies: [], warnings: [safeWarning], truncated: false, reason: "timeout", adapterFingerprint: descriptor.fingerprint};
      return Object.freeze({...base, resultFingerprint: fingerprintDiscoveryResult(base)});
    }
  }});
}

export const sanityMultiEntityDiscoverySecurity = Object.freeze({queryIsFixed: true, fixedSlice: 51, projectedFieldsOnly: true, readMethods: Object.freeze(["fetch"]), forbiddenMethods: Object.freeze(["create", "createIfNotExists", "patch", "delete", "transaction", "mutate", "upsert"])});
