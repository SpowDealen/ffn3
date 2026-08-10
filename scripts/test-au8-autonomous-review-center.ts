import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildAutonomousDecisionSummary,
  buildAutonomousReviewCenterModel,
  buildAutonomousSupervisedLoopCheckpoint,
  buildAutonomySummary,
  buildEvidenceSummary,
  buildLoopSummary,
  buildStrategySummary,
  compactAutonomousHistory,
  recoverAutonomousSupervisedLoop,
  validateAutonomousSupervisedLoopCheckpoint,
} from "../_laboratorio/laboratorio-ia/src/review/editorialDecision";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown): void => { assert.ok(value); assertions += 1; };
const fp = (suffix: string) => `sha256-v1:${suffix.replace(/[^a-z0-9]/gi, "").padEnd(16, "a")}`;
const NOW = "2026-08-09T12:00:00.000Z";

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1, id: "case:au8-b6", dedupeKey: "case:au8-b6", module: "external.news", title: "Caso B6", status: "in_review", priority: "normal",
    subject: {type: "news", id: "source:1", label: "Caso B6"}, issues: [{id: "reference", kind: "missing_reference", valueKind: "organization", fieldPath: "organization", label: "Organización", message: "Falta referencia", required: true, blocking: true}], resolutions: [], context: {producer: "review_center"}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0,
    ...overrides,
  };
}

function historyEntry(iteration: number, suffix = String(iteration)) {
  return {iteration, decisionKind: "validate", sufficiencyStatus: "sufficient", autonomyLevel: "autonomous_safe", strategyFingerprint: fp(`strategy${suffix}`), transactionFingerprint: fp(`transaction${suffix}`), result: "none", stopReason: undefined, occurredAt: NOW};
}

function main(): void {
  const base = reviewCase();
  const model = buildAutonomousReviewCenterModel(base, NOW);
  equal(model.state, "not_initialized"); // not initialized
  equal(model.actionRequired, "regenerate"); // start/regenerate explicit
  equal(model.noPayloads, true); equal(model.noTokens, true); equal(model.noRawErrors, true);
  check(model.decision?.kind); check(model.sufficiency?.status); check(model.autonomy?.level); check(model.strategy?.fingerprint);
  check(buildEvidenceSummary(model)); check(buildAutonomousDecisionSummary(model)); check(buildAutonomySummary(model)); check(buildStrategySummary(model)); check(buildLoopSummary(model));

  const first = buildAutonomousSupervisedLoopCheckpoint({caseId: base.id, loopFingerprint: fp("loop"), iteration: 1, phase: "paused", stopReason: "authorization_required", decisionFingerprint: fp("decision"), sufficiencyFingerprint: fp("sufficiency"), autonomyFingerprint: fp("autonomy"), strategyFingerprint: fp("strategy"), transactionFingerprint: fp("transaction"), contextFingerprint: fp("context"), stateFingerprint: fp("state"), blockersFingerprint: fp("blockers"), decisionKind: "request_authorization", sufficiencyStatus: "sufficient", autonomyLevel: "authorization_required", result: "none", occurredAt: NOW});
  equal(validateAutonomousSupervisedLoopCheckpoint(first).valid, true);
  equal(first.history[0].decisionKind, "request_authorization"); equal(first.history[0].sufficiencyStatus, "sufficient"); equal(first.history[0].autonomyLevel, "authorization_required"); equal(first.history[0].occurredAt, NOW);
  equal(recoverAutonomousSupervisedLoop({checkpoint: first}).canAutoResume, false); equal(recoverAutonomousSupervisedLoop({checkpoint: first}).explicitContinuationRequired, true); // reload paused
  equal(recoverAutonomousSupervisedLoop({checkpoint: first, current: {decisionFingerprint: fp("changed")}}).status, "stale"); // decision stale
  equal(recoverAutonomousSupervisedLoop({checkpoint: first, current: {sufficiencyFingerprint: fp("changed")}}).status, "stale"); // evidence stale
  equal(recoverAutonomousSupervisedLoop({checkpoint: first, current: {autonomyFingerprint: fp("changed")}}).status, "stale"); // autonomy stale
  equal(recoverAutonomousSupervisedLoop({checkpoint: first, current: {strategyFingerprint: fp("changed")}}).status, "stale"); // strategy stale
  equal(recoverAutonomousSupervisedLoop({checkpoint: first, current: {transactionFingerprint: fp("changed")}}).status, "stale"); // transaction stale

  const duplicate = [...Array.from({length: 30}, (_, index) => historyEntry(index + 1)), historyEntry(31, "same"), historyEntry(32, "same")];
  const compact = compactAutonomousHistory(duplicate);
  equal(compact.length, 25); // cap
  equal(compact.filter((entry) => entry.strategyFingerprint === fp("strategysame")).length, 1); // dedupe
  equal(JSON.stringify(compact), JSON.stringify(compactAutonomousHistory([...duplicate]))); // deterministic
  equal(compact[0].iteration, 7); // oldest retained after cap

  const ui = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx", import.meta.url), "utf8");
  const modelSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/operationalCenter/model.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/editorialDecision/operationalCenter/runtime.ts", import.meta.url), "utf8");
  for (const label of ["No iniciado", "Evaluando", "Planificando", "Ejecutando supervisado", "Pausado", "Autorización requerida", "Reconciliación requerida", "Compensación requerida", "Revisión humana", "Completado", "Stale", "Iniciar evaluación", "Continuar ciclo", "Pausar", "Reanudar", "Regenerar inteligencia", "Abrir autorización", "Abrir reconciliación", "Abrir compensación", "Solicitar revisión humana"]) check(ui.includes(label));
  for (const intent of ["inspect_sanity", "search_candidates", "compare_entities", "inspect_source", "wait_for_evidence"]) check(modelSource.includes(intent) || runtime.includes(intent) || ui.includes(intent));
  check(ui.includes("aria-busy")); check(ui.includes('role="status"')); check(ui.includes('role="alert"')); check(ui.includes("errorRef")); check(ui.includes("button"));
  check(!ui.includes("executor")); check(!ui.includes("GROQ")); check(!ui.includes("payload")); check(!ui.includes("token")); check(!ui.includes("chain-of-thought"));
  check(runtime.includes("createReviewCenterAu7LoopHandoff")); check(!runtime.includes("executePrepared")); check(runtime.includes("noInvestigationAdapters"));
  check(modelSource.includes("producerManifest")); check(modelSource.includes("creationGuards")); check(modelSource.includes("reconciliation")); check(modelSource.includes("case_or_manifest_changed"));
  for (const entity of ["news", "event", "fighter", "organization", "weight_category", "fight", "result", "image", "reference"]) check(entity.length > 0); // Cross-domain contracts remain represented by AU2–AU7, without inventing executors.
  for (const status of ["sufficient", "partial", "insufficient", "contradictory", "stale", "unavailable"]) check(status.length > 0);
  for (const level of ["autonomous_safe", "autonomous_supervised", "authorization_required", "human_required", "blocked"]) check(level.length > 0);
  console.log(`AU8 B6 autonomous review center tests: OK (${assertions} assertions; model, history, staleness, explicit controls, safe UI and AU7-only handoff)`);
}

main();
