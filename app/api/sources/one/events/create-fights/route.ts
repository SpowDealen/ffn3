
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

function containsEditorialNoise(value: string): boolean {
  const normalized = getString(value).toLowerCase();

  return (
    /\bone\s+(fight\s+night|friday\s+fights|championship|samurai)\b/.test(normalized) ||
    /\b(the\s+inner\s+circle|prime\s+video|full\s+card|results?|highlights?|watch|preview|reasons?\s+to\s+watch)\b/.test(normalized) ||
    /\b(added\s+to|set\s+for|announced|revealed|live\s+on|on\s+prime\s+video|june|july|august|september|october|november|december)\b/.test(normalized) ||
    /\b(news|tickets|how\s+to\s+watch|press\s+conference|weigh-ins?)\b/.test(normalized)
  );
}

function getSourceFightQualityReasons(fight: SourceFight): string[] {
  const redName = getString(fight.redFighter);
  const blueName = getString(fight.blueFighter);
  const label = `${redName} vs ${blueName}`;
  const reasons: string[] = [];

  if (!redName || !blueName) reasons.push("combate_sin_luchadores_validos");
  if (redName && blueName && normalizeName(redName) === normalizeName(blueName)) {
    reasons.push("luchadores_duplicados_en_fuente");
  }
  if (redName.length > 60 || blueName.length > 60) reasons.push("nombre_luchador_demasiado_largo");
  if (/[,:;|]/.test(redName) || /[,:;|]/.test(blueName)) reasons.push("nombre_luchador_con_ruido_editorial");
  if (containsEditorialNoise(redName) || containsEditorialNoise(blueName) || containsEditorialNoise(label)) {
    reasons.push("combate_descartado_por_ruido_fuente");
  }

  return Array.from(new Set(reasons));
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

type BlockedFight = {
  sourceFightId?: string;
  combate: string;
  reasons: string[];
  weightClass?: string;
  discipline?: string;
};

function buildFightDocumentId(params: {
  eventId: string;
  redFighter: string;
  blueFighter: string;
}): string {
  const eventPart = createSlug(baseId(params.eventId));
  const redPart = createSlug(params.redFighter);
  const bluePart = createSlug(params.blueFighter);
  return `one-fight-${eventPart}-${redPart}-vs-${bluePart}`.slice(0, 200);
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
    const event = findEvent(body.event, context.events);

    if (!event?._id) {
      return withCors(
        NextResponse.json({ ok: false, error: "No se encontró el evento ONE en Sanity por nombre o slug." }, { status: 409 }),
        request,
      );
    }

    const fallbackDiscipline = findDiscipline(body.event.primaryDiscipline, context.disciplines);
    const created: CreatedFight[] = [];
    const skipped: SkippedFight[] = [];
    const blocked: BlockedFight[] = [];

    for (const sourceFight of fightCard) {
      const redName = getString(sourceFight.redFighter);
      const blueName = getString(sourceFight.blueFighter);
      const fightLabel = redName && blueName ? `${redName} vs ${blueName}` : getString(sourceFight.id) || "Combate sin nombre";
      const fightDiscipline = findDiscipline(sourceFight.discipline, context.disciplines) || fallbackDiscipline;
      const category = resolveCategory(sourceFight.weightClass, context.categories, fightDiscipline);

      const redFighter = resolveByName(redName, context.fighters);
      const blueFighter = resolveByName(blueName, context.fighters);

      const reasons: string[] = getSourceFightQualityReasons(sourceFight);

      if (!fightDiscipline?._id) reasons.push("disciplina_del_combate_no_encontrada");
      if (!redName || !redFighter?._id) reasons.push("luchador_rojo_no_encontrado");
      if (!blueName || !blueFighter?._id) reasons.push("luchador_azul_no_encontrado");
      if (!category?._id) {
        reasons.push(
          getString(sourceFight.weightClass)
            ? "categoria_peso_no_resuelta"
            : "categoria_peso_no_informada_por_fuente",
        );
      }

      const status: FightStatus =
        sourceFight.status === "finalizado" || sourceFight.status === "cancelado"
          ? sourceFight.status
          : "programado";

      const winnerName = getString(sourceFight.winnerName);
      const winner = winnerName ? resolveByName(winnerName, context.fighters) : undefined;

      if (status === "finalizado" && winnerName && !winner?._id) {
        reasons.push("ganador_no_encontrado");
      }

      if (reasons.length > 0) {
        blocked.push({
          sourceFightId: getString(sourceFight.id) || undefined,
          combate: fightLabel,
          reasons,
          weightClass: getString(sourceFight.weightClass) || undefined,
          discipline: getString(sourceFight.disciplineLabel) || getString(sourceFight.discipline) || undefined,
        });
        continue;
      }

      const existingCombat = context.combats.find((combat) =>
        isSameCombat(combat, event._id, redFighter?._id, blueFighter?._id),
      );

      if (existingCombat?._id) {
        skipped.push({
          sourceFightId: getString(sourceFight.id) || undefined,
          combate: fightLabel,
          reason: "already_exists",
          existingId: baseId(existingCombat._id),
        });
        continue;
      }

      const documentId = buildFightDocumentId({
        eventId: event._id,
        redFighter: redName,
        blueFighter: blueName,
      });
      const draftId = `drafts.${documentId}`;

      const cartelera: FightCardSection = sourceFight.section === "preliminar" ? "preliminar" : "principal";
      const orden =
        typeof sourceFight.order === "number" &&
        Number.isInteger(sourceFight.order) &&
        sourceFight.order >= 1
          ? sourceFight.order
          : 1;

      const [eventReference, redReference, blueReference, categoryReference, winnerReference] =
        await Promise.all([
          createSafeReference(event._id),
          createSafeReference(redFighter!._id),
          createSafeReference(blueFighter!._id),
          createSafeReference(category!._id),
          winner?._id ? createSafeReference(winner._id) : Promise.resolve(undefined),
        ]);

      await sanityClient.createIfNotExists({
        _id: draftId,
        _type: "combate",
        evento: eventReference,
        luchadorRojo: redReference,
        luchadorAzul: blueReference,
        ...(status === "finalizado" && winnerReference ? { ganador: winnerReference } : {}),
        ...(getString(sourceFight.method) ? { metodo: getString(sourceFight.method) } : {}),
        ...(typeof sourceFight.round === "number" && Number.isInteger(sourceFight.round) && sourceFight.round >= 1
          ? { asalto: sourceFight.round }
          : {}),
        ...(getString(sourceFight.time) ? { tiempo: getString(sourceFight.time) } : {}),
        categoriaPeso: categoryReference,
        tituloEnJuego: Boolean(sourceFight.titleFight),
        cartelera,
        orden,
        estado: status,
        resumen: `${fightLabel} en ${eventName}. Disciplina detectada: ${fightDiscipline?.nombre ?? "sin resolver"}.`,
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
          skipped: skipped.length + blocked.length,
          failed: 0,
        },
        created,
        skipped,
        blocked,
        failed: [],
      }),
      request,
    );
  } catch (error) {
    console.error("Error creando combates ONE:", error);
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Error desconocido creando combates ONE." },
        { status: 500 },
      ),
      request,
    );
  }
}
