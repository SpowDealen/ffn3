import { NextResponse } from "next/server";
import { createClient } from "@sanity/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01",
  token: process.env.SANITY_API_WRITE_TOKEN!,
  useCdn: false,
});

type FightCardSection = "principal" | "preliminar";
type FightStatus = "programado" | "finalizado" | "cancelado";
type OneDisciplineKey =
  | "mma"
  | "muay_thai"
  | "kickboxing"
  | "submission_grappling"
  | "jiu_jitsu"
  | "mixed";

type SourceFight = {
  id?: string;
  section?: FightCardSection;
  sectionLabel?: "Main Card" | "Prelims";
  order?: number;
  redFighter?: string;
  blueFighter?: string;
  weightClass?: string;
  discipline?: OneDisciplineKey;
  disciplineLabel?: string;
  titleFight?: boolean;
  status?: FightStatus;
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type SourceEvent = {
  id?: string;
  name?: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  status?: "proximo" | "celebrado" | "cancelado";
  primaryDiscipline?: OneDisciplineKey;
  primaryDisciplineLabel?: string;
  fightCard?: SourceFight[];
};

type ReferenceDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
};

type CategoryDoc = ReferenceDoc & {
  disciplina?: { _ref?: string } | null;
};

type Body = {
  confirm?: boolean;
  event?: SourceEvent;
};

type CategoryDefinition = {
  sourceLabel: string;
  normalizedLabel: string;
  nombre: string;
  slugBase: string;
  limitePeso: number;
  unidad: "lb";
  descripcionBase: string;
};

type CategoryCandidate = CategoryDefinition & {
  discipline: ReferenceDoc;
  sourceDiscipline?: string;
};

const CORS_METHODS = "POST, OPTIONS";

const CATEGORY_DEFINITIONS: Record<string, Omit<CategoryDefinition, "sourceLabel" | "normalizedLabel">> = {
  atomweight: {
    nombre: "Peso átomo",
    slugBase: "peso-atomo",
    limitePeso: 115,
    unidad: "lb",
    descripcionBase: "Categoría de peso átomo en ONE Championship, con límite aproximado de 115 libras.",
  },
  "women atomweight": {
    nombre: "Peso átomo femenino",
    slugBase: "peso-atomo-femenino",
    limitePeso: 115,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso átomo en ONE Championship, con límite aproximado de 115 libras.",
  },
  "womens atomweight": {
    nombre: "Peso átomo femenino",
    slugBase: "peso-atomo-femenino",
    limitePeso: 115,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso átomo en ONE Championship, con límite aproximado de 115 libras.",
  },
  "women s atomweight": {
    nombre: "Peso átomo femenino",
    slugBase: "peso-atomo-femenino",
    limitePeso: 115,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso átomo en ONE Championship, con límite aproximado de 115 libras.",
  },
  strawweight: {
    nombre: "Peso paja",
    slugBase: "peso-paja",
    limitePeso: 125,
    unidad: "lb",
    descripcionBase: "Categoría de peso paja en ONE Championship, con límite aproximado de 125 libras.",
  },
  "women strawweight": {
    nombre: "Peso paja femenino",
    slugBase: "peso-paja-femenino",
    limitePeso: 125,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso paja en ONE Championship, con límite aproximado de 125 libras.",
  },
  flyweight: {
    nombre: "Peso mosca",
    slugBase: "peso-mosca",
    limitePeso: 135,
    unidad: "lb",
    descripcionBase: "Categoría de peso mosca en ONE Championship, con límite aproximado de 135 libras.",
  },
  "women flyweight": {
    nombre: "Peso mosca femenino",
    slugBase: "peso-mosca-femenino",
    limitePeso: 135,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso mosca en ONE Championship, con límite aproximado de 135 libras.",
  },
  bantamweight: {
    nombre: "Peso gallo",
    slugBase: "peso-gallo",
    limitePeso: 145,
    unidad: "lb",
    descripcionBase: "Categoría de peso gallo en ONE Championship, con límite aproximado de 145 libras.",
  },
  "women bantamweight": {
    nombre: "Peso gallo femenino",
    slugBase: "peso-gallo-femenino",
    limitePeso: 145,
    unidad: "lb",
    descripcionBase: "Categoría femenina de peso gallo en ONE Championship, con límite aproximado de 145 libras.",
  },
  featherweight: {
    nombre: "Peso pluma",
    slugBase: "peso-pluma",
    limitePeso: 155,
    unidad: "lb",
    descripcionBase: "Categoría de peso pluma en ONE Championship, con límite aproximado de 155 libras.",
  },
  lightweight: {
    nombre: "Peso ligero",
    slugBase: "peso-ligero",
    limitePeso: 170,
    unidad: "lb",
    descripcionBase: "Categoría de peso ligero en ONE Championship, con límite aproximado de 170 libras.",
  },
  welterweight: {
    nombre: "Peso wélter",
    slugBase: "peso-welter",
    limitePeso: 185,
    unidad: "lb",
    descripcionBase: "Categoría de peso wélter en ONE Championship, con límite aproximado de 185 libras.",
  },
  middleweight: {
    nombre: "Peso medio",
    slugBase: "peso-medio",
    limitePeso: 205,
    unidad: "lb",
    descripcionBase: "Categoría de peso medio en ONE Championship, con límite aproximado de 205 libras.",
  },
  "light heavyweight": {
    nombre: "Peso semipesado",
    slugBase: "peso-semipesado",
    limitePeso: 225,
    unidad: "lb",
    descripcionBase: "Categoría de peso semipesado en ONE Championship, con límite aproximado de 225 libras.",
  },
  heavyweight: {
    nombre: "Peso pesado",
    slugBase: "peso-pesado",
    limitePeso: 265,
    unidad: "lb",
    descripcionBase: "Categoría de peso pesado en ONE Championship, con límite aproximado de 265 libras.",
  },
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  "women atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "womens atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "women s atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  atomweight: ["peso átomo femenino", "peso atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "women strawweight": ["peso paja femenino", "paja femenino", "peso paja", "paja"],
  strawweight: ["peso paja", "paja"],
  "women flyweight": ["peso mosca femenino", "mosca femenino", "peso mosca", "mosca"],
  flyweight: ["peso mosca", "mosca"],
  "women bantamweight": ["peso gallo femenino", "gallo femenino", "peso gallo", "gallo"],
  bantamweight: ["peso gallo", "gallo"],
  featherweight: ["peso pluma", "pluma"],
  lightweight: ["peso ligero", "ligero"],
  welterweight: ["peso wélter", "peso welter", "wélter", "welter"],
  middleweight: ["peso medio", "medio"],
  "light heavyweight": ["peso semipesado", "semipesado"],
  heavyweight: ["peso pesado", "pesado"],
};

const DISCIPLINE_ALIASES: Record<OneDisciplineKey, string[]> = {
  mma: ["mma", "artes marciales mixtas"],
  muay_thai: ["muay thai"],
  kickboxing: ["kickboxing"],
  submission_grappling: ["submission grappling", "grappling", "jiu-jitsu", "jiu jitsu", "jiujitsu", "bjj"],
  jiu_jitsu: ["jiu-jitsu", "jiu jitsu", "jiujitsu", "bjj"],
  mixed: [],
};

function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return "*";

  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  return allowedOrigins.has(origin) ? origin : "*";
}

function withCors(response: NextResponse, request: Request): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Vary", "Origin");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

function baseId(value: string): string {
  return value.replace(/^drafts\./, "");
}

function createReference(id: string): { _type: "reference"; _ref: string } {
  return { _type: "reference", _ref: baseId(id) };
}

function normalizeWeightClass(value: string): string {
  return normalizeName(
    value
      .replace(/\bwomen's\b/gi, "women")
      .replace(/\bwoman's\b/gi, "women")
      .replace(/\bmen's\b/gi, "men")
      .replace(/\bwomens\b/gi, "women")
      .replace(/\bmens\b/gi, "men")
      .replace(/\binterim\b/gi, "")
      .replace(/\btitle\b/gi, "")
      .replace(/\bbout\b/gi, "")
      .replace(/\bchampionship\b/gi, "")
      .replace(/\bfight\b/gi, "")
      .replace(/\bdivision\b/gi, "")
  )
    .replace(/\bwomen s\b/g, "women")
    .replace(/\bwoman s\b/g, "women")
    .replace(/\bmen s\b/g, "men")
    .replace(/\s+/g, " ")
    .trim();
}

function disciplineCandidates(source?: OneDisciplineKey | string): string[] {
  const key = getString(source) as OneDisciplineKey;
  return DISCIPLINE_ALIASES[key]?.length ? DISCIPLINE_ALIASES[key] : ["mma", "muay thai", "kickboxing", "submission grappling", "jiu-jitsu"];
}

function findDiscipline(source: OneDisciplineKey | string | undefined, disciplines: ReferenceDoc[]): ReferenceDoc | undefined {
  const candidates = disciplineCandidates(source).map(normalizeName);
  return disciplines.find((discipline) => candidates.includes(normalizeName(getString(discipline.nombre))));
}

function resolveExistingCategory(sourceLabel: string, categories: CategoryDoc[], discipline: ReferenceDoc): CategoryDoc | undefined {
  const normalizedSource = normalizeWeightClass(sourceLabel);
  const aliases = CATEGORY_ALIASES[normalizedSource] ?? [normalizedSource];
  const normalizedAliases = aliases.map(normalizeName);

  return categories.find((category) => {
    const categoryDisciplineId = category.disciplina?._ref ? baseId(category.disciplina._ref) : "";
    const matchesDiscipline = !categoryDisciplineId || categoryDisciplineId === baseId(discipline._id);
    return matchesDiscipline && normalizedAliases.includes(normalizeName(getString(category.nombre)));
  });
}

function getCategoryDefinition(sourceLabel: string): CategoryDefinition | undefined {
  const normalizedLabel = normalizeWeightClass(sourceLabel);
  if (!normalizedLabel || normalizedLabel === "catchweight") return undefined;

  const baseDefinition = CATEGORY_DEFINITIONS[normalizedLabel];
  if (!baseDefinition) return undefined;

  return {
    sourceLabel,
    normalizedLabel,
    ...baseDefinition,
  };
}

function buildCandidates(event: SourceEvent, disciplines: ReferenceDoc[], categories: CategoryDoc[]): CategoryCandidate[] {
  const fightCard = Array.isArray(event.fightCard) ? event.fightCard : [];
  const fallbackDiscipline = findDiscipline(event.primaryDiscipline, disciplines);
  const candidates = new Map<string, CategoryCandidate>();

  for (const fight of fightCard) {
    const sourceWeight = getString(fight.weightClass);
    if (!sourceWeight) continue;

    const definition = getCategoryDefinition(sourceWeight);
    if (!definition) continue;

    const discipline = findDiscipline(fight.discipline, disciplines) || fallbackDiscipline;
    if (!discipline?._id) continue;

    const existing = resolveExistingCategory(sourceWeight, categories, discipline);
    if (existing) continue;

    const key = `${baseId(discipline._id)}::${definition.normalizedLabel}`;
    if (candidates.has(key)) continue;

    candidates.set(key, {
      ...definition,
      discipline,
      sourceDiscipline: getString(fight.disciplineLabel) || getString(fight.discipline),
    });
  }

  return Array.from(candidates.values());
}

function validateEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) return "Falta NEXT_PUBLIC_SANITY_PROJECT_ID.";
  if (!process.env.NEXT_PUBLIC_SANITY_DATASET) return "Falta NEXT_PUBLIC_SANITY_DATASET.";
  if (!process.env.SANITY_API_WRITE_TOKEN) return "Falta SANITY_API_WRITE_TOKEN.";
  return null;
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }), request);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const envError = validateEnv();
    if (envError) {
      return withCors(NextResponse.json({ ok: false, error: envError }, { status: 500 }), request);
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return withCors(NextResponse.json({ ok: false, error: "El body no es un JSON válido." }, { status: 400 }), request);
    }

    if (!body.confirm) {
      return withCors(
        NextResponse.json({ ok: false, error: "Falta confirmación explícita para crear categorías ONE." }, { status: 400 }),
        request,
      );
    }

    const eventName = getString(body.event?.name);
    const fightCard = Array.isArray(body.event?.fightCard) ? body.event?.fightCard ?? [] : [];

    if (!eventName) {
      return withCors(NextResponse.json({ ok: false, error: "Falta el nombre del evento ONE." }, { status: 400 }), request);
    }

    if (fightCard.length === 0) {
      return withCors(NextResponse.json({ ok: false, error: "El evento ONE no contiene cartelera válida." }, { status: 400 }), request);
    }

    const [disciplines, categories] = await Promise.all([
      sanityClient.fetch<ReferenceDoc[]>(`*[_type == "disciplina"]{_id,nombre,slug}`, {}, { perspective: "raw" }),
      sanityClient.fetch<CategoryDoc[]>(`*[_type == "categoriaPeso"]{_id,nombre,slug,disciplina}`, {}, { perspective: "raw" }),
    ]);

    const candidates = buildCandidates(body.event ?? {}, disciplines, categories);
    const created: Array<{ nombre: string; documentId: string; draftId: string; disciplina?: string; limitePeso: number; unidad: "lb" }> = [];
    const skipped: Array<{ sourceLabel: string; reason: string; disciplina?: string }> = [];
    const failed: Array<{ sourceLabel: string; error: string; disciplina?: string }> = [];

    for (const candidate of candidates) {
      const disciplineSlug = createSlug(getString(candidate.discipline.nombre) || "disciplina");
      const documentId = `one-category-${candidate.slugBase}-${disciplineSlug}`;
      const draftId = `drafts.${documentId}`;

      try {
        await sanityClient.createIfNotExists({
          _id: draftId,
          _type: "categoriaPeso",
          nombre: candidate.nombre,
          slug: {
            _type: "slug",
            current: `${candidate.slugBase}-${disciplineSlug}-one`,
          },
          disciplina: createReference(candidate.discipline._id),
          limitePeso: candidate.limitePeso,
          unidad: candidate.unidad,
          descripcion: `${candidate.descripcionBase} Creada automáticamente desde la cartelera oficial de ONE Championship (${eventName}).`,
        });

        created.push({
          nombre: candidate.nombre,
          documentId,
          draftId,
          disciplina: candidate.discipline.nombre,
          limitePeso: candidate.limitePeso,
          unidad: candidate.unidad,
        });
      } catch (error) {
        failed.push({
          sourceLabel: candidate.sourceLabel,
          disciplina: candidate.discipline.nombre,
          error: error instanceof Error ? error.message : "Error desconocido creando la categoría.",
        });
      }
    }

    const unresolvedSourceWeights = Array.from(
      new Set(
        fightCard
          .map((fight) => getString(fight.weightClass))
          .filter((weightClass) => Boolean(weightClass) && !getCategoryDefinition(weightClass)),
      ),
    );

    for (const sourceLabel of unresolvedSourceWeights) {
      skipped.push({
        sourceLabel,
        reason: "categoria_sin_mapeo_seguro_o_peso_pactado",
      });
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
      request,
    );
  } catch (error) {
    console.error("Error creando categorías ONE:", error);
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Error desconocido creando categorías ONE." },
        { status: 500 },
      ),
      request,
    );
  }
}
