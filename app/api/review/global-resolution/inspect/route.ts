import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";
import {
  SANITY_FIGHTER_BY_IDENTITY_QUERY,
  SANITY_NEWS_DOCUMENT_QUERY,
  SANITY_NEWS_FIGHTER_REFERENCE_QUERY,
  baseSanityDocumentId,
  draftSanityDocumentId,
  normalizeSanityFighterCandidate,
  normalizeSanityNewsDocumentCandidate,
  normalizeSanityReferenceResult,
  parseSanityInspectionReadRequest,
  sanityDocumentIdVariants,
} from "@/_laboratorio/laboratorio-ia/src/review/globalResolution/inspection/sanity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const configuredOrigin = process.env.REVIEW_LAB_ORIGIN?.trim();
const allowedOrigins = new Set([configuredOrigin, "http://localhost:5173", "http://127.0.0.1:5173"].filter((value): value is string => Boolean(value)));
const sanity = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN,
  useCdn: false,
  perspective: "raw",
});

const responseHeaders = (origin: string | null): Record<string, string> => ({
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  ...(origin && allowedOrigins.has(origin) ? {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} : {}),
});

const json = (body: Record<string, unknown>, status: number, origin: string | null) =>
  NextResponse.json(body, {status, headers: responseHeaders(origin)});

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}
function identitySlug(identityKey: string): string {
  return identityKey.replace(/^fighter:/, "").trim();
}

export function OPTIONS(request: Request): NextResponse {
  const origin = request.headers.get("origin");
  if (!originAllowed(request)) return new NextResponse(null, {status: 403});
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...responseHeaders(origin),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (!originAllowed(request)) return json({ok: false, code: "origin_forbidden", message: "Origen no permitido."}, 403, origin);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return json({ok: false, code: "request_too_large", message: "Solicitud demasiado grande."}, 413, origin);
  try {
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) return json({ok: false, code: "request_too_large", message: "Solicitud demasiado grande."}, 413, origin);
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return json({ok: false, code: "invalid_request", message: "Solicitud no válida."}, 400, origin);
    }
    const input = parseSanityInspectionReadRequest(raw);
    if (!input) return json({ok: false, code: "invalid_request", message: "Solicitud no válida."}, 400, origin);

    if (input.kind === "fighter_by_identity") {
      const expectedId = baseSanityDocumentId(input.expectedId ?? "");
      const candidates = await sanity.fetch<unknown[]>(SANITY_FIGHTER_BY_IDENTITY_QUERY, {
        expectedId: input.expectedId ?? "",
        expectedDraftId: expectedId ? draftSanityDocumentId(expectedId) : "",
        publishedExpectedId: expectedId,
        identitySlug: identitySlug(input.identityKey),
      }, {perspective: "raw", signal: request.signal});
      return json({ok: true, result: {kind: input.kind, candidates: candidates.map(normalizeSanityFighterCandidate).filter(Boolean)}}, 200, origin);
    }

    const ids = sanityDocumentIdVariants(input.documentId);
    if (input.kind === "news_document") {
      const documents = await sanity.fetch<unknown[]>(SANITY_NEWS_DOCUMENT_QUERY, ids, {perspective: "raw", signal: request.signal});
      return json({ok: true, result: {kind: input.kind, documents: documents.map(normalizeSanityNewsDocumentCandidate).filter(Boolean)}}, 200, origin);
    }

    const records = await sanity.fetch<unknown[]>(SANITY_NEWS_FIGHTER_REFERENCE_QUERY, ids, {perspective: "raw", signal: request.signal});
    const normalized = records.map((value) => normalizeSanityReferenceResult(value, input.fighterId)).filter((value): value is NonNullable<typeof value> => Boolean(value));
    const selected = normalized.find((value) => value.documentId === input.documentId) ?? normalized.find((value) => value.referenceExists) ?? normalized[0];
    return json({
      ok: true,
      result: {
        kind: input.kind,
        documentExists: Boolean(selected),
        referenceExists: selected?.referenceExists ?? false,
        observedDocumentId: selected?.documentId,
      },
    }, 200, origin);
  } catch {
    return json({ok: false, code: "inspection_unavailable", message: "La lectura de inspección no está disponible."}, 503, origin);
  }
}
