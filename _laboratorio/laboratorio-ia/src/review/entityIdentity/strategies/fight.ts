import {normalizeIdentityDate, normalizeIdentityText, normalizeParticipantPair} from "../normalize";
import type {EntityIdentityStrategy, FightIdentity, FightIdentityInput} from "../types";
import {baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch, identityKey, matchingExternalId, normalizedContext, normalizedSetEquals, safeRaw, sameNormalized} from "./shared";

function build(input: FightIdentityInput): FightIdentity {
  const participants = normalizeParticipantPair(input.participants);
  const common = commonIdentity(input);
  const eventDate = normalizeIdentityDate(input.eventDate);
  const context = normalizedContext({eventKey: input.eventKey, eventDate, participants, category: input.category, discipline: input.discipline, phase: input.phase});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    ...(input.eventKey && participants.length === 2 ? [identityKey("event-plus-sorted-participants", "very_strong", ["eventKey", "participants"], `${normalizeIdentityText(input.eventKey).normalizedValue}:${participants.join(":")}`)] : []),
    ...(input.eventKey && participants.length === 2 && input.category ? [identityKey("event-plus-sorted-participants-plus-category", "very_strong", ["eventKey", "participants", "category"], `${normalizeIdentityText(input.eventKey).normalizedValue}:${participants.join(":")}:${normalizeIdentityText(input.category).normalizedValue}`)] : []),
  ];
  return finalizeIdentity<FightIdentity>({
    ...common,
    entityType: "fight",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, eventKey: input.eventKey, eventDate: input.eventDate, category: input.category, discipline: input.discipline, phase: input.phase}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel, {normalizeVersus: true})},
    identityKeys: keys, context, attributes: context as FightIdentity["attributes"],
  });
}

function compare(input: FightIdentity, candidate: FightIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (matchingExternalId(input, candidate)) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "external_fight_id_exact", "definitive", "Coincide el ID externo del combate.")]});
  if (input.attributes.eventKey && candidate.attributes.eventKey && !sameNormalized(input.attributes.eventKey, candidate.attributes.eventKey)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "event_conflict", "definitive", "Los combates pertenecen a eventos distintos.")], conflictCodes: ["event_conflict"]});
  if (input.attributes.participants.length === 2 && candidate.attributes.participants.length === 2 && !normalizedSetEquals(input.attributes.participants, candidate.attributes.participants)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "participants_conflict", "definitive", "Los participantes son incompatibles.")], conflictCodes: ["participants_conflict"]});
  const sameParticipants = normalizedSetEquals(input.attributes.participants, candidate.attributes.participants);
  if (sameParticipants && input.attributes.eventKey && candidate.attributes.eventKey && sameNormalized(input.attributes.eventKey, candidate.attributes.eventKey)) return comparison({
    decision: "strong_match", score: input.attributes.category && candidate.attributes.category && sameNormalized(input.attributes.category, candidate.attributes.category) ? .98 : .95,
    input, candidate,
    matchedKeys: [evidence("key_match", "event_participants_match", "very_strong", "Coinciden evento y pareja de participantes sin depender del orden.")],
    supporting: input.attributes.category && candidate.attributes.category && sameNormalized(input.attributes.category, candidate.attributes.category) ? [evidence("context_match", "fight_category_match", "contextual", "Coincide la categoría.")] : [],
  });
  if (sameParticipants) return comparison({decision: "insufficient_evidence", score: .6, input, candidate, missing: [evidence("missing", "fight_event_missing", "very_strong", "La pareja sola no identifica una revancha.", "eventKey")]});
  return genericNoMatch(input, candidate);
}

export const fightIdentityStrategy: EntityIdentityStrategy<"fight"> = Object.freeze({
  entityType: "fight", version: "1.0.0", build, compare,
  canCreate(identity: FightIdentity) {
    const allowed = identity.attributes.participants.length === 2 && Boolean(identity.attributes.eventKey || identity.externalIdentifiers.length);
    return {allowed, reasonCodes: allowed ? ["fight_identity_sufficient"] : ["fight_event_and_participants_required"]};
  },
});
