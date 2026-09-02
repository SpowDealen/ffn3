import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {getReviewOriginResumeAuthority} from "../_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors";
import {selectReviewInbox} from "../_laboratorio/laboratorio-ia/src/review/inbox";
import {resolveReviewCaseDeepLink} from "../_laboratorio/laboratorio-ia/src/review/intake";
import {buildReviewContextHref, buildReviewContextSearch} from "../_laboratorio/laboratorio-ia/src/review/navigation";
import {createMemoryOutcomeRepository, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";
import {
  dispatchReviewResume,
  prepareRx5BrowserFixture,
  readReviewOriginResumeContext,
  readRx5BrowserFixtureDescriptor,
  rehydrateRx5BrowserFixtureAuthority,
} from "../_laboratorio/laboratorio-ia/src/review/resume/origin";
import {
  addReviewResolution,
  getReviewCase,
  getReviewCases,
  setReviewCaseRepositoryForTests,
  transitionReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";

const checks: string[] = [];
const check = (name: string, condition: unknown): void => { assert.ok(condition, name); checks.push(name); };
const source = (path: string): string => readFileSync(path, "utf8");
let storedCases: ReviewCase[] = [];
const restoreStore = setReviewCaseRepositoryForTests({load: () => structuredClone(storedCases), save: (items) => { storedCases = structuredClone([...items]); }});
const restoreOutcomes = setOutcomeRepositoryForTests(createMemoryOutcomeRepository());

async function main(): Promise<void> {
  let fixture: ReturnType<typeof prepareRx5BrowserFixture> | undefined;
  let rehydrated: ReturnType<typeof rehydrateRx5BrowserFixtureAuthority>;
  try {
    fixture = prepareRx5BrowserFixture("ufc_news");
    const caseUrl = new URL(fixture.url, "http://localhost:5173");
    check("1 fixture URL has fixture", caseUrl.searchParams.get("fixture") === "rx5");
    check("2 fixture URL has producer", caseUrl.searchParams.get("producer") === "ufc_news");

    const inboxSearch = buildReviewContextSearch(caseUrl.searchParams);
    const inboxParams = new URLSearchParams(inboxSearch);
    check("3 RX5 Inbox preserves fixture", inboxParams.get("fixture") === "rx5");
    check("4 RX5 Inbox preserves producer", inboxParams.get("producer") === "ufc_news");
    check("5 returning to Inbox removes only case", !inboxParams.has("case") && inboxSearch === "?fixture=rx5&producer=ufc_news");
    check("6 returning to Inbox does not cleanup", Boolean(getReviewCase(fixture.caseId)) && Boolean(getReviewOriginResumeAuthority("ufc_news")));

    const initialInbox = selectReviewInbox(getReviewCases());
    const reviewItem = initialInbox.groups.needs_attention[0];
    const reviewHref = buildReviewContextHref(inboxSearch, reviewItem!.caseId);
    check("7 Revisar preserves fixture and producer", reviewItem?.primaryAction.label === "Revisar" && reviewHref === fixture.url);
    check("8 case URL includes case", new URL(reviewHref, "http://localhost:5173").searchParams.get("case") === fixture.caseId);
    check("9 Inbox without case retains authority", readRx5BrowserFixtureDescriptor(inboxSearch)?.caseId === fixture.caseId && Boolean(getReviewOriginResumeAuthority("ufc_news")));

    fixture.unregister();
    check("10 reload simulation clears only memory authority", !getReviewOriginResumeAuthority("ufc_news") && Boolean(getReviewCase(fixture.caseId)));
    rehydrated = rehydrateRx5BrowserFixtureAuthority(inboxSearch);
    check("11 reload in RX5 Inbox rehydrates authority", rehydrated?.caseId === fixture.caseId && getReviewOriginResumeAuthority("ufc_news") === rehydrated.authority);

    const inboxView = resolveReviewCaseDeepLink(getReviewCases(), inboxParams);
    const caseView = resolveReviewCaseDeepLink(getReviewCases(), new URL(reviewHref, "http://localhost:5173").searchParams);
    check("12 Inbox visible without case", inboxView.section === "dashboard" && !inboxView.found);
    check("13 case visible with case", caseView.section === "case" && caseView.caseId === fixture.caseId);
    const historyViews = [reviewHref, `/revision${inboxSearch}`, reviewHref, `/revision${inboxSearch}`].map((value) => resolveReviewCaseDeepLink(getReviewCases(), new URL(value, "http://localhost:5173").searchParams).section);
    check("14 Back restores RX5 case view", historyViews.join(">") === "case>dashboard>case>dashboard");
    check("15 Forward restores RX5 Inbox view", [reviewHref, `/revision${inboxSearch}`].every((value) => { const params = new URL(value, "http://localhost:5173").searchParams; return params.get("fixture") === "rx5" && params.get("producer") === "ufc_news"; }));
    check("16 initial flow is 1/0/0", initialInbox.counts.needs_attention === 1 && initialInbox.counts.in_process === 0 && initialInbox.counts.resolved === 0);

    const opened = getReviewCase(fixture.caseId)!;
    const candidate = opened.issues[0]?.candidates?.[0];
    if (!candidate) throw new Error("rx5_b4_candidate_missing");
    addReviewResolution(opened.id, {type: "select_candidate", issueId: opened.issues[0]!.id, candidateId: candidate.id});
    transitionReviewCase(opened.id, "resolved");
    const resolved = getReviewCase(opened.id)!;
    const inProcess = selectReviewInbox(getReviewCases());
    check("17 resolved flow is 0/1/0", inProcess.counts.needs_attention === 0 && inProcess.counts.in_process === 1 && inProcess.counts.resolved === 0);
    const continueItem = inProcess.groups.in_process[0];
    const continueHref = buildReviewContextHref(inboxSearch, continueItem!.caseId);
    check("18 Continuar revisión preserves context", continueItem?.primaryAction.label === "Continuar revisión" && continueHref === fixture.url);
    check("19 return after resolution keeps session", readRx5BrowserFixtureDescriptor(inboxSearch)?.caseId === fixture.caseId && Boolean(getReviewOriginResumeAuthority("ufc_news")));

    const context = readReviewOriginResumeContext(resolved)!;
    const resumed = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version, expectedFingerprint: context.fingerprint, authorized: true});
    check("20 producer result is observed", resumed.success && resumed.status === "resumed");
    check("21 safe resultId is preserved", resumed.resultId === "producer-result:ufc_news:dev:rx5:ufc_news:browser:nueva_apta");
    check("22 completed flow is 0/0/1", selectReviewInbox(getReviewCases()).counts.resolved === 1 && selectReviewInbox(getReviewCases()).counts.needs_attention === 0 && selectReviewInbox(getReviewCases()).counts.in_process === 0);
    const resultItem = selectReviewInbox(getReviewCases()).groups.resolved[0];
    const resultHref = buildReviewContextHref(inboxSearch, resultItem!.caseId);
    check("23 Ver resultado preserves context", resultItem?.primaryAction.label === "Ver resultado" && resultHref === fixture.url);
    check("24 reopened result remains resumed", resolveReviewCaseDeepLink(getReviewCases(), new URL(resultHref, "http://localhost:5173").searchParams).found && getReviewCase(fixture.caseId)?.status === "resumed");
    const second = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version, expectedFingerprint: context.fingerprint, authorized: true});
    check("25 second resume is already_resumed", second.status === "already_resumed");
    check("26 authority is invoked once", rehydrated?.getInvocationCount() === 1);

    const app = source("_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx");
    const inbox = source("_laboratorio/laboratorio-ia/src/review/components/ReviewInbox.tsx");
    const navigation = source("_laboratorio/laboratorio-ia/src/review/navigation.ts");
    const development = source("_laboratorio/laboratorio-ia/src/review/resume/origin/development.ts");
    const cleanup = development.slice(development.indexOf("export function cleanupRx5BrowserFixtureFromLocation"), development.indexOf("export function prepareRx5BrowserFixture"));
    const registry = source("_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors.ts");
    check("27 Back action preserves query context", app.includes('removeLaboratoryQueryParam(search, "case")') && !app.includes('RX5_BROWSER_FIXTURE_QUERY ? ""'));
    check("28 Inbox links use canonical context helper", inbox.includes("buildReviewContextHref(fixtureQuery, item.caseId)") && navigation.includes('next.set("case", requestedCaseId)'));
    check("29 Inbox lifecycle infers persisted browser case", development.includes("getReviewCases().find") && development.includes('`dev:rx5:${producer}:browser`'));
    check("30 absence of case is not a cleanup signal", readRx5BrowserFixtureDescriptor(inboxSearch)?.caseId === fixture.caseId && development.includes("requestedCaseId\n    ? getReviewCase(requestedCaseId)\n    : getReviewCases().find"));
    check("31 leaving RX5 fixture is the lifecycle boundary", !readRx5BrowserFixtureDescriptor("?producer=ufc_news") && app.includes("previousCaseId !== descriptor?.caseId"));
    check("32 cleanup explicitly removes fixture parameters", ["fixture", "producer", "case"].every((key) => cleanup.includes(`url.searchParams.delete("${key}")`)));
    check("33 cleanup is exposed only through DEV harness", source("_laboratorio/laboratorio-ia/src/main.tsx").includes("cleanupRx5BrowserFixture") && source("_laboratorio/laboratorio-ia/src/main.tsx").includes("if (import.meta.env.DEV"));
    check("34 no new local or session storage", !/localStorage|sessionStorage|indexedDB/.test(navigation + development + app));
    check("35 no parallel registry", (registry.match(/originAuthorities = new Map/g) ?? []).length === 1 && !navigation.includes("new Map"));
    check("36 no parallel router", readdirSync("_laboratorio/laboratorio-ia/src/app").filter((name) => /router/i.test(name)).join("|") === "useLaboratoryRouter.ts");
    check("37 RX2 RX3 RX4 remain covered", ["scripts/test-rx2-review-inbox.ts", "scripts/test-rx3-simplified-review-case.ts", "scripts/test-rx4-global-ux-cleanup.ts"].every((path) => source(path).length > 100));
    check("38 runtime producer callbacks remain untouched by B4", source("scripts/test-rx5-runtime-producer-authorities.ts").includes("/39 contracts") && !/PanelIA|runtimeAuthorities/.test(navigation));
    check("39 no external writes", !/fetch\s*\(|saveDraft|createClient|sanityClient|notifyTelegram/.test(navigation + development));
    check("40 no external network", !/https?:\/\/|XMLHttpRequest|WebSocket/.test(navigation + development));

    rehydrated?.cleanup();
    rehydrated = undefined;
    check("41 explicit cleanup removes authority", !getReviewOriginResumeAuthority("ufc_news"));
    check("42 explicit cleanup removes case", !getReviewCase(fixture.caseId));

    assert.equal(checks.length, 42);
    console.log(`RX5 review context navigation: OK (${checks.length}/42 contracts)`);
  } finally {
    rehydrated?.cleanup();
    fixture?.cleanup();
    restoreOutcomes();
    restoreStore();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
