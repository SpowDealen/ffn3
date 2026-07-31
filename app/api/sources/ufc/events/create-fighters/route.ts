import {NextResponse} from "next/server";
import {normalizeProducerFighterResolutionRequests, planProducerFighterResolutionBatch} from "@/_laboratorio/laboratorio-ia/src/review/fighterResolutionIntake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 128_000;
const headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store"};
const respond = (body: unknown, status: number) => NextResponse.json(body, {status, headers});
export async function OPTIONS() { return new NextResponse(null, {status: 204, headers}); }

export async function POST(request: Request) {
  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY_BYTES) return respond({ok: false, outcome: "rejected", producer: "ufc_events", reasonCode: "invalid_fighter_resolution_request"}, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return respond({ok: false, outcome: "rejected", producer: "ufc_events", reasonCode: "invalid_fighter_resolution_request"}, 400); }
  try {
    const normalized = normalizeProducerFighterResolutionRequests("ufc_events", body);
    if (!normalized.ok) return respond({ok: false, outcome: "rejected", producer: "ufc_events", reasonCode: normalized.reasonCode}, 422);
    const result = planProducerFighterResolutionBatch("ufc_events", normalized.requests);
    return respond(result, result.ok ? 202 : 422);
  } catch { return respond({ok: false, outcome: "unavailable", producer: "ufc_events", reasonCode: "fighter_resolution_service_unavailable"}, 503); }
}
