import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildSimplifiedReviewCasePresentation,
  resolveReviewCaseDeepLink,
  selectNeedsAttentionReviewCases,
  simplifiedReviewCaseSecurity,
  translateReviewTechnicalState,
  type ReviewCase,
} from "../_laboratorio/laboratorio-ia/src/review";

const NOW = "2026-08-31T12:00:00.000Z";
const checks: string[] = [];
function check(area: string, condition: unknown): void {
  assert.ok(condition, area);
  checks.push(area);
}

function reviewCase(overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id: "rx3:case",
    dedupeKey: "rx3:case",
    module: "ufc.news",
    title: "Caso técnico de identidad",
    status: "open",
    priority: "high",
    source: "UFC",
    subject: {type: "fighter", id: "fighter:rx3", label: "Luchador pendiente"},
    issues: [{
      id: "issue:identity",
      kind: "ambiguous_reference",
      valueKind: "fighter",
      label: "Identidad del luchador",
      message: "No podemos identificar con suficiente seguridad al luchador de esta noticia.",
      required: true,
      blocking: true,
      candidates: [
        {id: "candidate:a", label: "Alex Norte", value: "fighter:a", confidence: .94, reasons: ["El nombre y la organización coinciden.", "token secreto no visible"]},
        {id: "candidate:b", label: "Álex Sur", value: "fighter:b", confidence: .61},
      ],
      evidence: ["La fuente menciona a Alex Norte.", "fingerprint:should-not-leak"],
    }],
    resolutions: [{type: "select_candidate", issueId: "issue:identity", candidateId: "candidate:a"}],
    context: {
      producer: "ufc_news",
      token: "must-not-leak",
      payloadSnapshot: {raw: "raw-payload-must-not-leak"},
      unifiedReviewIntake: {
        sourceLabel: "UFC",
        entityLabel: "Luchador",
        problemTitle: "Identidad del luchador sin confirmar",
        problemSummary: "No podemos identificar con suficiente seguridad al luchador de esta noticia.",
        resume: {producer: "ufc_news", operation: "analyze_official_news", fingerprint: "technical-only"},
      },
    },
    createdAt: NOW,
    updatedAt: NOW,
    version: 3,
    resumeAttempts: 0,
    ...overrides,
  };
}

function main(): void {
  const detailsPath = "_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx";
  const modelPath = "_laboratorio/laboratorio-ia/src/review/presentation/simplifiedReviewCase.ts";
  const centerPath = "_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx";
  const typePath = "_laboratorio/laboratorio-ia/src/review/types.ts";
  const stylesPath = "_laboratorio/laboratorio-ia/src/styles.css";
  const details = readFileSync(detailsPath, "utf8");
  const modelSource = readFileSync(modelPath, "utf8");
  const center = readFileSync(centerPath, "utf8");
  const types = readFileSync(typePath, "utf8");
  const styles = readFileSync(stylesPath, "utf8");
  const presentation = buildSimplifiedReviewCasePresentation(reviewCase());
  const questionPositions = ["¿Qué pasa?", "¿Por qué?", "¿Qué recomienda el Lab?", "¿Qué ocurrirá si apruebo?"].map((question) => details.indexOf(question));

  check("1 cuatro preguntas presentes", questionPositions.every((position) => position >= 0));
  check("2 orden correcto", questionPositions.every((position, index) => index === 0 || position > questionPositions[index - 1]));
  check("3 problem title humano", presentation.problem.title === "Identidad del luchador sin confirmar");
  check("4 issue técnico no usado como heading principal", !presentation.problem.title.includes("ambiguous_reference") && !details.includes("<h3>{reviewCase.title}</h3>"));
  check("5 ambos candidatos en capa humana", presentation.why.candidates.length === 2 && presentation.why.candidates.some((item) => item.label === "Alex Norte") && presentation.why.candidates.some((item) => item.label === "Álex Sur"));
  check("5b Alex Norte 94%", presentation.why.candidates.some((item) => item.label === "Alex Norte" && item.confidence?.value === 94));
  check("5c Álex Sur 61%", presentation.why.candidates.some((item) => item.label === "Álex Sur" && item.confidence?.value === 61));
  check("5d recomendado distinguido", presentation.why.candidates.some((item) => item.label === "Alex Norte" && item.role === "recommended"));
  check("5e alternativa distinguida", presentation.why.candidates.some((item) => item.label === "Álex Sur" && item.role === "alternative"));
  check("6 recommendation existente", presentation.recommendation.available && presentation.recommendation.summary.includes("Alex Norte"));
  check("7 recommendation no concluyente", !buildSimplifiedReviewCasePresentation(reviewCase({resolutions: [], issues: [{...reviewCase().issues[0], candidates: [{id: "low", label: "Opción dudosa", value: "low", confidence: .51}]}]})).recommendation.available);
  check("8 confidence", presentation.recommendation.confidence?.label === "Alta" && presentation.recommendation.confidence.value === 94);
  check("9 expected effect", presentation.expectedEffect.available && presentation.expectedEffect.summary.includes("Alex Norte"));
  const unresolved = buildSimplifiedReviewCasePresentation(reviewCase({resolutions: [], context: {producer: "rx3"}, issues: [{...reviewCase().issues[0], candidates: []}]}));
  check("10 expected effect no inventado", !unresolved.expectedEffect.available && unresolved.expectedEffect.summary.startsWith("No se puede determinar"));
  check("11 resume pendiente honesto", presentation.expectedEffect.resumePending && presentation.expectedEffect.summary.includes("reanudación posterior"));
  check("12 actions existentes", presentation.actions.approve && presentation.actions.change && presentation.actions.dismiss && details.includes("Aprobar resolución"));
  check("13 no acciones inventadas", !details.includes("Forzar ejecución") && !details.includes(">Reintentar<") && !modelSource.includes("autoExecute"));
  check("14 disabled reason humano", !unresolved.actions.approve && unresolved.actions.unavailableReason === "Completa primero las decisiones obligatorias pendientes.");

  const technicalStart = details.indexOf('<details className="review-technical-details"');
  const nucleusPosition = details.indexOf("<AIResolutionNucleus");
  const technicalEnd = details.lastIndexOf("</details>");
  const technicalSource = details.slice(technicalStart, technicalEnd);
  check("15 technical details cerrado por defecto", technicalStart >= 0 && details.includes("const [technicalOpen, setTechnicalOpen] = useState(false)") && !details.includes("defaultOpen"));
  check("16 AU7 dentro de technical details", technicalSource.includes("AU7") && technicalStart < nucleusPosition);
  check("17 AU8 dentro de technical details", technicalSource.includes("AU8") && technicalStart < nucleusPosition);
  check("18 checkpoint dentro", technicalSource.includes("checkpoint"));
  check("19 fingerprint dentro", technicalSource.includes("fingerprints"));
  check("20 reconciliation dentro", technicalSource.includes("reconciliación") && technicalSource.includes("technicalExtras") && center.includes("technicalExtras={selectedCase.id === developmentFixture?.id ? undefined") && center.includes("<EntityIdentityLookupControls /><ReconciliationScanControls />"));
  check("21 compensation dentro", technicalSource.includes("compensación"));
  check("22 staleness traducido", translateReviewTechnicalState("stale") === "Información desactualizada");
  check("23 unsupported traducido", translateReviewTechnicalState("unsupported") === "Este caso no puede resolverse automáticamente");
  check("24 enums internos intactos", types.includes('| "stale"') && types.includes('| "resume_failed"') && types.includes('| "resuming"'));

  const empty = buildSimplifiedReviewCasePresentation(reviewCase({issues: [], resolutions: [], context: {producer: "rx3"}}));
  check("25 empty why", empty.why.candidates.length === 0 && empty.why.evidence.length === 0 && empty.why.summary.includes("no hay evidencia suficiente"));
  check("26 empty recommendation", !empty.recommendation.available && empty.recommendation.summary.includes("No hay una recomendación segura"));
  check("27 empty expected effect", !unresolved.expectedEffect.available && unresolved.expectedEffect.summary.includes("completar la información pendiente"));

  const existingLink = resolveReviewCaseDeepLink([reviewCase()], "rx3:case");
  const missingLink = resolveReviewCaseDeepLink([reviewCase()], "missing");
  check("28 deep link intacto", existingLink.found && existingLink.section === "case" && !missingLink.found && missingLink.section === "dashboard" && center.includes("resolveReviewCaseDeepLink"));
  check("29 needs attention intacto", selectNeedsAttentionReviewCases([reviewCase()]).length === 1 && selectNeedsAttentionReviewCases([reviewCase({status: "resolved"})]).length === 0);
  check("30 Review authority intacta", !modelSource.includes("reviewStore") && !details.includes('from "../store/') && center.includes("transitionReviewCase") && center.includes("addReviewResolution"));

  const external = buildSimplifiedReviewCasePresentation(reviewCase({module: "external.news", source: "external_news", subject: {type: "external_news"}, context: {producer: "external_news"}}));
  check("31 external_news intacto", external.sourceLabel === "external_news" && external.entityLabel === "Noticia");
  check("32 RX2 intacto", center.includes("handledDeepLink.current === requested") && readFileSync("scripts/test-rx2-unified-review-intake.ts", "utf8").includes("52"));
  check("33 no store", simplifiedReviewCaseSecurity.createsStores === false && !/from ["'][^"']*store/.test(modelSource));
  check("34 no executor", simplifiedReviewCaseSecurity.createsExecutors === false && simplifiedReviewCaseSecurity.invokesExecutors === false && !/from ["'][^"']*executor/.test(modelSource));
  check("35 no planner", simplifiedReviewCaseSecurity.createsPlanners === false && !/from ["'][^"']*planner/.test(modelSource));
  check("36 no resume engine", simplifiedReviewCaseSecurity.createsResumeEngines === false && !modelSource.includes("resumeEngine"));
  check("37 no AU changes", !/from ["'][^"']*(transactions|editorialDecision|globalResolution)/.test(modelSource) && !details.includes("executeUniversalExecutionPlan"));
  check("38 no writes in presentation", presentation.writes === false && simplifiedReviewCaseSecurity.writes === false && !/localStorage|fetch\s*\(|\.save\s*\(/.test(modelSource));
  check("39 accessibility disclosure", details.includes("aria-expanded={technicalOpen}") && details.includes("aria-controls={technicalId}") && technicalSource.includes('id={technicalId}') && details.includes("<summary"));
  check("39b disclosure nativo no controlado", technicalSource.includes('<details className="review-technical-details" onToggle={syncTechnicalState}>') && !technicalSource.includes("open={technicalOpen}"));
  check("39c Enter y Space nativos", !technicalSource.includes("onKeyDown") && !technicalSource.includes("onKeyUp") && !technicalSource.includes("preventDefault"));
  check("39d click nativo", !technicalSource.includes("onClick") && technicalSource.includes("<summary aria-expanded={technicalOpen}"));
  check("39e sin double-toggle", (technicalSource.match(/onToggle=/g) ?? []).length === 1 && !technicalSource.includes("setTechnicalOpen((current)"));
  check("40 mobile-friendly structure", styles.includes(".review-human-case-flow") && styles.includes(".review-details-simplified") && styles.includes("@media (max-width: 560px)") && styles.includes("@media (max-width: 390px)"));
  check("41 no duplicate live regions", !details.includes("aria-live") && (details.match(/role="status"/g) ?? []).length === 1);

  const serialized = JSON.stringify(presentation);
  check("42 no raw secrets", !serialized.includes("must-not-leak") && !serialized.includes("token secreto") && !serialized.includes("technical-only"));
  check("43 no raw payloads", !serialized.includes("raw-payload") && !serialized.includes("payloadSnapshot") && !serialized.includes("fingerprint"));
  check("44 deterministic presentation", JSON.stringify(buildSimplifiedReviewCasePresentation(reviewCase())) === serialized);
  check("45 tsc compatibility", presentation.version === "1.0.0" && modelSource.includes("SimplifiedReviewCasePresentation"));

  assert.equal(checks.length, 53);
  console.log(`RX3 simplified review case tests: OK (${checks.length}/53)`);
}

main();
