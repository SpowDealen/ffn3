import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanityClient = createClient({
  projectId:
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset:
    process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion:
    process.env.NEXT_PUBLIC_SANITY_API_VERSION ||
    "2025-03-01",
  token:
    process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

type FightCardItem = {
  redFighter?: string;
  blueFighter?: string;
  weightClass?: string;
};

type CreateMissingFightersBody = {
  confirm?: boolean;
  event?: {
    name?: string;
    fightCard?: FightCardItem[];
  };
};

type ReferenceDoc = {
  _id: string;
  nombre?: string;
};

type FighterDoc = {
  _id: string;
  nombre?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type CategoryDoc = {
  _id: string;
  nombre?: string;
  disciplina?: { _ref?: string } | null;
};

type FighterCandidate = {
  nombre: string;
  normalizedName: string;
  slug: string;
  categorySource?: string;
  categoryId?: string;
  categoryName?: string;
};

type CreatedFighter = {
  nombre: string;
  documentId: string;
  draftId: string;
  categoriaPeso?: string;
};

type SkippedFighter = {
  nombre: string;
  reason: "already_exists" | "duplicate_candidate";
  existingId?: string;
};

type FailedFighter = {
  nombre: string;
  error: string;
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

function resolveCategory(
  sourceLabel: string | undefined,
  categories: CategoryDoc[]
): CategoryDoc | undefined {
  const normalizedSource = normalizeWeightClass(
    getString(sourceLabel)
  );

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

function buildCandidates(
  fightCard: FightCardItem[],
  categories: CategoryDoc[]
): FighterCandidate[] {
  const candidateMap = new Map<string, FighterCandidate>();

  for (const fight of fightCard) {
    const category = resolveCategory(
      fight.weightClass,
      categories
    );

    const names = [
      getString(fight.redFighter),
      getString(fight.blueFighter),
    ].filter(Boolean);

    for (const nombre of names) {
      const normalizedName = normalizeName(nombre);

      if (!normalizedName) {
        continue;
      }

      const existingCandidate =
        candidateMap.get(normalizedName);

      if (existingCandidate) {
        if (
          !existingCandidate.categoryId &&
          category?._id
        ) {
          existingCandidate.categoryId = category._id;
          existingCandidate.categoryName =
            getString(category.nombre);
          existingCandidate.categorySource =
            getString(fight.weightClass);
        }

        continue;
      }

      candidateMap.set(normalizedName, {
        nombre,
        normalizedName,
        slug: createSlug(nombre),
        categorySource: getString(fight.weightClass) || undefined,
        categoryId: category?._id,
        categoryName: getString(category?.nombre) || undefined,
      });
    }
  }

  return Array.from(candidateMap.values());
}

async function fetchSanityContext(): Promise<{
  disciplina?: ReferenceDoc;
  organizacion?: ReferenceDoc;
  fighters: FighterDoc[];
  categories: CategoryDoc[];
}> {
  const [
    disciplina,
    organizacion,
    fighters,
    categories,
  ] = await Promise.all([
    sanityClient.fetch<ReferenceDoc | null>(
      `*[_type == "disciplina" && lower(nombre) == "bare knuckle"][0]{
        _id,
        nombre
      }`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<ReferenceDoc | null>(
      `*[_type == "organizacion" && lower(nombre) == "bkfc"][0]{
        _id,
        nombre
      }`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<FighterDoc[]>(
      `*[_type == "luchador"]{
        _id,
        nombre,
        disciplina,
        organizacion
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
  ]);

  return {
    disciplina: disciplina ?? undefined,
    organizacion: organizacion ?? undefined,
    fighters,
    categories,
  };
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

    let body: CreateMissingFightersBody;

    try {
      body =
        (await request.json()) as CreateMissingFightersBody;
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
    const fightCard = Array.isArray(
      body.event?.fightCard
    )
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
      disciplina,
      organizacion,
      fighters,
      categories,
    } = await fetchSanityContext();

    if (!disciplina?._id) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "No se encontró la disciplina Bare Knuckle en Sanity.",
          },
          { status: 409 }
        ),
        request
      );
    }

    if (!organizacion?._id) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "No se encontró la organización BKFC en Sanity.",
          },
          { status: 409 }
        ),
        request
      );
    }

    const bareKnuckleCategories = categories.filter(
      (category) =>
        !category.disciplina?._ref ||
        category.disciplina._ref === disciplina._id
    );

    const existingByName = new Map<
      string,
      FighterDoc
    >();

    for (const fighter of fighters) {
      const normalized = normalizeName(
        getString(fighter.nombre)
      );

      if (normalized) {
        existingByName.set(normalized, fighter);
      }
    }

    const candidates = buildCandidates(
      fightCard,
      bareKnuckleCategories
    );

    const created: CreatedFighter[] = [];
    const skipped: SkippedFighter[] = [];
    const failed: FailedFighter[] = [];

    for (const candidate of candidates) {
      const existing = existingByName.get(
        candidate.normalizedName
      );

      if (existing) {
        skipped.push({
          nombre: candidate.nombre,
          reason: "already_exists",
          existingId: existing._id.replace(
            /^drafts\./,
            ""
          ),
        });
        continue;
      }

      const documentId = `bkfc-fighter-${candidate.slug}`;
      const draftId = `drafts.${documentId}`;

      try {
        await sanityClient.createIfNotExists({
          _id: draftId,
          _type: "luchador",
          nombre: candidate.nombre,
          slug: {
            _type: "slug",
            current: candidate.slug,
          },
          disciplina: {
            _type: "reference",
            _ref: disciplina._id.replace(
              /^drafts\./,
              ""
            ),
          },
          organizacion: {
            _type: "reference",
            _ref: organizacion._id.replace(
              /^drafts\./,
              ""
            ),
          },
          ...(candidate.categoryId
            ? {
                categoriaPeso: {
                  _type: "reference",
                  _ref: candidate.categoryId.replace(
                    /^drafts\./,
                    ""
                  ),
                },
              }
            : {}),
          activo: true,
          destacadoHome: false,
        });

        created.push({
          nombre: candidate.nombre,
          documentId,
          draftId,
          categoriaPeso:
            candidate.categoryName,
        });

        existingByName.set(
          candidate.normalizedName,
          {
            _id: draftId,
            nombre: candidate.nombre,
            disciplina: {
              _ref: disciplina._id,
            },
            organizacion: {
              _ref: organizacion._id,
            },
          }
        );
      } catch (error) {
        failed.push({
          nombre: candidate.nombre,
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido creando el borrador.",
        });
      }
    }

    return withCors(
      NextResponse.json({
        ok: failed.length === 0,
        event: eventName,
        summary: {
          candidates: candidates.length,
          created: created.length,
          skipped: skipped.length,
          failed: failed.length,
        },
        created,
        skipped,
        failed,
      }),
      request
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido creando luchadores.";

    console.error(
      "Error creando luchadores faltantes desde BKFC:",
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
