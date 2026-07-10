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

type SourceEvent = {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  timeText?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  description?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  imageUrl?: string;
  status?: "proximo" | "celebrado" | "cancelado";
  discipline?: "kickboxing" | "muay_thai" | "mixed";
  disciplineLabel?: string;
};

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getString(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function stripDiacritics(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function slugify(value: string): string { return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96); }
function baseId(value: string): string { return value.replace(/^drafts\./, ""); }
function createReference(id: string): { _type: "reference"; _ref: string; _weak?: true } {
  return { _type: "reference", _ref: baseId(id), ...(id.startsWith("drafts.") ? { _weak: true as const } : {}) };
}

export async function OPTIONS(): Promise<NextResponse> { return withCors(new NextResponse(null, { status: 204 })); }

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { confirm?: boolean; event?: SourceEvent };
    if (body.confirm !== true || !body.event) {
      return withCors(NextResponse.json({ ok: false, error: "Debes enviar confirm: true y un evento FEKM válido." }, { status: 400 }));
    }

    const event = body.event;
    const name = getString(event.name);
    const startDate = getString(event.startDate);
    if (!name || !startDate) {
      return withCors(NextResponse.json({ ok: false, error: "El evento necesita nombre y fecha." }, { status: 400 }));
    }

    const slug = slugify(name) || `fekm-event-${Date.now()}`;
    const existing = await sanityClient.fetch<{ _id: string; nombre?: string } | null>(
      `*[_type == "evento" && (slug.current == $slug || lower(nombre) == lower($name))][0]{_id,nombre}`,
      { slug, name }
    );
    if (existing) {
      return withCors(NextResponse.json({ ok: true, skipped: true, message: "El evento FEKM ya existe en Sanity.", event: existing }));
    }

    const disciplineSearch = event.discipline === "muay_thai" ? "muay thai" : "kick boxing";
    const [discipline, organization] = await Promise.all([
      sanityClient.fetch<{ _id: string; nombre?: string } | null>(
        `*[_type == "disciplina" && lower(nombre) match $search][0]{_id,nombre}`,
        { search: `*${disciplineSearch.replace(" ", "*")}*` }
      ),
      sanityClient.fetch<{ _id: string; nombre?: string } | null>(
        `*[_type == "organizacion" && (lower(nombre) match "*fekm*" || slug.current == "fekm" || lower(nombre) match "*federacion espanola de kickboxing*")][0]{_id,nombre}`
      ),
    ]);

    if (!discipline) return withCors(NextResponse.json({ ok: false, error: "No se pudo resolver la disciplina en Sanity." }, { status: 409 }));
    if (!organization) return withCors(NextResponse.json({ ok: false, error: "Primero crea la organización FEKM en Sanity." }, { status: 409 }));

    const sourceUrl = getString(event.canonicalUrl) || getString(event.sourceUrl);
    const location = getString(event.locationText) || [getString(event.city), getString(event.region), getString(event.country)].filter(Boolean).join(", ");
    const description = getString(event.description) || `Evento oficial de ${event.disciplineLabel || "FEKM"}${location ? ` celebrado en ${location}` : ""}.`;
    const documentId = `drafts.fekm-event-${slug}`;

    const imageUrl = getString(event.imageUrl);
    const document = {
      _id: documentId,
      _type: "evento" as const,
      nombre: name,
      slug: { _type: "slug" as const, current: slug },
      organizacion: createReference(organization._id),
      disciplina: createReference(discipline._id),
      fecha: startDate,
      horaLocal: getString(event.timeText).split("-")[0]?.trim() || "",
      ciudad: getString(event.city),
      pais: getString(event.country) || (getString(event.region) === "España" ? "España" : ""),
      recinto: getString(event.venue),
      descripcionCorta: description.slice(0, 280),
      descripcion: `${description}${sourceUrl ? ` Fuente oficial: ${sourceUrl}` : ""}`,
      notas: [event.endDate ? `Fecha de finalización: ${event.endDate}.` : "", sourceUrl ? `Fuente oficial FEKM: ${sourceUrl}` : ""].filter(Boolean).join("\n"),
      estado: event.status === "cancelado" || event.status === "celebrado" ? event.status : "proximo",
      ...(imageUrl ? { imagen: imageUrl } : {}),
    };

    await sanityClient.createOrReplace(document);

    return withCors(NextResponse.json({
      ok: true,
      skipped: false,
      message: "Evento FEKM guardado como borrador en Sanity.",
      event: { documentId, slug, disciplineId: discipline._id, organizationId: organization._id },
      warnings: getString(event.imageUrl) ? [] : ["El evento se ha creado sin imagen; añádela antes de publicar."],
    }));
  } catch (error) {
    return withCors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo crear el evento FEKM." }, { status: 500 }));
  }
}
