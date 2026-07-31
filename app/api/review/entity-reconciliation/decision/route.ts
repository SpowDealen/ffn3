import {NextResponse} from "next/server";
import {reconciliationReasonCode, validateReconciliationDecisionRequest} from "@/_laboratorio/laboratorio-ia/src/review/entityReconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4 * 1024;
const configuredOrigin = process.env.REVIEW_LAB_ORIGIN?.trim();
const allowedOrigins = new Set([configuredOrigin, "http://localhost:5173", "http://127.0.0.1:5173"].filter((value): value is string => Boolean(value)));
const headers = (origin: string | null) => ({"Cache-Control": "no-store", ...(origin && allowedOrigins.has(origin) ? {"Access-Control-Allow-Origin": origin, Vary: "Origin"} : {})});
const reply = (body: Record<string, unknown>, status: number, origin: string | null) => NextResponse.json(body, {status, headers: headers(origin)});
const allowed = (request: Request) => !request.headers.get("origin") || allowedOrigins.has(request.headers.get("origin")!);
export function OPTIONS(request: Request) { const origin = request.headers.get("origin"); if (!allowed(request)) return new NextResponse(null, {status: 403}); return new NextResponse(null, {status: 204, headers: {...headers(origin), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600"}}); }
export async function POST(request: Request) {
  const origin = request.headers.get("origin"); if (!allowed(request)) return reply({ok: false, code: "origin_forbidden"}, 403, origin);
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return reply({ok: false, code: "request_too_large"}, 413, origin); const decision = validateReconciliationDecisionRequest(JSON.parse(raw)); return reply({ok: true, decision}, 200, origin); }
  catch (error) { return reply({ok: false, code: "invalid_decision_request", reasonCode: reconciliationReasonCode(error, "invalid_decision_request")}, 400, origin); }
}
