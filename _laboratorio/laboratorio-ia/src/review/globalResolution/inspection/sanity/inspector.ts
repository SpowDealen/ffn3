import {sanitizeInspectionText} from "../errors";
import {fingerprintGlobalResolutionInspectionEvidence} from "../fingerprint";
import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionInspectionContext,
  GlobalResolutionInspectionEvidence,
  GlobalResolutionInspectionRequest,
  GlobalResolutionObservation,
} from "../types";
import {baseSanityDocumentId} from "./normalize";
import {
  SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
  SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION,
  type SanityExternalNewsReadExecutor,
  type SanityFighterCandidate,
  type SanityInspectionReadRequest,
  type SanityNewsDocumentCandidate,
} from "./types";

const CAPABILITIES = new Set(["create:luchador", "resume:external_news", "replace_reference:noticia:luchador"]);
const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const fingerprint = (value: unknown): value is string => text(value) && /^sha256-v1:[a-z0-9]+$/i.test(value);

function rawEvidence(request: GlobalResolutionInspectionRequest, context: GlobalResolutionInspectionContext, input: {
  status: GlobalResolutionInspectionEvidence["status"];
  observations: GlobalResolutionObservation[];
  warnings?: string[];
}): GlobalResolutionInspectionEvidence {
  const semantic = {
    inspectorId: SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
    inspectorVersion: SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION,
    producer: request.producer,
    capability: request.capability,
    operationId: request.operationId,
    operationFingerprint: request.operationFingerprint,
    checkpointFingerprint: request.checkpointFingerprint,
    status: input.status,
    observations: input.observations,
    warnings: input.warnings ?? [],
  };
  const evidenceFingerprint = fingerprintGlobalResolutionInspectionEvidence(semantic);
  return {
    ...semantic,
    inspectionId: `sanity-external-news-inspection:${evidenceFingerprint.slice(-24)}`,
    inspectedAt: context.now(),
    fingerprint: evidenceFingerprint,
  };
}

function compatibility(request: GlobalResolutionInspectionRequest): ReturnType<GlobalResolutionEffectInspector["supports"]> {
  if (request.producer !== "external_news") return {supported: false, reason: "producer_unsupported"};
  if (!CAPABILITIES.has(request.capability)) return {supported: false, reason: "capability_unsupported"};
  if (request.capability === "create:luchador" && (!text(request.subject.identityKey) && !text(request.subject.expectedId))) return {supported: false, reason: "subject_incomplete"};
  if (request.capability === "resume:external_news" && !text(request.subject.expectedId)) return {supported: false, reason: "subject_incomplete"};
  if (request.capability === "replace_reference:noticia:luchador") {
    const references = request.subject.expectedReferences;
    if (!text(request.subject.expectedId) || !Array.isArray(references) || references.length !== 1 || references[0]?.field !== "luchadores" || !text(references[0].targetId)) return {supported: false, reason: "subject_incomplete"};
  }
  return {supported: true, specificity: 100};
}

function fighterRequest(request: GlobalResolutionInspectionRequest): SanityInspectionReadRequest {
  return {
    kind: "fighter_by_identity",
    identityKey: request.subject.identityKey ?? `fighter:${baseSanityDocumentId(request.subject.expectedId ?? "")}`,
    expectedId: request.subject.expectedId,
    expectedPayloadFingerprint: request.subject.expectedPayloadFingerprint,
  };
}

function uniqueFighters(candidates: readonly SanityFighterCandidate[]): SanityFighterCandidate[] {
  const unique = new Map<string, SanityFighterCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.entityId}:${candidate.identityKey}:${candidate.payloadFingerprint}`;
    if (text(candidate.entityId) && text(candidate.identityKey) && fingerprint(candidate.payloadFingerprint)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function inspectFighter(request: GlobalResolutionInspectionRequest, candidates: readonly SanityFighterCandidate[], context: GlobalResolutionInspectionContext): GlobalResolutionInspectionEvidence {
  const safe = uniqueFighters(candidates);
  if (!safe.length) return rawEvidence(request, context, {status: "not_observed", observations: [{kind: "entity_missing", entityType: "luchador", expectedId: request.subject.expectedId, identityKey: request.subject.identityKey}]});
  const expectedId = request.subject.expectedId ? baseSanityDocumentId(request.subject.expectedId) : undefined;
  const identityKey = request.subject.identityKey;
  const strong = safe.filter((candidate) => (!expectedId || baseSanityDocumentId(candidate.entityId) === expectedId) && (!identityKey || candidate.identityKey === identityKey));
  const plausible = strong.length ? strong : safe.filter((candidate) => candidate.identityKey === identityKey || expectedId && baseSanityDocumentId(candidate.entityId) === expectedId);
  if (plausible.length !== 1 || safe.length > 1 && strong.length !== 1) {
    return rawEvidence(request, context, {
      status: "ambiguous",
      observations: [{kind: "multiple_candidates", entityType: "luchador", candidateIds: safe.map((item) => item.entityId), identityKey}],
    });
  }
  const candidate = plausible[0];
  const observations: GlobalResolutionObservation[] = [{
    kind: "entity_exists",
    entityType: "luchador",
    entityId: candidate.entityId,
    identityKey: candidate.identityKey,
    payloadFingerprint: candidate.payloadFingerprint,
  }];
  if (identityKey && candidate.identityKey !== identityKey) {
    return rawEvidence(request, context, {status: "ambiguous", observations, warnings: ["fighter_identity_mismatch"]});
  }
  if (request.subject.expectedPayloadFingerprint) {
    observations.push({
      kind: candidate.payloadFingerprint === request.subject.expectedPayloadFingerprint ? "payload_matches" : "payload_differs",
      entityId: candidate.entityId,
      expectedFingerprint: request.subject.expectedPayloadFingerprint,
      actualFingerprint: candidate.payloadFingerprint,
    });
  }
  return rawEvidence(request, context, {status: observations.some((item) => item.kind === "payload_differs") ? "ambiguous" : "observed", observations});
}

function uniqueNews(documents: readonly SanityNewsDocumentCandidate[]): SanityNewsDocumentCandidate[] {
  const unique = new Map<string, SanityNewsDocumentCandidate>();
  for (const document of documents) {
    if (text(document.entityId) && fingerprint(document.payloadFingerprint) && fingerprint(document.au3PayloadFingerprint)) unique.set(document.entityId, document);
  }
  return [...unique.values()].sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function matchesExpected(document: SanityNewsDocumentCandidate, expected?: string): boolean {
  return !expected || document.payloadFingerprint === expected || document.au3PayloadFingerprint === expected;
}

function inspectNews(request: GlobalResolutionInspectionRequest, documents: readonly SanityNewsDocumentCandidate[], context: GlobalResolutionInspectionContext): GlobalResolutionInspectionEvidence {
  const safe = uniqueNews(documents);
  if (!safe.length) return rawEvidence(request, context, {status: "not_observed", observations: [{kind: "entity_missing", entityType: "noticia", expectedId: request.subject.expectedId}]});
  const fingerprints = new Set(safe.map((item) => item.payloadFingerprint));
  if (safe.length > 1 && fingerprints.size > 1) {
    return rawEvidence(request, context, {status: "ambiguous", observations: [{kind: "multiple_candidates", entityType: "noticia", candidateIds: safe.map((item) => item.entityId)}], warnings: ["draft_and_published_differ"]});
  }
  const selected = safe.find((item) => item.entityId === request.subject.expectedId) ?? safe[0];
  const actualFingerprint = request.subject.expectedPayloadFingerprint && selected.au3PayloadFingerprint === request.subject.expectedPayloadFingerprint
    ? selected.au3PayloadFingerprint
    : selected.payloadFingerprint;
  const observations: GlobalResolutionObservation[] = [{kind: "entity_exists", entityType: "noticia", entityId: selected.entityId, payloadFingerprint: actualFingerprint}];
  if (request.subject.expectedPayloadFingerprint) {
    observations.push({
      kind: matchesExpected(selected, request.subject.expectedPayloadFingerprint) ? "payload_matches" : "payload_differs",
      entityId: selected.entityId,
      expectedFingerprint: request.subject.expectedPayloadFingerprint,
      actualFingerprint,
    });
  }
  return rawEvidence(request, context, {
    status: observations.some((item) => item.kind === "payload_differs") ? "ambiguous" : "observed",
    observations,
    warnings: safe.length > 1 ? ["draft_and_published_equivalent"] : [],
  });
}

export function createSanityExternalNewsEffectInspector(dependencies: {
  reader: SanityExternalNewsReadExecutor;
}): GlobalResolutionEffectInspector {
  return Object.freeze({
    id: SANITY_EXTERNAL_NEWS_INSPECTOR_ID,
    version: SANITY_EXTERNAL_NEWS_INSPECTOR_VERSION,
    supports: compatibility,
    async inspect(request: GlobalResolutionInspectionRequest, context: GlobalResolutionInspectionContext) {
      if (context.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const supported = compatibility(request);
      if (!supported.supported) return rawEvidence(request, context, {status: "unsupported", observations: [], warnings: [supported.reason]});
      try {
        if (request.capability === "create:luchador") {
          const result = await dependencies.reader.read(fighterRequest(request), {signal: context.signal});
          if (result.kind !== "fighter_by_identity") throw new Error("sanity_inspection_result_mismatch");
          return inspectFighter(request, result.candidates, context);
        }
        if (request.capability === "resume:external_news") {
          const result = await dependencies.reader.read({kind: "news_document", documentId: request.subject.expectedId!, expectedPayloadFingerprint: request.subject.expectedPayloadFingerprint}, {signal: context.signal});
          if (result.kind !== "news_document") throw new Error("sanity_inspection_result_mismatch");
          return inspectNews(request, result.documents, context);
        }
        const expected = request.subject.expectedReferences![0];
        const result = await dependencies.reader.read({kind: "news_fighter_reference", documentId: request.subject.expectedId!, fighterId: expected.targetId, field: "luchadores"}, {signal: context.signal});
        if (result.kind !== "news_fighter_reference") throw new Error("sanity_inspection_result_mismatch");
        if (!result.documentExists) return rawEvidence(request, context, {status: "not_observed", observations: [{kind: "entity_missing", entityType: "noticia", expectedId: request.subject.expectedId}]});
        return rawEvidence(request, context, {
          status: result.referenceExists ? "observed" : "not_observed",
          observations: [{
            kind: result.referenceExists ? "reference_exists" : "reference_missing",
            ownerId: result.observedDocumentId ?? request.subject.expectedId!,
            field: "luchadores",
            targetId: expected.targetId,
          }],
        });
      } catch (error) {
        if (context.signal?.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
        return rawEvidence(request, context, {
          status: "unavailable",
          observations: [{kind: "service_unavailable", reason: "sanity_read_unavailable"}],
          warnings: [sanitizeInspectionText(error instanceof Error ? error.message : "sanity_read_unavailable")],
        });
      }
    },
  });
}
