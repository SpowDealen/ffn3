
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
type OneDisciplineKey = "mma" | "muay_thai" | "kickboxing" | "submission_grappling" | "jiu_jitsu" | "mixed";

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

type EventDoc = ReferenceDoc & {
  fecha?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

type FighterDoc = ReferenceDoc & {
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
  categoriaPeso?: { _ref?: string } | null;
};

type CategoryDoc = ReferenceDoc & {
  disciplina?: { _ref?: string } | null;
};

type CombatDoc = {
  _id: string;
  evento?: { _ref?: string } | null;
  luchadorRojo?: { _ref?: string } | null;
  luchadorAzul?: { _ref?: string } | null;
};

const CORS_METHODS = "POST, OPTIONS";

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

async function createSafeReference(targetId: string): Promise<{
  _type: "reference";
  _ref: string;
  _weak?: true;
}> {
  const publishedId = baseId(targetId);
  const publishedDocument = await sanityClient.getDocument(publishedId);
  return {
    _type: "reference",
    _ref: publishedId,
    ...(publishedDocument?._id ? {} : { _weak: true as const }),
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

function resolveByName<T extends ReferenceDoc>(name: string, docs: T[]): T | undefined {
  const normalized = normalizeName(name);
  return docs.find((doc) => normalizeName(getString(doc.nombre)) === normalized);
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

const CATEGORY_ALIASES: Record<string, string[]> = {
  "women atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "womens atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "women s atomweight": ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  atomweight: ["peso átomo femenino", "peso atomo femenino", "átomo femenino", "atomo femenino", "peso átomo", "peso atomo", "átomo", "atomo"],
  "women strawweight": ["peso paja femenino", "paja femenino", "peso paja", "paja"],
  strawweight: ["peso paja femenino", "paja femenino", "peso paja", "paja"],
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
  catchweight: ["peso pactado", "catchweight"],
};

const DISCIPLINE_ALIASES: Record<OneDisciplineKey, string[]> = {
  mma: ["mma", "artes marciales mixtas"],
  muay_thai: ["muay thai"],
  kickboxing: ["kickboxing"],
  submission_grappling: ["submission grappling", "grappling", "jiu-jitsu", "jiu jitsu", "jiujitsu", "bjj"],
  jiu_jitsu: ["jiu-jitsu", "jiu jitsu", "jiujitsu", "bjj"],
  mixed: [],
};

function disciplineCandidates(source?: OneDisciplineKey | string): string[] {
  const key = getString(source) as OneDisciplineKey;
  return DISCIPLINE_ALIASES[key]?.length ? DISCIPLINE_ALIASES[key] : ["mma", "muay thai", "kickboxing", "submission grappling", "jiu-jitsu"];
}

function findDiscipline(source: OneDisciplineKey | string | undefined, disciplines: ReferenceDoc[]): ReferenceDoc | undefined {
  const candidates = disciplineCandidates(source).map(normalizeName);
  return disciplines.find((discipline) => candidates.includes(normalizeName(getString(discipline.nombre))));
}

function resolveCategory(sourceLabel: string | undefined, categories: CategoryDoc[], discipline?: ReferenceDoc): CategoryDoc | undefined {
  const normalizedSource = normalizeWeightClass(getString(sourceLabel));
  if (!normalizedSource) return undefined;

  const aliases = CATEGORY_ALIASES[normalizedSource] ?? [normalizedSource];
  const normalizedAliases = aliases.map(normalizeName);
  const filtered = discipline
    ? categories.filter((category) => !category.disciplina?._ref || baseId(category.disciplina._ref) === baseId(discipline._id))
    : categories;

  return filtered.find((category) => normalizedAliases.includes(normalizeName(getString(category.nombre))));
}

async function fetchContext(): Promise<{
  disciplines: ReferenceDoc[];
  organization?: ReferenceDoc;
  events: EventDoc[];
  fighters: FighterDoc[];
  categories: CategoryDoc[];
  combats: CombatDoc[];
}> {
  const [disciplines, organization, events, fighters, categories, combats] = await Promise.all([
    sanityClient.fetch<ReferenceDoc[]>(`*[_type == "disciplina"]{_id,nombre,slug}`, {}, { perspective: "raw" }),
    sanityClient.fetch<ReferenceDoc | null>(
      `*[_type == "organizacion" && (
        lower(nombre) == "one championship" ||
        lower(nombre) == "one"
      )][0]{_id,nombre,slug}`,
      {},
      { perspective: "raw" }
    ),
    sanityClient.fetch<EventDoc[]>(`*[_type == "evento"]{_id,nombre,slug,fecha,disciplina,organizacion}`, {}, { perspective: "raw" }),
    sanityClient.fetch<FighterDoc[]>(`*[_type == "luchador"]{_id,nombre,slug,disciplina,organizacion,categoriaPeso}`, {}, { perspective: "raw" }),
    sanityClient.fetch<CategoryDoc[]>(`*[_type == "categoriaPeso"]{_id,nombre,slug,disciplina}`, {}, { perspective: "raw" }),
    sanityClient.fetch<CombatDoc[]>(`*[_type == "combate"]{_id,evento,luchadorRojo,luchadorAzul}`, {}, { perspective: "raw" }),
  ]);

  return {
    disciplines: preferDraft(disciplines),
    organization: organization ?? undefined,
    events: preferDraft(events),
    fighters: preferDraft(fighters),
    categories: preferDraft(categories),
    combats: preferDraft(combats),
  };
}

function findEvent(event: SourceEvent, events: EventDoc[]): EventDoc | undefined {
  const name = getString(event.name);
  const slug = createSlug(name);
  return events.find(
    (doc) =>
      normalizeName(getString(doc.nombre)) === normalizeName(name) ||
      createSlug(getString(doc.slug?.current)) === slug
  );
}

function uniqueByName<T extends { normalizedName: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.normalizedName)) continue;
    seen.add(item.normalizedName);
    output.push(item);
  }
  return output;
}

function isSameCombat(combat: CombatDoc, eventId: string, redId?: string, blueId?: string): boolean {
  return (
    baseId(combat.evento?._ref ?? "") === baseId(eventId) &&
    baseId(combat.luchadorRojo?._ref ?? "") === baseId(redId ?? "") &&
    baseId(combat.luchadorAzul?._ref ?? "") === baseId(blueId ?? "")
  );
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

type Body = {
  confirm?: boolean;
  event?: SourceEvent;
};

type FighterCandidate = {
  nombre: string;
  normalizedName: string;
  slug: string;
  discipline?: ReferenceDoc;
  category?: CategoryDoc;
  sourceDiscipline?: string;
  sourceCategory?: string;
};

function buildCandidates(event: SourceEvent, disciplines: ReferenceDoc[], categories: CategoryDoc[]): FighterCandidate[] {
  const fightCard = Array.isArray(event.fightCard) ? event.fightCard : [];
  const fallbackDiscipline = findDiscipline(event.primaryDiscipline, disciplines);
  const map = new Map<string, FighterCandidate>();

  for (const fight of fightCard) {
    const discipline = findDiscipline(fight.discipline, disciplines) || fallbackDiscipline;
    const category = resolveCategory(fight.weightClass, categories, discipline);

    for (const nombre of [getString(fight.redFighter), getString(fight.blueFighter)].filter(Boolean)) {
      const normalizedName = normalizeName(nombre);
      if (!normalizedName) continue;

      const existing = map.get(normalizedName);
      if (existing) {
        if (!existing.discipline && discipline) existing.discipline = discipline;
        if (!existing.category && category) existing.category = category;
        continue;
      }

      map.set(normalizedName, {
        nombre,
        normalizedName,
        slug: createSlug(nombre),
        discipline,
        category,
        sourceDiscipline: getString(fight.disciplineLabel) || getString(fight.discipline),
        sourceCategory: getString(fight.weightClass),
      });
    }
  }

  return Array.from(map.values());
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

    if (body.confirm !== true || !body.event) {
      return withCors(
        NextResponse.json({ ok: false, error: "Debes enviar confirm: true y un evento ONE válido." }, { status: 400 }),
        request,
      );
    }

    const eventName = getString(body.event.name);
    const fightCard = Array.isArray(body.event.fightCard) ? body.event.fightCard : [];

    if (!eventName) {
      return withCors(NextResponse.json({ ok: false, error: "Falta el nombre del evento." }, { status: 400 }), request);
    }

    if (fightCard.length === 0) {
      return withCors(NextResponse.json({ ok: false, error: "El evento no contiene cartelera válida." }, { status: 400 }), request);
    }

    const context = await fetchContext();
    const organization = context.organization;

    if (!organization?._id) {
      return withCors(
        NextResponse.json({ ok: false, error: "No se encontró la organización ONE Championship en Sanity." }, { status: 409 }),
        request,
      );
    }

    const candidates = buildCandidates(body.event, context.disciplines, context.categories);
    const existingByName = new Map<string, FighterDoc>();

    for (const fighter of context.fighters) {
      const normalized = normalizeName(getString(fighter.nombre));
      if (normalized) existingByName.set(normalized, fighter);
    }

    const created: Array<{ nombre: string; documentId: string; draftId: string; disciplina?: string; categoriaPeso?: string }> = [];
    const skipped: Array<{ nombre: string; reason: "already_exists" | "missing_discipline"; existingId?: string }> = [];
    const failed: Array<{ nombre: string; error: string }> = [];

    for (const candidate of candidates) {
      const existing = existingByName.get(candidate.normalizedName);

      if (existing) {
        skipped.push({
          nombre: candidate.nombre,
          reason: "already_exists",
          existingId: baseId(existing._id),
        });
        continue;
      }

      if (!candidate.discipline?._id) {
        skipped.push({
          nombre: candidate.nombre,
          reason: "missing_discipline",
        });
        continue;
      }

      const documentId = `one-fighter-${candidate.slug}`;
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
          disciplina: createReference(candidate.discipline._id),
          organizacion: createReference(organization._id),
          ...(candidate.category?._id
            ? {
                categoriaPeso: createReference(candidate.category._id),
              }
            : {}),
          activo: true,
          destacadoHome: false,
          descripcion: `Luchador detectado desde cartelera oficial de ONE Championship (${eventName}). Pendiente de completar perfil editorial.`,
        });

        created.push({
          nombre: candidate.nombre,
          documentId,
          draftId,
          disciplina: candidate.discipline.nombre,
          categoriaPeso: candidate.category?.nombre,
        });

        existingByName.set(candidate.normalizedName, {
          _id: draftId,
          nombre: candidate.nombre,
          disciplina: { _ref: candidate.discipline._id },
          organizacion: { _ref: organization._id },
          categoriaPeso: candidate.category?._id ? { _ref: candidate.category._id } : undefined,
        });
      } catch (error) {
        failed.push({
          nombre: candidate.nombre,
          error: error instanceof Error ? error.message : "Error desconocido creando el borrador.",
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
      request,
    );
  } catch (error) {
    console.error("Error creando luchadores ONE:", error);
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Error desconocido creando luchadores ONE." },
        { status: 500 },
      ),
      request,
    );
  }
}
