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

function withCors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function baseId(value: string): string {
  return value.replace(/^drafts\./, "");
}

function createReference(id: string): { _type: "reference"; _ref: string; _weak?: true } {
  return { _type: "reference", _ref: baseId(id), ...(id.startsWith("drafts.") ? { _weak: true as const } : {}) };
}

export async function OPTIONS(): Promise<NextResponse> {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { confirm?: boolean };
    if (body.confirm !== true) {
      return withCors(NextResponse.json({ ok: false, error: "Debes confirmar la creación de FEKM." }, { status: 400 }));
    }

    const existing = await sanityClient.fetch<{ _id: string; nombre?: string } | null>(
      `*[_type == "organizacion" && (lower(nombre) match "*fekm*" || slug.current == "fekm" || lower(nombre) match "*federacion espanola de kickboxing*")][0]{_id,nombre}`
    );

    if (existing) {
      return withCors(NextResponse.json({ ok: true, skipped: true, message: "La organización FEKM ya existe en Sanity.", organization: existing }));
    }

    const disciplines = await sanityClient.fetch<Array<{ _id: string; nombre?: string }>>(
      `*[_type == "disciplina" && (lower(nombre) match "*kick*boxing*" || lower(nombre) match "*muay*thai*")]{_id,nombre}`
    );

    if (disciplines.length === 0) {
      return withCors(NextResponse.json({ ok: false, error: "No se encontraron las disciplinas Kickboxing o Muay Thai en Sanity." }, { status: 409 }));
    }

    const documentId = "fekm";
    await sanityClient.createOrReplace({
      _id: `drafts.${documentId}`,
      _type: "organizacion",
      nombre: "Federación Española de Kickboxing y Muaythai",
      slug: { _type: "slug", current: "fekm" },
      descripcionCorta: "Federación nacional responsable del kickboxing y el muay thai en España.",
      descripcion: "La Federación Española de Kickboxing y Muaythai organiza y coordina competiciones, selecciones nacionales, formación y actividad federativa de ambas disciplinas en España.",
      paisOrigen: "España",
      sede: "España",
      identidad: "Entidad federativa nacional vinculada a la estructura competitiva, formativa e institucional del kickboxing y el muay thai español.",
      datosCuriosos: [],
      disciplinas: disciplines.map((item) => createReference(item._id)),
      sitioWeb: "https://fekm.es/",
      activa: true,
    });

    return withCors(NextResponse.json({
      ok: true,
      skipped: false,
      message: "Organización FEKM creada como borrador en Sanity.",
      organization: { _id: `drafts.${documentId}`, nombre: "Federación Española de Kickboxing y Muaythai" },
      warnings: ["La organización se crea sin logo ni banner; añádelos antes de publicar."],
    }));
  } catch (error) {
    return withCors(NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo crear FEKM." }, { status: 500 }));
  }
}
