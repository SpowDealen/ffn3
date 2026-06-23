
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

type RequestBody = {
  confirm?: boolean;
  event?: SourceEvent;
};

type TransformResponse =
  | {
      ok: true;
      data: {
        nombre: string;
        horaLocal: string;
        ciudad: string;
        pais: string;
        recinto: string;
        cartelPrincipal: string;
        dondeVer: string;
        descripcionCorta: string;
        descripcion: string;
        notas: string;
      };
    }
  | {
      ok: false;
      error?: string;
    };

type SaveDraftResponse =
  | {
      ok: true;
      documentId?: string;
      documentType?: string;
      imageAssetId?: string;
      message?: string;
    }
  | {
      ok: false;
      error?: string;
      message?: string;
    };

async function findExistingEvent(params: {
  slug: string;
  name: string;
}): Promise<EventDoc | null> {
  return sanityClient.fetch<EventDoc | null>(
    `*[
      _type == "evento" &&
      (
        slug.current == $slug ||
        lower(nombre) == lower($name)
      )
    ][0]{
      _id,
      nombre,
      slug,
      fecha,
      disciplina,
      organizacion
    }`,
    params,
    { perspective: "raw" },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const envError = validateEnv();
    if (envError) {
      return withCors(NextResponse.json({ ok: false, error: envError }, { status: 500 }), request);
    }

    let body: RequestBody;
    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return withCors(NextResponse.json({ ok: false, error: "El body no es un JSON válido." }, { status: 400 }), request);
    }

    if (body.confirm !== true || !body.event) {
      return withCors(
        NextResponse.json({ ok: false, error: "Debes enviar confirm: true y un evento ONE válido." }, { status: 400 }),
        request,
      );
    }

    const event = body.event;
    const name = getString(event.name);
    const startDate = getString(event.startDate);
    const imageUrl = getString(event.imageUrl);

    if (!name) {
      return withCors(NextResponse.json({ ok: false, error: "El evento no incluye nombre." }, { status: 400 }), request);
    }

    if (!startDate) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "El evento ONE no incluye una fecha válida y no se puede crear con seguridad." },
          { status: 400 },
        ),
        request,
      );
    }

    if (!imageUrl) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "El evento ONE no incluye imagen oficial válida." },
          { status: 400 },
        ),
        request,
      );
    }

    const slug = createSlug(name) || createSlug(getString(event.id)) || `one-event-${Date.now()}`;
    const existingEvent = await findExistingEvent({ slug, name });

    if (existingEvent) {
      return withCors(
        NextResponse.json({
          ok: true,
          skipped: true,
          message: "El evento ONE ya existe en Sanity.",
          event: {
            sourceName: name,
            sanityId: existingEvent._id,
            sanityName: existingEvent.nombre,
            slug: existingEvent.slug?.current,
          },
        }),
        request,
      );
    }

    const context = await fetchContext();
    const organization = context.organization;
    const primaryDiscipline = findDiscipline(event.primaryDiscipline, context.disciplines);

    if (!organization?._id) {
      return withCors(
        NextResponse.json({ ok: false, error: "No se encontró la organización ONE Championship en Sanity." }, { status: 409 }),
        request,
      );
    }

    if (!primaryDiscipline?._id) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              "No se encontró una disciplina compatible para este evento ONE en Sanity. Revisa MMA, Muay Thai, Kickboxing o Submission Grappling.",
          },
          { status: 409 },
        ),
        request,
      );
    }

    const baseUrl = new URL(request.url).origin;
    const transformResponse = await fetch(`${baseUrl}/api/transformar-evento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...event,
        headline: event.headline || event.mainEvent,
        description:
          getString(event.description) ||
          `Evento oficial de ONE Championship con cartelera de ${event.primaryDisciplineLabel || primaryDiscipline.nombre}.`,
      }),
      cache: "no-store",
    });

    const transformed = (await transformResponse.json()) as TransformResponse;

    if (!transformResponse.ok || !transformed.ok) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              !transformed.ok && transformed.error
                ? transformed.error
                : "No se pudo transformar editorialmente el evento ONE.",
          },
          { status: 502 },
        ),
        request,
      );
    }

    const documentId = `one-event-${slug}`;

    const document: Record<string, unknown> = {
      _id: documentId,
      _type: "evento",
      nombre: transformed.data.nombre || name,
      slug: {
        _type: "slug",
        current: slug,
      },
      organizacion: createReference(organization._id),
      disciplina: createReference(primaryDiscipline._id),
      fecha: startDate,
      horaLocal: transformed.data.horaLocal,
      ciudad: transformed.data.ciudad || getString(event.city),
      pais: transformed.data.pais || getString(event.country),
      recinto: transformed.data.recinto || getString(event.venue),
      cartelPrincipal: transformed.data.cartelPrincipal || getString(event.mainEvent),
      dondeVer: transformed.data.dondeVer || getString(event.watchText) || "ONE Championship / onefc.com",
      descripcionCorta: transformed.data.descripcionCorta,
      descripcion: transformed.data.descripcion,
      notas:
        transformed.data.notas ||
        `Fuente oficial: ${getString(event.canonicalUrl) || getString(event.sourceUrl)}. Disciplina principal inferida: ${
          event.primaryDisciplineLabel || primaryDiscipline.nombre
        }.`,
      imagen: imageUrl,
      estado:
        event.status === "celebrado" || event.status === "cancelado"
          ? event.status
          : "proximo",
    };

    const saveResponse = await fetch(`${baseUrl}/api/guardar-borrador`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        contentType: "evento",
        document,
      }),
      cache: "no-store",
    });

    const saved = (await saveResponse.json()) as SaveDraftResponse;

    if (!saveResponse.ok || !saved.ok) {
      return withCors(
        NextResponse.json(
          {
            ok: false,
            error:
              !saved.ok
                ? saved.error || saved.message || "No se pudo guardar el borrador del evento ONE."
                : "No se pudo guardar el borrador del evento ONE.",
          },
          { status: 502 },
        ),
        request,
      );
    }

    return withCors(
      NextResponse.json({
        ok: true,
        skipped: false,
        message: "Evento ONE transformado y guardado como borrador.",
        event: {
          sourceName: name,
          documentId: saved.documentId,
          documentType: saved.documentType,
          imageAssetId: saved.imageAssetId,
          slug,
          disciplineId: primaryDiscipline._id,
          organizationId: organization._id,
        },
      }),
      request,
    );
  } catch (error) {
    console.error("Error creando evento ONE:", error);
    return withCors(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Error desconocido creando evento ONE." },
        { status: 500 },
      ),
      request,
    );
  }
}
