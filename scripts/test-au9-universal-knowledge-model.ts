import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildKnowledgeProvenance,
  buildKnowledgeRecommendation,
  buildKnowledgeSource,
  createKnowledgeItem,
  deduplicateKnowledgeItems,
  detectKnowledgeConflicts,
  evaluateKnowledgeValidity,
  invalidateKnowledgeItem,
  parseKnowledgeItem,
  serializeKnowledgeItem,
  supersedeKnowledgeItem,
  universalEditorialKnowledgeSecurity,
  validateKnowledgeItem,
  type CreateKnowledgeItemInput,
  type KnowledgeDomain,
  type KnowledgeKind,
} from "../_laboratorio/laboratorio-ia/src/review/knowledge";
import {computeUniversalFingerprint} from "../_laboratorio/laboratorio-ia/src/review/universal";

const NOW = "2026-08-10T10:00:00.000Z";
const LATER = "2026-08-12T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const throws = (fn: () => unknown, match: RegExp): void => { assert.throws(fn, match); assertions += 1; };
const fp = (value: string) => computeUniversalFingerprint(value);

const sourceA = buildKnowledgeSource({sourceId: "inspection:official", kind: "inspection", authority: "authoritative", sourceVersion: "AU4/1", observedAt: NOW, independenceGroup: "sanity-official"});
const sourceB = buildKnowledgeSource({sourceId: "outcome:editorial", kind: "outcome", authority: "editorial_confirmed", sourceVersion: "AU3/1", observedAt: NOW, independenceGroup: "editorial-review"});
const provenance = buildKnowledgeProvenance({caseId: "case:au9", caseVersion: 7, producerId: "review_center", engineVersions: {checkpoint: "AU3", inspection: "AU4", identity: "AU5", resolution: "AU6", transaction: "AU7", decision: "AU8"}, checkpointFingerprint: fp("checkpoint"), inspectionFingerprints: [fp("inspection")], identityFingerprints: [fp("identity")], resolutionFingerprint: fp("resolution"), transactionFingerprint: fp("transaction"), decisionFingerprint: fp("decision"), sufficiencyFingerprint: fp("sufficiency"), autonomyFingerprint: fp("autonomy"), strategyFingerprint: fp("strategy"), outcomeFingerprints: [fp("outcome")], memoryFingerprints: ["mem1:history"]});

function input(domain: KnowledgeDomain = "fighter", kind: KnowledgeKind = "confirmed_fact", polarity: "supports" | "contradicts" = "supports", suffix: string = domain): CreateKnowledgeItemInput {
  return {
    domain, kind, subjectKey: `${domain}:canonical`, claimCode: `identity.${suffix}`, safeSummary: `Resumen editorial seguro para ${domain}.`, authority: "authoritative",
    observations: [{claimCode: `identity.${suffix}`, subjectKey: `${domain}:canonical`, polarity, safeSummary: `Observación ${polarity} para ${domain}.`, valueFingerprint: fp(`value:${domain}:${polarity}`), evidenceFingerprints: [fp(`evidence:${domain}`)], sourceIds: [sourceA.sourceId, sourceB.sourceId], observedAt: NOW}],
    sources: [sourceB, sourceA], references: [{kind: "case", id: "case:au9", relation: "derived_from", fingerprint: fp("case")}, {kind: "decision", id: "decision:au8", relation: "derived_from", fingerprint: fp("decision")}],
    conflicts: [], recommendations: [], validity: {state: kind === "temporal_knowledge" ? "temporal" : "current", validFrom: NOW, validUntil: kind === "temporal_knowledge" ? LATER : undefined, evaluatedAt: NOW}, provenance,
  };
}

function main(): void {
  const domains: KnowledgeDomain[] = ["news", "event", "fighter", "organization", "weight_category", "fight", "result", "relationship"];
  for (const domain of domains) { const item = createKnowledgeItem(input(domain)); equal(item.domain, domain); equal(item.replacesCurrentEvidence, false); equal(item.serializable, true); }
  const kinds: KnowledgeKind[] = ["confirmed_fact", "observed_pattern", "historical_experience", "recommendation", "negative_evidence", "contradiction", "invalidated_knowledge", "temporal_knowledge"];
  for (const kind of kinds) equal(createKnowledgeItem(input("fighter", kind, kind === "contradiction" ? "contradicts" : "supports", kind)).kind, kind);

  const canonical = createKnowledgeItem(input(), () => NOW);
  const reordered = createKnowledgeItem({...input(), sources: [sourceA, sourceB], references: [...input().references].reverse(), observations: [{...input().observations[0], evidenceFingerprints: [...input().observations[0].evidenceFingerprints].reverse(), sourceIds: [sourceB.sourceId, sourceA.sourceId]}]}, () => LATER);
  equal(canonical.knowledgeFingerprint, reordered.knowledgeFingerprint, "timestamps de almacenamiento y orden no alteran semántica");
  equal(canonical.id, reordered.id); equal(canonical.contentFingerprint, reordered.contentFingerprint);
  equal(canonical.schemaVersion, "1.0.0"); equal(canonical.fingerprintVersion, 1); equal(canonical.revision, 1);
  check(canonical.provenance.checkpointFingerprint); check(canonical.provenance.decisionFingerprint); check(canonical.provenance.strategyFingerprint); equal(canonical.provenance.provenanceFingerprint, provenance.provenanceFingerprint);
  equal(canonical.sources[0].sourceId, sourceA.sourceId); equal(canonical.observations[0].sourceIds.length, 2);

  const serialized = serializeKnowledgeItem(canonical);
  const parsed = parseKnowledgeItem(serialized);
  equal(JSON.stringify(parsed), JSON.stringify(canonical)); equal(validateKnowledgeItem(parsed).valid, true); check(serialized.includes("knowledgeFingerprint"));
  const tampered = JSON.parse(serialized); tampered.safeSummary = "Manipulado";
  throws(() => parseKnowledgeItem(JSON.stringify(tampered)), /knowledge_fingerprint_mismatch/);
  const tamperedObservation = JSON.parse(serialized); tamperedObservation.observations[0].safeSummary = "Manipulada";
  throws(() => parseKnowledgeItem(JSON.stringify(tamperedObservation)), /knowledge_observation_fingerprint_mismatch/);

  const temporal = createKnowledgeItem(input("event", "temporal_knowledge"));
  equal(evaluateKnowledgeValidity(temporal, NOW).state, "temporal");
  equal(evaluateKnowledgeValidity(temporal, "2026-08-13T10:00:00.000Z").state, "expired");
  const invalidated = invalidateKnowledgeItem(canonical, {reasonCode: "current_evidence_refuted", invalidatedAt: LATER});
  equal(invalidated.validity.state, "invalidated"); equal(invalidated.kind, "invalidated_knowledge"); equal(invalidated.revision, 2); check(invalidated.knowledgeFingerprint !== canonical.knowledgeFingerprint);
  const superseded = supersedeKnowledgeItem(canonical, {supersededBy: "knowledge:new", supersededAt: LATER});
  equal(superseded.validity.state, "superseded"); equal(superseded.validity.supersededBy, "knowledge:new"); equal(superseded.revision, 2); check(superseded.references.some((item) => item.relation === "supersedes"));
  throws(() => createKnowledgeItem({...input("event", "temporal_knowledge"), validity: {state: "temporal", validFrom: LATER, validUntil: NOW, evaluatedAt: NOW}}), /knowledge_validity_range_invalid/);

  equal(deduplicateKnowledgeItems([canonical, reordered, canonical]).length, 1);
  equal(deduplicateKnowledgeItems([invalidated, canonical]).length, 2);
  equal(JSON.stringify(deduplicateKnowledgeItems([invalidated, canonical])), JSON.stringify(deduplicateKnowledgeItems([canonical, invalidated])));
  const contrary = createKnowledgeItem(input("fighter", "contradiction", "contradicts"));
  const conflicts = detectKnowledgeConflicts([contrary, canonical]);
  equal(conflicts.length, 1); equal(conflicts[0].severity, "critical"); equal(conflicts[0].requiresCurrentEvidence, true); check(conflicts[0].reasonCodes.includes("knowledge_polarity_conflict"));
  equal(detectKnowledgeConflicts([canonical]).length, 0);

  const recommendation = buildKnowledgeRecommendation({action: "inspect_current_evidence", safeSummary: "Confirmar con evidencia vigente antes de reutilizar.", reasonCodes: ["historical_only", "historical_only"], supportingKnowledgeIds: [canonical.id]});
  equal(recommendation.advisoryOnly, true); equal(recommendation.requiresCurrentEvidence, true); equal(recommendation.reasonCodes.length, 1); check(recommendation.recommendationFingerprint.startsWith("sha256-v1:"));

  equal(universalEditorialKnowledgeSecurity.pure, true); equal(universalEditorialKnowledgeSecurity.writes, false); equal(universalEditorialKnowledgeSecurity.accessesSanity, false); equal(universalEditorialKnowledgeSecurity.createsStores, false); equal(universalEditorialKnowledgeSecurity.invokesExecutors, false); equal(universalEditorialKnowledgeSecurity.replacesCurrentEvidence, false);
  const modelSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/knowledge/model.ts", import.meta.url), "utf8");
  check(!/from ["'][^"']*(store|executor|sanity)/i.test(modelSource)); check(!modelSource.includes("fetch(")); check(!modelSource.includes("localStorage")); check(!modelSource.includes("payload"));
  console.log(`AU9 B1 universal editorial knowledge model tests: OK (${assertions} assertions; 8 domains, 8 knowledge kinds, temporal validity, provenance, conflict, deterministic fingerprints and zero writes)`);
}

main();
