import type {CandidateDiscoveryRequest} from "../types";
import type {SanityCandidateReadExecutor, SanityFighterCandidateRecord} from "./sanity";
import {createSanityFighterCandidateDiscoveryAdapter} from "./sanity";
import type {CandidateDiscoveryAdapter} from "../types";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function defaultEndpoint(): string {
  const configured = import.meta.env?.VITE_FFN3_API_BASE_URL;
  const base = typeof configured === "string" && configured.trim() ? configured.trim().replace(/\/+$/u, "") : "http://localhost:3000";
  return `${base}/api/review/entity-identity/candidates`;
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
