import type {ReviewJsonObject, ReviewResolution} from "../../types";
import type {
  OfficialReviewResumeProducer,
  ReviewOriginAuthorityResult,
  ReviewOriginResumeAuthority,
  ReviewOriginResumeRequest,
} from "./types";

export type OfficialNewsRuntimeItem = Readonly<{
  id: string;
  title: string;
}>;

export type OfficialNewsRuntimeAnalysis = Readonly<{
  sourceId: string;
  status: "existente" | "nueva_apta" | "sin_contenido" | "requiere_revision";
  existingSanityId?: string;
  reasons?: readonly string[];
}>;

export type OfficialEventRuntimeItem = Readonly<{
  id: string;
  name: string;
}>;

export type OfficialEventRuntimeResolution = Readonly<{
  event: Readonly<{found: boolean; sanityId?: string}>;
  discipline: Readonly<{found: boolean; sanityId?: string}>;
  organization: Readonly<{found: boolean; sanityId?: string}>;
  counts: Readonly<{
    missingFighters: number;
    unresolvedCategories: number;
  }>;
  missingFighters: readonly Readonly<{sourceName: string; normalizedName: string}>[];
  unresolvedCategories: readonly Readonly<{sourceLabel: string; normalizedLabel: string}>[];
  fights: readonly Readonly<{
    sourceFightId: string;
    readyToCreate: boolean;
    blockingReasons: readonly string[];
  }>[];
}>;

export type OfficialEventRuntimeBatchAnalysis = Readonly<{
  eventId: string;
  status: "completo" | "evento_pendiente" | "requiere_revision" | "listo_para_preparar";
  eventSanityId?: string;
  error?: string;
}>;

export type OfficialNewsRuntimePort<TItem extends OfficialNewsRuntimeItem> = Readonly<{
  getItem(originId: string): TItem | undefined;
  analyze(item: TItem, signal: AbortSignal): Promise<OfficialNewsRuntimeAnalysis | undefined>;
}>;

export type OfficialEventRuntimePort<TItem extends OfficialEventRuntimeItem> = Readonly<{
  getEvent(originId: string): TItem | undefined;
  resolve(event: TItem, signal: AbortSignal): Promise<OfficialEventRuntimeResolution | undefined>;
  analyzeBatch?(event: TItem, signal: AbortSignal): Promise<OfficialEventRuntimeBatchAnalysis | undefined>;
}>;

function intakeContext(request: ReviewOriginResumeRequest): ReviewJsonObject | undefined {
  const value = request.context.unifiedReviewIntake;
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function duplicateDecisionMatches(resolutions: readonly ReviewResolution[], sanityId: string): boolean {
  const normalized = sanityId.replace(/^drafts\./, "");
  return resolutions.some((resolution) => {
    if (resolution.type === "select_candidate") return resolution.candidateId.replace(/^drafts\./, "") === normalized;
    if (resolution.type === "confirm_duplicate") return resolution.duplicateId.replace(/^drafts\./, "") === normalized;
    if (resolution.type === "link_reference") return resolution.sanityId.replace(/^drafts\./, "") === normalized;
    return false;
  });
}

function validateRequest(request: ReviewOriginResumeRequest, producer: OfficialReviewResumeProducer, operation: string): ReviewOriginAuthorityResult | undefined {
  if (request.producer !== producer || request.operation !== operation || !request.originId.trim()) {
    return {outcome: "conflict", observed: false, message: "El contexto no pertenece a esta autoridad de productor."};
  }
  if (request.signal.aborted) return {outcome: "blocked", observed: false, message: "La continuación fue cancelada antes de consultar el productor."};
  return undefined;
}

export function createOfficialNewsRuntimeAuthority<TItem extends OfficialNewsRuntimeItem>(
  producer: Extract<OfficialReviewResumeProducer, `${string}_news`>,
  port: OfficialNewsRuntimePort<TItem>,
): ReviewOriginResumeAuthority {
  return Object.freeze({
    authorityId: `panel-ia:${producer}:official-analysis-v1`,
    producer,
    async continueOrigin(request): Promise<ReviewOriginAuthorityResult> {
      const invalid = validateRequest(request, producer, "analyze_official_news");
      if (invalid) return invalid;
      const item = port.getItem(request.originId);
      if (!item || item.id !== request.originId) {
        return {outcome: "blocked", observed: false, message: "La noticia original ya no está cargada en el productor."};
      }
      const analysis = await port.analyze(item, request.signal);
      if (!analysis || analysis.sourceId !== request.originId) {
        return {outcome: "failed", observed: false, message: "El productor no devolvió un resultado verificable para la noticia."};
      }
      if (analysis.status === "existente" && analysis.existingSanityId) {
        return {outcome: "already_applied", observed: true, resultId: analysis.existingSanityId, message: "La noticia ya existe y el productor confirmó su identidad en Sanity."};
      }
      if (analysis.status === "nueva_apta") {
        return {outcome: "succeeded", observed: true, resultId: `producer-result:${producer}:${analysis.sourceId}:nueva_apta`, message: "El productor reanalizó la noticia y la dejó lista para preparar."};
      }
      if (analysis.status === "requiere_revision" && analysis.existingSanityId && duplicateDecisionMatches(request.resolutions, analysis.existingSanityId)) {
        return {outcome: "already_applied", observed: true, resultId: analysis.existingSanityId, message: "La decisión de duplicado coincide con la noticia observada por el productor."};
      }
      if (analysis.status === "requiere_revision") {
        return {outcome: "review_required", observed: true, resultId: `producer-result:${producer}:${analysis.sourceId}:requiere_revision`, message: analysis.reasons?.join(" · ") || "El productor volvió a detectar una incidencia que necesita revisión."};
      }
      return {outcome: "blocked", observed: true, resultId: `producer-result:${producer}:${analysis.sourceId}:sin_contenido`, message: analysis.reasons?.join(" · ") || "La noticia sigue sin contenido suficiente para continuar."};
    },
  });
}

function eventHasBlockingState(resolution: OfficialEventRuntimeResolution): boolean {
  return !resolution.event.found
    || !resolution.discipline.found
    || !resolution.organization.found
    || resolution.counts.missingFighters > 0
    || resolution.counts.unresolvedCategories > 0
    || resolution.fights.some((fight) => !fight.readyToCreate);
}

export function createOfficialEventRuntimeAuthority<TItem extends OfficialEventRuntimeItem>(
  producer: Extract<OfficialReviewResumeProducer, `${string}_events`>,
  port: OfficialEventRuntimePort<TItem>,
): ReviewOriginResumeAuthority {
  return Object.freeze({
    authorityId: `panel-ia:${producer}:official-resolution-v1`,
    producer,
    async continueOrigin(request): Promise<ReviewOriginAuthorityResult> {
      const allowedOperation = request.operation === "resolve_official_event" || request.operation === "analyze_official_events";
      const invalid = validateRequest(request, producer, allowedOperation ? request.operation : "resolve_official_event");
      if (invalid || !allowedOperation) return invalid ?? {outcome: "conflict", observed: false, message: "La operación no pertenece al flujo oficial de eventos."};
      const event = port.getEvent(request.originId);
      if (!event || event.id !== request.originId) {
        return {outcome: "blocked", observed: false, message: "El evento original ya no está cargado en el productor."};
      }
      if (request.operation === "analyze_official_events") {
        if (!port.analyzeBatch) return {outcome: "blocked", observed: false, message: "Este productor no expone reanálisis seguro del lote de eventos."};
        const analysis = await port.analyzeBatch(event, request.signal);
        if (!analysis || analysis.eventId !== request.originId) return {outcome: "failed", observed: false, message: "El productor no devolvió análisis observable para el evento."};
        const resultId = analysis.eventSanityId ?? `producer-result:${producer}:${event.id}:${analysis.status}`;
        if (analysis.error) return {outcome: "failed", observed: true, resultId, message: analysis.error};
        if (analysis.status === "completo" || analysis.status === "listo_para_preparar") {
          return {outcome: "succeeded", observed: true, resultId, message: "El productor reanalizó el evento y confirmó que puede continuar."};
        }
        return {outcome: "review_required", observed: true, resultId, message: "El productor reanalizó el evento, pero todavía detecta un bloqueo verificable."};
      }
      const resolution = await port.resolve(event, request.signal);
      if (!resolution) {
        return {outcome: "failed", observed: false, message: "El productor no devolvió una resolución observable para el evento."};
      }
      const evidenceId = resolution.event.sanityId
        ? resolution.event.sanityId
        : `producer-result:${producer}:${event.id}:resolution`;
      if (eventHasBlockingState(resolution)) {
        const intake = intakeContext(request);
        const entity = typeof intake?.entityType === "string" ? intake.entityType : "evento";
        return {
          outcome: "review_required",
          observed: true,
          resultId: evidenceId,
          message: `El productor reanudó la resolución, pero ${entity} todavía deja bloqueos verificables.`,
        };
      }
      return {
        outcome: "succeeded",
        observed: true,
        resultId: evidenceId,
        message: "El productor volvió a resolver la cartelera y confirmó que puede continuar.",
      };
    },
  });
}
