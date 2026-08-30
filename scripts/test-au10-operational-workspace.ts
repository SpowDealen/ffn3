import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildOperationalWorkspaceViewModel,
  getOperationalWorkspaceZone,
  operationalWorkspaceSecurity,
  type OperationalWorkspaceZoneId,
  type ReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review";

const NOW = "2026-08-10T10:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual: unknown, expected: unknown, message?: string): void => { assert.deepEqual(actual, expected, message); assertions += 1; };

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {schemaVersion: 1, id: "case:workspace", dedupeKey: "case:workspace", module: "external.news", title: "Workspace operativo", status: "open", priority: "high", subject: {type: "news", id: "news:workspace"}, issues: [{id: "identity", kind: "ambiguous_reference", valueKind: "fighter", label: "Identidad", message: "Seleccionar luchador", required: true, blocking: true}], resolutions: [], context: {producer: "review_center", token: "never-show", payloadSnapshot: {body: "never-show-payload"}}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0, ...overrides};
}

function main(): void {
  const workspace = buildOperationalWorkspaceViewModel({reviewCase: reviewCase(), evaluatedAt: NOW});
  equal(workspace.version, "1.0.0");
  equal(workspace.nucleus.caseId, "case:workspace");
  equal(workspace.primaryAction, workspace.nucleus.primaryAction, "CTA must be the B1 authority, not a copy");
  equal(workspace.onePrimaryAction, true); equal(workspace.presentationOnly, true); equal(workspace.persistsNavigation, false); equal(workspace.invokesExecutors, false); equal(workspace.writes, false);
  deepEqual(workspace.nucleus.sourceAuthorities, ["AU2", "AU3", "AU4", "AU5", "AU6", "AU7", "AU8", "AU9"]);
  equal(workspace.primaryAction.kind, "resolve_identity"); equal(workspace.suggestedZone, "resolution");

  const expectedZones: OperationalWorkspaceZoneId[] = ["summary", "evidence", "resolution", "execution", "knowledge", "history"];
  deepEqual(workspace.zones.map((zone) => zone.id), expectedZones); equal(workspace.zones.length, 6); equal(workspace.navigation.length, 5); deepEqual(workspace.navigation, expectedZones.slice(1));
  workspace.zones.forEach((zone, index) => { equal(zone.order, index + 1); check(zone.safeSummary.length > 10); check(zone.metrics.length > 0); equal(zone.unsupported.length, 0); });
  const summary = getOperationalWorkspaceZone(workspace, "summary"); equal(summary.mountedByDefault, true); equal(summary.lazy, false); equal(summary.metrics.length, 5);
  for (const zone of workspace.zones.slice(1)) { equal(zone.lazy, true); equal(zone.mountedByDefault, false); }
  equal(getOperationalWorkspaceZone(workspace, "resolution").state, "required"); check(getOperationalWorkspaceZone(workspace, "resolution").metrics.some((entry) => entry.label === "Identidad" && entry.value === "pendiente"));
  check(getOperationalWorkspaceZone(workspace, "evidence").metrics.some((entry) => entry.label === "Suficiencia")); check(getOperationalWorkspaceZone(workspace, "execution").metrics.some((entry) => entry.label === "Transaction")); check(getOperationalWorkspaceZone(workspace, "execution").metrics.some((entry) => entry.label === "Reconciliación")); check(getOperationalWorkspaceZone(workspace, "execution").metrics.some((entry) => entry.label === "Compensación")); check(getOperationalWorkspaceZone(workspace, "execution").metrics.some((entry) => entry.label === "Autorizaciones")); check(getOperationalWorkspaceZone(workspace, "knowledge").metrics.some((entry) => entry.label === "Recomendaciones")); check(getOperationalWorkspaceZone(workspace, "knowledge").metrics.some((entry) => entry.label === "Feedback")); check(getOperationalWorkspaceZone(workspace, "knowledge").metrics.some((entry) => entry.label === "Lifecycle")); check(getOperationalWorkspaceZone(workspace, "knowledge").metrics.some((entry) => entry.label === "Conflictos"));

  equal(workspace.contextualTimeline.history.length, workspace.nucleus.timeline.length); equal(workspace.contextualTimeline.resolution.every((event) => ["identity_resolved", "decision_made", "strategy_generated"].includes(event.kind)), true); equal(workspace.contextualTimeline.execution.every((event) => ["transaction_prepared", "supervised_iteration", "reconciliation"].includes(event.kind)), true); equal(new Set(workspace.contextualTimeline.history.map((event) => event.fingerprint)).size, workspace.contextualTimeline.history.length); equal(workspace.contextualTimeline.history.every((event, index, all) => index === 0 || all[index - 1].order <= event.order), true);
  const serialized = JSON.stringify(workspace); check(!serialized.includes("never-show")); check(!serialized.includes("never-show-payload")); check(!serialized.toLowerCase().includes("chain-of-thought")); check(!serialized.toLowerCase().includes("raw error"));

  deepEqual(workspace.layout, {desktopColumns: 2, tabletColumns: 2, mobileColumns: 1, narrowViewport: 390, fingerprintsWrapAnywhere: true}); equal(workspace.accessibility.keyboardNavigation, true); equal(workspace.accessibility.nativeButtons, true); equal(workspace.accessibility.focusManaged, true); equal(workspace.accessibility.busyAnnounced, true); equal(workspace.accessibility.alertsAnnounced, true); equal(workspace.accessibility.reducedMotion, true);
  const replay = buildOperationalWorkspaceViewModel({reviewCase: reviewCase(), evaluatedAt: NOW}); deepEqual(replay, workspace, "workspace must be deterministic");
  assert.throws(() => getOperationalWorkspaceZone(workspace, "missing" as OperationalWorkspaceZoneId), /zone_unknown/); assertions += 1;

  const unsupported = buildOperationalWorkspaceViewModel({reviewCase: reviewCase({subject: {type: "image"}}), evaluatedAt: NOW}); equal(unsupported.nucleus.state, "unsupported"); equal(unsupported.primaryAction.enabled, false); check(unsupported.zones.every((zone) => zone.state === "unsupported")); check(unsupported.zones.every((zone) => zone.unsupported.length > 0));

  equal(operationalWorkspaceSecurity.pure, true); equal(operationalWorkspaceSecurity.derivesNucleusOnly, true); equal(operationalWorkspaceSecurity.createsEngines, false); equal(operationalWorkspaceSecurity.createsPlanners, false); equal(operationalWorkspaceSecurity.createsStores, false); equal(operationalWorkspaceSecurity.createsExecutors, false); equal(operationalWorkspaceSecurity.persistsNavigation, false); equal(operationalWorkspaceSecurity.invokesExecutors, false); equal(operationalWorkspaceSecurity.accessesSanity, false); equal(operationalWorkspaceSecurity.accessesNetwork, false); equal(operationalWorkspaceSecurity.autoExecutes, false); equal(operationalWorkspaceSecurity.autoAppliesKnowledge, false); equal(operationalWorkspaceSecurity.hidesUnsupported, false); equal(operationalWorkspaceSecurity.writes, false);

  const workspaceSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/nucleus/workspace.ts", import.meta.url), "utf8"); check(!/from ["'][^"']*(executor|sanity|store)/i.test(workspaceSource)); check(!workspaceSource.includes("fetch(")); check(!workspaceSource.includes("localStorage")); check(!workspaceSource.includes("payloadSnapshot"));
  const uiSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/AIResolutionNucleus.tsx", import.meta.url), "utf8"); check(uiSource.includes('lazy(() => import("./OperationalWorkspaceSection"))')); check(uiSource.includes("<Suspense fallback=")); check(uiSource.includes("<FeedbackSkeleton label="), "Suspense debe reutilizar la primitiva LES1 de loading"); check(uiSource.includes('import {FeedbackSkeleton, ProgressBar} from "../../components/feedback/VisualFeedback"'), "el workspace consume la autoridad visual compartida"); check(!uiSource.includes('className="workspace-skeleton"'), "AU10 no debe reintroducir un skeleton local paralelo"); check(uiSource.includes("ArrowRight")); check(uiSource.includes("Home")); check(uiSource.includes("aria-expanded")); check(uiSource.includes("aria-controls")); check(uiSource.includes("aria-busy")); equal(uiSource.includes("TransactionOperationalCenter"), false); equal(uiSource.includes("KnowledgeCenter"), false); equal((uiSource.match(/nucleus-cta/g) ?? []).length, 1);
  const feedbackSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx", import.meta.url), "utf8"); check(feedbackSource.includes("export function FeedbackSkeleton"), "LES1 conserva la primitiva compartida"); check(feedbackSource.includes('className="feedback-skeleton"')); check(feedbackSource.includes('role="status"')); check(feedbackSource.includes('aria-live="polite"')); check(feedbackSource.includes("aria-label={label}"), "el loading conserva nombre accesible contextual");
  const sectionSource = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/review/components/OperationalWorkspaceSection.tsx", import.meta.url), "utf8"); check(sectionSource.includes("TransactionOperationalCenter")); check(sectionSource.includes("KnowledgeCenter")); check(!sectionSource.includes("useEffect")); check(!sectionSource.includes("execute("));
  const css = readFileSync(new URL("../_laboratorio/laboratorio-ia/src/styles.css", import.meta.url), "utf8"); check(css.includes("@media (max-width: 900px)")); check(css.includes("@media (max-width: 560px)")); check(css.includes("@media (max-width: 390px)")); check(css.includes("overflow-wrap: anywhere")); check(css.includes("prefers-reduced-motion")); check(css.includes(".feedback-skeleton")); check(css.includes("feedback-skeleton-pulse"));
  console.log(`AU10 B2 Operational Workspace tests: OK (${assertions} assertions; composition, single CTA/navigation, six-zone layout, lazy sections, contextual timeline, responsive, unsupported and zero writes)`);
}

main();
