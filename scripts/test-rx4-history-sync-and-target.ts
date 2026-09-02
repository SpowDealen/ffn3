import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {removeLaboratoryQueryParam} from "../_laboratorio/laboratorio-ia/src/app/useLaboratoryRouter";
import {buildRx2ReviewInboxFixtures} from "../_laboratorio/laboratorio-ia/src/review/development/rx2InboxFixture";
import {resolveReviewCaseDeepLink} from "../_laboratorio/laboratorio-ia/src/review/intake";
import {selectReviewInbox} from "../_laboratorio/laboratorio-ia/src/review/inbox";

const checks: string[] = [];
const source = (path: string): string => readFileSync(path, "utf8");
const check = (contract: string, condition: unknown): void => {
  assert.ok(condition, contract);
  checks.push(contract);
};

function main(): void {
  const router = source("_laboratorio/laboratorio-ia/src/app/useLaboratoryRouter.ts");
  const app = source("_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx");
  const screen = source("_laboratorio/laboratorio-ia/src/app/screens/ReviewCenterScreen.tsx");
  const center = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  const inboxSource = source("_laboratorio/laboratorio-ia/src/review/components/ReviewInbox.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  const fixtures = buildRx2ReviewInboxFixtures();
  const caseId = "dev:rx2:inbox:attention";
  const caseSearch = `?fixture=inbox&case=${encodeURIComponent(caseId)}`;
  const inboxSearch = removeLaboratoryQueryParam(caseSearch, "case");
  const view = (search: string) => resolveReviewCaseDeepLink(fixtures, new URLSearchParams(search).get("case"));
  const absentBranch = center.match(/if \(!requested\) \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

  check("1 URL con case abre caso", view(caseSearch).found && view(caseSearch).section === "case" && center.includes('setActiveSection("case")'));
  check("2 URL sin case muestra Inbox", view(inboxSearch).section === "dashboard" && absentBranch.includes('setActiveSection("dashboard")'));
  check("3 Back abre caso", view(caseSearch).caseId === caseId && router.includes('window.addEventListener("popstate", update)'));
  check("4 Forward limpia caso", view(inboxSearch).section === "dashboard" && absentBranch.includes("setSelectedId(null)"));
  check("5 no queda state fantasma", [inboxSearch, caseSearch, inboxSearch].map(view).map((state) => state.section).join(">") === "dashboard>case>dashboard" && absentBranch.includes('setCaseContext("overview")'));
  check("6 sin timer workaround", !/setTimeout|setInterval|requestAnimationFrame/.test(router + app + screen + center));
  check("7 sin hard reload", !/window\.location\.(?:reload|assign|replace)/.test(router + app + screen + center));
  check("8 fixture preservado", new URLSearchParams(inboxSearch).get("fixture") === "inbox");
  const extra = removeLaboratoryQueryParam("?fixture=inbox&view=compact&case=one&source=ufc", "case");
  check("9 otros params preservados", extra === "?fixture=inbox&view=compact&source=ufc");
  const missing = view("?fixture=inbox&case=__rx4_missing_case__");
  check("10 missing case intacto", !missing.found && missing.section === "dashboard" && center.includes("El caso indicado no existe o ya no está disponible"));
  check("11 reload sin case permanece en Inbox", view(inboxSearch).section === "dashboard" && !new URLSearchParams(inboxSearch).has("case"));
  check("12 deep link directo intacto", inboxSource.includes("case=${encodeURIComponent(item.caseId)}") && view(caseSearch).found);
  const desktopRule = styles.match(/\.review-button\.review-back-to-inbox\s*\{([^}]*)\}/)?.[1] ?? "";
  check("13 back button mínimo 44", center.includes("review-button review-button-secondary review-back-to-inbox") && desktopRule.includes("min-height: 44px"));
  check("14 contrato desktop gana la cascada", styles.indexOf(".review-button.review-back-to-inbox") > styles.indexOf(".review-button,\n.review-disclosure") && desktopRule.includes("min-height: 44px"));
  check("15 contrato mobile mínimo 44", styles.includes(".review-case-context .review-button { width: 100%; min-height: 44px; }"));
  const inbox = selectReviewInbox(fixtures);
  check("16 RX2 Inbox intacta", inbox.counts.needs_attention === 1 && inbox.counts.in_process === 1 && inbox.counts.resolved === 1);
  check("17 RX3 intacto", source("scripts/test-rx3-simplified-review-case.ts").includes("53") && source("scripts/test-rx3-review-fixture.ts").includes("29"));
  check("18 RX4 B2 y B3 intactos", source("scripts/test-rx4-review-deep-link-ux.ts").includes("13") && source("scripts/test-rx4-url-and-heading-fix.ts").includes("15"));
  check("19 sin writes", !/\b(?:fetch|localStorage|sessionStorage|indexedDB|POST|PUT|PATCH|DELETE)\b/.test(router + app + screen + center));
  const routerFiles = readdirSync("_laboratorio/laboratorio-ia/src/app").filter((file) => /router/i.test(file));
  check("20 sin router paralelo", routerFiles.join("|") === "useLaboratoryRouter.ts" && app.includes("useLaboratoryRouter"));

  assert.equal(checks.length, 20);
  console.log(`RX4 B4 History Sync and Target: OK (${checks.length}/20 contracts)`);
}

main();
