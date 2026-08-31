import {
  normalizeProducerFighterResolutionRequests,
  planProducerFighterResolutionBatch,
  registerFighterResolutionProposal,
  type FighterResolutionProducer,
  type FighterResolutionRegistrationResult,
} from "../fighterResolutionIntake";
import {getReviewCase} from "../store/reviewStore";
import type {ReviewJsonObject, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {createOrUpdateReviewCaseFromIntake} from "./intake";
import type {
  ReviewIntakeIssueType,
  ReviewIntakeResult,
  ReviewIntakeSource,
} from "./types";

export type OfficialReviewSource = Extract<ReviewIntakeSource, "ufc" | "one" | "bkfc">;

export type OfficialNewsReviewItem = Readonly<{
  sourceId: string;
  title: string;
  canonicalUrl?: string;
  publishedAt?: string;
  status: "existente" | "nueva_apta" | "sin_contenido" | "requiere_revision";
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons?: readonly string[];
}>;

export type OfficialEventReviewSnapshot = Readonly<{
  event: Readonly<{
    sourceName: string;
    found: boolean;
    sanityId?: string;
    sanityName?: string;
    matchStrategy?: string;
  }>;
  discipline: Readonly<{found: boolean; sanityId?: string; sanityName?: string}>;
  organization: Readonly<{found: boolean; sanityId?: string; sanityName?: string}>;
  missingFighters: readonly Readonly<{
    sourceName: string;
    normalizedName: string;
    found: false;
  }>[];
  unresolvedCategories: readonly Readonly<{
    sourceLabel: string;
    normalizedLabel: string;
    found: false;
  }>[];
  fights: readonly Readonly<{
    sourceFightId: string;
    readyToCreate: boolean;
    blockingReasons: readonly string[];
  }>[];
}>;

export type OfficialEventOrigin = Readonly<{
  id: string;
  name: string;
  sourceUrl?: string;
  canonicalUrl?: string;
}>;

export type OfficialEventIntakeResult = Readonly<{
  reviewCases: readonly ReviewIntakeResult[];
  fighterRegistrations: readonly FighterResolutionRegistrationResult[];
}>;

export type OfficialEventBatchReviewItem = Readonly<{
  eventId: string;
  eventName: string;
  startDate?: string;
  status: "completo" | "evento_pendiente" | "requiere_revision" | "listo_para_preparar";
  unresolvedCategories: number;
  error?: string;
}>;

const LABELS: Readonly<Record<OfficialReviewSource, string>> = Object.freeze({
  ufc: "UFC",
  one: "ONE Championship",
  bkfc: "BKFC",
});

const PRODUCERS: Readonly<Record<OfficialReviewSource, FighterResolutionProducer>> = Object.freeze({
  ufc: "ufc_events",
  one: "one_events",
  bkfc: "bkfc_events",
});

function fingerprint(value: ReviewJsonValue): string {
  return computeUniversalFingerprint(value);
}

function newsIssue(item: OfficialNewsReviewItem): ReviewIntakeIssueType {
  const reasons = (item.reasons ?? []).join(" ").toLocaleLowerCase("es");
  if (item.existingSanityId || item.matchStrategy === "titulo") return "duplicate_entity";
  if (/ambigu|identidad|sujeto/.test(reasons)) return "ambiguous_entity";
  if (/url|enlace|campo|fecha|imagen/.test(reasons)) return "missing_required_field";
  return "review_required";
}

export function registerOfficialNewsReviewIntake(
  source: OfficialReviewSource,
  items: readonly OfficialNewsReviewItem[],
): ReviewIntakeResult[] {
  return items.flatMap((item) => {
    if (item.status !== "requiere_revision") return [];
    const resumeFingerprint = fingerprint({
      source,
      producer: `${source}_news`,
      originId: item.sourceId,
      operation: "analyze_official_news",
    });
    return [createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "news",
      originId: item.sourceId,
      externalId: item.sourceId,
      subjectLabel: item.title,
      issueType: newsIssue(item),
      summary: item.reasons?.filter(Boolean).join(" · ") || "La noticia requiere una decisión editorial antes de continuar.",
      title: item.title,
      evidenceRefs: [
        {id: `official-news:${source}:${item.sourceId}`, source: `${LABELS[source]} official news`},
      ],
      candidates: item.existingSanityId ? [{
        id: item.existingSanityId,
        label: item.existingTitle || item.title,
        value: {sanityId: item.existingSanityId, title: item.existingTitle || item.title},
        entityType: "news",
        sanityId: item.existingSanityId,
        confidence: item.matchStrategy === "titulo" ? 0.7 : 0.95,
        reasons: item.reasons ? [...item.reasons] : undefined,
      }] : undefined,
      originContext: {
        route: "/editorial",
        sourceId: item.sourceId,
        canonicalUrl: item.canonicalUrl ?? "",
        publishedAt: item.publishedAt ?? "",
        existingSanityId: item.existingSanityId ?? "",
        matchStrategy: item.matchStrategy ?? "",
      },
      resumeContext: {
        producer: `${source}_news`,
        originId: item.sourceId,
        operation: "analyze_official_news",
        fingerprint: resumeFingerprint,
      },
    })];
  });
}

export function registerOfficialEventBatchReviewIntake(
  source: OfficialReviewSource,
  items: readonly OfficialEventBatchReviewItem[],
): ReviewIntakeResult[] {
  return items.flatMap((item) => {
    if (item.status !== "requiere_revision" || item.unresolvedCategories < 1 || item.error) return [];
    return [createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "event",
      originId: item.eventId,
      subjectLabel: item.eventName,
      issueType: "incomplete_event",
      summary: `${item.unresolvedCategories} categorías de peso impiden completar la cartelera.`,
      title: item.eventName,
      evidenceRefs: [{id: `official-event-batch:${source}:${item.eventId}`, source: `${LABELS[source]} official events`}],
      originContext: {route: "/editorial", eventId: item.eventId, startDate: item.startDate ?? ""},
      resumeContext: {
        producer: `${source}_events`,
        originId: item.eventId,
        operation: "analyze_official_events",
        fingerprint: fingerprint({source, eventId: item.eventId, operation: "analyze_official_events"}),
      },
    })];
  });
}

function sharedContext(
  source: OfficialReviewSource,
  event: OfficialEventOrigin,
  operation: string,
): {originContext: ReviewJsonObject; resumeContext: ReviewJsonObject} {
  return {
    originContext: {
      route: "/editorial",
      eventId: event.id,
      eventName: event.name,
      sourceUrl: event.sourceUrl ?? "",
      canonicalUrl: event.canonicalUrl ?? "",
    },
    resumeContext: {
      producer: `${source}_events`,
      originId: event.id,
      operation,
      fingerprint: fingerprint({source, eventId: event.id, operation}),
    },
  };
}

function fightIssue(reasons: readonly string[]): ReviewIntakeIssueType {
  if (reasons.some((reason) => reason.includes("duplicados"))) return "conflicting_relation";
  if (reasons.some((reason) => reason.includes("ganador_no_encontrado"))) return "missing_relation";
  if (reasons.some((reason) => reason.includes("no_informada") || reason.includes("sin_luchadores"))) return "missing_required_field";
  return "insufficient_evidence";
}

const COVERED_FIGHT_REASON = /(evento_no_encontrado|disciplina_.+_no_encontrada|organizacion_.+_no_encontrada|luchador_(rojo|azul)_no_encontrado|categoria_peso_no_resuelta)/;

function registerFallbackFighters(
  source: OfficialReviewSource,
  event: OfficialEventOrigin,
  resolution: OfficialEventReviewSnapshot,
): ReviewIntakeResult[] {
  const context = sharedContext(source, event, "resolve_official_event");
  return resolution.missingFighters.map((fighter) => createOrUpdateReviewCaseFromIntake({
    actionable: true,
    source,
    entityType: source === "one" ? "participant" : "fighter",
    originId: `${event.id}:fighter:${fighter.normalizedName || fighter.sourceName}`,
    subjectLabel: fighter.sourceName,
    issueType: "unresolved_fighter",
    summary: `${fighter.sourceName} no tiene una identidad verificable para continuar la cartelera.`,
    title: fighter.sourceName,
    evidenceRefs: [{id: `official-event-fighter:${source}:${event.id}:${fighter.normalizedName}`, source: `${LABELS[source]} official events`}],
    ...context,
  }));
}

function registerCanonicalFighters(
  source: OfficialReviewSource,
  event: OfficialEventOrigin,
  resolution: OfficialEventReviewSnapshot,
): {registrations: FighterResolutionRegistrationResult[]; fallback: ReviewIntakeResult[]} {
  if (!resolution.missingFighters.length) return {registrations: [], fallback: []};
  const producer = PRODUCERS[source];
  const normalized = normalizeProducerFighterResolutionRequests(producer, {
    confirm: true,
    event: {id: event.id, sourceUrl: event.sourceUrl, canonicalUrl: event.canonicalUrl},
    resolutionContext: {
      disciplineId: resolution.discipline.sanityId,
      organizationId: resolution.organization.sanityId,
    },
    fighters: resolution.missingFighters.map((fighter) => ({
      name: fighter.sourceName,
      aliases: fighter.normalizedName !== fighter.sourceName ? [fighter.normalizedName] : [],
    })),
  });
  if (!normalized.ok) return {registrations: [], fallback: registerFallbackFighters(source, event, resolution)};
  const planned = planProducerFighterResolutionBatch(producer, normalized.requests);
  const registrations = planned.items.flatMap((item) => item.proposal ? [registerFighterResolutionProposal(item.proposal)] : []);
  const missingCanonicalCase = registrations.some((item) => item.status === "blocked" && !getReviewCase(item.caseId));
  return {
    registrations,
    fallback: missingCanonicalCase ? registerFallbackFighters(source, event, resolution) : [],
  };
}

export function registerOfficialEventReviewIntake(input: {
  source: OfficialReviewSource;
  event: OfficialEventOrigin;
  resolution: OfficialEventReviewSnapshot;
}): OfficialEventIntakeResult {
  const {source, event, resolution} = input;
  const reviewCases: ReviewIntakeResult[] = [];
  const context = sharedContext(source, event, "resolve_official_event");

  if (!resolution.discipline.found) {
    reviewCases.push(createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "discipline",
      originId: `${event.id}:discipline`,
      subjectLabel: `${LABELS[source]} · ${event.name}`,
      issueType: "missing_entity",
      summary: "La disciplina requerida por la cartelera no existe o no puede identificarse.",
      title: `Disciplina de ${event.name}`,
      evidenceRefs: [{id: `official-event-discipline:${source}:${event.id}`}],
      ...context,
    }));
  }
  if (!resolution.organization.found) {
    reviewCases.push(createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "organization",
      originId: `${event.id}:organization`,
      subjectLabel: LABELS[source],
      issueType: "missing_entity",
      summary: "La organización requerida por la cartelera no existe o no puede identificarse.",
      title: `Organización de ${event.name}`,
      evidenceRefs: [{id: `official-event-organization:${source}:${event.id}`}],
      ...context,
    }));
  }

  for (const category of resolution.unresolvedCategories) {
    const categoryIdentity = category.normalizedLabel || category.sourceLabel || "sin-categoria";
    reviewCases.push(createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "weight_category",
      originId: `${event.id}:category:${categoryIdentity}`,
      subjectLabel: category.sourceLabel || "Categoría sin identificar",
      issueType: "unresolved_category",
      summary: category.sourceLabel
        ? `La categoría “${category.sourceLabel}” no tiene una referencia verificable.`
        : "La fuente no aporta una categoría de peso verificable.",
      title: category.sourceLabel || `Categoría de ${event.name}`,
      evidenceRefs: [{id: `official-event-category:${source}:${event.id}:${categoryIdentity}`}],
      ...context,
    }));
  }

  for (const fight of resolution.fights) {
    const uncovered = fight.blockingReasons.filter((reason) => !COVERED_FIGHT_REASON.test(reason));
    if (fight.readyToCreate || !uncovered.length) continue;
    reviewCases.push(createOrUpdateReviewCaseFromIntake({
      actionable: true,
      source,
      entityType: "fight",
      originId: `${event.id}:fight:${fight.sourceFightId}`,
      subjectLabel: fight.sourceFightId,
      issueType: fightIssue(uncovered),
      summary: `El combate está bloqueado: ${uncovered.join(" · ")}.`,
      title: `Combate ${fight.sourceFightId}`,
      evidenceRefs: uncovered.map((reason) => ({id: `official-fight:${source}:${fight.sourceFightId}:${reason}`})),
      ...context,
    }));
  }

  const fighters = registerCanonicalFighters(source, event, resolution);
  reviewCases.push(...fighters.fallback);
  return {reviewCases, fighterRegistrations: fighters.registrations};
}
