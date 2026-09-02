import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {getReviewOriginResumeAuthority} from "../_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors";
import {selectReviewInbox} from "../_laboratorio/laboratorio-ia/src/review/inbox";
import {createMemoryOutcomeRepository, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";
import {
  dispatchReviewResume,
  prepareRx5BrowserFixture,
  readReviewOriginResumeContext,
  readRx5BrowserFixtureDescriptor,
  rehydrateRx5BrowserFixtureAuthority,
  removeRx5BrowserFixtureCase,
} from "../_laboratorio/laboratorio-ia/src/review/resume/origin";
import {
  addReviewResolution,
  createReviewCase,
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
    check("1 fixture creates canonical ReviewCase", getReviewCase(fixture.caseId)?.context.producer === "ufc_news");
    const params = new URL(fixture.url, "http://localhost:5173").searchParams;
    check("2 fixture URL is self-contained", params.get("fixture") === "rx5" && params.get("producer") === "ufc_news" && params.get("case") === fixture.caseId);
    check("3 initial Inbox is 1/0/0", selectReviewInbox(getReviewCases()).counts.needs_attention === 1 && selectReviewInbox(getReviewCases()).counts.in_process === 0 && selectReviewInbox(getReviewCases()).counts.resolved === 0);
    check("4 initial DEV authority uses canonical registry", getReviewOriginResumeAuthority("ufc_news")?.authorityId === "panel-ia:ufc_news:official-analysis-v1");

    fixture.unregister();
    check("5 simulated reload loses in-memory authority", !getReviewOriginResumeAuthority("ufc_news"));
    const descriptor = readRx5BrowserFixtureDescriptor(params);
    check("6 URL reidentifies case and producer", descriptor?.caseId === fixture.caseId && descriptor.producer === "ufc_news");
    rehydrated = rehydrateRx5BrowserFixtureAuthority(params);
    check("7 reload reinjects DEV authority", getReviewOriginResumeAuthority("ufc_news") === rehydrated?.authority);

    const opened = getReviewCase(fixture.caseId)!;
    const candidate = opened.issues[0]?.candidates?.[0];
    if (!candidate) throw new Error("rx5_browser_candidate_missing");
    addReviewResolution(opened.id, {type: "select_candidate", issueId: opened.issues[0]!.id, candidateId: candidate.id});
    transitionReviewCase(opened.id, "resolved");
    const resolved = getReviewCase(opened.id)!;
    const context = readReviewOriginResumeContext(resolved)!;
    const inProcess = selectReviewInbox(getReviewCases());
    check("8 resolved fixture moves to 0/1/0", inProcess.counts.needs_attention === 0 && inProcess.counts.in_process === 1 && inProcess.counts.resolved === 0);
    check("9 continue is available after reload", Boolean(getReviewOriginResumeAuthority(context.producer)) && resolved.status === "resolved");

    const resumed = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version, expectedFingerprint: context.fingerprint, authorized: true});
    check("10 rehydrated authority is invoked", rehydrated?.getInvocationCount() === 1);
    check("11 producer result is observed", resumed.status === "resumed" && resumed.success);
    check("12 safe resultId is present", resumed.resultId?.startsWith("producer-result:ufc_news:dev:rx5:ufc_news:browser:nueva_apta"));
    check("13 case transitions to resumed", getReviewCase(resolved.id)?.status === "resumed");
    const completed = selectReviewInbox(getReviewCases());
    check("14 completed fixture moves to 0/0/1", completed.counts.needs_attention === 0 && completed.counts.in_process === 0 && completed.counts.resolved === 1);
    const second = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version, expectedFingerprint: context.fingerprint, authorized: true});
    check("15 second resume is idempotent", second.status === "already_resumed");
    check("16 authority remains invoked once", rehydrated?.getInvocationCount() === 1);

    rehydrated?.cleanup();
    rehydrated = undefined;
    check("17 cleanup removes fixture authority", !getReviewOriginResumeAuthority("ufc_news"));
    check("18 cleanup removes fixture case", !getReviewCase(fixture.caseId));
    check("19 cleanup is idempotent", removeRx5BrowserFixtureCase(fixture.caseId) === false);

    const realCase = createReviewCase({dedupeKey: "rx5:b3:real", module: "ufc.news", title: "Real", priority: "normal", subject: {type: "news", id: "real"}, issues: [], context: {producer: "ufc_news"}});
    const malicious = new URLSearchParams({fixture: "rx5", producer: "ufc_news", case: realCase.id});
    check("20 non-fixture case cannot rehydrate authority", !readRx5BrowserFixtureDescriptor(malicious) && !rehydrateRx5BrowserFixtureAuthority(malicious));

    const development = source("_laboratorio/laboratorio-ia/src/review/resume/origin/development.ts");
    const app = source("_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx");
    const panel = source("_laboratorio/laboratorio-ia/src/review/components/ReviewOriginResumePanel.tsx");
    const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
    const registry = source("_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors.ts");
    const originFiles = readdirSync("_laboratorio/laboratorio-ia/src/review/resume/origin");
    check("21 bootstrap is explicitly DEV-only", app.includes("if (!import.meta.env.DEV) return") && app.includes("rehydrateRx5BrowserFixtureAuthority(searchKey)"));
    check("22 canonical registry remains the only registry", development.includes("registerReviewOriginResumeAuthority") && (registry.match(/originAuthorities = new Map/g) ?? []).length === 1 && !originFiles.some((name) => /fixtureRegistry|authorityStore/.test(name)));
    check("23 no product localStorage marker", !/localStorage|sessionStorage|indexedDB/.test(development + app));
    check("24 no external API, Sanity or Telegram", !/fetch\(|saveDraft|createClient|sanityClient|@sanity|notifyTelegram|\/api\/notifications/i.test(development));
    check("25 runtime producer factories are reused", development.includes("createOfficialNewsRuntimeAuthority") && development.includes("createOfficialEventRuntimeAuthority"));
    check("26 real UFC ONE BKFC registrations stay intact", ["ufc_news", "ufc_events", "one_news", "one_events", "bkfc_news", "bkfc_events"].every((producer) => source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx").includes(`\"${producer}\"`)));
    check("27 exact resume target selector is 44px", panel.includes("review-origin-resume-action") && /\.review-button\.review-origin-resume-action\s*\{\s*min-height:\s*44px;\s*\}/.test(styles));
    check("28 desktop and mobile share the same 44px contract", !/@media[^}]+review-origin-resume-action/.test(styles) && styles.includes(".review-button.review-origin-resume-action { min-height: 44px; }"));
    check("29 human feedback confirms resolution and result", panel.includes("La incidencia se resolvió. El flujo original continuó correctamente y el resultado fue confirmado."));
    check("30 Inbox preserves RX5 session and real fixture exit cleans previous case", app.includes("previousRx5FixtureCaseId") && app.includes("removeRx5BrowserFixtureCase(previousCaseId)") && app.includes('removeLaboratoryQueryParam(search, "case")') && !app.includes('RX5_BROWSER_FIXTURE_QUERY ? ""'));
    check("31 RX2 RX3 RX4 contracts remain present", ["scripts/test-rx2-unified-review-intake.ts", "scripts/test-rx3-simplified-review-case.ts", "scripts/test-rx4-global-ux-cleanup.ts"].every((path) => source(path).length > 100));
    check("32 zero external effects in fixture execution", rehydrated === undefined && !/fetch\(|saveDraft|createClient/.test(development));
    check("33 resume control resynchronizes after late registration", panel.includes("syncAvailability();") && panel.includes("subscribeReviewResumeExecutors(syncAvailability)"));

    assert.equal(checks.length, 33);
    console.log(`RX5 browser fixture rehydration: OK (${checks.length}/33 contracts)`);
  } finally {
    rehydrated?.cleanup();
    fixture?.cleanup();
    restoreOutcomes();
    restoreStore();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
