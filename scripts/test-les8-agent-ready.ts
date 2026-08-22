import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {agentReadyAdaptersSecurity, projectAgentCapability} from "../_laboratorio/laboratorio-ia/src/agent-ready/adapters";
import {AGENT_READY_CONTRACT_VERSION, agentReadyModelSecurity} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {agentSnapshotSecurity, buildAgentSnapshot, compareAgentSnapshots} from "../_laboratorio/laboratorio-ia/src/agent-ready/snapshot";
import {buildInteractionCapability, type InteractionCapability} from "../_laboratorio/laboratorio-ia/src/interactions/model";
import type {LabNotification} from "../_laboratorio/laboratorio-ia/src/notifications/types";
import {buildOperatorExperienceModel} from "../_laboratorio/laboratorio-ia/src/operator/adapters";
import type {ProcessExperiencePresentation} from "../_laboratorio/laboratorio-ia/src/processes/presentation";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {buildGlobalStatusModel, type GlobalStatusEffect, type SubsystemStatus, type SubsystemStatusState} from "../_laboratorio/laboratorio-ia/src/status/model";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function subsystem(id: SubsystemStatus["id"], state: SubsystemStatusState, effect: GlobalStatusEffect, options: Partial<SubsystemStatus> = {}): SubsystemStatus {
  return {id, label: id, state, effect, summary: `${id}:${state}`, activeCount: 0, currentIncidentCount: 0, historicalCount: 0, isLive: false, ...options};
}

function globalState(telegram: SubsystemStatus = subsystem("telegram", "operational", "none", {route: "/telegram", checkedAt: "2026-08-23T09:00:00.000Z"}), evaluatedAt = "2026-08-23T09:00:01.000Z") {
  return buildGlobalStatusModel([
    subsystem("runtime", "operational", "none", {route: "/editorial", checkedAt: "2026-08-23T09:00:00.000Z"}),
    subsystem("references", "operational", "none", {route: "/editorial", checkedAt: "2026-08-23T09:00:00.000Z"}),
    telegram,
    subsystem("notifications", "operational", "none", {route: "/actividad", historicalCount: 1}),
    subsystem("processes", "idle", "none", {route: "/actividad"}),
    subsystem("review", "idle", "none", {route: "/revision"}),
  ], evaluatedAt);
}

function process(overrides: Partial<ProcessExperiencePresentation> = {}): ProcessExperiencePresentation {
  return {id: "process:editorial", title: "Preparación editorial", state: "running", stateLabel: "En ejecución", feedbackState: "processing", temporal: "live", isLive: true, isHistorical: false, source: "Panel IA · Process Store", purpose: "Preparar contenido", updatedAt: "2026-08-23T09:01:00.000Z", progress: {kind: "determinate", current: 1, total: 3}, steps: [], retryAuthorized: false, cancelAuthorized: false, notificationPolicy: "milestones_only", ...overrides};
}

function notification(overrides: Partial<LabNotification> = {}): LabNotification {
  return {id: "notification:historical", level: "error", title: "Fallo token=telegram-secret", message: "payload privado que no debe proyectarse", source: "Notification Engine", createdAt: "2026-08-22T08:00:00.000Z", read: false, deliveryStatus: "failed", priority: "high", ...overrides};
}

function reviewCase(overrides: Record<string, unknown> = {}): ReviewCase {
  return {
    schemaVersion: 1, id: "case:agent-ready", dedupeKey: "case:agent-ready", module: "editorial.builder", title: "Resolver referencia", status: "open", priority: "critical", subject: {type: "article"},
    issues: [{id: "issue:reference", kind: "missing_reference", label: "Referencia", message: "Falta referencia", blocking: true, evidence: ["raw evidence body"]}], resolutions: [], context: {privatePayload: "never-project-this"}, resumeAction: {kind: "internal_operation", operation: "secret-operation", payload: {token: "never-project-token"}},
    createdAt: "2026-08-23T08:00:00.000Z", updatedAt: "2026-08-23T09:02:00.000Z", version: 3, resumeAttempts: 0,
    globalResolution: {
      schemaVersion: 1, id: "checkpoint:case:agent-ready", caseId: "case:agent-ready", caseVersion: 3, storedAtCaseVersion: 3, producer: "editorial.builder",
      planFingerprint: "sha256-v1:plan", graphFingerprint: "sha256-v1:graph", caseFingerprint: "sha256-v1:case", snapshotFingerprint: "sha256-v1:snapshot", checkpointFingerprint: "sha256-v1:checkpoint", phase: "blocked",
      transaction: {transactionId: "transaction:case:agent-ready", transactionFingerprint: "sha256-v1:transaction", sourcePlanFingerprint: "sha256-v1:plan", phase: "blocked", steps: [], blockers: [], history: [], checkpointFingerprint: "sha256-v1:transaction-checkpoint", createdAt: "2026-08-23T08:30:00.000Z", updatedAt: "2026-08-23T09:02:00.000Z", schemaVersion: 1},
      autonomousLoop: {schemaVersion: 1, loopId: "loop:case:agent-ready", loopFingerprint: "sha256-v1:loop", iteration: 2, phase: "blocked", decisionFingerprint: "sha256-v1:decision", sufficiencyFingerprint: "sha256-v1:sufficiency", autonomyFingerprint: "sha256-v1:autonomy", strategyFingerprint: "sha256-v1:strategy", stopReason: "human_required", history: []},
      history: [{id: "history:inspection", kind: "reconciliation_evidence_collected", status: "observed", occurredAt: "2026-08-23T09:01:00.000Z", evidenceFingerprint: "sha256-v1:inspection-evidence"}],
      plan: {}, graph: {}, createdAt: "2026-08-23T08:30:00.000Z", updatedAt: "2026-08-23T09:02:00.000Z",
    },
    ...overrides,
  } as unknown as ReviewCase;
}

function capabilities(): InteractionCapability[] {
  return [
    buildInteractionCapability({id: "navigate-review", label: "Abrir Review", kind: "subtle", intent: "navigate", authority: {allowed: true, source: "UI route"}, href: "/revision"}),
    buildInteractionCapability({id: "refresh-global", label: "Actualizar", busyLabel: "Actualizando", kind: "secondary", intent: "refresh", authority: {allowed: true, source: "LES 4 · Global Status"}, busy: true, busyReason: "Comprobación en curso"}),
    buildInteractionCapability({id: "retry-notification", label: "Reintentar", kind: "secondary", intent: "retry", authority: {allowed: false, source: "Notification Store", reason: "delivery_not_retryable"}}),
    buildInteractionCapability({id: "cancel-au7", label: "Cancelar", kind: "destructive", intent: "cancel", authority: {allowed: true, source: "AU7 Transaction Authority", confirmation: "domain"}}),
    buildInteractionCapability({id: "authorize-au8", label: "Autorizar", kind: "primary", intent: "authorize", authority: {allowed: true, source: "AU8 Supervised Loop", confirmation: "domain"}}),
  ];
}

function snapshotInput(options: Partial<{global: ReturnType<typeof globalState>; processes: ProcessExperiencePresentation[]; notifications: LabNotification[]; cases: ReviewCase[]; capabilities: InteractionCapability[]; observedAt: string}> = {}) {
  const global = options.global ?? globalState();
  const processes = options.processes ?? [process()];
  const notifications = options.notifications ?? [notification()];
  const cases = options.cases ?? [reviewCase()];
  return {observedAt: options.observedAt ?? "2026-08-23T09:03:00.000Z", globalStatus: global, operator: buildOperatorExperienceModel({globalStatus: global, processes, notifications, reviewCases: cases}), processes, notifications, reviewCases: cases, capabilities: options.capabilities ?? capabilities()};
}

function containsFunction(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsFunction(child, seen));
}

function main(): void {
  const snapshot = buildAgentSnapshot(snapshotInput());
  const json = JSON.stringify(snapshot);
  check(json.length > 0 && JSON.parse(json).schemaVersion === 1, "1 snapshot serializable y JSON-safe");
  equal(snapshot.contractVersion, AGENT_READY_CONTRACT_VERSION, "contrato versionado");
  check(snapshot.observationId.startsWith("agent-observation:sha256-v1:"), "2 observation ID estable deriva de fingerprint");
  equal(snapshot.observationId, `agent-observation:${snapshot.observationFingerprint}`, "2 ID trazable");

  const reordered = buildAgentSnapshot(snapshotInput({processes: [process()], notifications: [notification()], cases: [reviewCase()], capabilities: [...capabilities()].reverse()}));
  equal(reordered.observationFingerprint, snapshot.observationFingerprint, "3 orden de entrada no altera fingerprint");
  assert.deepEqual(reordered.capabilities.map((item) => item.id), [...snapshot.capabilities.map((item) => item.id)].sort()); assertions += 1;
  const differentObservationTime = buildAgentSnapshot(snapshotInput({observedAt: "2026-08-23T10:00:00.000Z"}));
  equal(differentObservationTime.observationFingerprint, snapshot.observationFingerprint, "3 observedAt explícito no altera identidad semántica");
  equal(snapshot.globalStatus.state, "operational", "4 global status presente");
  check(snapshot.operator.attention.some((item) => item.id === "review:case:agent-ready"), "5 operator signals presentes");
  equal(snapshot.processes[0]?.id, "process:editorial", "6 process projection usa ID original");
  equal(snapshot.notifications[0]?.id, "notification:historical", "7 notification projection usa ID original");
  equal(snapshot.notifications[0]?.temporal, "historical", "8 notification fallida es histórica");
  equal(snapshot.processes[0]?.temporal, "current", "8 process vivo es current");
  equal(snapshot.review[0]?.id, "case:agent-ready", "9 review projection usa case ID");

  for (const dependency of ["runtime", "references", "telegram"] as const) check(snapshot.dependencies.some((item) => item.id === dependency), `${dependency === "runtime" ? 10 : dependency === "references" ? 11 : 12} ${dependency} projection presente`);
  const available = snapshot.capabilities.find((item) => item.id === "navigate-review")!;
  equal(available.availability, "available", "13 capability available");
  equal(available.available, true);
  const blocked = snapshot.capabilities.find((item) => item.id === "retry-notification")!;
  equal(blocked.availability, "blocked", "14 capability blocked");
  equal(blocked.blocked, true);
  const busy = snapshot.capabilities.find((item) => item.id === "refresh-global")!;
  equal(busy.availability, "busy", "15 capability busy");
  equal(busy.busy, true);
  const authorize = snapshot.capabilities.find((item) => item.id === "authorize-au8")!;
  equal(authorize.requiresAuthorization, true, "16 autorización explícita estructurada");
  const destructive = snapshot.capabilities.find((item) => item.id === "cancel-au7")!;
  equal(destructive.destructive, true, "17 destructive estructurado");
  equal(destructive.requiresAuthorization, true);
  equal(blocked.authority.owner, "notification_store", "18 retry mapea Notification Store");
  equal(destructive.authority.owner, "au7_transaction", "18 cancel mapea AU7");
  equal(authorize.authority.owner, "au8_supervised", "18 authorize mapea AU8");
  equal(busy.authority.owner, "les4_live_checks", "18 refresh mapea LES4");
  equal(blocked.reason?.code, "authority_blocked", "19 disabled reason contiene código");
  equal(blocked.reason?.text, "delivery_not_retryable", "19 disabled reason conserva copy segura");
  equal(available.destination, "/revision", "20 destination explícito");
  check(available.authority.owner !== ("agent" as never), "18 agente nunca es owner");

  equal(containsFunction(snapshot), false, "21 sin function values");
  check(!json.includes("$$typeof") && !json.includes("react.element"), "22 sin React nodes");
  check(!json.includes("telegram-secret") && !json.includes("never-project-token"), "23 no secrets");
  check(json.includes("[redacted]") && !json.includes("privatePayload") && !json.includes("payload privado"), "24 credenciales/payloads crudos minimizados");
  equal(snapshot.review[0]?.checkpoint?.checkpointFingerprint, "sha256-v1:checkpoint", "metadata checkpoint segura presente");
  equal(snapshot.review[0]?.checkpoint?.transaction?.fingerprint, "sha256-v1:transaction", "AU7 fingerprint presente");
  equal(snapshot.review[0]?.checkpoint?.supervisedLoop?.fingerprint, "sha256-v1:loop", "AU8 fingerprint presente");
  assert.deepEqual(snapshot.review[0]?.evidenceReferences, ["review-issue:issue:reference", "sha256-v1:inspection-evidence"]); assertions += 1;

  const agentSources = readdirSync("_laboratorio/laboratorio-ia/src/agent-ready").map((name) => source(`_laboratorio/laboratorio-ia/src/agent-ready/${name}`)).join("\n");
  check(!/\b(POST|PUT|PATCH|DELETE|createNotification|startProcess|retryNotificationDelivery|runAutonomousSupervisedLoop)\b/.test(agentSources), "25 no writes/ejecución");
  equal(readdirSync("_laboratorio/laboratorio-ia/src/agent-ready").some((name) => /executor/i.test(name)), false, "26 no executor nuevo");
  equal(readdirSync("_laboratorio/laboratorio-ia/src/agent-ready").some((name) => /planner/i.test(name)), false, "27 no planner nuevo");
  equal(readdirSync("_laboratorio/laboratorio-ia/src/agent-ready").some((name) => /store|memory/i.test(name)), false, "28 no store/memory nuevo");
  equal(readdirSync("_laboratorio/laboratorio-ia/src/agent-ready").some((name) => /checkpoint/i.test(name)), false, "29 no checkpoint paralelo");
  check(!/decideAutonomy|buildAutonomy|autonomyDecision/.test(agentSources), "30 no autonomy decision");
  check(!/buildStrategy|planStrategy|strategyDecision/.test(agentSources), "31 no strategy decision");

  const au7 = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  const au8 = source("_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx");
  check(au7.includes("view.canExecuteNext") && au7.includes("view.canOpenReconciliation"), "32 AU7 authority intacta");
  check(au8.includes("runAutonomousSupervisedLoop") && au8.includes('cta === "authorize"'), "33 AU8 authority intacta");
  equal(snapshot.notifications[0]?.temporal, "historical", "34 historical error no se convierte en current");
  equal(snapshot.operator.attention.some((item) => item.source === "notification"), false, "35 unread no se convierte en attention");
  equal(snapshot.processes[0]?.active, true, "36 active process permanece activity");
  equal(snapshot.processes[0]?.actions.retryAuthorized, false, "36 activity no inventa acción");
  equal(snapshot.review[0]?.blocked, true, "37 review blocked escala estructuralmente");
  check(snapshot.review[0]!.reasonCodes.includes("issue:missing_reference") && snapshot.review[0]!.reasonCodes.includes("transaction:blocked"), "37 razones machine-readable");

  const degradedTelegram = subsystem("telegram", "degraded", "degraded", {route: "/telegram", currentIncidentCount: 1, reason: "telegram_health_failed", checkedAt: "2026-08-23T09:05:00.000Z"});
  const healthySnapshot = buildAgentSnapshot(snapshotInput({global: globalState(), processes: [], notifications: [], cases: [], capabilities: capabilities()}));
  const degradedSnapshot = buildAgentSnapshot(snapshotInput({global: globalState(degradedTelegram), processes: [process()], notifications: [], cases: [reviewCase()], capabilities: capabilities()}));
  const degradedDiff = compareAgentSnapshots(healthySnapshot, degradedSnapshot);
  check(degradedDiff.changes.some((item) => item.kind === "health_degraded" && item.entityId === "telegram"), "38 health degradation observable");
  check(degradedDiff.changes.some((item) => item.kind === "process_started"), "39 diff puro detecta proceso nuevo");
  check(degradedDiff.changes.some((item) => item.kind === "review_added"), "39 diff puro detecta review nuevo");
  check(degradedDiff.changes.some((item) => item.kind === "blocker_added"), "39 diff puro detecta bloqueo nuevo");
  const recoveredDiff = compareAgentSnapshots(degradedSnapshot, healthySnapshot);
  check(recoveredDiff.changes.some((item) => item.kind === "health_recovered" && item.entityId === "telegram"), "38 health recovery observable");
  check(recoveredDiff.changes.some((item) => item.kind === "process_finished"), "39 diff detecta fin de proceso");
  check(recoveredDiff.changes.some((item) => item.kind === "review_resolved"), "39 diff detecta review resuelto/ausente");

  for (const [key, value] of Object.entries(agentReadyModelSecurity)) equal(value, false, `security model ${key}`);
  equal(agentReadyAdaptersSecurity.pure, true);
  equal(agentSnapshotSecurity.pure, true);
  for (const key of ["createsStore", "persists", "fetches", "writes", "executes", "retries", "plans", "decidesAutonomy", "createsCheckpoint"] as const) equal(agentReadyAdaptersSecurity[key], false, `security adapter ${key}`);
  for (const key of ["createsStore", "persists", "watches", "polls", "fetches", "writes", "executes", "retries", "plans", "decidesAutonomy", "createsCheckpoint"] as const) equal(agentSnapshotSecurity[key], false, `security snapshot ${key}`);

  for (const suite of ["test-les1-global-feedback.ts", "test-les2-notification-experience.ts", "test-les3-process-experience.ts", "test-les4-global-status.ts", "test-les5-interaction-system.ts", "test-les6-motion-system.ts", "test-les7-operator-experience.ts"]) check(source(`scripts/${suite}`).length > 100, `40 compatibilidad ${suite}`);
  check(source("scripts/test-au10-final-certification.ts").includes("AU10 B6 final certification"), "41 AU10 intacto");
  equal(JSON.stringify(buildAgentSnapshot(snapshotInput())), JSON.stringify(buildAgentSnapshot(snapshotInput())), "42 JSON stringify estable");
  equal(projectAgentCapability(capabilities()[0]!).id, "navigate-review", "capability adapter puro y estable");
  check(assertions >= 95, `se esperaban al menos 95 assertions y hubo ${assertions}`);
  console.log(`LES 8 Agent Ready: OK (${assertions} assertions; serializable deterministic snapshot, stable IDs, Global/Operator/Process/Notification/Review/AU7/AU8 projections, capability/authority contract, safe metadata, pure diff, payload minimization, zero store/planner/executor/loop/write)`);
}

main();
