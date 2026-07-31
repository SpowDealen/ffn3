import {normalizeIdentityText, normalizeParticipantPair} from "../normalize";
import type {EntityIdentityStrategy, ResultIdentity, ResultIdentityInput} from "../types";
import {baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch, identityKey, matchingExternalId, normalizedContext, normalizedSetEquals, safeRaw, sameNormalized} from "./shared";

function build(input: ResultIdentityInput): ResultIdentity {
  const participants = normalizeParticipantPair(input.participants ?? []);
  const common = commonIdentity(input);
  const context = normalizedContext({resultScope: input.resultScope, eventKey: input.eventKey, fightKey: input.fightKey, participants, winner: input.winner, method: input.method, round: input.round, time: input.time});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    ...(input.fightKey ? [identityKey("result-fight", "very_strong", ["resultScope", "fightKey"], `${input.resultScope}:${normalizeIdentityText(input.fightKey).normalizedValue}`)] : []),
    ...(input.eventKey && input.resultScope === "event" ? [identityKey("result-event", "very_strong", ["resultScope", "eventKey"], `${input.resultScope}:${normalizeIdentityText(input.eventKey).normalizedValue}`)] : []),
  ];
  return finalizeIdentity<ResultIdentity>({
    ...common,
    entityType: "result",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, resultScope: input.resultScope, eventKey: input.eventKey, fightKey: input.fightKey, winner: input.winner, method: input.method, round: input.round, time: input.time}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel)},
    identityKeys: keys, context, attributes: context as ResultIdentity["attributes"],
  });
}

function compare(input: ResultIdentity, candidate: ResultIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (input.attributes.resultScope !== candidate.attributes.resultScope) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "result_scope_conflict", "definitive", "Los tipos documentales de resultado son distintos.")], conflictCodes: ["result_scope_conflict"]});
  if (matchingExternalId(input, candidate)) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "external_result_id_exact", "definitive", "Coincide el ID externo del resultado.")]});
  const sameFight = Boolean(input.attributes.fightKey && candidate.attributes.fightKey && sameNormalized(input.attributes.fightKey, candidate.attributes.fightKey));
  const sameEvent = Boolean(input.attributes.eventKey && candidate.attributes.eventKey && sameNormalized(input.attributes.eventKey, candidate.attributes.eventKey));
  if (sameFight && input.attributes.method && candidate.attributes.method && !sameNormalized(input.attributes.method, candidate.attributes.method)) return comparison({decision: "conflicting_identity", score: 0, input, candidate, conflicting: [evidence("conflict", "result_method_conflict", "definitive", "El mismo combate presenta métodos incompatibles.")], conflictCodes: ["result_method_conflict"]});
  if (sameFight || input.attributes.resultScope === "event" && sameEvent) return comparison({
    decision: "strong_match", score: .96, input, candidate,
    matchedKeys: [evidence("key_match", sameFight ? "result_fight_match" : "result_event_match", "very_strong", sameFight ? "Coincide el combate del resultado." : "Coincide el evento del resultado.")],
    supporting: [
      ...(input.attributes.participants && candidate.attributes.participants && normalizedSetEquals(input.attributes.participants, candidate.attributes.participants) ? [evidence("context_match", "result_participants_match", "contextual", "Coinciden participantes.")] : []),
      ...(input.attributes.round && input.attributes.round === candidate.attributes.round ? [evidence("context_match", "result_round_match", "contextual", "Coincide la ronda.")] : []),
      ...(input.attributes.time && input.attributes.time === candidate.attributes.time ? [evidence("context_match", "result_time_match", "contextual", "Coincide el tiempo.")] : []),
    ],
  });
  return genericNoMatch(input, candidate);
}

export const resultIdentityStrategy: EntityIdentityStrategy<"result"> = Object.freeze({
  entityType: "result", version: "1.0.0", build, compare,
  canCreate(identity: ResultIdentity) {
    const allowed = Boolean(identity.externalIdentifiers.length || identity.attributes.resultScope === "fight" && identity.attributes.fightKey || identity.attributes.resultScope === "event" && identity.attributes.eventKey);
    return {allowed, reasonCodes: allowed ? ["result_identity_sufficient"] : ["result_scope_reference_required"]};
  },
});
