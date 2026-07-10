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
  perspective: "raw",
});

type FekmDisciplineKey = "kickboxing" | "muay_thai" | "mixed";

type SourceEvent = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  timeText?: string;
  city?: string;
  region?: string;
  country?: string;
  venue?: string;
  locationText?: string;
  description?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  status?: "proximo" | "celebrado" | "cancelado";
  discipline?: FekmDisciplineKey;
  disciplineLabel?: string;
  category?: string;
  scope?: "nacional" | "internacional" | "autonomico" | "otro";
};

type ReferenceDoc = {
  _id: string;
  nombre?: string;
  slug?: { current?: string };
};

type EventDoc = ReferenceDoc & {
  fecha?: string;
  ciudad?: string;
  pais?: string;
  disciplina?: { _ref?: string } | null;
  organizacion?: { _ref?: string } | null;
};

function allowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return "*";
  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].includes(origin)
    ? origin
    : "*";
}

function withCors(response: NextResponse, request: Request): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin(request));
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Origin");
  return response;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseId(value: string): string {
  return value.replace(/^drafts\./, "");
}

function preferDraft<T extends { _id: string }>(docs: T[]): T[] {
  const grouped = new Map<string, T>();
  for (const doc of docs) {
    const key = baseId(doc._id);
    const current = grouped.get(key);
    if (!current || doc._id.startsWith("drafts.")) grouped.set(key, doc);
  }
  return Array.from(grouped.values());
}

function sameDay(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

function nameScore(source: string, candidate: string): number {
  const a = normalize(source);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 88;

  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;
  const common = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  return Math.round((common / Math.max(aTokens.size, bTokens.size)) * 80);
}

const DISCIPLINE_ALIASES: Record<FekmDisciplineKey, string[]> = {
  kickboxing: ["kickboxing", "kick boxing", "k1", "k 1"],
  muay_thai: ["muay thai", "muaythai", "boxeo tailandes"],
  mixed: ["kickboxing", "kick boxing", "muay thai", "muaythai"],
};

function resolveDiscipline(
  source: FekmDisciplineKey,
  disciplines: ReferenceDoc[]
): ReferenceDoc | undefined {
  const aliases = DISCIPLINE_ALIASES[source] ?? [];
  return disciplines.find((doc) => {
    const name = normalize(getString(doc.nombre));
    return aliases.some((alias) => name === normalize(alias));
  });
}

function resolveOrganization(organizations: ReferenceDoc[]): ReferenceDoc | undefined {
  const aliases = [
    "fekm",
    "federacion espanola de kickboxing y muaythai",
    "federacion espanola de kickboxing y muay thai",
  ].map(normalize);

  return organizations.find((doc) => aliases.includes(normalize(getString(doc.nombre))));
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }), request);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as unknown;
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const nestedEvent = bodyRecord.event;
    const source: SourceEvent =
      nestedEvent && typeof nestedEvent === "object" && !Array.isArray(nestedEvent)
        ? (nestedEvent as SourceEvent)
        : (bodyRecord as SourceEvent);
    const name = getString(source.name);

    if (!name) {
      return withCors(
        NextResponse.json({ ok: false, error: "El evento FEKM no incluye nombre." }, { status: 400 }),
        request
      );
    }

    const [disciplineDocs, organizationDocs, eventDocs] = await Promise.all([
      sanityClient.fetch<ReferenceDoc[]>(
        `*[_type == "disciplina"]{_id,nombre,slug}`
      ),
      sanityClient.fetch<ReferenceDoc[]>(
        `*[_type == "organizacion"]{_id,nombre,slug}`
      ),
      sanityClient.fetch<EventDoc[]>(
        `*[_type == "evento"]{_id,nombre,slug,fecha,ciudad,pais,disciplina,organizacion}`
      ),
    ]);

    const disciplines = preferDraft(disciplineDocs);
    const organizations = preferDraft(organizationDocs);
    const events = preferDraft(eventDocs);

    const disciplineKey = source.discipline ?? "mixed";
    const discipline = resolveDiscipline(disciplineKey, disciplines);
    const organization = resolveOrganization(organizations);

    const rankedEvents = events
      .map((event) => {
        const score = nameScore(name, getString(event.nombre));
        const dateBonus = sameDay(source.startDate, event.fecha) ? 15 : 0;
        const cityBonus =
          source.city && event.ciudad && normalize(source.city) === normalize(event.ciudad) ? 5 : 0;
        return { event, score: Math.min(100, score + dateBonus + cityBonus) };
      })
      .filter((entry) => entry.score >= 65)
      .sort((a, b) => b.score - a.score);

    const existingEvent = rankedEvents[0];
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    if (!source.startDate) blockingReasons.push("fecha_no_resuelta");
    if (!discipline) blockingReasons.push("disciplina_no_resuelta_en_sanity");
    if (!organization) warnings.push("organizacion_fekm_no_resuelta_en_sanity");
    if (!source.imageUrl) warnings.push("evento_sin_imagen");
    if (disciplineKey === "mixed") warnings.push("evento_multidisciplina_revisar_disciplina_principal");

    return withCors(
      NextResponse.json({
        ok: true,
        source: "fekm",
        event: source,
        resolution: {
          readyToCreate: blockingReasons.length === 0 && !existingEvent,
          existing: Boolean(existingEvent),
          existingEvent: existingEvent
            ? {
                _id: existingEvent.event._id,
                nombre: existingEvent.event.nombre,
                fecha: existingEvent.event.fecha,
                confidence: existingEvent.score,
              }
            : null,
          discipline: discipline
            ? { _id: discipline._id, nombre: discipline.nombre, slug: discipline.slug }
            : null,
          organization: organization
            ? { _id: organization._id, nombre: organization.nombre, slug: organization.slug }
            : null,
          blockingReasons,
          warnings,
        },
      }),
      request
    );
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "No se pudo resolver el evento FEKM.",
        },
        { status: 500 }
      ),
      request
    );
  }
}
