import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  getReviewOriginResumeAuthority,
  registerReviewOriginResumeAuthority,
} from "../_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors";
import {
  createOfficialEventRuntimeAuthority,
  createOfficialNewsRuntimeAuthority,
  createRx5ReviewFlowFixture,
  dispatchReviewResume,
  getReviewProducerSupport,
  readReviewOriginResumeContext,
  type OfficialReviewResumeProducer,
  type ReviewOriginResumeRequest,
} from "../_laboratorio/laboratorio-ia/src/review/resume/origin";
import {
  addReviewResolution,
  getReviewCase,
  setReviewCaseRepositoryForTests,
  transitionReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import type {ReviewCase} from "../_laboratorio/laboratorio-ia/src/review/types";
import {createMemoryOutcomeRepository, setOutcomeRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/outcomes";

const checks: string[] = [];
const check = (name: string, value: unknown): void => { assert.ok(value, name); checks.push(name); };
const source = (path: string): string => readFileSync(path, "utf8");
const signal = new AbortController().signal;
let cases: ReviewCase[] = [];
const restoreStore = setReviewCaseRepositoryForTests({load: () => structuredClone(cases), save: (next) => { cases = structuredClone([...next]); }});
const restoreOutcomes = setOutcomeRepositoryForTests(createMemoryOutcomeRepository());
const disposers: Array<() => void> = [];

function request(producer: OfficialReviewResumeProducer, operation: string, resolutions: ReviewOriginResumeRequest["resolutions"] = []): ReviewOriginResumeRequest {
  return {
    caseId: `case:${producer}`,
    caseVersion: 1,
    producer,
    originId: `origin:${producer}`,
    operation,
    fingerprint: `sha256-v1:${producer}`,
    resolutions,
    context: {unifiedReviewIntake: {entityType: producer.endsWith("_news") ? "news" : "event"}},
    idempotencyKey: `resume:${producer}`,
    signal,
  };
}

function readyEvent() {
  return {
    event: {found: true, sanityId: "drafts.event-runtime"},
    discipline: {found: true, sanityId: "discipline-runtime"},
    organization: {found: true, sanityId: "organization-runtime"},
    counts: {missingFighters: 0, unresolvedCategories: 0},
    missingFighters: [],
    unresolvedCategories: [],
    fights: [{sourceFightId: "fight-1", readyToCreate: true, blockingReasons: []}],
  } as const;
}

async function main(): Promise<void> {
  try {
    const panel = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
    const adapter = source("_laboratorio/laboratorio-ia/src/review/resume/origin/runtimeAuthorities.ts");
    const registry = source("_laboratorio/laboratorio-ia/src/integrations/reviewResumeExecutors.ts");
    const dispatcher = source("_laboratorio/laboratorio-ia/src/review/resume/origin/dispatchReviewResume.ts");
    const development = source("_laboratorio/laboratorio-ia/src/review/resume/origin/development.ts");

    const newsProducers = ["ufc_news", "one_news", "bkfc_news"] as const;
    const eventProducers = ["ufc_events", "one_events", "bkfc_events"] as const;
    const invoked = new Map<string, number>();

    for (const producer of newsProducers) {
      const authority = createOfficialNewsRuntimeAuthority(producer, {
        getItem: (originId) => ({id: originId, title: producer}),
        analyze: async (item) => {
          invoked.set(producer, (invoked.get(producer) ?? 0) + 1);
          return {sourceId: item.id, status: "nueva_apta"};
        },
      });
      disposers.push(registerReviewOriginResumeAuthority(producer, authority, {replace: true}));
      check(`${producer} authority registered`, getReviewOriginResumeAuthority(producer)?.authorityId === `panel-ia:${producer}:official-analysis-v1`);
      const result = await authority.continueOrigin(request(producer, "analyze_official_news"));
      check(`${producer} real callback result observed`, result.outcome === "succeeded" && result.observed && result.resultId?.includes("nueva_apta"));
    }

    for (const producer of eventProducers) {
      const authority = createOfficialEventRuntimeAuthority(producer, {
        getEvent: (originId) => ({id: originId, name: producer}),
        resolve: async () => {
          invoked.set(producer, (invoked.get(producer) ?? 0) + 1);
          return readyEvent();
        },
      });
      disposers.push(registerReviewOriginResumeAuthority(producer, authority, {replace: true}));
      check(`${producer} authority registered`, getReviewOriginResumeAuthority(producer)?.authorityId === `panel-ia:${producer}:official-resolution-v1`);
      const result = await authority.continueOrigin(request(producer, "resolve_official_event"));
      check(`${producer} real callback result observed`, result.outcome === "succeeded" && result.observed && result.resultId === "drafts.event-runtime");
    }
    check("all six runtime callbacks invoked", [...newsProducers, ...eventProducers].every((producer) => invoked.get(producer) === 1));

    const duplicate = createOfficialNewsRuntimeAuthority("ufc_news", {
      getItem: (originId) => ({id: originId, title: "Duplicada"}),
      analyze: async (item) => ({sourceId: item.id, status: "requiere_revision", existingSanityId: "drafts.news-existing"}),
    });
    const duplicateResult = await duplicate.continueOrigin(request("ufc_news", "analyze_official_news", [{type: "select_candidate", issueId: "issue", candidateId: "news-existing"}]));
    check("duplicate decision uses observed Sanity identity", duplicateResult.outcome === "already_applied" && duplicateResult.observed && duplicateResult.resultId === "drafts.news-existing");

    const unobserved = createOfficialNewsRuntimeAuthority("one_news", {
      getItem: (originId) => ({id: originId, title: "Sin respuesta"}),
      analyze: async () => undefined,
    });
    const unobservedResult = await unobserved.continueOrigin(request("one_news", "analyze_official_news"));
    check("unobserved producer result cannot succeed", unobservedResult.outcome === "failed" && !unobservedResult.observed && !unobservedResult.resultId);

    const blockedEvent = createOfficialEventRuntimeAuthority("bkfc_events", {
      getEvent: (originId) => ({id: originId, name: "BKFC blocked"}),
      resolve: async () => ({...readyEvent(), counts: {missingFighters: 1, unresolvedCategories: 0}, missingFighters: [{sourceName: "Fighter", normalizedName: "fighter"}]}),
    });
    const chained = await blockedEvent.continueOrigin(request("bkfc_events", "resolve_official_event"));
    check("new producer blocker remains review_required", chained.outcome === "review_required" && chained.observed && Boolean(chained.resultId));

    let ufcBatchCalls = 0;
    const ufcBatch = createOfficialEventRuntimeAuthority("ufc_events", {
      getEvent: (originId) => ({id: originId, name: "UFC batch"}),
      resolve: async () => readyEvent(),
      analyzeBatch: async (event) => { ufcBatchCalls += 1; return {eventId: event.id, status: "listo_para_preparar", eventSanityId: "event-batch"}; },
    });
    const ufcBatchResult = await ufcBatch.continueOrigin(request("ufc_events", "analyze_official_events"));
    check("UFC batch resumes through its own analyzer", ufcBatchCalls === 1 && ufcBatchResult.outcome === "succeeded" && ufcBatchResult.resultId === "event-batch");

    let dispatchCalls = 0;
    const reviewCase = createRx5ReviewFlowFixture("ufc_news", "runtime-idempotency");
    const candidate = reviewCase.issues[0]?.candidates?.[0];
    if (!candidate) throw new Error("runtime_test_candidate_missing");
    addReviewResolution(reviewCase.id, {type: "select_candidate", issueId: reviewCase.issues[0]!.id, candidateId: candidate.id});
    transitionReviewCase(reviewCase.id, "resolved");
    const resolved = getReviewCase(reviewCase.id)!;
    const context = readReviewOriginResumeContext(resolved)!;
    const dispatchAuthority = createOfficialNewsRuntimeAuthority("ufc_news", {
      getItem: (originId) => ({id: originId, title: "Runtime"}),
      analyze: async (item) => { dispatchCalls += 1; return {sourceId: item.id, status: "nueva_apta"}; },
    });
    disposers.push(registerReviewOriginResumeAuthority("ufc_news", dispatchAuthority, {replace: true}));
    const unauthorized = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version, expectedFingerprint: context.fingerprint, authorized: false});
    check("authorization is preserved", unauthorized.status === "authorization_required" && dispatchCalls === 0);
    const stale = await dispatchReviewResume({caseId: resolved.id, expectedCaseVersion: resolved.version + 1, expectedFingerprint: context.fingerprint, authorized: true});
    check("stale version fails closed", stale.status === "changed" && dispatchCalls === 0);

    const idempotentCase = createRx5ReviewFlowFixture("ufc_news", "runtime-repeat");
    const idempotentCandidate = idempotentCase.issues[0]?.candidates?.[0];
    if (!idempotentCandidate) throw new Error("runtime_repeat_candidate_missing");
    addReviewResolution(idempotentCase.id, {type: "select_candidate", issueId: idempotentCase.issues[0]!.id, candidateId: idempotentCandidate.id});
    transitionReviewCase(idempotentCase.id, "resolved");
    const idempotentReady = getReviewCase(idempotentCase.id)!;
    const idempotentContext = readReviewOriginResumeContext(idempotentReady)!;
    const first = await dispatchReviewResume({caseId: idempotentReady.id, expectedCaseVersion: idempotentReady.version, expectedFingerprint: idempotentContext.fingerprint, authorized: true});
    const second = await dispatchReviewResume({caseId: idempotentReady.id, expectedCaseVersion: idempotentReady.version, expectedFingerprint: idempotentContext.fingerprint, authorized: true});
    check("idempotent resume invokes producer once", first.status === "resumed" && second.status === "already_resumed" && dispatchCalls === 1);
    check("observed result persisted", getReviewCase(idempotentReady.id)?.resumeExecution?.summary?.resultId?.includes("nueva_apta"));

    check("runtime registration uses no DEV authority", panel.includes("createOfficialNewsRuntimeAuthority") && panel.includes("createOfficialEventRuntimeAuthority") && !panel.slice(panel.indexOf("const officialResumeRuntime"), panel.indexOf("const visibleSchemaFields")).includes("createRx5ResumeAuthority"));
    check("UFC news callback wired", panel.includes("officialResumeRuntime.current.analyzeOfficialUfcNews([item], signal, true)"));
    check("UFC event callback wired", panel.includes("officialResumeRuntime.current.resolveSelectedUfcEvent(event, signal)"));
    check("UFC batch callback wired without forced symmetry", panel.includes("officialResumeRuntime.current.analyzeUpcomingUfcEvents([event], signal, true)"));
    check("ONE news callback wired", panel.includes("officialResumeRuntime.current.analyzeOfficialOneNews([item], signal, true)"));
    check("ONE event callback wired", panel.includes("officialResumeRuntime.current.resolveSelectedOneEvent(event, signal)"));
    check("BKFC news callback wired", panel.includes("officialResumeRuntime.current.analyzeOfficialBkfcNews([item], signal, true)"));
    check("BKFC event callback wired", panel.includes("officialResumeRuntime.current.resolveSelectedBkfcEvent(event, signal)"));
    check("single-news resume preserves the analyzed batch", (panel.match(/mergeOfficialNewsBatchAnalysis\(current, payload\)/g) ?? []).length === 3);
    check("no parallel executor or registry", !/new Map|class .*Executor|localStorage|sessionStorage/.test(adapter) && (registry.match(/originAuthorities = new Map/g) ?? []).length === 1 && dispatcher.includes("getReviewOriginResumeAuthority"));
    check("runtime adapter performs no direct writes", !/saveDraft|createClient|sanityClient|create-event|create-fights|create-fighters|create-categories/.test(adapter));
    check("external_news remains supported", getReviewProducerSupport("external_news").status === "supported" && panel.includes('registerReviewResumeExecutor("external_news"'));
    check("all official producers report support", [...newsProducers, ...eventProducers].every((producer) => getReviewProducerSupport(producer).status === "supported"));
    check("AU7 authority remains upstream", panel.includes("registerFighterResolutionProposals") && adapter.includes("review_required") && !adapter.includes("executeTransaction"));
    check("AU8 authority remains untouched", !/autonomous|runAgent|supervisedLoop/.test(adapter));
    check("existing callbacks preserve review intake", panel.includes('registerOfficialNewsReviewIntake("ufc"') && panel.includes("registerOfficialEventReviewIntake({"));
    check("no duplicate news/event creation path", !/saveDraft|create-event/.test(adapter));
    check("browser fixture uses production authority contract without writes", development.includes("createOfficialNewsRuntimeAuthority") && development.includes("createOfficialEventRuntimeAuthority") && development.includes("fixture: RX5_BROWSER_FIXTURE_QUERY") && development.includes("producer, case: reviewCase.id") && !/fetch\(|saveDraft|createClient/.test(development));

    assert.equal(checks.length, 39);
    console.log(`RX5 runtime producer authorities: OK (${checks.length}/39 contracts)`);
  } finally {
    while (disposers.length) disposers.pop()?.();
    restoreOutcomes();
    restoreStore();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
