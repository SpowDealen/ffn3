import {createClient} from "@sanity/client";
import {NextResponse} from "next/server";
import {validatePreparedEntity} from "../../../../_laboratorio/laboratorio-ia/src/review/materialization/validatePreparedEntity";
import {computeUniversalFingerprint} from "../../../../_laboratorio/laboratorio-ia/src/review/universal/fingerprints";
import {validateFighterIdentityGuardToken, type FighterIdentityGuardAuthorization} from "../../../../_laboratorio/laboratorio-ia/src/review/globalResolution/identityGuard";
import type {ReviewJsonObject, ReviewJsonValue} from "../../../../_laboratorio/laboratorio-ia/src/review/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const client = createClient({projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!, dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!, apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01", token: process.env.SANITY_API_WRITE_TOKEN!, useCdn: false});
const headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store"};
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {status, headers});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const baseId = (value: string): string => value.replace(/^drafts\./, "");
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const statusCode = (error: unknown): number | undefined => object(error) && typeof error.statusCode === "number" ? error.statusCode : undefined;

export function OPTIONS() { return new NextResponse(null, {status: 204, headers}); }
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action); const entityType = text(body.entityType);
    if (entityType !== "fighter") return json({success: false, error: "Solo se admite fighter."}, 400);
    if (action === "check_duplicate") {
      return json({success: false, reasonCode: "identity_guard_required", error: "La deduplicación de fighters se resuelve exclusivamente mediante resolve_identity:fighter."}, 410);
    }
    if (action === "create") {
      if (body.confirm !== true) return json({success: false, error: "Falta confirmación explícita."}, 400);
      const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {};
      const authority = object(body.identityAuthorization) ? body.identityAuthorization as unknown as FighterIdentityGuardAuthorization : undefined;
      const context = object(body.authorityContext) ? body.authorityContext : undefined;
      const sourcePayload = context && object(context.sourcePayload) ? context.sourcePayload : undefined;
      const globalOperationId = context ? text(context.globalOperationId) : "";
      if (!authority || !context || !sourcePayload || !validateFighterIdentityGuardToken(authority, {creationOperationId: globalOperationId, planFingerprint: text(context.globalPlanFingerprint), caseId: text(context.caseId), caseVersion: Number(context.caseVersion), producer: text(context.producer), creationPayload: sourcePayload as ReviewJsonObject, now: new Date().toISOString()})) return json({success: false, reasonCode: "identity_authorization_invalid", error: "La autorización de identidad falta, venció o no coincide."}, 403);
      const prepared = validatePreparedEntity({issueId: globalOperationId, entityType: "fighter", draft: sourcePayload as ReviewJsonObject});
      if (!prepared.valid || !prepared.entity || computeUniversalFingerprint(prepared.entity.sanityPayload) !== computeUniversalFingerprint(payload as ReviewJsonValue)) return json({success: false, reasonCode: "identity_authorization_mismatch", error: "El payload persistente no coincide con el payload autorizado."}, 409);
      const name = text(payload.nombre); const payloadSlug = payload.slug && typeof payload.slug === "object" ? text((payload.slug as Record<string, unknown>).current) : "";
      const disciplineId = payload.disciplina && typeof payload.disciplina === "object" ? baseId(text((payload.disciplina as Record<string, unknown>)._ref)) : "";
      const organizationId = payload.organizacion && typeof payload.organizacion === "object" ? baseId(text((payload.organizacion as Record<string, unknown>)._ref)) : "";
      const identityKey = prepared.entity.identityKey; const idempotencyKey = text(body.idempotencyKey);
      if (!name || payloadSlug !== slug(name) || !disciplineId || !organizationId || idempotencyKey !== `fighter-entity:${identityKey}:${computeUniversalFingerprint(payload as ReviewJsonValue)}`) return json({success: false, reasonCode: "identity_authorization_mismatch", error: "Payload o idempotencyKey inválidos."}, 400);
      const references = await client.fetch<number>(`count(*[_id in [$disciplineId,$organizationId] || _id in [$draftDisciplineId,$draftOrganizationId]])`, {disciplineId, organizationId, draftDisciplineId: `drafts.${disciplineId}`, draftOrganizationId: `drafts.${organizationId}`}, {perspective: "raw"});
      if (references < 2) return json({success: false, error: "Disciplina u organización no existen en Sanity."}, 409);
      const documentId = `editorial-agent-fighter-${payloadSlug}`; const draftId = `drafts.${documentId}`;
      try { await client.create({_id: draftId, _type: "luchador", nombre: name, slug: {_type: "slug", current: payloadSlug}, disciplina: {_type: "reference", _ref: disciplineId}, organizacion: {_type: "reference", _ref: organizationId}, activo: true, destacadoHome: false}); }
      catch (error) { if (statusCode(error) === 409) return json({success: false, reasonCode: "persistence_conflict", error: "El ID persistente autorizado ya está ocupado."}, 409); throw error; }
      return json({success: true, entityId: documentId, documentId, alreadyExisted: false});
    }
    return json({success: false, error: "Acción no soportada."}, 400);
  } catch (error) { return json({success: false, error: error instanceof Error ? error.message : "Error desconocido."}, 500); }
}
