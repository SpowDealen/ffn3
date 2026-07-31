import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";
import {
  CANDIDATE_DISCOVERY_REQUEST_VERSION, CANDIDATE_DISCOVERY_STRATEGY_IDS,
  SANITY_FIGHTER_CANDIDATE_QUERY,
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
    if (!object(body) || body.requestVersion !== CANDIDATE_DISCOVERY_REQUEST_VERSION || body.entityType !== "fighter" || !object(body.identity) || !object(body.limits)) return json({ok: false, code: "invalid_request"}, 400, origin);
    const strategyIds = strings(body.strategyIds, 16, 40);
    if (!strategyIds.length || strategyIds.some((id) => !(CANDIDATE_DISCOVERY_STRATEGY_IDS as readonly string[]).includes(id))) return json({ok: false, code: "invalid_strategies"}, 400, origin);
    const maxTotal = Number(body.limits.maxTotal);
    if (!Number.isSafeInteger(maxTotal) || maxTotal < 1 || maxTotal > 50) return json({ok: false, code: "invalid_limits"}, 400, origin);
    const primary = typeof body.identity.primaryLabel === "string" ? body.identity.primaryLabel.slice(0, 160) : "";
    const normalized = typeof body.identity.normalizedPrimaryLabel === "string" ? body.identity.normalizedPrimaryLabel.slice(0, 160) : "";
    if (!primary || !normalized || typeof body.identity.fingerprint !== "string" || typeof body.requestFingerprint !== "string") return json({ok: false, code: "invalid_identity"}, 400, origin);
    const aliases = strings(body.identity.aliases, 12, 160).map((item) => item.toLocaleLowerCase("und"));
    const external = Array.isArray(body.identity.externalIdentifiers) ? body.identity.externalIdentifiers.flatMap((item) => {
      if (!object(item) || typeof item.namespace !== "string" || typeof item.value !== "string") return [];
      return [{namespace: item.namespace.trim().slice(0, 80), value: item.value.trim().slice(0, 120)}];
    }).slice(0, 16) : [];
    const slug = typeof body.identity.slug === "string" ? body.identity.slug.trim().slice(0, 96) : "";
    const surname = normalized.split(" ").at(-1) ?? "";
    const records = await sanity.fetch<unknown[]>(SANITY_FIGHTER_CANDIDATE_QUERY, {
      documentIds: [], slugs: slug ? [slug] : [], labels: [...new Set([primary.toLocaleLowerCase("und"), normalized])],
      aliases, externalNamespaces: [...new Set(external.map((item) => item.namespace))],
      externalValues: [...new Set(external.map((item) => item.value))],
      recall: surname ? `*${surname}*` : "__no_recall__", maxTotal: maxTotal + 1,
    }, {perspective: "raw", signal: request.signal});
    return json({ok: true, records}, 200, origin);
  } catch (error) {
    if (request.signal.aborted) return json({ok: false, code: "cancelled"}, 499, origin);
    return json({ok: false, code: "candidate_discovery_unavailable"}, 503, origin);
  }
}
