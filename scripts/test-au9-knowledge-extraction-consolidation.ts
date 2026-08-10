import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {DecisionOutcomeRecord} from "../_laboratorio/laboratorio-ia/src/review/outcomes";
import {
  consolidateKnowledge,
  extractKnowledgeFromOutcome,
  knowledgeConsolidationSecurity,
  knowledgeExtractionSecurity,
  knowledgeExtractorSecurity,
  type KnowledgeExtractionInput,
} from "../_laboratorio/laboratorio-ia/src/review/knowledge";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

function outcome(options: Partial<DecisionOutcomeRecord> = {}): DecisionOutcomeRecord {
  return {schemaVersion: 1, engineVersion: "AU7/1", id: "outcome:1", caseId: "case:1", issueId: "identity", resolutionId: "resolution:1", decisionFingerprint: fp("decision"), contextFingerprint: fp("context"), inputFingerprint: fp("input"), evidenceFingerprint: fp("evidence"), correlationKey: "case:1:identity", producer: "review_center", source: "fixture", entityType: "luchador", issueType: "missing_entity", decisionType: "reuse_existing", reviewSchemaVersion: 1, currentStatus: "operationally_confirmed", technicalStatus: "succeeded", structuralStatus: "valid", editorialStatus: "confirmed", operationalStatus: "completed", createdAt: NOW, updatedAt: NOW, reconciliationRequired: false, conflicts: [], eventIds: [], ...options};
}

function extraction(options: Partial<KnowledgeExtractionInput> = {}) {
  return extractKnowledgeFromOutcome({caseVersion: 3, outcome: outcome(), ...options});
}

function main(): void {
  const simple = extraction();
  equal(simple.eligible, true); equal(simple.observations.length, 1); equal(simple.observations[0].kind, "confirmed_fact"); equal(simple.observations[0].domain, "fighter"); equal(simple.observations[0].confidence, 1); equal(simple.observations[0].observation.polarity, "supports");
  equal(simple.writes, false); equal(simple.readsOnly, true); check(simple.outcomeFingerprint.startsWith("sha256-v1:")); check(simple.extractionFingerprint.startsWith("sha256-v1:"));

  const negative = extraction({outcome: outcome({id: "outcome:negative", currentStatus: "rejected", editorialStatus: "rejected", operationalStatus: "failed", evidenceFingerprint: fp("negative")})});
  equal(negative.observations[0].kind, "negative_evidence"); equal(negative.observations[0].observation.polarity, "contradicts"); check(negative.reasonCodes.includes("outcome_negative"));
  const falseAlias = extraction({outcome: outcome({id: "outcome:false-alias", decisionType: "reject_alias_match", currentStatus: "rejected", editorialStatus: "rejected", evidenceFingerprint: fp("false-alias")})});
  equal(falseAlias.observations[0].kind, "negative_evidence"); check(falseAlias.observations[0].observation.claimCode.includes("reject_alias_match"));
  const invalidReference = extraction({outcome: outcome({id: "outcome:invalid-reference", entityType: "relation", decisionType: "repair_reference", structuralStatus: "invalid", currentStatus: "failed", evidenceFingerprint: fp("invalid-reference")})});
  equal(invalidReference.observations[0].domain, "relationship"); equal(invalidReference.observations[0].kind, "negative_evidence");
  const discardedEntity = extraction({outcome: outcome({id: "outcome:discarded", decisionType: "discard_entity", currentStatus: "rejected", editorialStatus: "rejected", evidenceFingerprint: fp("discarded")})});
  equal(discardedEntity.observations[0].kind, "negative_evidence");

  const contradiction = extraction({outcome: outcome({id: "outcome:conflict", conflicts: ["identity_conflict"], reconciliationRequired: true, evidenceFingerprint: fp("conflict")})});
  equal(contradiction.observations[0].kind, "contradiction"); equal(contradiction.observations[0].observation.polarity, "contradicts"); check(contradiction.reasonCodes.includes("outcome_conflict_observed"));
  const invalidated = extraction({outcome: outcome({id: "outcome:superseded", currentStatus: "superseded", evidenceFingerprint: fp("superseded")})});
  equal(invalidated.observations[0].kind, "invalidated_knowledge");
  const temporal = extraction({outcome: outcome({id: "outcome:temporal", entityType: "evento", evidenceFingerprint: fp("temporal")}), temporal: {validFrom: "2026-08-01T00:00:00.000Z", validUntil: "2026-08-20T00:00:00.000Z"}});
  equal(temporal.observations[0].kind, "temporal_knowledge"); equal(temporal.observations[0].temporal.state, "temporal"); equal(temporal.observations[0].domain, "event");
  const pending = extraction({outcome: outcome({id: "outcome:pending", currentStatus: "pending", technicalStatus: "pending", structuralStatus: "pending", editorialStatus: "pending_confirmation", operationalStatus: "pending"})});
  equal(pending.eligible, false); equal(pending.observations.length, 0);

  const fullyProvenanced = extraction({
    checkpoint: {id: "checkpoint:1", schemaVersion: 1, updatedAt: NOW, checkpointFingerprint: fp("checkpoint")} as KnowledgeExtractionInput["checkpoint"],
    inspections: [{inspectionId: "inspection:1", inspectorId: "sanity-read", inspectorVersion: "AU4", inspectedAt: NOW, status: "observed", fingerprint: fp("inspection")} as NonNullable<KnowledgeExtractionInput["inspections"]>[number]],
    identities: [{resolutionFingerprint: fp("identity")} as NonNullable<KnowledgeExtractionInput["identities"]>[number]],
    resolution: {version: "1.0.0", decisionFingerprint: fp("resolution")} as unknown as KnowledgeExtractionInput["resolution"],
    transaction: {schemaVersion: "1.0.0", transactionFingerprint: fp("transaction")} as unknown as KnowledgeExtractionInput["transaction"],
    decision: {version: "1.1.0", decisionFingerprint: fp("decision-au8")} as KnowledgeExtractionInput["decision"],
    sufficiency: {version: "1.0.0", evaluationFingerprint: fp("sufficiency")} as KnowledgeExtractionInput["sufficiency"],
    autonomy: {schemaVersion: "1.0.0", policyFingerprint: fp("autonomy")} as KnowledgeExtractionInput["autonomy"],
    strategy: {schemaVersion: "1.0.0", strategyFingerprint: fp("strategy")} as KnowledgeExtractionInput["strategy"],
    loop: {schemaVersion: 1} as KnowledgeExtractionInput["loop"],
  });
  check(fullyProvenanced.provenance.checkpointFingerprint); equal(fullyProvenanced.provenance.inspectionFingerprints.length, 1); equal(fullyProvenanced.provenance.identityFingerprints.length, 1); check(fullyProvenanced.provenance.resolutionFingerprint); check(fullyProvenanced.provenance.transactionFingerprint); check(fullyProvenanced.provenance.decisionFingerprint); check(fullyProvenanced.provenance.sufficiencyFingerprint); check(fullyProvenanced.provenance.autonomyFingerprint); check(fullyProvenanced.provenance.strategyFingerprint); equal(fullyProvenanced.provenance.outcomeFingerprints.length, 1);

  const exact = consolidateKnowledge({extractions: [simple, simple]});
  equal(exact.items.length, 1); equal(exact.exactDuplicates, 1); equal(exact.occurrences.length, 1); equal(exact.recurrence[0].observationCount, 1); // replay idempotente
  const reinforcedSecond = extraction({outcome: outcome({id: "outcome:2", caseId: "case:2", correlationKey: "case:2:identity", evidenceFingerprint: fp("evidence:2"), inputFingerprint: fp("input:2")})});
  const reinforced = consolidateKnowledge({extractions: [reinforcedSecond, simple]});
  equal(reinforced.items.length, 1); equal(reinforced.reinforcements, 1); equal(reinforced.occurrences.length, 2); equal(reinforced.recurrence[0].observationCount, 2); equal(reinforced.recurrence[0].caseCount, 2); equal(reinforced.recurrence[0].producerCount, 1); check(reinforced.recurrence[0].independentSourceCount >= 2); equal(reinforced.recurrence[0].replacesCurrentEvidence, false); check(reinforced.relations.some((item) => item.kind === "reinforcement"));
  equal(JSON.stringify(reinforced), JSON.stringify(consolidateKnowledge({extractions: [simple, reinforcedSecond]})), "orden determinista");

  const sameClaimNegative = extraction({outcome: outcome({id: "outcome:3", currentStatus: "rejected", editorialStatus: "rejected", operationalStatus: "failed", evidenceFingerprint: fp("evidence:3")})});
  const conflicted = consolidateKnowledge({extractions: [simple, sameClaimNegative]});
  equal(conflicted.items.length, 2); equal(conflicted.conflicts.length, 1); check(conflicted.relations.some((item) => item.kind === "contradiction")); equal(conflicted.conflicts[0].requiresCurrentEvidence, true);
  const invalidationConsolidated = consolidateKnowledge({extractions: [simple, invalidated]});
  check(invalidationConsolidated.relations.some((item) => item.kind === "invalidated"));
  const temporalTwo = extraction({outcome: outcome({id: "outcome:temporal-2", entityType: "evento", evidenceFingerprint: fp("temporal-2")}), temporal: {validFrom: "2026-08-15T00:00:00.000Z", validUntil: "2026-09-01T00:00:00.000Z"}});
  const temporalOverlap = consolidateKnowledge({extractions: [temporal, temporalTwo]});
  check(temporalOverlap.relations.some((item) => item.kind === "temporal_overlap"));

  const shiftedTime = extraction({outcome: outcome({createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z"})});
  equal(simple.outcomeFingerprint, shiftedTime.outcomeFingerprint); equal(simple.extractionFingerprint, shiftedTime.extractionFingerprint); equal(simple.observations[0].observation.observationFingerprint, shiftedTime.observations[0].observation.observationFingerprint);
  equal(consolidateKnowledge({extractions: [simple]}).consolidationFingerprint, consolidateKnowledge({extractions: [shiftedTime]}).consolidationFingerprint);

  for (const item of reinforced.items) { equal(item.advisoryOnly, true); equal(item.replacesCurrentEvidence, false); }
  equal(exact.advisoryOnly, true); equal(exact.retrievesKnowledge, false); equal(exact.modifiesDecisions, false); equal(exact.appliesLearning, false); equal(exact.writes, false);
  equal(knowledgeExtractionSecurity.writes, false); equal(knowledgeExtractionSecurity.createsStores, false); equal(knowledgeExtractorSecurity.retrievesKnowledge, false); equal(knowledgeExtractorSecurity.chainOfThought, false); equal(knowledgeExtractorSecurity.prompts, false); equal(knowledgeConsolidationSecurity.resolvesConflicts, false);
  const sources = ["extract.ts", "consolidate.ts"].map((file) => readFileSync(new URL(`../_laboratorio/laboratorio-ia/src/review/knowledge/${file}`, import.meta.url), "utf8")).join("\n");
  check(!/from ["'][^"']*(store|executor|sanity)/i.test(sources)); check(!sources.includes("fetch(")); check(!sources.includes("localStorage")); check(!sources.includes("outcome.payload")); check(!sources.includes("event.payload")); check(!sources.includes("promptText"));
  console.log(`AU9 B2 knowledge extraction and consolidation tests: OK (${assertions} assertions; extraction, reinforcement, anti-double-learning, recurrence, conflicts, provenance, temporal overlap and zero writes)`);
}

main();
