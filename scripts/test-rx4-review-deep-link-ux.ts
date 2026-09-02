import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {buildRx2ReviewInboxFixtures} from "../_laboratorio/laboratorio-ia/src/review/development/rx2InboxFixture";
import {resolveReviewCaseDeepLink} from "../_laboratorio/laboratorio-ia/src/review/intake";

const checks: string[] = [];
const source = (path: string): string => readFileSync(path, "utf8");
const check = (contract: string, condition: unknown): void => {
  assert.ok(condition, contract);
  checks.push(contract);
};

function main(): void {
  const center = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  const details = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx");
  const navigation = source("_laboratorio/laboratorio-ia/src/review/components/OperatorExperienceNavigation.tsx");
  const inbox = source("_laboratorio/laboratorio-ia/src/review/components/ReviewInbox.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  const changedFiles = execFileSync("git", ["status", "--short"], {encoding: "utf8"});
  const fixtures = buildRx2ReviewInboxFixtures();
  const attention = fixtures.find((entry) => entry.id === "dev:rx2:inbox:attention")!;
  const deepLink = resolveReviewCaseDeepLink(fixtures, attention.id);
  const caseBranch = center.slice(center.lastIndexOf('activeSection === "case"'), center.lastIndexOf('activeSection === "activity"'));
  const humanStart = details.indexOf('<div className="review-human-case-flow">');
  const technicalStart = details.indexOf('<details className="review-technical-details"');
  const technicalSource = details.slice(technicalStart, details.lastIndexOf("</details>"));

  check("1 deep link abre case-first", deepLink.found && deepLink.caseId === attention.id && deepLink.section === "case" && center.includes('activeSection !== "dashboard" && activeSection !== "case"'));
  check("2 RX3 simplificado precede a técnica", humanStart >= 0 && technicalStart > humanStart && ["¿Qué pasa?", "¿Por qué?", "¿Qué recomienda el Lab?", "¿Qué ocurrirá si apruebo?"].every((label) => details.slice(humanStart, technicalStart).includes(label)));
  check("3 Núcleo no precede al caso", !caseBranch.includes('className="sr-only">Núcleo Resolutivo IA') && details.indexOf("<AIResolutionNucleus") > technicalStart);
  check("4 tabs técnicos son secundarios", caseBranch.includes("technicalNavigation={<OperatorExperienceNavigation") && technicalSource.includes("{technicalNavigation ?") && technicalSource.includes("Herramientas avanzadas"));
  check("5 shared blocker traducido", navigation.includes('shared_blocker: "Bloqueo compartido"') && !navigation.includes('entry.kind.replace(/_/g, " ")'));
  check("6 completed traducido", navigation.includes('completed: "Completado"'));
  check("7 una sola superficie técnica del caso", (details.match(/<details className="review-technical-details"/g) ?? []).length === 1 && !caseBranch.includes("<details") && technicalSource.includes("<AIResolutionNucleus"));
  check("8 breadcrumbs humanos", caseBranch.includes('aria-label="Ruta del caso"') && caseBranch.includes(">Revisión<") && caseBranch.includes('aria-current="page">Caso') && caseBranch.includes("Volver a la Inbox"));
  check("9 Inbox intacta", inbox.includes("selectReviewInbox") && ["Necesitan atención", "En proceso", "Resueltos"].every((label) => inbox.includes(label)) && inbox.includes("review-inbox-primary-action"));
  check("10 RX3 intacto", ["¿Qué pasa?", "¿Por qué?", "¿Qué recomienda el Lab?", "¿Qué ocurrirá si apruebo?", "Detalles técnicos"].every((label) => details.includes(label)));
  check("11 técnica sigue accesible", technicalSource.includes("AU7") && technicalSource.includes("AU8") && technicalSource.includes("AU9") && technicalSource.includes("checkpoint") && technicalSource.includes("fingerprints") && technicalSource.includes("reconciliación") && technicalSource.includes("compensación"));
  const changedPaths = changedFiles.split("\n").map((line) => line.slice(3)).filter(Boolean);
  const rx5ResumeFile = (path: string): boolean => path.includes("/review/resume/origin/") || path.endsWith("/review/resume/index.ts");
  check("12 autoridades AU intactas", !changedPaths.some((path) => /_laboratorio\/laboratorio-ia\/src\/review\/(?:globalResolution|transactions|autonomous|store|materialization)/.test(path) || path.includes("/review/resume/") && !rx5ResumeFile(path)));
  check("13 cero writes", !/\b(?:fetch|localStorage|sessionStorage|indexedDB|POST|PUT|PATCH|DELETE)\b/.test(navigation + styles) && !center.includes("createStore"));

  assert.equal(checks.length, 13);
  console.log(`RX4 B2 Review Deep Link UX: OK (${checks.length}/13 contracts)`);
}

main();
