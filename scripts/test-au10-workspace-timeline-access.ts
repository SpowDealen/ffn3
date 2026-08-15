import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildOperationalWorkspaceViewModel, buildOperatorExperience, operatorExperienceSecurity, type ReviewCase} from "../_laboratorio/laboratorio-ia/src/review";

const NOW = "2026-08-15T12:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id: "workspace:case",
    dedupeKey: "workspace:case",
    module: "external.news",
    title: "Caso del workspace",
    status: "open",
    priority: "high",
    subject: {type: "fighter", id: "fighter:workspace"},
    issues: [],
    resolutions: [],
    context: {producer: "workspace-test"},
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    resumeAttempts: 0,
    ...overrides,
  };
}

function main(): void {
  const current = reviewCase();
  const related = reviewCase({id: "workspace:related", dedupeKey: "workspace:related", title: "Caso relacionado", subject: {type: "fighter", id: "fighter:workspace"}});
  const workspace = buildOperationalWorkspaceViewModel({reviewCase: current});
  const workspaceBreadcrumbs = buildOperatorExperience({cases: [current, related], evaluatedAt: NOW, activeSection: "case", selectedCaseId: current.id, caseContext: "workspace"}).breadcrumbs;
  const timelineBreadcrumbs = buildOperatorExperience({cases: [current, related], evaluatedAt: NOW, activeSection: "case", selectedCaseId: current.id, caseContext: "timeline"}).breadcrumbs;
  const overviewBreadcrumbs = buildOperatorExperience({cases: [current], evaluatedAt: NOW, activeSection: "case", selectedCaseId: current.id, caseContext: "overview"}).breadcrumbs;

  equal(workspace.nucleus.case.title, current.title);
  equal(workspace.zones.length, 6);
  check(workspace.navigation.includes("evidence"));
  check(workspace.navigation.includes("execution"));
  check(workspace.contextualTimeline.evidence !== undefined);
  equal(workspaceBreadcrumbs.at(-1), "Workspace");
  equal(timelineBreadcrumbs.at(-1), "Timeline");
  equal(overviewBreadcrumbs.at(-1), current.title);
  check(workspaceBreadcrumbs.includes(current.title));
  check(!buildOperatorExperience({cases: [current], evaluatedAt: NOW, activeSection: "activity", selectedCaseId: current.id, caseContext: "timeline"}).breadcrumbs.includes("Timeline"));

  const nucleus = readFileSync("_laboratorio/laboratorio-ia/src/review/components/AIResolutionNucleus.tsx", "utf8");
  const center = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx", "utf8");
  const details = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx", "utf8");
  const styles = readFileSync("_laboratorio/laboratorio-ia/src/styles.css", "utf8");

  check(nucleus.includes('type NucleusContextView = "overview" | "workspace" | "timeline"'));
  check(nucleus.includes('>Abrir workspace</button>'));
  check(nucleus.includes('role="tablist"'));
  check(nucleus.includes('role="tab"'));
  check(nucleus.includes('role="tabpanel"'));
  check(nucleus.includes('aria-selected={activeContext === context}'));
  check(nucleus.includes('aria-controls={contextPanelId}'));
  check(nucleus.includes('"ArrowRight", "ArrowLeft", "Home", "End"'));
  check(nucleus.includes('WORKSPACE RESOLUTIVO'));
  check(nucleus.includes('Timeline resolutivo'));
  check(nucleus.includes('Este caso todavía no tiene actividad resolutiva.'));
  check(nucleus.includes('LazyOperationalWorkspaceSection'));
  check(nucleus.includes('Suspense fallback'));
  check(nucleus.includes('Ninguna operación se ejecutó automáticamente.'));
  check(nucleus.includes('no es un log paralelo'));
  check(!nucleus.includes('Ver timeline técnico'));
  check(details.includes('onNucleusContextChange'));
  check(center.includes('const [caseContext, setCaseContext]'));
  check(center.includes('onNucleusContextChange={setCaseContext}'));
  check(center.includes('function openCase(caseId: string'));
  check(center.includes('setCaseContext("overview")'));
  check(center.includes('globalDashboard.timeline.map'));
  check(center.includes('onClick={() => openCase(entry.caseId)}'));
  check(center.includes("Selecciona un caso para abrir el workspace resolutivo."));
  check(center.includes("Todavía no hay actividad registrada."));
  check(styles.includes('.nucleus-context-nav'));
  check(styles.includes('.nucleus-context-panel'));
  check(styles.includes('@media (max-width: 560px)'));
  check(styles.includes('@media (max-width: 390px)'));

  equal(operatorExperienceSecurity.createsRouters, false);
  equal(operatorExperienceSecurity.invokesExecutors, false);
  equal(operatorExperienceSecurity.accessesSanity, false);
  equal(operatorExperienceSecurity.writes, false);
  console.log(`AU10 B6.4 workspace/timeline access: OK (${assertions} assertions; contextual route, breadcrumb sync, lazy workspace, timeline, keyboard, responsive and zero writes)`);
}

main();
