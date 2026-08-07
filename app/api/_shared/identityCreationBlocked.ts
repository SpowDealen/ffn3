import {NextResponse} from "next/server";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function identityCreationBlocked(entityType: string, capability: string): NextResponse {
  return NextResponse.json({
    ok: false,
    reasonCode: "identity_resolution_unsupported",
    entityType,
    requiredCapability: capability,
    error: `La creación directa de ${entityType} está cerrada hasta disponer de preflight y executor gate universales.`,
  }, {status: 409, headers});
}

export function identityCreationBlockedOptions(): NextResponse {
  return new NextResponse(null, {status: 204, headers});
}
