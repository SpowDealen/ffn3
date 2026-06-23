
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

type ResolveBody = { event?: SourceEvent };

type ResolvedReference = {
  sourceName: string;
  normalizedName: string;
  found: boolean;
  sanityId?: string;
  sanityName?: string;
};

type ResolvedCategory = {
  sourceLabel: string;
  normalizedLabel: string;
  found: boolean;
  sanityId?: string;
  sanityName?: string;
};

type ResolvedFight = {
  sourceFightId: string;
  section: FightCardSection;
  sectionLabel: "Main Card" | "Prelims";
  order: number;
  redFighter: ResolvedReference;
  blueFighter: ResolvedReference;
  category: ResolvedCategory;
  discipline: {
    sourceLabel?: string;
    found: boolean;
    sanityId?: string;
    sanityName?: string;
  };
  titleFight: boolean;
  status: FightStatus;
  winner?: ResolvedReference;
  method?: string;
  round?: number;
  time?: string;
  readyToCreate: boolean;
  alreadyExists: boolean;
  existingSanityId?: string;
  blockingReasons: string[];
};

function resolveReference(sourceName: string, docs: FighterDoc[], discipline?: ReferenceDoc, organization?: ReferenceDoc): ResolvedReference {
  const normalizedName = normalizeName(sourceName);
  const filtered = docs.filter((fighter) => {
    const matchesOrganization =
      !organization || !fighter.organizacion?._ref || baseId(fighter.organizacion._ref) === baseId(organization._id);
    const matchesDiscipline =
      !discipline || !fighter.disciplina?._ref || baseId(fighter.disciplina._ref) === baseId(discipline._id);
    return matchesOrganization && matchesDiscipline;
  });

  const match =
    filtered.find((doc) => normalizeName(getString(doc.nombre)) === normalizedName) ||
    docs.find((doc) => normalizeName(getString(doc.nombre)) === normalizedName);

  return match
    ? { sourceName, normalizedName, found: true, sanityId: match._id, sanityName: getString(match.nombre) }
    : { sourceName, normalizedName, found: false };
}

function resolveCategoryForFight(sourceLabel: string | undefined, categories: CategoryDoc[], discipline?: ReferenceDoc): ResolvedCategory {
  const cleanSourceLabel = getString(sourceLabel);
  const normalizedLabel = normalizeWeightClass(cleanSourceLabel);
  const match = resolveCategory(cleanSourceLabel, categories, discipline);

  return match
    ? { sourceLabel: cleanSourceLabel, normalizedLabel, found: true, sanityId: match._id, sanityName: getString(match.nombre) }
    : { sourceLabel: cleanSourceLabel, normalizedLabel, found: false };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const envError = validateEnv();
    if (envError) {
      return withCors(NextResponse.json({ ok: false, error: envError }, { status: 500 }), request);
    }

    let body: ResolveBody;
    try {
      body = (await request.json()) as ResolveBody;
    } catch {
      return withCors(NextResponse.json({ ok: false, error: "El body no es un JSON válido." }, { status: 400 }), request);
    }

    const event = body.event;
    const sourceName = getString(event?.name);
    const fightCard = Array.isArray(event?.fightCard) ? event?.fightCard ?? [] : [];

    if (!sourceName) {
      return withCors(NextResponse.json({ ok: false, error: "El evento no incluye nombre." }, { status: 400 }), request);
    }

    if (fightCard.length === 0) {
      return withCors(NextResponse.json({ ok: false, error: "El evento ONE no incluye cartelera para resolver." }, { status: 400 }), request);
    }

    const context = await fetchContext();
    const organization = context.organization;
    const primaryDiscipline = findDiscipline(event?.primaryDiscipline, context.disciplines);
    const matchedEvent = findEvent(event ?? {}, context.events);

    const resolvedFights: ResolvedFight[] = fightCard.map((fight) => {
      const fightDiscipline = findDiscipline(fight.discipline, context.disciplines) || primaryDiscipline;
      const redName = getString(fight.redFighter);
      const blueName = getString(fight.blueFighter);

      const redFighter = resolveReference(redName, context.fighters, fightDiscipline, organization);
      const blueFighter = resolveReference(blueName, context.fighters, fightDiscipline, organization);
      const category = resolveCategoryForFight(fight.weightClass, context.categories, fightDiscipline);

      const winnerName = getString(fight.winnerName);
      const winner = winnerName ? resolveReference(winnerName, context.fighters, fightDiscipline, organization) : undefined;

      const blockingReasons: string[] = [];

      if (!matchedEvent) blockingReasons.push("evento_no_encontrado");
      if (!organization) blockingReasons.push("organizacion_one_no_encontrada");
      if (!fightDiscipline) blockingReasons.push("disciplina_del_combate_no_encontrada");
      if (!redFighter.found) blockingReasons.push("luchador_rojo_no_encontrado");
      if (!blueFighter.found) blockingReasons.push("luchador_azul_no_encontrado");
      if (!category.found) blockingReasons.push(getString(fight.weightClass) ? "categoria_peso_no_resuelta" : "categoria_peso_no_informada_por_fuente");
      if (fight.status === "finalizado" && winnerName && !winner?.found) blockingReasons.push("ganador_no_encontrado");

      const existingCombat = matchedEvent
        ? context.combats.find((combat) => isSameCombat(combat, matchedEvent._id, redFighter.sanityId, blueFighter.sanityId))
        : undefined;

      return {
        sourceFightId: getString(fight.id) || `${redName}-vs-${blueName}`,
        section: fight.section === "preliminar" ? "preliminar" : "principal",
        sectionLabel: fight.sectionLabel === "Prelims" ? "Prelims" : "Main Card",
        order: typeof fight.order === "number" && Number.isFinite(fight.order) ? fight.order : 1,
        redFighter,
        blueFighter,
        category,
        discipline: {
          sourceLabel: getString(fight.disciplineLabel) || getString(fight.discipline),
          found: Boolean(fightDiscipline),
          sanityId: fightDiscipline?._id,
          sanityName: fightDiscipline?.nombre,
        },
        titleFight: Boolean(fight.titleFight),
        status: fight.status === "finalizado" || fight.status === "cancelado" ? fight.status : "programado",
        winner,
        method: getString(fight.method) || undefined,
        round: typeof fight.round === "number" && Number.isFinite(fight.round) ? fight.round : undefined,
        time: getString(fight.time) || undefined,
        readyToCreate: blockingReasons.length === 0,
        alreadyExists: Boolean(existingCombat),
        existingSanityId: existingCombat?._id,
        blockingReasons,
      };
    });

    const references = uniqueByName(
      resolvedFights.flatMap((fight) => {
        const values = [fight.redFighter, fight.blueFighter];
        if (fight.winner) values.push(fight.winner);
        return values;
      }),
    );

    const categories = Array.from(
      new Map(
        resolvedFights
          .map((fight) => fight.category)
          .filter((category) => category.sourceLabel || category.normalizedLabel)
          .map((category) => [category.normalizedLabel, category]),
      ).values(),
    );

    return withCors(
      NextResponse.json({
        ok: true,
        event: {
          sourceName,
          found: Boolean(matchedEvent),
          sanityId: matchedEvent?._id,
          sanityName: matchedEvent?.nombre,
          matchStrategy: matchedEvent ? "exact_name_or_slug" : undefined,
          candidates: matchedEvent
            ? undefined
            : context.events.slice(0, 12).map((candidate) => ({
                sanityId: candidate._id,
                sanityName: candidate.nombre,
                slug: candidate.slug?.current,
                fecha: candidate.fecha,
              })),
        },
        discipline: {
          found: Boolean(primaryDiscipline),
          sanityId: primaryDiscipline?._id,
          sanityName: primaryDiscipline?.nombre,
        },
        organization: {
          found: Boolean(organization),
          sanityId: organization?._id,
          sanityName: organization?.nombre,
        },
        counts: {
          fights: resolvedFights.length,
          readyFights: resolvedFights.filter((fight) => fight.readyToCreate).length,
          existingFights: resolvedFights.filter((fight) => fight.alreadyExists).length,
          pendingFights: resolvedFights.filter((fight) => fight.readyToCreate && !fight.alreadyExists).length,
          existingFighters: references.filter((item) => item.found).length,
          missingFighters: references.filter((item) => !item.found).length,
          resolvedCategories: categories.filter((item) => item.found).length,
          unresolvedCategories: categories.filter((item) => !item.found).length,
        },
        existingFighters: references.filter((item) => item.found),
        missingFighters: references.filter((item) => !item.found),
        resolvedCategories: categories.filter((item) => item.found),
        unresolvedCategories: categories.filter((item) => !item.found),
        fights: resolvedFights,
      }),
      request,
    );
  } catch (error) {
    console.error("Error resolviendo evento ONE:", error);
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Error desconocido resolviendo evento ONE." },
        { status: 500 },
      ),
      request,
    );
  }
}
