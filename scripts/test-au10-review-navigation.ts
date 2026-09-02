import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildGlobalResolutionDashboard, buildOperatorExperience, globalResolutionDashboardSecurity, operatorExperienceSecurity, type OperatorWorkspaceSection, type ReviewCase} from "../_laboratorio/laboratorio-ia/src/review";

const NOW = "2026-08-15T12:00:00.000Z";
let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown): void => { assert.ok(value); assertions += 1; };

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {schemaVersion: 1, id: "navigation:case", dedupeKey: "navigation:case", module: "external.news", title: "Caso prioritario", status: "open", priority: "high", subject: {type: "fighter", id: "fighter:navigation"}, issues: [], resolutions: [], context: {producer: "navigation"}, createdAt: NOW, updatedAt: NOW, version: 1, resumeAttempts: 0, ...overrides};
}

function main(): void {
  const first = reviewCase();
  const second = reviewCase({id: "navigation:related", dedupeKey: "navigation:related", title: "Caso relacionado", subject: {type: "fighter", id: "fighter:navigation"}});
  const cases = [first, second];
  const sections: readonly OperatorWorkspaceSection[] = ["dashboard", "priorities", "case", "activity", "knowledge"];

  for (const activeSection of sections) {
    const model = buildOperatorExperience({cases, evaluatedAt: NOW, activeSection, selectedCaseId: first.id});
    equal(model.activeSection, activeSection);
    equal(model.navigation.length, 5);
    equal(model.navigation.filter((entry) => entry.id === activeSection).length, 1);
    equal(model.breadcrumbs[1], activeSection === "dashboard" ? "Dashboard" : activeSection === "priorities" ? "Casos prioritarios" : activeSection === "case" ? "Núcleo Resolutivo IA" : activeSection === "activity" ? "Actividad" : "Conocimiento");
    equal(model.breadcrumbs.includes(first.title), activeSection === "case");
  }

  const empty = buildOperatorExperience({cases: [], evaluatedAt: NOW, activeSection: "case"});
  equal(empty.rows.length, 0);
  equal(empty.activeSection, "case");
  const dashboard = buildGlobalResolutionDashboard({cases, evaluatedAt: NOW});
  equal(dashboard.summary.totalCases, 2);
  check(dashboard.priorityCases.length > 0);

  const center = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx", "utf8");
  for (const section of sections) check(center.includes(`activeSection === "${section}"`));
  check(center.includes('role="tabpanel"'));
  check(center.includes('NucleusGlobalDashboard cases={reviewCases}'));
  check(center.includes('onSelect={openCase}'));
  check(center.includes("<KnowledgeCenter reviewCase={selectedCase}"));
  check(center.includes("globalDashboard.timeline.map"));
  check(center.includes("Selecciona un caso de revisión"));
  check(center.includes("Todavía no hay conocimiento relevante seleccionado."));

  const navigation = readFileSync("_laboratorio/laboratorio-ia/src/review/components/OperatorExperienceNavigation.tsx", "utf8");
  check(navigation.includes('role="tablist"'));
  check(navigation.includes('role="tab"'));
  check(navigation.includes("aria-selected"));
  check(navigation.includes("aria-controls"));
  check(navigation.includes("ArrowRight"));
  check(navigation.includes("Home"));
  check(navigation.includes("End"));
  const styles = readFileSync("_laboratorio/laboratorio-ia/src/styles.css", "utf8");
  check(styles.includes(".operator-nav"));
  check(styles.includes("@media (max-width: 560px)"));
  check(styles.includes("@media (max-width: 390px)"));

  equal(operatorExperienceSecurity.createsRouters, false);
  equal(operatorExperienceSecurity.invokesExecutors, false);
  equal(globalResolutionDashboardSecurity.invokesExecutors, false);
  equal(globalResolutionDashboardSecurity.writes, false);
  console.log(`AU10 B6.3 review navigation: OK (${assertions} assertions; unique active section, real views, breadcrumbs, empty states, keyboard contract, AU9/AU10 safety and zero writes)`);
}

main();
