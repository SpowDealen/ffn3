import { NextRequest, NextResponse } from "next/server";
import { getExternalNewsAdapter } from "@/_laboratorio/laboratorio-ia/src/sources/adapters";
import { getExternalNewsSource } from "@/_laboratorio/laboratorio-ia/src/sources/sourceRegistry";
import {
  isExternalSourceId,
  type ExternalNewsFetchResult,
} from "@/_laboratorio/laboratorio-ia/src/sources/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_EXTERNAL_SOURCE = "marca";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
} as const;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

function createErrorResponse(
  source: string,
  message: string,
  status: number,
): NextResponse<ExternalNewsFetchResult> {
  const safeSource = isExternalSourceId(source) ? source : DEFAULT_EXTERNAL_SOURCE;
  const sourceDefinition = isExternalSourceId(source)
    ? getExternalNewsSource(source)
    : undefined;

  return NextResponse.json(
    {
      ok: false,
      source: safeSource,
      sourceName: sourceDefinition?.name ?? "Fuente externa",
      fetchedAt: new Date().toISOString(),
      count: 0,
      items: [],
      error: message,
    },
    {
      status,
      headers: JSON_HEADERS,
    },
  );
}

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ExternalNewsFetchResult>> {
  const sourceParam =
    request.nextUrl.searchParams.get("source")?.trim().toLowerCase() ||
    DEFAULT_EXTERNAL_SOURCE;

  if (!isExternalSourceId(sourceParam)) {
    return createErrorResponse(
      sourceParam,
      `Fuente externa no soportada: ${sourceParam}.`,
      400,
    );
  }

  const adapter = getExternalNewsAdapter(sourceParam);

  if (!adapter.source.enabled) {
    return createErrorResponse(
      sourceParam,
      `La fuente externa ${adapter.source.name} está desactivada.`,
      403,
    );
  }

  const result = await adapter.fetchNews();

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: JSON_HEADERS,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      Allow: "GET, OPTIONS",
    },
  });
}
