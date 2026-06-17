import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UfcOfficialEventItem = {
  id: string;
  name: string;
  startDate?: string;
  status: "proximo" | "celebrado" | "cancelado";
  fightCard?: unknown[];
  [key: string]: unknown;
};

type ResolveSuccess = {
  ok: true;
  event: {
    found: boolean;
    sanityId?: string;
  };
  counts: {
    fights: number;
    readyFights: number;
    existingFights: number;
    pendingFights: number;
    existingFighters: number;
    missingFighters: number;
    unresolvedCategories: number;
  };
};

type ResolveFailure = {
  ok: false;
  error?: string;
};

type BatchEventAnalysis = {
  eventId: string;
  eventName: string;
  startDate?: string;
  eventFound: boolean;
  eventSanityId?: string;
  fights: number;
  readyFights: number;
  existingFights: number;
  pendingFights: number;
  existingFighters: number;
  missingFighters: number;
  unresolvedCategories: number;
  status:
    | "completo"
    | "evento_pendiente"
    | "requiere_revision"
    | "listo_para_preparar";
  error?: string;
};

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return "*";
  }

  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  return allowedOrigins.has(origin) ? origin : "*";
}

function withCors(response: NextResponse, request: Request): NextResponse {
  response.headers.set(
    "Access-Control-Allow-Origin",
    getAllowedOrigin(request)
  );
  response.headers.set(
    "Access-Control-Allow-Methods",
    "POST,OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");

  return response;
}

function getStatus(
  resolution: ResolveSuccess
): BatchEventAnalysis["status"] {
  if (resolution.counts.unresolvedCategories > 0) {
    return "requiere_revision";
  }

  if (!resolution.event.found) {
    return "evento_pendiente";
  }

  if (
    resolution.counts.pendingFights === 0 &&
    resolution.counts.missingFighters === 0
  ) {
    return "completo";
  }

  return "listo_para_preparar";
}

export async function OPTIONS(
  request: Request
): Promise<NextResponse> {
  return withCors(
    new NextResponse(null, { status: 204 }),
    request
  );
}

export async function POST(
  request: Request
): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      events?: UfcOfficialEventItem[];
    };

    const events = Array.isArray(body.events)
      ? body.events.filter(
          (event) =>
            event &&
            event.status === "proximo" &&
            Array.isArray(event.fightCard) &&
            event.fightCard.length > 0
        )
      : [];

    if (events.length === 0) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "No se recibieron próximos eventos UFC con cartelera.",
          },
          { status: 400 }
        ),
        request
      );
    }

    const resolveUrl = new URL(
      "/api/sources/ufc/events/resolve",
      request.url
    );

    const items: BatchEventAnalysis[] = [];

    for (const event of events) {
      try {
        const response = await fetch(resolveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ event }),
          cache: "no-store",
        });

        const payload = (await response.json()) as
          | ResolveSuccess
          | ResolveFailure;

        if (!response.ok || !payload.ok) {
          items.push({
            eventId: event.id,
            eventName: event.name,
            startDate: event.startDate,
            eventFound: false,
            fights: event.fightCard?.length ?? 0,
            readyFights: 0,
            existingFights: 0,
            pendingFights: 0,
            existingFighters: 0,
            missingFighters: 0,
            unresolvedCategories: 0,
            status: "requiere_revision",
            error:
              !payload.ok && payload.error
                ? payload.error
                : "No se pudo resolver el evento.",
          });
          continue;
        }

        items.push({
          eventId: event.id,
          eventName: event.name,
          startDate: event.startDate,
          eventFound: payload.event.found,
          eventSanityId: payload.event.sanityId,
          fights: payload.counts.fights,
          readyFights: payload.counts.readyFights,
          existingFights: payload.counts.existingFights,
          pendingFights: payload.counts.pendingFights,
          existingFighters: payload.counts.existingFighters,
          missingFighters: payload.counts.missingFighters,
          unresolvedCategories:
            payload.counts.unresolvedCategories,
          status: getStatus(payload),
        });
      } catch (error) {
        items.push({
          eventId: event.id,
          eventName: event.name,
          startDate: event.startDate,
          eventFound: false,
          fights: event.fightCard?.length ?? 0,
          readyFights: 0,
          existingFights: 0,
          pendingFights: 0,
          existingFighters: 0,
          missingFighters: 0,
          unresolvedCategories: 0,
          status: "requiere_revision",
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido resolviendo el evento.",
        });
      }
    }

    const summary = {
      completed: items.filter(
        (item) => item.status === "completo"
      ).length,
      eventPending: items.filter(
        (item) => item.status === "evento_pendiente"
      ).length,
      readyToPrepare: items.filter(
        (item) => item.status === "listo_para_preparar"
      ).length,
      requiresReview: items.filter(
        (item) => item.status === "requiere_revision"
      ).length,
      totalMissingFighters: items.reduce(
        (total, item) => total + item.missingFighters,
        0
      ),
      totalPendingFights: items.reduce(
        (total, item) => total + item.pendingFights,
        0
      ),
    };

    return withCors(
      NextResponse.json({
        ok: true,
        count: items.length,
        summary,
        items,
      }),
      request
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido analizando eventos UFC.",
        },
        { status: 500 }
      ),
      request
    );
  }
}
