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
  const details = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx");
  const shell = source("_laboratorio/laboratorio-ia/src/app/LaboratoryShell.tsx");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  const fixtures = buildRx2ReviewInboxFixtures();
  const caseId = "dev:rx2:inbox:attention";
  const original = `?fixture=inbox&case=${encodeURIComponent(caseId)}`;
  const returned = removeLaboratoryQueryParam(original, "case");

  check("1 volver elimina case", returned === "?fixture=inbox" && app.includes('removeLaboratoryQueryParam(search, "case")') && center.includes("onClick={returnToInbox}"));
  check("2 fixture se conserva", new URLSearchParams(returned).get("fixture") === "inbox");
  const extra = removeLaboratoryQueryParam("?fixture=inbox&view=compact&case=one&source=ufc", "case");
  check("3 otros params se conservan", extra === "?fixture=inbox&view=compact&source=ufc" && !new URLSearchParams(extra).has("case"));
  check("4 reload y back-forward coherentes", !new URLSearchParams(returned).has("case") && resolveReviewCaseDeepLink(fixtures, new URLSearchParams(returned).get("case")).section === "dashboard" && router.includes('window.history.pushState') && router.includes('window.addEventListener("popstate"') && center.includes("handledDeepLink.current = undefined"));
  check("5 deep link real abre caso", resolveReviewCaseDeepLink(fixtures, caseId).found && resolveReviewCaseDeepLink(fixtures, caseId).section === "case");
  const missing = resolveReviewCaseDeepLink(fixtures, "__rx4_missing_case__");
  check("6 missing case seguro", !missing.found && missing.section === "dashboard" && center.includes("El caso indicado no existe o ya no está disponible"));
  const inbox = selectReviewInbox(fixtures);
  check("7 Inbox 1/1/1 intacta", inbox.counts.needs_attention === 1 && inbox.counts.in_process === 1 && inbox.counts.resolved === 1);
  check("8 RX3 intacto", ["¿Qué pasa?", "¿Por qué?", "¿Qué recomienda el Lab?", "¿Qué ocurrirá si apruebo?", "Detalles técnicos"].every((label) => details.includes(label)));
  check("9 un solo h1", (shell.match(/<h1\b/g) ?? []).length === 1 && !/<h1\b/.test(details + center));
  const caseHeading = details.indexOf('<h2 className="review-details-title">');
  const firstHumanHeading = details.indexOf("<h3", caseHeading);
  check("10 no salto h1 a h3", caseHeading >= 0 && firstHumanHeading > caseHeading && !details.slice(0, caseHeading).includes("<h3"));
  check("11 headings jerárquicos", ["review-what", "review-why", "review-recommendation", "review-effect", "review-actions"].every((id) => details.includes(`<h3 id={\`${id}-`)) && details.includes("<h2 className=\"review-details-title\">") && details.includes("<h4>{issue.label}</h4>"));
  const backRule = styles.match(/\.review-button\.review-back-to-inbox\s*\{([^}]*)\}/)?.[1] ?? "";
  check("12 back action mínimo 44", backRule.includes("min-height: 44px") && center.includes("review-back-to-inbox") && styles.includes(".review-case-context .review-button { width: 100%; min-height: 44px; }"));
  check("13 sin hard reload", !/window\.location\.(?:reload|assign|replace)/.test(app + screen + center) && app.includes('navigate("/revision", reviewInboxSearch)'));
  check("14 sin writes", !/\b(?:fetch|localStorage|sessionStorage|indexedDB|POST|PUT|PATCH|DELETE)\b/.test(router) && !router.includes("persist"));
  const routerFiles = readdirSync("_laboratorio/laboratorio-ia/src/app").filter((file) => /router/i.test(file));
  check("15 sin router nuevo", routerFiles.join("|") === "useLaboratoryRouter.ts" && screen.includes("onReturnToInbox") && app.includes("useLaboratoryRouter"));

  assert.equal(checks.length, 15);
  console.log(`RX4 B3 URL and Heading Fix: OK (${checks.length}/15 contracts)`);
}

main();
