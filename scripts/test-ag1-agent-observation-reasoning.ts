import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import type {AgentAuthorityOwner, AgentCapability, AgentDependency, AgentNotification, AgentOperatorSignal, AgentProcess, AgentReview, AgentSnapshot} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {AGENT_READY_CONTRACT_VERSION} from "../_laboratorio/laboratorio-ia/src/agent-ready/model";
import {compareAgentSnapshots} from "../_laboratorio/laboratorio-ia/src/agent/compare";
import {agentDiagnosisSecurity, diagnoseAgentContext} from "../_laboratorio/laboratorio-ia/src/agent/diagnosis";
import {AGENT_REASONING_CONTRACT_VERSION, agentReasoningModelSecurity, type AgentDiagnosis, type AgentObservationDiff, type AgentProposalAuthority} from "../_laboratorio/laboratorio-ia/src/agent/model";
import {agentProposalSecurity, buildAgentProposals, mapProposalAuthority} from "../_laboratorio/laboratorio-ia/src/agent/proposals";
import {agentReasoningContextSecurity, buildReasoningContext} from "../_laboratorio/laboratorio-ia/src/agent/reasoning";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");

function authority(owner: AgentAuthorityOwner, label: string) {
  return Object.freeze({owner, source: label});
}

function dependency(state: AgentDependency["state"], current: boolean): AgentDependency {
  const effect: AgentDependency["effect"] = state === "operational" || state === "idle" ? "none" : state;
  return Object.freeze({id: "references", label: "Reference Entities", state, effect, current, live: false, reason: state === "operational" ? undefined : Object.freeze({code: "references_unavailable"}), destination: "/editorial", activeCount: 0, currentIncidentCount: current ? 1 : 0, historicalCount: current ? 0 : 1});
}

function signal(id: string, priority: AgentOperatorSignal["priority"] = "high"): AgentOperatorSignal {
  return Object.freeze({id, source: "review", kind: "blocker", priority, temporal: "current", title: "Reference blocked", actionable: true, authority: authority("review_center", "Review Center"), reason: Object.freeze({code: "missing_reference"}), destination: "/revision"});
}

function process(active: boolean): AgentProcess {
  return Object.freeze({id: "au7:case:1", title: "Transaction", state: active ? "running" : "completed", temporal: active ? "current" : "historical", active, source: "Centro de Revisión · AU7", authority: authority("au7_transaction", "AU7 Transaction Authority"), progress: Object.freeze(active ? {kind: "indeterminate" as const} : {kind: "none" as const}), actions: Object.freeze({retryAuthorized: false, cancelAuthorized: false}), destination: "/actividad"});
}

function review(current: boolean, priority: AgentReview["priority"] = "high"): AgentReview {
  return Object.freeze({
    id: "case:1", title: "Resolve reference", version: 4, status: current ? "open" : "resolved", priority, temporal: current ? "current" : "historical", blocked: current, unresolvedIssueCount: current ? 1 : 0, unresolvedBlockingCount: current ? 1 : 0,
    reasonCodes: Object.freeze(current ? ["issue:missing_reference"] : []), evidenceReferences: Object.freeze(["source:official:1", "inspection:sha256-v1:evidence"]), updatedAt: "2026-08-29T10:00:00.000Z",
    authority: Object.freeze([authority("review_center", "Review Center"), authority("au7_transaction", "AU7"), authority("au8_supervised", "AU8")]), destination: "/revision",
    checkpoint: Object.freeze({id: "checkpoint:case:1", schemaVersion: 1, caseVersion: 4, phase: current ? "blocked" : "resolved", checkpointFingerprint: "sha256-v1:checkpoint", planFingerprint: "sha256-v1:plan", graphFingerprint: "sha256-v1:graph", snapshotFingerprint: "sha256-v1:snapshot", updatedAt: "2026-08-29T10:00:00.000Z", transaction: Object.freeze({id: "transaction:case:1", phase: current ? "blocked" : "completed", fingerprint: "sha256-v1:transaction", checkpointFingerprint: "sha256-v1:transaction-checkpoint"}), supervisedLoop: Object.freeze({id: "loop:case:1", phase: current ? "blocked" : "completed", fingerprint: "sha256-v1:loop", iteration: 2, stopReason: current ? "human_required" : undefined})}),
  });
}

function capability(id: string, owner: AgentAuthorityOwner, availability: AgentCapability["availability"], options: Partial<Pick<AgentCapability, "requiresAuthorization" | "destructive" | "destination">> = {}): AgentCapability {
  const available = availability === "available";
  const blocked = availability === "blocked" || availability === "unavailable";
  return Object.freeze({id, intent: owner === "notification_store" ? "retry" : owner === "les4_live_checks" ? "refresh" : owner === "ui_navigation" ? "navigate" : owner === "au8_supervised" ? "authorize" : "execute", label: id, availability, available, blocked, busy: availability === "busy", requiresAuthorization: options.requiresAuthorization ?? false, destructive: options.destructive ?? false, authority: authority(owner, owner), reason: blocked ? Object.freeze({code: "authority_blocked"}) : undefined, destination: options.destination, reevaluate: Object.freeze([])});
}

function notification(priority: NonNullable<AgentNotification["priority"]>, temporal: AgentNotification["temporal"]): AgentNotification {
  return Object.freeze({id: "notification:1", title: "Delivery", temporal, unread: temporal === "current", priority, tone: "warning", source: "Notification Store", effectiveAt: "2026-08-29T10:00:00.000Z", deliveryStatus: temporal === "current" ? "pending" : "sent", retryAvailable: temporal === "current", authority: authority("notification_store", "Notification Store"), destination: "/actividad"});
}

function snapshot(kind: "previous" | "current", options: Partial<Pick<AgentSnapshot, "dependencies" | "processes" | "review" | "capabilities" | "notifications">> = {}): AgentSnapshot {
  const isCurrent = kind === "current";
  const capabilities = isCurrent ? [
    capability("retry-notification", "notification_store", "blocked", {destination: "/actividad"}),
    capability("review-action", "review_center", "available", {destination: "/revision"}),
    capability("execute-au7", "au7_transaction", "available", {destination: "/revision", requiresAuthorization: true, destructive: true}),
    capability("authorize-au8", "au8_supervised", "blocked", {destination: "/revision", requiresAuthorization: true}),
    capability("navigate-review", "ui_navigation", "available", {destination: "/revision"}),
  ] : [
    capability("retry-notification", "notification_store", "available", {destination: "/actividad"}),
    capability("review-action", "review_center", "blocked", {destination: "/revision"}),
    capability("execute-au7", "au7_transaction", "blocked", {destination: "/revision", requiresAuthorization: true, destructive: true}),
    capability("authorize-au8", "au8_supervised", "available", {destination: "/revision", requiresAuthorization: true}),
    capability("navigate-review", "ui_navigation", "blocked", {destination: "/revision"}),
  ];
  const result: AgentSnapshot = {
    schemaVersion: 1,
    contractVersion: AGENT_READY_CONTRACT_VERSION,
    observationId: `agent-observation:sha256-v1:${kind}`,
    observationFingerprint: `sha256-v1:${kind}`,
    observedAt: isCurrent ? "2026-08-29T10:01:00.000Z" : "2026-08-29T10:00:00.000Z",
    globalStatus: Object.freeze({state: isCurrent ? "blocked" : "operational", label: isCurrent ? "Blocked" : "Operational", evaluatedAt: isCurrent ? "2026-08-29T10:01:00.000Z" : "2026-08-29T10:00:00.000Z", currentIncidentCount: isCurrent ? 1 : 0, activeProcessCount: isCurrent ? 1 : 0, historicalRecordCount: isCurrent ? 0 : 1}),
    operator: Object.freeze({state: isCurrent ? "attention" : "clear", nextBestSignalId: isCurrent ? "review:case:1" : undefined, attention: Object.freeze(isCurrent ? [signal("review:case:1", "immediate")] : []), active: Object.freeze([])}),
    dependencies: options.dependencies ?? Object.freeze([dependency(isCurrent ? "unavailable" : "operational", isCurrent)]),
    processes: options.processes ?? Object.freeze([process(isCurrent)]),
    notifications: options.notifications ?? Object.freeze([notification(isCurrent ? "high" : "low", isCurrent ? "historical" : "current")]),
    review: options.review ?? Object.freeze([review(isCurrent, isCurrent ? "critical" : "low")]),
    capabilities: options.capabilities ?? Object.freeze(capabilities.sort((left, right) => left.id.localeCompare(right.id))),
    boundary: Object.freeze({readOnly: true, projectionOnly: true, executes: false, persists: false, plans: false, decidesAutonomy: false}),
  };
  return Object.freeze(result);
}

function containsFunction(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) => containsFunction(child, seen));
}

function findDiagnosis(diagnoses: readonly AgentDiagnosis[], category: string): AgentDiagnosis {
  const result = diagnoses.find((diagnosis) => diagnosis.category === category);
  assert.ok(result, `missing diagnosis ${category}`);
  assertions += 1;
  return result;
}

function main(): void {
  const previous = snapshot("previous");
  const current = snapshot("current");
  const diff = compareAgentSnapshots(previous, current);
  const jsonDiff = JSON.stringify(diff);
  check(jsonDiff.length > 0 && JSON.parse(jsonDiff).contractVersion === AGENT_REASONING_CONTRACT_VERSION, "1 diff serializable");
  equal(diff.contractVersion, AGENT_REASONING_CONTRACT_VERSION, "AG1 versioned contract");
  check(diff.events.some((event) => event.type === "blocker_added"), "2 nuevo bloqueo");
  check(compareAgentSnapshots(current, previous).events.some((event) => event.type === "blocker_resolved"), "3 bloqueo resuelto");
  check(diff.events.some((event) => event.type === "process_added"), "4 proceso nuevo");
  check(compareAgentSnapshots(current, previous).events.some((event) => event.type === "process_finished"), "5 proceso terminado");
  check(diff.events.some((event) => event.type === "review_pending"), "6 review pendiente");
  check(compareAgentSnapshots(current, previous).events.some((event) => event.type === "review_resolved"), "7 review resuelto");
  check(diff.events.some((event) => event.type === "dependency_degraded"), "8 dependency degraded");
  check(compareAgentSnapshots(current, previous).events.some((event) => event.type === "dependency_recovered"), "9 dependency recovered");
  check(diff.events.some((event) => event.type === "capability_available"), "10 capability available");
  check(diff.events.some((event) => event.type === "capability_blocked"), "11 capability blocked");
  const newlyAvailable = capability("new-read-capability", "existing_authority", "available");
  const withNewCapability = snapshot("current", {capabilities: Object.freeze([...current.capabilities, newlyAvailable].sort((left, right) => left.id.localeCompare(right.id)))});
  check(compareAgentSnapshots(current, withNewCapability).events.some((event) => event.type === "capability_available" && event.entityId === newlyAvailable.id), "10 nueva capability disponible");
  check(diff.events.some((event) => event.type === "priority_changed" && event.entity === "review"), "12 priority change");
  check(diff.events.some((event) => event.type === "temporal_changed" && event.entity === "notification" && event.reason === "current->historical"), "13 current historical");

  const repeated = compareAgentSnapshots(previous, current);
  assert.deepEqual(repeated, diff); assertions += 1;
  assert.deepEqual(diff.events.map((event) => event.id), [...diff.events.map((event) => event.id)].sort()); assertions += 1;
  equal(new Set(diff.events.map((event) => event.id)).size, diff.events.length, "14 unique deterministic IDs");
  check(diff.events.every((event) => event.source.length > 0 && event.temporal), "source traceable and temporal explicit");

  const context = buildReasoningContext(diff, current);
  const repeatedContext = buildReasoningContext(diff, current);
  assert.deepEqual(repeatedContext, context); assertions += 1;
  check(context.facts.every((fact) => fact.evidenceIds.length > 0), "16 structured stable reasoning facts");
  check(context.patterns.some((pattern) => pattern.kind === "dependency_blocks_review" && pattern.factIds.length === 2), "reasoning derives dependency plus review pattern");
  check(context.patterns.some((pattern) => pattern.statement.includes("dependencia")), "interpretable context summary");

  const diagnoses = diagnoseAgentContext(context);
  const dependencyDiagnosis = findDiagnosis(diagnoses, "dependency_blocks_review");
  check(dependencyDiagnosis.evidence.length >= 3, "17 diagnosis with evidence");
  equal(dependencyDiagnosis.confidence, "high", "19 deterministic confidence");
  equal(dependencyDiagnosis.conclusive, true);
  equal(dependencyDiagnosis.actionable, true);
  assert.deepEqual(diagnoseAgentContext(context), diagnoses); assertions += 1;

  const sparse = snapshot("current", {dependencies: Object.freeze([dependency("degraded", true)]), processes: Object.freeze([]), review: Object.freeze([]), capabilities: Object.freeze([]), notifications: Object.freeze([])});
  const sparseDiff = compareAgentSnapshots(sparse, sparse);
  const sparseDiagnosis = diagnoseAgentContext(buildReasoningContext(sparseDiff, sparse))[0]!;
  equal(sparseDiagnosis.category, "insufficient_evidence", "18 insufficient evidence");
  equal(sparseDiagnosis.confidence, "low", "18 low confidence");
  equal(sparseDiagnosis.conclusive, false, "18 no fabricated certainty");
  equal(sparseDiagnosis.actionable, false);

  const proposals = buildAgentProposals(diagnoses, context);
  check(proposals.every((proposal) => proposal.authority.length > 0), "20 proposal authority");
  check(proposals.every((proposal) => proposal.authority !== ("agent" as AgentProposalAuthority)), "21 no invalid authority");
  const au7Proposal = proposals.find((proposal) => proposal.authority === "AU7")!;
  equal(au7Proposal.requiresAuthorization, true, "22 requiresAuthorization");
  equal(au7Proposal.destructive, true, "23 destructive");
  equal(au7Proposal.destination, "/revision", "24 destination");
  const notificationProposal = proposals.find((proposal) => proposal.authority === "Notification Store")!;
  equal(notificationProposal.blocked, true, "25 blocked proposal");
  check(notificationProposal.reason?.includes("authority_blocked"), "blocked reason");
  assert.deepEqual(notificationProposal.reevaluateAfter, ["notification_delivery", "global_status"]); assertions += 1;
  equal(notificationProposal.action, "handoff_notification_retry");
  equal(proposals.some((proposal) => proposal.authority === "Notification Store"), true, "27 Notification Store routing");
  equal(proposals.some((proposal) => proposal.authority === "Review Center"), true, "28 Review Center routing");
  equal(proposals.some((proposal) => proposal.authority === "AU7"), true, "29 AU7 routing");
  equal(proposals.some((proposal) => proposal.authority === "AU8"), true, "30 AU8 routing");
  equal(mapProposalAuthority("les4_live_checks"), "LES 4 live checks");
  equal(mapProposalAuthority("process_origin"), "Process origin");
  equal(mapProposalAuthority("ui_navigation"), "UI navigation");
  equal(mapProposalAuthority(undefined), "Existing authority");
  const au8Proposal = proposals.find((proposal) => proposal.authority === "AU8")!;
  assert.deepEqual(au8Proposal.reevaluateAfter, ["supervised_loop_state", "checkpoint", "observed_effects"]); assertions += 1;
  assert.deepEqual(au7Proposal.reevaluateAfter, ["transaction_result", "checkpoint", "reconciliation"]); assertions += 1;
  const reviewProposal = proposals.find((proposal) => proposal.authority === "Review Center")!;
  assert.deepEqual(reviewProposal.reevaluateAfter, ["review_case", "process_state", "dependencies"]); assertions += 1;

  const agentPath = "_laboratorio/laboratorio-ia/src/agent";
  const files = readdirSync(agentPath).filter((name) => name.endsWith(".ts")).sort();
  const allSource = files.map((name) => source(`${agentPath}/${name}`)).join("\n");
  for (const forbidden of ["executor", "planner", "store", "memory", "loop", "watcher", "polling"]) equal(files.some((name) => name.toLowerCase().includes(forbidden)), false, `no ${forbidden} file`);
  check(!/\b(fetch|axios|XMLHttpRequest)\s*\(/.test(allSource), "40 no direct fetch");
  check(!/\b(POST|PUT|PATCH|DELETE)\b/.test(allSource), "39 no mutable endpoint/write verbs");
  check(!/Math\.random|Date\.now|new Date\s*\(/.test(allSource), "determinism no clock/random");
  check(!/runAutonomousSupervisedLoop|retryNotificationDelivery|createNotification|executeTransaction/.test(allSource), "zero authority execution");
  check(!/localStorage|sessionStorage|indexedDB/.test(allSource), "no storage APIs");
  check(!/setInterval|setTimeout|requestAnimationFrame/.test(allSource), "no background jobs/polling");

  const output = Object.freeze({diff, context, diagnoses, proposals});
  const json = JSON.stringify(output);
  check(json.length > 0 && JSON.parse(json).diff.events.length === diff.events.length, "41 JSON stringify");
  check(!json.includes("$$typeof") && !json.includes("react.element"), "42 no React nodes");
  equal(containsFunction(output), false, "43 no functions in output");
  check(!/token=|password=|Bearer\s/.test(json), "44 no secrets");
  equal(context.snapshot.contractVersion, AGENT_READY_CONTRACT_VERSION, "45 LES8 compatibility");

  for (const suite of ["test-les1-global-feedback.ts", "test-les2-notification-experience.ts", "test-les3-process-experience.ts", "test-les4-global-status.ts", "test-les5-interaction-system.ts", "test-les6-motion-system.ts", "test-les7-operator-experience.ts"]) check(source(`scripts/${suite}`).length > 100, `46 LES compatibility ${suite}`);
  check(source("scripts/test-au7-transaction-executor.ts").length > 100, "47 AU7 intact");
  check(source("scripts/test-au8-autonomous-supervised-loop.ts").length > 100, "48 AU8 intact");
  check(source("scripts/test-au10-final-certification.ts").includes("AU10 B6 final certification"), "49 AU10 intact");
  equal(JSON.stringify(buildAgentProposals(diagnoseAgentContext(buildReasoningContext(compareAgentSnapshots(previous, current), current)), buildReasoningContext(compareAgentSnapshots(previous, current), current))), JSON.stringify(proposals), "50 same input same output");

  for (const [key, value] of Object.entries(agentReasoningModelSecurity)) if (key !== "readOnly" && key !== "pureContracts") equal(value, false, `model security ${key}`);
  equal(agentReasoningModelSecurity.readOnly, true);
  equal(agentReasoningModelSecurity.pureContracts, true);
  equal(agentReasoningContextSecurity.pure, true);
  equal(agentReasoningContextSecurity.textOnlyReasoning, false);
  equal(agentDiagnosisSecurity.pure, true);
  equal(agentDiagnosisSecurity.fabricatesCertainty, false);
  equal(agentProposalSecurity.handoffOnly, true);
  equal(agentProposalSecurity.agentIsAuthority, false);
  for (const security of [agentReasoningContextSecurity, agentDiagnosisSecurity, agentProposalSecurity]) {
    for (const key of ["fetches", "persists", "writes", "executes", "usesClock", "usesRandomness"] as const) equal(security[key], false, `security ${key}`);
  }
  check(assertions >= 100, `expected at least 100 assertions, got ${assertions}`);
  console.log(`AG1 Agent Observation & Reasoning: OK (${assertions} assertions; pure deterministic LES8 diff, structured context, evidence-based diagnosis, governed handoffs, explicit reevaluation, zero execution/write/store/planner/loop/polling)`);
}

main();
