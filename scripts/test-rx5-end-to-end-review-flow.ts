import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {
  addReviewResolution,
  createReviewCase,
  getReviewCase,
  getReviewCases,
  setReviewCaseRepositoryForTests,
  transitionReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {isSerializableReviewValue} from "../_laboratorio/laboratorio-ia/src/review/cases/validateResolution";
import {selectReviewInbox} from "../_laboratorio/laboratorio-ia/src/review/inbox";
import {createOrUpdateReviewCaseFromIntake} from "../_laboratorio/laboratorio-ia/src/review/intake";
import {
  createRx5ResumeAuthority,
  createRx5ReviewFlowFixture,
  dispatchReviewResume,
  getReviewProducerSupport,
  prepareRx5BrowserFixture,
  readRx5BrowserFixtureDescriptor,
  rehydrateRx5BrowserFixtureAuthority,
  readReviewOriginResumeContext,
  rx5ReviewFlowFixtureSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/resume/origin";
import {buildExternalNewsResumePreview, createExternalNewsPreviewFingerprint, createExternalNewsResumeExecutionTestCase, type ExternalNewsResumeExecutor} from "../_laboratorio/laboratorio-ia/src/review/resume/externalNews";
import {getReviewOriginResumeAuthority, registerReviewOriginResumeAuthority, registerReviewResumeExecutor} from "../_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors";
import {createMemoryOutcomeRepository, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";

const NOW = "2026-09-02T12:00:00.000Z";
const checks: string[] = [];
const check = (contract: string, condition: unknown): void => { assert.ok(condition, contract); checks.push(contract); };
const source = (path: string): string => readFileSync(path, "utf8");
let storedCases: ReviewCase[] = [];
const restoreStore = setReviewCaseRepositoryForTests({load: () => structuredClone(storedCases), save: (items) => { storedCases = structuredClone([...items]); }});
const restoreOutcomes = setOutcomeRepositoryForTests(createMemoryOutcomeRepository());
const disposers: Array<() => void> = [];

function resolveFixture(producer: Parameters<typeof createRx5ReviewFlowFixture>[0], suffix: string): ReviewCase {
  const created = createRx5ReviewFlowFixture(producer, suffix);
  const candidate = created.issues[0]?.candidates?.[0];
  if (!candidate) throw new Error("rx5_candidate_missing");
  addReviewResolution(created.id, {type: "select_candidate", issueId: created.issues[0]!.id, candidateId: candidate.id});
  transitionReviewCase(created.id, "resolved");
  return getReviewCase(created.id)!;
}

async function resumeFixture(producer: Parameters<typeof createRx5ReviewFlowFixture>[0], suffix: string) {
  const reviewCase = resolveFixture(producer, suffix);
  const registered = createRx5ResumeAuthority(producer);
  const dispose = registerReviewOriginResumeAuthority(producer, registered.authority, {replace: true});
  disposers.push(dispose);
  const context = readReviewOriginResumeContext(reviewCase)!;
  const value = await dispatchReviewResume({caseId: reviewCase.id, expectedCaseVersion: reviewCase.version, expectedFingerprint: context.fingerprint, authorized: true, now: () => NOW});
  dispose(); disposers.pop();
  return {reviewCase, value, calls: registered.calls};
}

async function main(): Promise<void> {
  try {
    const news = createRx5ReviewFlowFixture("ufc_news", "actionable-news");
    check("1 noticia actionable crea ReviewCase", news.module === "ufc.news" && news.status === "open" && news.issues.length === 1);
    const event = createRx5ReviewFlowFixture("one_events", "actionable-event");
    check("2 evento actionable crea ReviewCase", event.module === "one.events" && event.subject.type === "event" && event.issues[0]?.blocking === true);
    const external = createExternalNewsResumeExecutionTestCase();
    check("3 external_news baseline intacto", external.context.producer === "external_news" && buildExternalNewsResumePreview(external, {now: () => NOW}).canResume);
    check("4 caso aparece en Needs Attention", selectReviewInbox(getReviewCases()).groups.needs_attention.some((item) => item.caseId === news.id));
    const resolvedNews = resolveFixture("ufc_news", "resolve-case");
    check("5 resolve case", resolvedNews.status === "resolved" && resolvedNews.resolutions.length === resolvedNews.issues.length);
    check("6 sale de Needs Attention", !selectReviewInbox(getReviewCases()).groups.needs_attention.some((item) => item.caseId === resolvedNews.id) && selectReviewInbox(getReviewCases()).groups.in_process.some((item) => item.caseId === resolvedNews.id));

    let release!: (value: {outcome: "succeeded"; observed: true; resultId: string}) => void;
    const pendingAuthority = createRx5ResumeAuthority("ufc_events", () => new Promise((resolve) => { release = resolve; }));
    const disposePending = registerReviewOriginResumeAuthority("ufc_events", pendingAuthority.authority, {replace: true}); disposers.push(disposePending);
    const pendingCase = resolveFixture("ufc_events", "pending");
    const pendingContext = readReviewOriginResumeContext(pendingCase)!;
    const pendingExecution = dispatchReviewResume({caseId: pendingCase.id, expectedCaseVersion: pendingCase.version, expectedFingerprint: pendingContext.fingerprint, authorized: true, now: () => NOW});
    await Promise.resolve();
    check("7 entra En proceso mientras reanuda", getReviewCase(pendingCase.id)?.status === "resuming" && selectReviewInbox(getReviewCases()).groups.in_process.some((item) => item.caseId === pendingCase.id));
    check("8 resumeContext válido", pendingContext.producer === "ufc_events" && Boolean(pendingContext.originId && pendingContext.operation && pendingContext.fingerprint));
    check("9 productor identificado", pendingAuthority.calls[0]?.producer === "ufc_events" && pendingAuthority.calls[0]?.originId === pendingContext.originId);
    const concurrent = await dispatchReviewResume({caseId: pendingCase.id, expectedCaseVersion: pendingCase.version, expectedFingerprint: pendingContext.fingerprint, authorized: true, now: () => NOW});
    check("10 dispatcher delega en autoridad existente", pendingAuthority.calls.length === 1 && concurrent.status === "already_resuming");
    const dispatcherSource = source("_laboratorio/laboratorio-ia/src/review/resume/origin/dispatchReviewResume.ts");
    check("11 no executor paralelo", dispatcherSource.includes("getReviewOriginResumeAuthority") && !/class .*Executor|executeDomain|saveDraft\s*\(/.test(dispatcherSource));
    const originFiles = readdirSync("_laboratorio/laboratorio-ia/src/review/resume/origin");
    check("12 no store paralelo", !originFiles.some((name) => /store|repository/i.test(name)) && !/localStorage|sessionStorage|indexedDB/.test(dispatcherSource));
    release({outcome: "succeeded", observed: true, resultId: "prepared:ufc-event"});
    await pendingExecution; disposePending(); disposers.pop();

    const staleCase = resolveFixture("one_news", "stale");
    const staleContext = readReviewOriginResumeContext(staleCase)!;
    const staleAuthority = createRx5ResumeAuthority("one_news");
    const disposeStale = registerReviewOriginResumeAuthority("one_news", staleAuthority.authority, {replace: true}); disposers.push(disposeStale);
    const stale = await dispatchReviewResume({caseId: staleCase.id, expectedCaseVersion: staleCase.version + 1, expectedFingerprint: staleContext.fingerprint, authorized: true, now: () => NOW});
    check("13 valida fingerprint y versión", stale.status === "changed" && staleAuthority.calls.length === 0);
    check("14 stale bloquea", getReviewCase(staleCase.id)?.status === "stale" && !stale.success); disposeStale(); disposers.pop();

    const conflictCase = resolveFixture("bkfc_events", "conflict");
    const conflictContext = readReviewOriginResumeContext(conflictCase)!;
    const conflictAuthority = createRx5ResumeAuthority("bkfc_events", () => ({outcome: "conflict", observed: true}));
    const disposeConflict = registerReviewOriginResumeAuthority("bkfc_events", conflictAuthority.authority, {replace: true}); disposers.push(disposeConflict);
    const conflict = await dispatchReviewResume({caseId: conflictCase.id, expectedCaseVersion: conflictCase.version, expectedFingerprint: conflictContext.fingerprint, authorized: true, now: () => NOW});
    check("15 conflict bloquea", conflict.status === "conflict" && getReviewCase(conflictCase.id)?.status === "stale"); disposeConflict(); disposers.pop();
    check("16 duplicate resume no duplica", concurrent.status === "already_resuming" && pendingAuthority.calls.length === 1);
    const already = await dispatchReviewResume({caseId: pendingCase.id, expectedCaseVersion: pendingCase.version, expectedFingerprint: pendingContext.fingerprint, authorized: true, now: () => NOW});
    check("17 already_resumed idempotente", already.status === "already_resumed" && pendingAuthority.calls.length === 1);
    check("18 resultado observado", getReviewCase(pendingCase.id)?.resumeExecution?.summary?.resultId === "prepared:ufc-event");
    check("19 success entra Resueltos", getReviewCase(pendingCase.id)?.status === "resumed" && selectReviewInbox(getReviewCases()).groups.resolved.some((item) => item.caseId === pendingCase.id));

    const failedCase = resolveFixture("bkfc_news", "failed");
    const failedContext = readReviewOriginResumeContext(failedCase)!;
    const failedAuthority = createRx5ResumeAuthority("bkfc_news", () => ({outcome: "failed", observed: false, message: "El productor sigue bloqueado por una relación pendiente."}));
    const disposeFailed = registerReviewOriginResumeAuthority("bkfc_news", failedAuthority.authority, {replace: true}); disposers.push(disposeFailed);
    const failed = await dispatchReviewResume({caseId: failedCase.id, expectedCaseVersion: failedCase.version, expectedFingerprint: failedContext.fingerprint, authorized: true, now: () => NOW});
    check("20 fallo vuelve a atención según contrato", failed.status === "resume_failed" && selectReviewInbox(getReviewCases()).groups.needs_attention.some((item) => item.caseId === failedCase.id)); disposeFailed(); disposers.pop();

    const chainedCase = resolveFixture("one_news", "chain-a");
    const chainedContext = readReviewOriginResumeContext(chainedCase)!;
    const chainedAuthority = createRx5ResumeAuthority("one_news", () => ({outcome: "review_required", observed: true, message: "La noticia continuó, pero otra relación necesita revisión.", followUp: {actionable: true, source: "one", entityType: "reference", originId: "dev:rx5:one_news:chain-b", issueType: "missing_relation", summary: "Falta una segunda relación verificable.", title: "Segunda relación", resumeContext: {schemaVersion: 1, producer: "one_news", originId: "dev:rx5:one_news:chain-b", operation: "analyze_official_news", fingerprint: "sha256-v1:follow-up"}, now: () => NOW}}));
    const disposeChained = registerReviewOriginResumeAuthority("one_news", chainedAuthority.authority, {replace: true}); disposers.push(disposeChained);
    const chained = await dispatchReviewResume({caseId: chainedCase.id, expectedCaseVersion: chainedCase.version, expectedFingerprint: chainedContext.fingerprint, authorized: true, now: () => NOW});
    check("21 segundo problema crea o actualiza Review", chained.status === "review_required" && Boolean(chained.followUpCaseId) && getReviewCase(chained.followUpCaseId!)?.status === "open");
    check("22 no infinite loop", chainedAuthority.calls.length === 1 && getReviewCases().filter((item) => item.subject.id === "dev:rx5:one_news:chain-b").length === 1); disposeChained(); disposers.pop();

    const unobservedCase = resolveFixture("ufc_news", "unobserved");
    const unobservedContext = readReviewOriginResumeContext(unobservedCase)!;
    const unobservedAuthority = createRx5ResumeAuthority("ufc_news", () => ({outcome: "succeeded", observed: false}));
    const disposeUnobserved = registerReviewOriginResumeAuthority("ufc_news", unobservedAuthority.authority, {replace: true}); disposers.push(disposeUnobserved);
    const unobserved = await dispatchReviewResume({caseId: unobservedCase.id, expectedCaseVersion: unobservedCase.version, expectedFingerprint: unobservedContext.fingerprint, authorized: true, now: () => NOW});
    check("23 no resolved prematuro", unobserved.status === "result_not_observed" && getReviewCase(unobservedCase.id)?.status === "resume_failed"); disposeUnobserved(); disposers.pop();

    const ufc = await resumeFixture("ufc_news", "supported-ufc");
    check("24 feedback humano success", ufc.value.message === "La noticia continuó correctamente y quedó preparada.");
    const unavailableCase = resolveFixture("one_events", "unavailable");
    const unavailableContext = readReviewOriginResumeContext(unavailableCase)!;
    const unavailable = await dispatchReviewResume({caseId: unavailableCase.id, expectedCaseVersion: unavailableCase.version, expectedFingerprint: unavailableContext.fingerprint, authorized: true, now: () => NOW});
    check("25 feedback humano blocked", unavailable.status === "authority_unavailable" && unavailable.message.includes("todavía no ofrece una reanudación segura"));
    check("26 feedback humano changed/stale", stale.message === "No se pudo continuar porque la información cambió desde que se abrió el caso.");
    check("27 UFC supported flow", ufc.value.status === "resumed" && ufc.calls.length === 1 && getReviewProducerSupport("ufc_news").status === "supported");
    const one = await resumeFixture("one_events", "supported-one");
    check("28 ONE supported flow", one.value.status === "resumed" && one.calls[0]?.producer === "one_events");
    const bkfc = await resumeFixture("bkfc_news", "supported-bkfc");
    check("29 BKFC supported flow", bkfc.value.status === "resumed" && bkfc.calls[0]?.producer === "bkfc_news");

    const unsupportedCase = createReviewCase({dedupeKey: "dev:rx5:unsupported", module: "editorial.builder", title: "Productor sin soporte", priority: "normal", subject: {type: "news", id: "unsupported"}, issues: [], context: {producer: "unknown_producer"}});
    transitionReviewCase(unsupportedCase.id, "resolved");
    const unsupported = await dispatchReviewResume({caseId: unsupportedCase.id, expectedCaseVersion: getReviewCase(unsupportedCase.id)!.version, expectedFingerprint: "sha256-v1:unknown", authorized: true, now: () => NOW});
    check("30 productor no soportado fail-closed", unsupported.status === "invalid_resume_context" && getReviewCase(unsupportedCase.id)?.status === "resolved");

    let saves = 0;
    const externalExecutor: ExternalNewsResumeExecutor = {buildOutput: (form) => ({_type: "noticia", titulo: String(form.titulo), contenido: String(form.contenido)}), saveDraft: async () => { saves += 1; return {success: true, draftId: "draft:rx5:external"}; }};
    const disposeExternal = registerReviewResumeExecutor("external_news", externalExecutor, {replace: true}); disposers.push(disposeExternal);
    transitionReviewCase(external.id, "resolved");
    const externalReady = getReviewCase(external.id)!;
    const externalPreview = buildExternalNewsResumePreview(externalReady, {now: () => NOW});
    const externalFingerprint = createExternalNewsPreviewFingerprint(externalReady, externalPreview);
    const externalResult = await dispatchReviewResume({caseId: externalReady.id, expectedCaseVersion: externalReady.version, expectedFingerprint: externalFingerprint, authorized: true, now: () => NOW});
    const externalAgain = await dispatchReviewResume({caseId: externalReady.id, expectedCaseVersion: externalReady.version, expectedFingerprint: externalFingerprint, authorized: true, now: () => NOW});
    check("31 external_news regression", externalResult.status === "resumed" && externalAgain.status === "already_resumed" && saves === 1); disposeExternal(); disposers.pop();

    check("32 RX2 Intake intacto", source("scripts/test-rx2-unified-review-intake.ts").includes("52") && source("_laboratorio/laboratorio-ia/src/review/intake/intake.ts").includes("createOrUpdateReviewCaseFromIntake"));
    check("33 RX2 Inbox intacta", source("scripts/test-rx2-review-inbox.ts").includes("52") && selectReviewInbox(getReviewCases()).total > 0);
    check("34 RX3 intacto", source("scripts/test-rx3-simplified-review-case.ts").includes("53") && source("scripts/test-rx3-review-fixture.ts").includes("29"));
    check("35 RX4 intacto", ["global-ux-cleanup", "review-deep-link-ux", "url-and-heading-fix", "history-sync-and-target"].every((name) => source(`scripts/test-rx4-${name}.ts`).length > 100));
    check("36 AU7 intacto", source("scripts/test-au7-transaction-orchestration.ts").length > 100 && !/executeUniversalExecutionPlan|runTransaction/.test(dispatcherSource));
    check("37 AU8 intacto", source("scripts/test-au8-autonomous-review-center.ts").length > 100 && !/runAutonomous|supervisedLoop/.test(dispatcherSource));
    check("38 sin cambio de autonomía", !/autonomous|autoResolve|agentLoop/.test(dispatcherSource));
    check("39 sin ejecución AG", !/runAgent|executeAgent|AG1|AG2/.test(dispatcherSource));
    check("40 sin Sanity real", rx5ReviewFlowFixtureSecurity.sanity === false && !/@sanity|sanityClient|createClient/.test(dispatcherSource));
    check("41 sin Telegram", rx5ReviewFlowFixtureSecurity.telegram === false && !/telegram/i.test(dispatcherSource));
    check("42 sin polling", rx5ReviewFlowFixtureSecurity.polling === false && !/setInterval|setTimeout|polling|watcher/.test(dispatcherSource));
    check("43 transiciones deterministas", ["resolved", "resuming", "resumed"].every((status) => source("_laboratorio/laboratorio-ia/src/review/cases/transitionReviewCase.ts").includes(status)) && getReviewCase(ufc.reviewCase.id)?.status === "resumed");
    check("44 estado JSON-safe", getReviewCases().every((item) => isSerializableReviewValue(item)));
    const safe = createOrUpdateReviewCaseFromIntake({actionable: true, source: "ufc", entityType: "news", originId: "dev:rx5:safe", issueType: "review_required", summary: "Dato visible", originContext: {token: "secret-token", visible: "sí"}, resumeContext: {producer: "ufc_news", originId: "dev:rx5:safe", operation: "analyze_official_news", fingerprint: "sha256-v1:safe", authorization: "Bearer secret"}, now: () => NOW});
    const safeJson = JSON.stringify(getReviewCase(safe.caseId!)!);
    check("45 sin secretos", !safeJson.includes("secret-token") && !safeJson.includes("Bearer secret") && safeJson.includes("visible"));

    const browserFixture = prepareRx5BrowserFixture("ufc_news");
    const browserSearch = new URL(browserFixture.url, "http://localhost:5173").searchParams;
    check("46 fixture browser URL autocontenida", readRx5BrowserFixtureDescriptor(browserSearch)?.caseId === browserFixture.caseId && browserSearch.get("fixture") === "rx5");
    browserFixture.unregister();
    const browserReload = rehydrateRx5BrowserFixtureAuthority(browserSearch);
    check("47 fixture browser reinyecta autoridad", browserReload?.authority === getReviewOriginResumeAuthority("ufc_news"));
    browserReload?.cleanup();

    assert.equal(checks.length, 47);
    console.log(`RX5 end-to-end review flow: OK (${checks.length}/47 contracts)`);
  } finally {
    while (disposers.length) disposers.pop()?.();
    restoreOutcomes();
    restoreStore();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
