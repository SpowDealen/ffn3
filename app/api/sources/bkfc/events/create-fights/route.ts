import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion:
    process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

type FightCardSection = "principal" | "preliminar";
type FightStatus = "programado" | "finalizado" | "cancelado";

type SourceFight = {
  id?: string;
  section?: FightCardSection;
  sectionLabel?: "Main Card" | "Prelims";
  order?: number;
  redFighter?: string;
  blueFighter?: string;
  weightClass?: string;
  titleFight?: boolean;
  status?: FightStatus;
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type CreateFightsBody = {
  confirm?: boolean;
  event?: {
    name?: string;
    startDate?: string;
    fightCard?: SourceFight[];
  };
};

type ReferenceDoc = {
  _id: string;
  nombre?: string;
};

type EventDoc = ReferenceDoc & {
  slug?: { current?: string };
  fecha?: string;
};

type FighterDoc = ReferenceDoc;

type CategoryDoc = ReferenceDoc & {
  disciplina?: { _ref?: string } | null;
};

type CreatedFight = {
  sourceFightId?: string;
  documentId: string;
  draftId: string;
  combate: string;
  cartelera: FightCardSection;
  orden: number;
};

type SkippedFight = {
  sourceFightId?: string;
  combate: string;
  reason: "already_exists";
  existingId: string;
};

type FailedFight = {
  sourceFightId?: string;
  combate: string;
  reasons: string[];
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  "women strawweight": [
    "peso paja femenino",
    "paja femenino",
    "peso paja",
    "paja",
  ],
  "women flyweight": [
    "peso mosca femenino",
    "mosca femenino",
    "peso mosca",
    "mosca",
  ],
  "women bantamweight": [
    "peso gallo femenino",
    "gallo femenino",
    "peso gallo",
    "gallo",
  ],
  "men flyweight": [
    "peso mosca",
    "mosca",
  ],
  flyweight: [
    "peso mosca",
    "mosca",
  ],
  bantamweight: [
    "peso gallo",
    "gallo",
  ],
  featherweight: [
    "peso pluma",
    "pluma",
  ],
  lightweight: [
    "peso ligero",
    "ligero",
  ],
  welterweight: [
    "peso wélter",
    "peso welter",
    "wélter",
    "welter",
  ],
  middleweight: [
    "peso medio",
    "medio",
  ],
  "light heavyweight": [
    "peso semipesado",
    "semipesado",
  ],
  cruiserweight: [
    "peso crucero",
    "crucero",
  ],
  heavyweight: [
    "peso pesado",
    "pesado",
  ],
  catchweight: [
    "peso pactado",
    "catchweight",
  ],
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSlug(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[’‘`´']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeWeightClass(value: string): string {
  return normalizeName(
    value
      .replace(/\binterim\b/gi, "")
      .replace(/\btitle\b/gi, "")
      .replace(/\bbout\b/gi, "")
      .replace(/\bchampionship\b/gi, "")
  );
}

function baseId(value: string): string {
  return value.replace(/^drafts\./, "");
}

async function createSafeReference(
  targetId: string
): Promise<{
  _type: "reference";
  _ref: string;
  _weak?: true;
}> {
  const publishedId = baseId(targetId);

  const publishedDocument = await sanityClient.getDocument(publishedId);
  const publishedExists = Boolean(publishedDocument?._id);

  return {
    _type: "reference",
    _ref: publishedId,
    ...(publishedExists ? {} : { _weak: true as const }),
  };
}

function preferDraft<T extends { _id: string }>(docs: T[]): T[] {
  const grouped = new Map<string, T>();

  for (const doc of docs) {
    const id = baseId(doc._id);
    const current = grouped.get(id);

    if (!current || doc._id.startsWith("drafts.")) {
      grouped.set(id, doc);
    }
  }

  return Array.from(grouped.values());
}

function resolveByName<T extends ReferenceDoc>(
  name: string,
  docs: T[]
): T | undefined {
  const normalized = normalizeName(name);

  return docs.find(
    (doc) => normalizeName(getString(doc.nombre)) === normalized
  );
}

function resolveCategory(
  sourceLabel: string,
  categories: CategoryDoc[]
): CategoryDoc | undefined {
  const normalizedSource = normalizeWeightClass(sourceLabel);

  if (!normalizedSource) {
    return undefined;
  }

  const aliases =
    CATEGORY_ALIASES[normalizedSource] ?? [normalizedSource];

  const normalizedAliases = aliases.map(normalizeName);

  return categories.find((category) =>
    normalizedAliases.includes(
      normalizeName(getString(category.nombre))
    )
  );
}

async function fetchContext(): Promise<{
  events: EventDoc[];
  fighters: FighterDoc[];
  categories: CategoryDoc[];
  bareKnuckle?: ReferenceDoc;
}> {
  const [events, fighters, categories, bareKnuckle] = await Promise.all([
    sanityClient.fetch<EventDoc[]>(
      `*[_type == "evento"]{
        _id,
        nombre,
        slug,
        fecha
      }`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<FighterDoc[]>(
      `*[_type == "luchador"]{
        _id,
        nombre
      }`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<CategoryDoc[]>(
      `*[_type == "categoriaPeso"]{
        _id,
        nombre,
        disciplina
      }`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<ReferenceDoc | null>(
      `*[_type == "disciplina" && lower(nombre) == "bare knuckle"][0]{
        _id,
        nombre
      }`,
      {},
      { perspective: "raw" }
    ),
  ]);

  return {
    events: preferDraft(events),
    fighters: preferDraft(fighters),
    categories: preferDraft(categories),
    bareKnuckle: bareKnuckle ?? undefined,
  };
}

function findEvent(
  sourceName: string,
  events: EventDoc[]
): EventDoc | undefined {
  return resolveByName(sourceName, events);
}

function buildFightDocumentId(params: {
  eventId: string;
  redFighter: string;
  blueFighter: string;
}): string {
  const eventPart = createSlug(baseId(params.eventId));
  const redPart = createSlug(params.redFighter);
  const bluePart = createSlug(params.blueFighter);

  return `bkfc-fight-${eventPart}-${redPart}-vs-${bluePart}`.slice(
    0,
    200
  );
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
    if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "Falta NEXT_PUBLIC_SANITY_PROJECT_ID.",
          },
          { status: 500 }
        ),
        request
      );
    }

    if (!process.env.NEXT_PUBLIC_SANITY_DATASET) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "Falta NEXT_PUBLIC_SANITY_DATASET.",
          },
          { status: 500 }
        ),
        request
      );
    }

    if (!process.env.SANITY_API_WRITE_TOKEN) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "Falta SANITY_API_WRITE_TOKEN.",
          },
          { status: 500 }
        ),
        request
      );
    }

    let body: CreateFightsBody;

    try {
      body = (await request.json()) as CreateFightsBody;
    } catch {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "El body no contiene JSON válido.",
          },
          { status: 400 }
        ),
        request
      );
    }

    if (body.confirm !== true) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "Debes enviar confirm: true para crear los borradores.",
          },
          { status: 400 }
        ),
        request
      );
    }

    const eventName = getString(body.event?.name);
    const fightCard = Array.isArray(body.event?.fightCard)
      ? body.event?.fightCard ?? []
      : [];

    if (!eventName) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error: "Falta el nombre del evento.",
          },
          { status: 400 }
        ),
        request
      );
    }

    if (fightCard.length === 0) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "El evento no contiene una cartelera válida.",
          },
          { status: 400 }
        ),
        request
      );
    }

    const {
      events,
      fighters,
      categories,
      bareKnuckle,
    } = await fetchContext();

    const event = findEvent(eventName, events);

    if (!event?._id) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "No se encontró el evento en Sanity por nombre exacto.",
          },
          { status: 409 }
        ),
        request
      );
    }

    const bareKnuckleCategories = bareKnuckle
      ? categories.filter(
          (category) =>
            !category.disciplina?._ref ||
            baseId(category.disciplina._ref) === baseId(bareKnuckle._id)
        )
      : categories;

    const created: CreatedFight[] = [];
    const skipped: SkippedFight[] = [];
    const failed: FailedFight[] = [];

    for (const sourceFight of fightCard) {
      const redName = getString(sourceFight.redFighter);
      const blueName = getString(sourceFight.blueFighter);
      const fightLabel =
        redName && blueName
          ? `${redName} vs ${blueName}`
          : getString(sourceFight.id) || "Combate sin nombre";

      const reasons: string[] = [];

      const redFighter = resolveByName(redName, fighters);
      const blueFighter = resolveByName(blueName, fighters);
      const category = resolveCategory(
        getString(sourceFight.weightClass),
        bareKnuckleCategories
      );

      if (!redName || !redFighter?._id) {
        reasons.push("luchador_rojo_no_encontrado");
      }

      if (!blueName || !blueFighter?._id) {
        reasons.push("luchador_azul_no_encontrado");
      }

      if (!category?._id) {
        reasons.push("categoria_peso_no_resuelta");
      }

      const status: FightStatus =
        sourceFight.status === "finalizado" ||
        sourceFight.status === "cancelado"
          ? sourceFight.status
          : "programado";

      const winnerName = getString(sourceFight.winnerName);
      const winner = winnerName
        ? resolveByName(winnerName, fighters)
        : undefined;

      if (
        status === "finalizado" &&
        (!winnerName || !winner?._id)
      ) {
        reasons.push("ganador_no_encontrado");
      }

      if (reasons.length > 0) {
        failed.push({
          sourceFightId: getString(sourceFight.id) || undefined,
          combate: fightLabel,
          reasons,
        });
        continue;
      }

      const documentId = buildFightDocumentId({
        eventId: event._id,
        redFighter: redName,
        blueFighter: blueName,
      });

      const draftId = `drafts.${documentId}`;

      const existing = await sanityClient.fetch<{
        _id: string;
      } | null>(
        `*[
          _type == "combate" &&
          _id in [$publishedId, $draftId]
        ][0]{_id}`,
        {
          publishedId: documentId,
          draftId,
        },
        { perspective: "raw" }
      );

      if (existing?._id) {
        skipped.push({
          sourceFightId: getString(sourceFight.id) || undefined,
          combate: fightLabel,
          reason: "already_exists",
          existingId: baseId(existing._id),
        });
        continue;
      }

      const cartelera: FightCardSection =
        sourceFight.section === "preliminar"
          ? "preliminar"
          : "principal";

      const orden =
        typeof sourceFight.order === "number" &&
        Number.isInteger(sourceFight.order) &&
        sourceFight.order >= 1
          ? sourceFight.order
          : 1;

      const [
        eventReference,
        redFighterReference,
        blueFighterReference,
        categoryReference,
        winnerReference,
      ] = await Promise.all([
        createSafeReference(event._id),
        createSafeReference(redFighter!._id),
        createSafeReference(blueFighter!._id),
        createSafeReference(category!._id),
        winner?._id
          ? createSafeReference(winner._id)
          : Promise.resolve(undefined),
      ]);

      await sanityClient.createIfNotExists({
        _id: draftId,
        _type: "combate",
        evento: eventReference,
        luchadorRojo: redFighterReference,
        luchadorAzul: blueFighterReference,
        ...(status === "finalizado" && winnerReference
          ? {
              ganador: winnerReference,
            }
          : {}),
        ...(getString(sourceFight.method)
          ? {
              metodo: getString(sourceFight.method),
            }
          : {}),
        ...(typeof sourceFight.round === "number" &&
        Number.isInteger(sourceFight.round) &&
        sourceFight.round >= 1
          ? {
              asalto: sourceFight.round,
            }
          : {}),
        ...(getString(sourceFight.time)
          ? {
              tiempo: getString(sourceFight.time),
            }
          : {}),
        categoriaPeso: categoryReference,
        tituloEnJuego: Boolean(sourceFight.titleFight),
        cartelera,
        orden,
        estado: status,
      });

      created.push({
        sourceFightId: getString(sourceFight.id) || undefined,
        documentId,
        draftId,
        combate: fightLabel,
        cartelera,
        orden,
      });
    }

    return withCors(
      NextResponse.json({
        ok: true,
        event: {
          nombre: getString(event.nombre),
          sanityId: baseId(event._id),
        },
        summary: {
          candidates: fightCard.length,
          created: created.length,
          skipped: skipped.length + failed.length,
          failed: 0,
        },
        created,
        skipped,
        blocked: failed,
        failed: [],
      }),
      request
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido creando combates.";

    console.error(
      "Error creando combates BKFC en Sanity:",
      error
    );

    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: message,
        },
        { status: 500 }
      ),
      request
    );
  }
}
