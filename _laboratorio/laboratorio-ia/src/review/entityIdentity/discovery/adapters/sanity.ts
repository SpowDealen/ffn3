import {buildEntityIdentity, createEntityCandidate} from "../../core";
import {normalizeIdentityText} from "../../normalize";
import type {EntityAlias, ExternalEntityIdentifier, FighterIdentityInput, IdentityProvenance} from "../../types";
import {
  fingerprintAdapterDescriptor, fingerprintDiscoveryResult, fingerprintDiscoveryWarning,
  fingerprintStrategyResult,
} from "../fingerprint";
import type {
  CandidateDiscoveryAdapter, CandidateDiscoveryAdapterResult, CandidateDiscoveryRequest,
  CandidateDiscoveryStrategyId, CandidateDiscoveryWarning, SafeDiscoveredCandidate, SafeStrategyResult,
} from "../types";

export const SANITY_FIGHTER_CANDIDATE_QUERY = `*[
  _type == "luchador" &&
  (
    (_id in $documentIds) ||
    (defined(slug.current) && slug.current in $slugs) ||
    (defined(nombre) && (lower(nombre) in $labels || lower(nombre) match $recall)) ||
    (defined(apodo) && lower(apodo) in $aliases) ||
    (defined(aliases) && count(aliases[lower(@) in $aliases]) > 0) ||
    (defined(externalIds) && count(externalIds[namespace in $externalNamespaces && value in $externalValues]) > 0)
  )
][0...$maxTotal]{
  _id, _type, nombre, nombreCompleto, apodo, aliases, slug,
  externalIds, fechaNacimiento, nacionalidad,
  "organizacionId": organizacion._ref,
  "disciplinaId": disciplina._ref,
  "categoriaPesoId": categoriaPeso._ref
}`;

export type SanityFighterCandidateRecord = Readonly<{
  _id?: unknown; _type?: unknown; nombre?: unknown; nombreCompleto?: unknown; apodo?: unknown;
  aliases?: unknown; slug?: unknown; externalIds?: unknown; fechaNacimiento?: unknown; nacionalidad?: unknown;
  organizacionId?: unknown; disciplinaId?: unknown; categoriaPesoId?: unknown;
}>;
export type SanityCandidateReadExecutor = Readonly<{
  readFighterCandidates(input: {
    documentIds: readonly string[]; slugs: readonly string[]; labels: readonly string[];
    aliases: readonly string[]; externalNamespaces: readonly string[]; externalValues: readonly string[];
    recall: string; maxTotal: number;
  }, signal?: AbortSignal): Promise<readonly SanityFighterCandidateRecord[]>;
}>;

const text = (value: unknown, max = 160): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const baseId = (value: string) => value.replace(/^drafts\./u, "");
const arrayText = (value: unknown, max = 12): string[] => Array.isArray(value) ? value.map((item) => text(typeof item === "object" && item ? (item as {value?: unknown}).value : item)).filter((item): item is string => Boolean(item)).slice(0, max) : [];
const slugCurrent = (value: unknown): string | undefined => value && typeof value === "object" ? text((value as {current?: unknown}).current, 96) : undefined;
const externalIds = (value: unknown): Array<{namespace: string; value: string}> => Array.isArray(value) ? value.flatMap((item) => {
  if (!item || typeof item !== "object") return [];
  const namespace = text((item as {namespace?: unknown}).namespace, 80);
  const id = text((item as {value?: unknown}).value, 120);
  return namespace && id ? [{namespace, value: id}] : [];
}).slice(0, 12) : [];
const provenance = (field: string): IdentityProvenance => Object.freeze({producer: "candidate_discovery", source: "sanity", field, extractionMethod: "catalog", confidence: .9, verified: true});
const safeAlias = (value: string, field: string, type: "nickname" | "historical" | "slug"): Omit<EntityAlias, "aliasVersion" | "normalizedValue" | "fingerprint"> => ({
  value, aliasType: type, source: "sanity", confidence: type === "slug" ? .7 : .85, verified: field === "aliases", provenance: provenance(field),
});
const safeExternal = (item: {namespace: string; value: string}): Omit<ExternalEntityIdentifier, "identifierVersion" | "entityType" | "fingerprint"> => ({
  source: "sanity", namespace: item.namespace, value: item.value, confidence: .98, verified: true,
});

function strategiesFor(record: SanityFighterCandidateRecord, request: CandidateDiscoveryRequest): CandidateDiscoveryStrategyId[] {
  const name = text(record.nombreCompleto) ?? text(record.nombre) ?? "";
  const normalizedName = normalizeIdentityText(name).normalizedValue;
  const persistedAliases = arrayText(record.aliases);
  const nickname = text(record.apodo);
  const slug = slugCurrent(record.slug);
  const ids = externalIds(record.externalIds);
  const matches: CandidateDiscoveryStrategyId[] = [];
  if (ids.some((item) => request.identity.externalIdentifiers.some((candidate) => candidate.namespace === item.namespace && candidate.value === item.value))) matches.push("external_id_exact");
  if (name === request.identity.primaryLabel) matches.push("canonical_label_exact");
  if (normalizedName === request.identity.normalizedPrimaryLabel) matches.push("normalized_label_exact");
  if ([...persistedAliases, nickname].filter(Boolean).some((item) => request.identity.aliases.some((alias) => alias.normalizedValue === normalizeIdentityText(item!).normalizedValue))) matches.push("alias_exact");
  if (slug && request.identity.entityType === "fighter" && request.identity.attributes.slug === slug) matches.push("slug_exact");
  if (normalizedName && (normalizedName.split(" ").at(-1) === request.identity.normalizedPrimaryLabel.split(" ").at(-1))) matches.push("broad_recall");
  return matches.length ? [...new Set(matches)] : ["broad_recall"];
}

function candidate(record: SanityFighterCandidateRecord, request: CandidateDiscoveryRequest): SafeDiscoveredCandidate | undefined {
  const id = text(record._id);
  const name = text(record.nombreCompleto) ?? text(record.nombre);
  if (!id || !name || record._type !== "luchador") return undefined;
  const aliases = arrayText(record.aliases);
  const nickname = text(record.apodo);
  const slug = slugCurrent(record.slug);
  const input: FighterIdentityInput = {
    entityType: "fighter", source: "sanity", primaryLabel: name,
    nickname, birthDate: text(record.fechaNacimiento, 32), nationality: text(record.nacionalidad, 80),
    organizations: text(record.organizacionId) ? [baseId(text(record.organizacionId)!)] : undefined,
    discipline: text(record.disciplinaId), weightCategory: text(record.categoriaPesoId), slug,
    aliases: [
      ...aliases.map((value) => safeAlias(value, "aliases", "historical")),
      ...(nickname ? [safeAlias(nickname, "apodo", "nickname")] : []),
      ...(slug ? [safeAlias(slug.replace(/-/gu, " "), "slug.current", "slug")] : []),
    ],
    externalIdentifiers: externalIds(record.externalIds).map(safeExternal),
    provenance: [provenance("document")],
  };
  const identity = buildEntityIdentity(input);
  const base = createEntityCandidate({candidateId: baseId(id), entityType: "fighter", identity, safeSummary: `${name}${nickname ? ` · ${nickname}` : ""}`.slice(0, 240), source: "sanity", status: id.startsWith("drafts.") ? "draft" : "published"});
  const matched = strategiesFor(record, request).sort((a, b) => request.strategies.findIndex((item) => item.strategyId === a) - request.strategies.findIndex((item) => item.strategyId === b));
  return Object.freeze({
    ...base, matchedByStrategies: Object.freeze(matched), bestStrategy: matched[0],
    variants: Object.freeze([{documentId: id, state: (id.startsWith("drafts.") ? "draft" : "published") as "draft" | "published", identityFingerprint: identity.fingerprint}]),
    deduplicationReasons: Object.freeze(["logical_document_id"]),
  });
}

function mergeCandidates(values: readonly SafeDiscoveredCandidate[]): {candidates: SafeDiscoveredCandidate[]; warnings: CandidateDiscoveryWarning[]} {
  const groups = new Map<string, SafeDiscoveredCandidate[]>();
  values.forEach((item) => groups.set(item.candidateId, [...(groups.get(item.candidateId) ?? []), item]));
  const warnings: CandidateDiscoveryWarning[] = [];
  const candidates = [...groups.values()].map((group) => {
    const preferred = group.find((item) => item.status === "draft") ?? group[0];
    const fingerprints = new Set(group.map((item) => item.identity.fingerprint));
    if (fingerprints.size > 1) {
      const value = {code: "draft_published_identity_difference", message: "Draft y publicado difieren en campos de identidad.", candidateId: preferred.candidateId};
      warnings.push(Object.freeze({...value, fingerprint: fingerprintDiscoveryWarning(value)}));
    }
    return Object.freeze({
      ...preferred,
      matchedByStrategies: Object.freeze([...new Set(group.flatMap((item) => item.matchedByStrategies))].sort()),
      variants: Object.freeze([...new Map(group.flatMap((item) => item.variants).map((item) => [item.documentId, item])).values()].sort((a, b) => a.documentId.localeCompare(b.documentId))),
      deduplicationReasons: Object.freeze([...new Set([...preferred.deduplicationReasons, ...(group.length > 1 ? ["draft_published_grouped"] : [])])].sort()),
    });
  }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return {candidates, warnings};
}

export function createSanityFighterCandidateDiscoveryAdapter(reader: SanityCandidateReadExecutor): CandidateDiscoveryAdapter {
  const semanticDescriptor = {adapterId: "sanity.fighter-candidates", adapterVersion: "1.0.0", source: "sanity", capability: "resolve_identity:fighter", entityTypes: ["fighter"] as const, priority: 100, specificity: 100};
  const descriptor = Object.freeze({...semanticDescriptor, fingerprint: fingerprintAdapterDescriptor(semanticDescriptor)});
  return Object.freeze({
    descriptor,
    supports: (request: CandidateDiscoveryRequest) => request.entityType === "fighter" && request.source === "sanity",
    async discover(request: CandidateDiscoveryRequest, context: {signal?: AbortSignal}): Promise<CandidateDiscoveryAdapterResult> {
      if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const identity = request.identity;
      if (identity.entityType !== "fighter") throw new Error("candidate_discovery_entity_type_unsupported");
      const labels = [...new Set([identity.primaryLabel, identity.normalizedPrimaryLabel].map((item) => item.toLocaleLowerCase("und")).filter(Boolean))];
      const aliases = [...new Set(identity.aliases.map((item) => item.normalizedValue))].slice(0, request.limits.maxAliases);
      const external = identity.externalIdentifiers.slice(0, request.limits.maxKeys);
      const slug = identity.attributes.slug;
      const surname = identity.normalizedPrimaryLabel.split(" ").at(-1) ?? "";
      const strongRecords = await reader.readFighterCandidates({
        documentIds: [], slugs: slug ? [slug] : [], labels, aliases,
        externalNamespaces: [...new Set(external.map((item) => item.namespace))],
        externalValues: [...new Set(external.map((item) => item.value))],
        recall: "__no_recall__", maxTotal: Math.min(request.limits.maxTotal + 1, 51),
      }, context.signal);
      const strongNormalized = strongRecords.map((item) => candidate(item, request)).filter((item): item is SafeDiscoveredCandidate => Boolean(item));
      const definitive = strongNormalized.some((item) => item.matchedByStrategies.includes("external_id_exact"));
      const broadEnabled = request.strategies.some((item) => item.strategyId === "broad_recall");
      const recallRecords = definitive || !broadEnabled || strongRecords.length > request.limits.maxTotal || !surname ? [] : await reader.readFighterCandidates({
        documentIds: [], slugs: [], labels: [], aliases: [], externalNamespaces: [], externalValues: [],
        recall: `*${surname}*`, maxTotal: Math.min(request.limits.maxTotal + 1, 51),
      }, context.signal);
      const records = [...strongRecords, ...recallRecords];
      const truncated = records.length > request.limits.maxTotal;
      const normalized = records.slice(0, request.limits.maxTotal).map((item) => candidate(item, request)).filter((item): item is SafeDiscoveredCandidate => Boolean(item));
      const merged = mergeCandidates(normalized);
      const executed = request.strategies.filter((item) => item.strategyId !== "broad_recall" || !definitive).map((item): SafeStrategyResult => {
        const value = {strategyId: item.strategyId, status: "executed" as const, candidateCount: merged.candidates.filter((candidate) => candidate.matchedByStrategies.includes(item.strategyId)).length};
        return Object.freeze({...value, fingerprint: fingerprintStrategyResult(value)});
      });
      const skipped = request.strategies.filter((item) => item.strategyId === "broad_recall" && definitive).map((item): SafeStrategyResult => {
        const value = {strategyId: item.strategyId, status: "skipped" as const, candidateCount: 0, reason: "early_exact_id" as const};
        return Object.freeze({...value, fingerprint: fingerprintStrategyResult(value)});
      });
      const base: Omit<CandidateDiscoveryAdapterResult, "resultFingerprint"> = {
        status: truncated ? "truncated" : "complete", candidates: Object.freeze(merged.candidates),
        executedStrategies: Object.freeze(executed), skippedStrategies: Object.freeze(skipped), warnings: Object.freeze(merged.warnings),
        truncated, reason: truncated ? "limit_reached" : undefined, adapterFingerprint: descriptor.fingerprint,
      };
      return Object.freeze({...base, resultFingerprint: fingerprintDiscoveryResult(base)});
    },
  });
}

export const sanityCandidateDiscoverySecurity = Object.freeze({
  queryIsFixed: true, typeFilter: "_type == luchador", projectedFieldsOnly: true,
  readMethods: Object.freeze(["fetch"]), forbiddenMethods: Object.freeze(["create", "createIfNotExists", "patch", "delete", "transaction", "mutate"]),
});
