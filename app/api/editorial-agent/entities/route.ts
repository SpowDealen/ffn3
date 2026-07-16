import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const client = createClient({projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!, apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01", token: process.env.SANITY_API_WRITE_TOKEN!, useCdn: false});
const headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store"};
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {status, headers});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const baseId = (value: string): string => value.replace(/^drafts\./, "");
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
type Fighter = {_id: string; nombre?: string; apodo?: string; slug?: {current?: string}; disciplina?: {_ref?: string}};

export function OPTIONS() { return new NextResponse(null, {status: 204, headers}); }
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action); const entityType = text(body.entityType);
    if (entityType !== "fighter") return json({success: false, error: "Solo se admite fighter."}, 400);
    if (action === "check_duplicate") {
      const name = text(body.name); const aliases = Array.isArray(body.aliases) ? body.aliases.map(text).filter(Boolean).slice(0, 20).map((item) => item.toLocaleLowerCase("es")) : []; const normalizedSlug = text(body.slug) || slug(name); const disciplineId = baseId(text(body.disciplineId)); const documentId = `editorial-agent-fighter-${normalizedSlug}`;
      if (!name) return json({success: false, error: "Falta name."}, 400);
      const candidates = await client.fetch<Fighter[]>(`*[_type == "luchador" && (_id in [$documentId,$draftId] || lower(nombre) == lower($name) || lower(apodo) in $aliases || slug.current == $slug)]{_id,nombre,apodo,slug,disciplina}`, {name, aliases, slug: normalizedSlug, documentId, draftId: `drafts.${documentId}`}, {perspective: "raw"});
      const unique = [...new Map(candidates.filter((item) => !disciplineId || !item.disciplina?._ref || baseId(item.disciplina._ref) === disciplineId).map((item) => [baseId(item._id), item])).entries()].map(([entityId, item]) => ({entityId, name: item.nombre || name, match: item.nombre?.toLocaleLowerCase("es") === name.toLocaleLowerCase("es") ? "exact_name" : item.slug?.current === normalizedSlug ? "slug" : "alias"}));
      return json({success: true, status: unique.length === 0 ? "none" : unique.length === 1 ? "existing" : "ambiguous", candidates: unique});
    }
    if (action === "create") {
      if (body.confirm !== true) return json({success: false, error: "Falta confirmación explícita."}, 400);
      const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {};
      const name = text(payload.nombre); const payloadSlug = payload.slug && typeof payload.slug === "object" ? text((payload.slug as Record<string, unknown>).current) : "";
      const disciplineId = payload.disciplina && typeof payload.disciplina === "object" ? baseId(text((payload.disciplina as Record<string, unknown>)._ref)) : "";
      const organizationId = payload.organizacion && typeof payload.organizacion === "object" ? baseId(text((payload.organizacion as Record<string, unknown>)._ref)) : "";
      const identityKey = `fighter:${slug(name)}`; const idempotencyKey = text(body.idempotencyKey);
      if (!name || payloadSlug !== slug(name) || !disciplineId || !organizationId || idempotencyKey !== `editorial-agent:create:fighter:${identityKey}`) return json({success: false, error: "Payload o idempotencyKey inválidos."}, 400);
      const references = await client.fetch<number>(`count(*[_id in [$disciplineId,$organizationId] || _id in [$draftDisciplineId,$draftOrganizationId]])`, {disciplineId, organizationId, draftDisciplineId: `drafts.${disciplineId}`, draftOrganizationId: `drafts.${organizationId}`}, {perspective: "raw"});
      if (references < 2) return json({success: false, error: "Disciplina u organización no existen en Sanity."}, 409);
      const documentId = `editorial-agent-fighter-${payloadSlug}`; const draftId = `drafts.${documentId}`;
      const existing = await client.fetch<Fighter | null>(`*[_type == "luchador" && (_id == $documentId || _id == $draftId || lower(nombre) == lower($name))][0]{_id,nombre}`, {documentId, draftId, name}, {perspective: "raw"});
      if (existing?._id) return json({success: true, entityId: baseId(existing._id), documentId: baseId(existing._id), alreadyExisted: true});
      await client.createIfNotExists({_id: draftId, _type: "luchador", nombre: name, slug: {_type: "slug", current: payloadSlug}, disciplina: {_type: "reference", _ref: disciplineId}, organizacion: {_type: "reference", _ref: organizationId}, activo: true, destacadoHome: false});
      return json({success: true, entityId: documentId, documentId, alreadyExisted: false});
    }
    return json({success: false, error: "Acción no soportada."}, 400);
  } catch (error) { return json({success: false, error: error instanceof Error ? error.message : "Error desconocido."}, 500); }
}
