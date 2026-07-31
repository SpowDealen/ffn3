import {normalizeIdentityText} from "../entityIdentity";
import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {FIGHTER_RESOLUTION_REQUEST_VERSION, type FighterResolutionProducer, type FighterResolutionRequest} from "./types";

const SOURCE_BY_PRODUCER = {ufc_events: "ufc", one_events: "one", bkfc_events: "bkfc", fekm_participants: "fekm"} as const;
const ID_NAMESPACE = {ufc_events: "ufc:fighter", one_events: "one:fighter", bkfc_events: "bkfc:fighter", fekm_participants: "fekm:athlete"} as const;
const FORBIDDEN = new Set(["producer", "capability", "operation", "entityType", "identityAuthorization", "authorization", "token", "groq", "query", "client"]);
const EVENT_KEYS = new Set(["confirm", "event", "fighters", "resolutionContext"]);
const FEKM_KEYS = new Set(["confirm", "participants", "sourceReference"]);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 160): string => typeof value === "string" ? value.trim().slice(0, max) : "";
const baseId = (value: unknown): string => text(value, 160).replace(/^drafts\./u, "");
const aliases = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.map((item) => text(item)).filter(Boolean))].slice(0, 12) : [];
const hasForbidden = (value: unknown): boolean => object(value)
  ? Object.entries(value).some(([key, child]) => FORBIDDEN.has(key) || hasForbidden(child))
  : Array.isArray(value) && value.some(hasForbidden);
const stableNow = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
const safeExternalId = (value: unknown): string | undefined => {
  const candidate = text(value, 120);
  return candidate && /^[a-z0-9][a-z0-9._:-]{0,119}$/iu.test(candidate) ? candidate : undefined;
};
const safeSourceId = (value: unknown): string => {
  const candidate = text(value, 200);
  return /^https?:\/\//iu.test(candidate) ? `source:${computeUniversalFingerprint(candidate as ReviewJsonValue).slice(-24)}` : candidate;
};

type Candidate = {name: string; aliases: string[]; externalId?: string; itemId?: string; disciplineId: string; organizationId: string; weightCategoryId?: string};
function eventCandidates(body: Record<string, unknown>): {sourceId: string; candidates: Candidate[]} | {error: string} {
  const event = object(body.event) ? body.event : undefined;
  const resolution = object(body.resolutionContext) ? body.resolutionContext : undefined;
  const sourceId = safeSourceId(event?.id ?? event?.sourceUrl ?? event?.canonicalUrl);
  const disciplineId = baseId(resolution?.disciplineId); const organizationId = baseId(resolution?.organizationId);
  if (!event || !sourceId || !disciplineId || !organizationId) return {error: "invalid_fighter_resolution_request"};
  const explicit = Array.isArray(body.fighters) ? body.fighters.filter(object).map((fighter): Candidate => ({name: text(fighter.name ?? fighter.sourceName), aliases: aliases(fighter.aliases), externalId: safeExternalId(fighter.externalId ?? fighter.athleteId), itemId: safeExternalId(fighter.sourceId ?? fighter.id), disciplineId, organizationId, weightCategoryId: baseId(fighter.weightCategoryId) || undefined})) : [];
  const fallback = Array.isArray(event.fightCard) ? event.fightCard.filter(object).flatMap((fight) => [
    {name: text(fight.redFighter), aliases: [], itemId: text(fight.id) || undefined, disciplineId, organizationId},
    {name: text(fight.blueFighter), aliases: [], itemId: text(fight.id) || undefined, disciplineId, organizationId},
  ]) : [];
  return {sourceId, candidates: explicit.length ? explicit : fallback};
}

function fekmCandidates(body: Record<string, unknown>): {sourceId: string; candidates: Candidate[]} | {error: string} {
  if (!Array.isArray(body.participants)) return {error: "invalid_fighter_resolution_request"};
  const candidates = body.participants.filter(object).map((entry): Candidate => {
    const source = object(entry.source) ? entry.source : entry;
    const resolution = object(entry.resolutionContext) ? entry.resolutionContext : undefined;
    return {name: text(source.name), aliases: aliases(source.aliases), externalId: safeExternalId(source.athleteId ?? source.id), itemId: safeExternalId(source.id ?? source.athleteId), disciplineId: baseId(resolution?.disciplineId), organizationId: baseId(resolution?.organizationId), weightCategoryId: baseId(resolution?.weightCategoryId ?? resolution?.categoryId) || undefined};
  });
  const sourceId = text(body.sourceReference, 200) || computeUniversalFingerprint(candidates.map(({name, itemId}) => ({name, itemId})) as unknown as ReviewJsonValue);
  return {sourceId, candidates};
}

export function normalizeProducerFighterResolutionRequests(producer: FighterResolutionProducer, raw: unknown, now = new Date().toISOString()): {ok: true; requests: FighterResolutionRequest[]} | {ok: false; reasonCode: string} {
  if (!object(raw) || hasForbidden(raw)) return {ok: false, reasonCode: "invalid_fighter_resolution_request"};
  const allowed = producer === "fekm_participants" ? FEKM_KEYS : EVENT_KEYS;
  if (Object.keys(raw).some((key) => !allowed.has(key))) return {ok: false, reasonCode: "invalid_fighter_resolution_request"};
  const parsed = producer === "fekm_participants" ? fekmCandidates(raw) : eventCandidates(raw);
  if ("error" in parsed) return {ok: false, reasonCode: parsed.error};
  const unique = new Map<string, Candidate>();
  for (const candidate of parsed.candidates) {
    const normalized = normalizeIdentityText(candidate.name).normalizedValue;
    if (!normalized || normalized.split(" ").length < 2 || !candidate.disciplineId || !candidate.organizationId) continue;
    if (!unique.has(normalized)) unique.set(normalized, candidate);
  }
  if (!unique.size || unique.size > 64) return {ok: false, reasonCode: "fighter_identity_insufficient"};
  const requestedAt = stableNow(now);
  const requests = [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([normalizedLabel, candidate]): FighterResolutionRequest => {
    const externalIdentifiers = candidate.externalId ? [{namespace: ID_NAMESPACE[producer], value: candidate.externalId.slice(0, 120)}] : [];
    const semantic = {requestVersion: FIGHTER_RESOLUTION_REQUEST_VERSION, producer, source: SOURCE_BY_PRODUCER[producer], sourceReference: {kind: producer === "fekm_participants" ? "participant_document" : "event", id: parsed.sourceId, itemId: candidate.itemId}, identity: {primaryLabel: candidate.name, normalizedLabel, aliases: candidate.aliases, externalIdentifiers}, creation: {disciplineId: candidate.disciplineId, organizationId: candidate.organizationId, weightCategoryId: candidate.weightCategoryId}};
    const requestFingerprint = computeUniversalFingerprint(semantic as unknown as ReviewJsonValue);
    return Object.freeze({...semantic, requestId: `fighter-resolution-request:${requestFingerprint.slice(-20)}`, requestFingerprint, idempotencyKey: `fighter-resolution:${producer}:${requestFingerprint}`, requestedAt}) as FighterResolutionRequest;
  });
  return {ok: true, requests};
}
