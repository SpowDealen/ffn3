import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";
import {
  CANDIDATE_DISCOVERY_REQUEST_VERSION, CANDIDATE_DISCOVERY_STRATEGY_IDS,
  SANITY_FIGHTER_CANDIDATE_QUERY, SANITY_MULTI_ENTITY_CANDIDATE_QUERIES, getCandidateDiscoveryProfile,
} from "@/_laboratorio/laboratorio-ia/src/review/entityIdentity/discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 12 * 1024;
const configuredOrigin = process.env.REVIEW_LAB_ORIGIN?.trim();
const allowedOrigins = new Set([configuredOrigin, "http://localhost:5173", "http://127.0.0.1:5173"].filter((value): value is string => Boolean(value)));
const sanity = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_READ_TOKEN, useCdn: false, perspective: "raw",
});
const headers = (origin: string | null) => ({"Cache-Control": "no-store", ...(origin && allowedOrigins.has(origin) ? {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} : {})});
const json = (body: Record<string, unknown>, status: number, origin: string | null) => NextResponse.json(body, {status, headers: headers(origin)});
const originAllowed = (request: Request) => !request.headers.get("origin") || allowedOrigins.has(request.headers.get("origin")!);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown, max: number, length: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, length)).filter(Boolean).slice(0, max) : [];
const exact = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const integerIn = (value: unknown, minimum: number, maximum: number) => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
const entityTypes = ["fighter", "event", "organization", "weight_category"] as const;

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!originAllowed(request)) return new NextResponse(null, {status: 403});
  return new NextResponse(null, {status: 204, headers: {...headers(origin), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600"}});
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!originAllowed(request)) return json({ok: false, code: "origin_forbidden"}, 403, origin);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json({ok: false, code: "request_too_large"}, 413, origin);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ok: false, code: "request_too_large"}, 413, origin);
    const body: unknown = JSON.parse(raw);
    if (!object(body) || !exact(body, ["requestVersion", "entityType", "phase", "identity", "strategyIds", "limits", "cursor", "requestFingerprint"]) || body.requestVersion !== CANDIDATE_DISCOVERY_REQUEST_VERSION || !(entityTypes as readonly unknown[]).includes(body.entityType) || (body.phase !== undefined && !["strong", "broad"].includes(String(body.phase))) || !object(body.identity) || !object(body.limits)) return json({ok: false, code: "invalid_request"}, 400, origin);
    if (!exact(body.identity, ["fingerprint", "primaryLabel", "normalizedPrimaryLabel", "aliases", "externalIdentifiers", "slug", "attributes"]) || !exact(body.limits, ["maxPerStrategy", "maxTotal", "maxStrategies", "timeoutMs", "maxAliases", "maxKeys"])) return json({ok: false, code: "invalid_request"}, 400, origin);
    const entityType = body.entityType as typeof entityTypes[number];
    const profile = getCandidateDiscoveryProfile(entityType);
    const strategyIds = strings(body.strategyIds, 16, 40);
    if (!profile || !strategyIds.length || strategyIds.some((id) => !(CANDIDATE_DISCOVERY_STRATEGY_IDS as readonly string[]).includes(id) || !profile.strategyOrder.includes(id as typeof profile.strategyOrder[number])) || body.phase === "broad" && !strategyIds.includes("broad_recall")) return json({ok: false, code: "invalid_strategies"}, 400, origin);
    const maxTotal = Number(body.limits.maxTotal);
    if (!integerIn(body.limits.maxTotal, 1, 50) || !integerIn(body.limits.maxPerStrategy, 1, 20) || !integerIn(body.limits.maxStrategies, 1, 16) || !integerIn(body.limits.timeoutMs, 100, 30_000) || !integerIn(body.limits.maxAliases, 0, 12) || !integerIn(body.limits.maxKeys, 0, 16)) return json({ok: false, code: "invalid_limits"}, 400, origin);
    const primary = typeof body.identity.primaryLabel === "string" ? body.identity.primaryLabel.slice(0, 160) : "";
    const normalized = typeof body.identity.normalizedPrimaryLabel === "string" ? body.identity.normalizedPrimaryLabel.slice(0, 160) : "";
    if (!primary || !normalized || typeof body.identity.fingerprint !== "string" || !body.identity.fingerprint.trim() || body.identity.fingerprint.length > 160 || typeof body.requestFingerprint !== "string" || !body.requestFingerprint.trim() || body.requestFingerprint.length > 160 || !Array.isArray(body.identity.aliases) || !Array.isArray(body.identity.externalIdentifiers)) return json({ok: false, code: "invalid_identity"}, 400, origin);
    const aliases = strings(body.identity.aliases, 12, 160).map((item) => item.toLocaleLowerCase("und"));
    const external = Array.isArray(body.identity.externalIdentifiers) ? body.identity.externalIdentifiers.flatMap((item) => {
      if (!object(item) || typeof item.namespace !== "string" || typeof item.value !== "string") return [];
      return [{namespace: item.namespace.trim().slice(0, 80), value: item.value.trim().slice(0, 120)}];
    }).slice(0, 16) : [];
    if (external.some((item) => !item.namespace || !item.value || !profile.externalNamespaces.includes(item.namespace))) return json({ok: false, code: "invalid_identity"}, 400, origin);
    const slug = typeof body.identity.slug === "string" ? body.identity.slug.trim().slice(0, 96) : "";
    if (body.identity.attributes !== undefined && (!object(body.identity.attributes) || !exact(body.identity.attributes, ["slug", "organization", "date", "officialDomain", "discipline", "limitKg"]))) return json({ok: false, code: "invalid_identity"}, 400, origin);
    const attributes = object(body.identity.attributes) ? body.identity.attributes : {};
    const cursor = typeof body.cursor === "string" && body.cursor.trim() && body.cursor.length <= 160 ? body.cursor.trim() : null;
    if (body.cursor !== undefined && !cursor) return json({ok: false, code: "invalid_cursor"}, 400, origin);
    const surname = normalized.split(" ").at(-1) ?? "";
    const broadPhase = body.phase === "broad";
    const query = entityType === "fighter" ? SANITY_FIGHTER_CANDIDATE_QUERY : SANITY_MULTI_ENTITY_CANDIDATE_QUERIES[entityType];
    const requestedSlug = slug || (typeof attributes.slug === "string" ? attributes.slug.slice(0, 96) : "");
    const officialDomain = !broadPhase && typeof attributes.officialDomain === "string" ? attributes.officialDomain.slice(0, 180) : "";
    const weightKg = !broadPhase && typeof attributes.limitKg === "number" && Number.isFinite(attributes.limitKg) ? attributes.limitKg : undefined;
    const records = await sanity.fetch<unknown[]>(query, {
      cursor, documentIds: [], slugs: !broadPhase && requestedSlug ? [requestedSlug] : [], labels: broadPhase ? [] : [...new Set([primary.toLocaleLowerCase("und"), normalized])],
      aliases: broadPhase ? [] : aliases, externalNamespaces: broadPhase ? [] : [...new Set(external.map((item) => item.namespace))],
      externalValues: broadPhase ? [] : [...new Set(external.map((item) => item.value))],
      recall: broadPhase && surname ? `*${surname}*` : "__no_recall__", maxTotal: maxTotal + 1,
      organizationIds: !broadPhase && typeof attributes.organization === "string" ? [attributes.organization.slice(0, 160)] : [], dates: !broadPhase && typeof attributes.date === "string" ? [attributes.date.slice(0, 40)] : [], officialUrls: officialDomain ? [...new Set([officialDomain, ...(officialDomain.includes("://") ? [] : [`https://${officialDomain}`])])] : [], disciplineIds: !broadPhase && typeof attributes.discipline === "string" ? [attributes.discipline.slice(0, 160)] : [], weightLimits: weightKg === undefined ? [] : [weightKg, Number((weightKg / .45359237).toFixed(2))],
    }, {perspective: "raw", signal: request.signal});
    return json({ok: true, status: records.length > maxTotal ? "truncated" : "complete", records}, 200, origin);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ok: false, code: "invalid_json"}, 400, origin);
    if (request.signal.aborted) return json({ok: false, code: "cancelled"}, 499, origin);
    return json({ok: false, code: "candidate_discovery_unavailable"}, 503, origin);
  }
}
