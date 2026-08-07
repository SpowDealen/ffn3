import type {CandidateDiscoveryRequest} from "../types";
import type {SanityCandidateReadExecutor, SanityFighterCandidateRecord} from "./sanity";
import {createSanityFighterCandidateDiscoveryAdapter} from "./sanity";
import type {CandidateDiscoveryAdapter} from "../types";
import {createSanityMultiEntityCandidateDiscoveryAdapter, type SanityMultiEntityCandidateReader, type SanityMultiEntityCandidateRecord} from "./sanityMultiEntity";
import type {DiscoveryEntityType} from "../profiles";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function defaultEndpoint(): string {
  const configured = import.meta.env?.VITE_FFN3_API_BASE_URL;
  const base = typeof configured === "string" && configured.trim() ? configured.trim().replace(/\/+$/u, "") : "http://localhost:3000";
  return `${base}/api/review/entity-identity/candidates`;
}

const safeAttributes = (request: CandidateDiscoveryRequest) => {
  const allowed = new Set(["slug", "organization", "date", "officialDomain", "discipline", "limitKg"]);
  const values: Record<string, string | number> = Object.fromEntries(Object.entries(request.identity.attributes).filter(([key, value]) => allowed.has(key) && (typeof value === "string" || typeof value === "number"))) as Record<string, string | number>;
  for (const item of request.identity.rawInput) if (allowed.has(item.field)) values[item.field] = item.value;
  return Object.freeze(values);
};

export function createSanityMultiEntityCandidateDiscoveryHttpReader(input: {endpoint?: string; fetcher?: FetchLike; request: CandidateDiscoveryRequest}): SanityMultiEntityCandidateReader {
  return Object.freeze({async readCandidates(entityType, queryInput, signal) {
    const response = await (input.fetcher ?? fetch)(input.endpoint ?? defaultEndpoint(), {method: "POST", headers: {"Content-Type": "application/json"}, credentials: "omit", cache: "no-store", signal, body: JSON.stringify({requestVersion: input.request.requestVersion, entityType, phase: queryInput.recall === "__no_recall__" ? "strong" : "broad", identity: {fingerprint: input.request.identity.fingerprint, primaryLabel: input.request.identity.primaryLabel, normalizedPrimaryLabel: input.request.identity.normalizedPrimaryLabel, aliases: input.request.identity.aliases.map((item) => item.normalizedValue).slice(0, input.request.limits.maxAliases), externalIdentifiers: input.request.identity.externalIdentifiers.map(({namespace, value}) => ({namespace, value})).slice(0, input.request.limits.maxKeys), attributes: safeAttributes(input.request)}, strategyIds: input.request.strategies.map((item) => item.strategyId), limits: input.request.limits, cursor: queryInput.cursor, requestFingerprint: input.request.requestFingerprint})});
    if (!response.ok) throw new Error(response.status === 408 || response.status === 504 ? "candidate_discovery_timeout" : "candidate_discovery_unavailable");
    const body = await response.json() as {ok?: unknown; status?: unknown; records?: unknown};
    if (body.ok !== true || !["complete", "truncated"].includes(String(body.status)) || !Array.isArray(body.records)) throw new Error("candidate_discovery_response_invalid");
    return {status: body.status as "complete" | "truncated", records: body.records as SanityMultiEntityCandidateRecord[]};
  }});
}

export function createSanityCandidateDiscoveryHttpReader(input: {endpoint?: string; fetcher?: FetchLike; request: CandidateDiscoveryRequest}): SanityCandidateReadExecutor {
  return Object.freeze({
    async readFighterCandidates(_queryInput, signal): Promise<readonly SanityFighterCandidateRecord[]> {
      const response = await (input.fetcher ?? fetch)(input.endpoint ?? defaultEndpoint(), {
        method: "POST", headers: {"Content-Type": "application/json"}, credentials: "omit",
        cache: "no-store", signal,
        body: JSON.stringify({
          requestVersion: input.request.requestVersion,
          entityType: input.request.entityType,
          phase: _queryInput.recall === "__no_recall__" ? "strong" : "broad",
          identity: {
            fingerprint: input.request.identity.fingerprint,
            primaryLabel: input.request.identity.primaryLabel,
            normalizedPrimaryLabel: input.request.identity.normalizedPrimaryLabel,
            aliases: input.request.identity.aliases.map((item) => item.normalizedValue).slice(0, input.request.limits.maxAliases),
            externalIdentifiers: input.request.identity.externalIdentifiers.map(({namespace, value}) => ({namespace, value})).slice(0, input.request.limits.maxKeys),
            slug: input.request.entityType === "fighter" ? input.request.identity.attributes.slug : undefined,
          },
          strategyIds: input.request.strategies.map((item) => item.strategyId),
          limits: input.request.limits,
          requestFingerprint: input.request.requestFingerprint,
        }),
      });
      if (!response.ok) throw new Error(response.status === 408 || response.status === 504 ? "candidate_discovery_timeout" : "candidate_discovery_unavailable");
      const body = await response.json() as {ok?: unknown; records?: unknown};
      if (body.ok !== true || !Array.isArray(body.records)) throw new Error("candidate_discovery_response_invalid");
      return body.records as SanityFighterCandidateRecord[];
    },
  });
}

export function createSanityFighterCandidateDiscoveryHttpAdapter(input: {endpoint?: string; fetcher?: FetchLike} = {}): CandidateDiscoveryAdapter {
  const prototype = createSanityFighterCandidateDiscoveryAdapter({readFighterCandidates: async () => []});
  return Object.freeze({
    descriptor: prototype.descriptor,
    supports: prototype.supports,
    discover(request: CandidateDiscoveryRequest, context: {signal?: AbortSignal}) {
      return createSanityFighterCandidateDiscoveryAdapter(createSanityCandidateDiscoveryHttpReader({...input, request})).discover(request, context);
    },
  });
}

export function createSanityMultiEntityCandidateDiscoveryHttpAdapter(entityType: Exclude<DiscoveryEntityType, "fighter">, input: {endpoint?: string; fetcher?: FetchLike} = {}): CandidateDiscoveryAdapter {
  const prototype = createSanityMultiEntityCandidateDiscoveryAdapter(entityType, {readCandidates: async () => ({status: "complete", records: []})});
  return Object.freeze({descriptor: prototype.descriptor, supports: prototype.supports, discover(request: CandidateDiscoveryRequest, context: {signal?: AbortSignal}) { return createSanityMultiEntityCandidateDiscoveryAdapter(entityType, createSanityMultiEntityCandidateDiscoveryHttpReader({...input, request})).discover(request, context); }});
}
