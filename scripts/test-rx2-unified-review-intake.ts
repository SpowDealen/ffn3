import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {
  createOrUpdateReviewCaseFromIntake,
  createReviewIntakeIdentity,
  deriveReviewCaseHumanLabels,
  registerOfficialEventBatchReviewIntake,
  registerOfficialEventReviewIntake,
  registerOfficialNewsReviewIntake,
  resolveReviewCaseDeepLink,
  REVIEW_INTAKE_ISSUE_TYPES,
} from "../_laboratorio/laboratorio-ia/src/review/intake";
import {isSerializableReviewValue} from "../_laboratorio/laboratorio-ia/src/review/cases/validateResolution";
import {createExternalNewsReviewTestInput} from "../_laboratorio/laboratorio-ia/src/review/producers/externalNews/development";
import {createOrUpdateExternalNewsReviewCase} from "../_laboratorio/laboratorio-ia/src/review/producers/externalNews";
import {registerExternalNewsGlobalResolutionRuntime} from "../_laboratorio/laboratorio-ia/src/review/globalResolution";
import {getReviewCases, setReviewCaseRepositoryForTests} from "../_laboratorio/laboratorio-ia/src/review/store/reviewStore";
import {selectNeedsAttentionReviewCases} from "../_laboratorio/laboratorio-ia/src/review/store/selectors";
import type {ReviewCase, ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";
import {editorialSignalsSecurity} from "../_laboratorio/laboratorio-ia/src/agent/editorial-signals";

const now = "2026-08-31T10:00:00.000Z";
const checks: string[] = [];
function check(area: string, condition: unknown): void {
  assert.ok(condition, area);
  checks.push(area);
}

let storedCases: ReviewCase[] = [];
const restoreStore = setReviewCaseRepositoryForTests({
  load: () => structuredClone(storedCases),
  save: (items) => { storedCases = structuredClone([...items]); },
});
const disposeRuntime = registerExternalNewsGlobalResolutionRuntime({
  fighter: {
    entityCreationExecutor: {
      checkDuplicate: async () => ({status: "none", candidates: []}),
      createEntity: async () => ({success: true, entityId: "never-written"}),
    },
  },
  resume: {} as never,
  now: () => now,
});

const baseRequest = {
  actionable: true,
  source: "ufc" as const,
  entityType: "news" as const,
  originId: "news:identity-42",
  issueType: "missing_entity" as const,
  summary: "Falta una entidad editorial requerida.",
  title: "Noticia de prueba",
  subjectLabel: "Noticia de prueba",
  evidenceRefs: [{id: "evidence:42", source: "fixture"}],
  originContext: {route: "/editorial", sourceId: "news:identity-42"},
  resumeContext: {producer: "ufc_news", originId: "news:identity-42", operation: "analyze"},
  now: () => now,
};

const eventResolution = (fighterName: string) => ({
  event: {sourceName: "Fight Night 42", found: true, sanityId: "event:42", sanityName: "Fight Night 42"},
  discipline: {found: true, sanityId: "discipline:mma", sanityName: "MMA"},
  organization: {found: true, sanityId: "organization:42", sanityName: "Organization"},
  missingFighters: [{sourceName: fighterName, normalizedName: fighterName.toLocaleLowerCase("es"), found: false as const}],
  unresolvedCategories: [{sourceLabel: "Catchweight 165", normalizedLabel: "catchweight 165", found: false as const}],
  fights: [{sourceFightId: "fight:42", readyToCreate: false, blockingReasons: ["ganador_no_encontrado"]}],
});

async function main(): Promise<void> {
  try {
    const first = createOrUpdateReviewCaseFromIntake(baseRequest);
    const firstCase = getReviewCases().find((item) => item.id === first.caseId)!;
    check("1 intake serializable", isSerializableReviewValue(firstCase));

    const beforeRepeat = getReviewCases().length;
    const repeated = createOrUpdateReviewCaseFromIntake(baseRequest);
    check("2 idempotencia", repeated.status === "unchanged" && repeated.caseId === first.caseId && getReviewCases().length === beforeRepeat);

    const identityA = createReviewIntakeIdentity(baseRequest);
    const identityB = createReviewIntakeIdentity({...baseRequest, originId: "  NEWS:IDENTITY-42  "});
    check("3 deterministic identity", identityA?.identityKey === identityB?.identityKey && identityA?.fingerprint === identityB?.fingerprint);

    const ufcNews = registerOfficialNewsReviewIntake("ufc", [{sourceId: "ufc-news:1", title: "UFC News", status: "requiere_revision", existingSanityId: "sanity-news:1", existingTitle: "Existing UFC News", matchStrategy: "titulo", reasons: ["Coincidencia por título"]}]);
    check("4 UFC news actionable", ufcNews.length === 1 && ufcNews[0].status === "created" && getReviewCases().some((item) => item.id === ufcNews[0].caseId && item.module === "ufc.news"));

    const ufcBatch = registerOfficialEventBatchReviewIntake("ufc", [{eventId: "ufc-event:batch", eventName: "UFC Batch Event", status: "requiere_revision", unresolvedCategories: 2}]);
    check("5 UFC event actionable", ufcBatch.length === 1 && getReviewCases().some((item) => item.id === ufcBatch[0].caseId && item.subject.type === "event"));

    const ufcEvent = registerOfficialEventReviewIntake({source: "ufc", event: {id: "ufc-event:42", name: "UFC Fight Night 42"}, resolution: eventResolution("Ada UFC Fighter")});
    check("6 UFC fighter actionable", ufcEvent.fighterRegistrations.length === 1 && getReviewCases().some((item) => item.context.producer === "ufc_events" && item.subject.label === "Ada UFC Fighter"));

    const beforeUfcNoop = getReviewCases().length;
    const ufcNoop = registerOfficialNewsReviewIntake("ufc", [{sourceId: "ufc-news:ready", title: "Ready", status: "nueva_apta", reasons: []}]);
    check("7 UFC non-actionable", ufcNoop.length === 0 && getReviewCases().length === beforeUfcNoop);

    const oneNews = registerOfficialNewsReviewIntake("one", [{sourceId: "one-news:1", title: "ONE News", status: "requiere_revision", reasons: ["Sujeto ambiguo"]}]);
    check("8 ONE news", oneNews.length === 1 && getReviewCases().some((item) => item.id === oneNews[0].caseId && item.module === "one.news"));

    const oneEvent = registerOfficialEventReviewIntake({source: "one", event: {id: "one-event:42", name: "ONE 42"}, resolution: eventResolution("Bea ONE Participant")});
    check("9 ONE event", oneEvent.reviewCases.some((result) => getReviewCases().some((item) => item.id === result.caseId && item.module === "one.events")));
    check("10 ONE participant", oneEvent.fighterRegistrations.length === 1 && getReviewCases().some((item) => item.context.producer === "one_events" && item.subject.label === "Bea ONE Participant"));

    const beforeOneNoop = getReviewCases().length;
    const oneNoop = registerOfficialNewsReviewIntake("one", [{sourceId: "one-news:empty", title: "Empty", status: "sin_contenido", reasons: ["Fuente vacía"]}]);
    check("11 ONE non-actionable", oneNoop.length === 0 && getReviewCases().length === beforeOneNoop);

    const bkfcNews = registerOfficialNewsReviewIntake("bkfc", [{sourceId: "bkfc-news:1", title: "BKFC News", status: "requiere_revision", reasons: ["Campo obligatorio ausente"]}]);
    check("12 BKFC news", bkfcNews.length === 1 && getReviewCases().some((item) => item.id === bkfcNews[0].caseId && item.module === "bkfc.news"));

    const bkfcEvent = registerOfficialEventReviewIntake({source: "bkfc", event: {id: "bkfc-event:42", name: "BKFC 42"}, resolution: eventResolution("Cora BKFC Fighter")});
    check("13 BKFC event", bkfcEvent.reviewCases.some((result) => getReviewCases().some((item) => item.id === result.caseId && item.module === "bkfc.events")));
    check("14 BKFC fighter", bkfcEvent.fighterRegistrations.length === 1 && getReviewCases().some((item) => item.context.producer === "bkfc_events" && item.subject.label === "Cora BKFC Fighter"));

    const beforeBkfcNoop = getReviewCases().length;
    const bkfcNoop = registerOfficialNewsReviewIntake("bkfc", [{sourceId: "bkfc-news:existing", title: "Existing", status: "existente", reasons: []}]);
    check("15 BKFC non-actionable", bkfcNoop.length === 0 && getReviewCases().length === beforeBkfcNoop);

    const external = createOrUpdateExternalNewsReviewCase(createExternalNewsReviewTestInput());
    const externalCase = getReviewCases().find((item) => item.id === external.caseId);
    check("16 external_news intact", external.status === "created" && externalCase?.module === "external.news" && externalCase.context.producer === "external_news" && !externalCase.context.unifiedReviewIntake);

    const taxonomyCases = new Map<string, ReviewCase>();
    for (const [index, issueType] of REVIEW_INTAKE_ISSUE_TYPES.entries()) {
      const result = createOrUpdateReviewCaseFromIntake({...baseRequest, originId: `taxonomy:${issueType}`, issueType, summary: `Caso ${issueType}`, now: () => now});
      taxonomyCases.set(issueType, getReviewCases().find((item) => item.id === result.caseId)!);
      if (index > 11) break;
    }
    check("17 missing entity", taxonomyCases.get("missing_entity")?.issues[0].kind === "missing_entity");
    check("18 ambiguous entity", taxonomyCases.get("ambiguous_entity")?.issues[0].kind === "ambiguous_reference");
    check("19 duplicate entity", taxonomyCases.get("duplicate_entity")?.issues[0].kind === "duplicate_candidate");
    check("20 missing relation", taxonomyCases.get("missing_relation")?.issues[0].kind === "missing_reference");
    check("21 ambiguous relation", taxonomyCases.get("ambiguous_relation")?.issues[0].kind === "ambiguous_reference");
    check("22 conflicting relation", taxonomyCases.get("conflicting_relation")?.issues[0].kind === "contradictory_data");
    check("23 insufficient evidence", taxonomyCases.get("insufficient_evidence")?.issues[0].kind === "low_confidence");
    check("24 conflicting evidence", taxonomyCases.get("conflicting_evidence")?.issues[0].kind === "contradictory_data");
    check("25 missing required field", taxonomyCases.get("missing_required_field")?.issues[0].kind === "required_field");
    check("26 incomplete event", taxonomyCases.get("incomplete_event")?.issues[0].kind === "blocked_dependency");
    check("27 unresolved fighter", taxonomyCases.get("unresolved_fighter")?.issues[0].kind === "missing_entity");
    check("28 unresolved category", taxonomyCases.get("unresolved_category")?.issues[0].kind === "missing_reference");

    const logicalAgain = createOrUpdateReviewCaseFromIntake({...baseRequest, summary: "Contexto actualizado", now: () => "2026-08-31T11:00:00.000Z"});
    check("29 same logical issue reuses case", logicalAgain.status === "updated" && logicalAgain.caseId === first.caseId && getReviewCases().filter((item) => item.dedupeKey === identityA?.identityKey).length === 1);

    const updatedFirst = getReviewCases().find((item) => item.id === first.caseId)!;
    const intake = updatedFirst.context.unifiedReviewIntake as ReviewJsonObject;
    check("30 source preserved", updatedFirst.source === "UFC" && intake.source === "ufc");
    check("31 origin context preserved", (intake.origin as ReviewJsonObject).sourceId === "news:identity-42");
    check("32 resume context preserved", (intake.resume as ReviewJsonObject).producer === "ufc_news" && (intake.resume as ReviewJsonObject).originId === "news:identity-42");

    const minimized = createOrUpdateReviewCaseFromIntake({...baseRequest, originId: "minimized", originContext: {body: "x".repeat(20_000), nested: {values: Array.from({length: 100}, (_, index) => index)}}});
    const minimizedCase = getReviewCases().find((item) => item.id === minimized.caseId)!;
    check("33 payload minimized", JSON.stringify(minimizedCase.context).length < 8_000 && JSON.stringify(minimizedCase.context).length < 20_000);

    const safe = createOrUpdateReviewCaseFromIntake({...baseRequest, originId: "safe", originContext: {token: "secret-token", headers: {authorization: "Bearer secret"}, safeId: "visible"}, resumeContext: {password: "secret", originId: "safe"}});
    const safeCaseJson = JSON.stringify(getReviewCases().find((item) => item.id === safe.caseId));
    check("34 no secrets", !safeCaseJson.includes("secret-token") && !safeCaseJson.includes("Bearer secret") && !safeCaseJson.includes("password") && safeCaseJson.includes("visible"));

    check("35 needsAttention includes actionable", selectNeedsAttentionReviewCases([updatedFirst]).some((item) => item.id === updatedFirst.id));
    check("36 needsAttention excludes resolved", selectNeedsAttentionReviewCases([{...updatedFirst, status: "resolved"}]).length === 0);
    check("37 needsAttention excludes historical", selectNeedsAttentionReviewCases([{...updatedFirst, context: {...updatedFirst.context, historical: true}}]).length === 0);
    check("38 needsAttention excludes active no-human-action", selectNeedsAttentionReviewCases([{...updatedFirst, context: {...updatedFirst.context, humanActionRequired: false}}]).length === 0);

    const labels = deriveReviewCaseHumanLabels(updatedFirst);
    check("39 human labels", labels.sourceLabel === "UFC" && labels.entityLabel === "Noticia" && labels.problemTitle.length > 0 && labels.problemSummary === "Contexto actualizado");

    const existingLink = resolveReviewCaseDeepLink(getReviewCases(), updatedFirst.id);
    check("40 deep link existing case", existingLink.found && existingLink.caseId === updatedFirst.id && existingLink.section === "case");
    const missingLink = resolveReviewCaseDeepLink(getReviewCases(), "missing-case");
    check("41 deep link missing case safe", !missingLink.found && missingLink.section === "dashboard" && !missingLink.caseId);

    const reviewCenterSource = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx", "utf8");
    check("42 tabs intact", reviewCenterSource.includes("handledDeepLink.current === requested") && reviewCenterSource.includes("OperatorExperienceNavigation") && reviewCenterSource.includes("function navigate(section"));

    const viteConfig = readFileSync("_laboratorio/laboratorio-ia/vite.config.ts", "utf8");
    assert.match(viteConfig, /dedupe:\s*\["react",\s*"react-dom"\]/, "el Lab debe resolver una única instancia React");

    const intakeDir = "_laboratorio/laboratorio-ia/src/review/intake";
    const intakeSource = readdirSync(intakeDir).filter((name) => name.endsWith(".ts")).map((name) => readFileSync(join(intakeDir, name), "utf8")).join("\n");
    const officialSource = readFileSync(join(intakeDir, "officialSources.ts"), "utf8");
    check("43 no writes outside Review authority", !/localStorage|@sanity\/client|sanityClient|\bfetch\s*\(/.test(officialSource));
    check("44 AU7 authority untouched", !/review\/transactions|executeUniversalExecutionPlan|TransactionExecutor/.test(intakeSource));
    check("45 AU8 authority untouched", !/editorialDecision|supervisedLoop|runAutonomous/.test(intakeSource));
    check("46 no new store", !readdirSync(intakeDir).some((name) => /store/i.test(name)) && !intakeSource.includes("ReviewInboxStore"));
    check("47 no polling", !/setInterval|setTimeout|polling|watcher/.test(intakeSource));
    check("48 no agent execution", !/runAgent|executeAgent|agentLoop|scheduler/.test(intakeSource));

    const panelSource = readFileSync("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx", "utf8");
    check("49 LES intact", panelSource.includes("GlobalFeedbackRegion") && panelSource.includes("notifyAnalysisCompleted") && readFileSync("scripts/test-les8-agent-ready.ts", "utf8").length > 0);
    check("50 AG1 intact", readFileSync("scripts/test-ag1-agent-observation-reasoning.ts", "utf8").length > 0 && !/agent\/observation|agent\/reasoning/.test(intakeSource));
    check("51 AG2 intact", editorialSignalsSecurity.writes === false && editorialSignalsSecurity.persists === false && intakeSource.includes("EditorialAnomalyCategory"));
    check("52 AU10 intact", reviewCenterSource.includes("NucleusGlobalDashboard") && readFileSync("scripts/test-au10-final-certification.ts", "utf8").length > 0);

    assert.equal(checks.length, 52);
    console.log(`RX2 unified review intake tests: OK (${checks.length}/52)`);
  } finally {
    disposeRuntime();
    restoreStore();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
