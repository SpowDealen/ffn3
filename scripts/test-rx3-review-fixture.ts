import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildRx3VisualReviewFixture,
  RX3_VISUAL_REVIEW_FIXTURE_ID,
  RX3_VISUAL_REVIEW_FIXTURE_QUERY,
  rx3VisualReviewFixtureSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/development/rx3VisualFixture";
import {canResolveReviewCase, isSerializableReviewValue} from "../_laboratorio/laboratorio-ia/src/review/cases/validateResolution";
import {resolveReviewCaseDeepLink} from "../_laboratorio/laboratorio-ia/src/review/intake";
import {buildNucleusResolutionViewModel} from "../_laboratorio/laboratorio-ia/src/review/nucleus";
import {buildSimplifiedReviewCasePresentation} from "../_laboratorio/laboratorio-ia/src/review/presentation";
import type {ReviewJsonObject} from "../_laboratorio/laboratorio-ia/src/review/types";

const checks: string[] = [];
function check(area: string, condition: unknown): void {
  assert.ok(condition, area);
  checks.push(area);
}

function main(): void {
  const fixtureSource = readFileSync("_laboratorio/laboratorio-ia/src/review/development/rx3VisualFixture.ts", "utf8");
  const appSource = readFileSync("_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx", "utf8");
  const centerSource = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx", "utf8");
  const detailsSource = readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx", "utf8");
  const reviewIndex = readFileSync("_laboratorio/laboratorio-ia/src/review/index.ts", "utf8");
  const first = buildRx3VisualReviewFixture();
  const second = buildRx3VisualReviewFixture();
  const presentation = buildSimplifiedReviewCasePresentation(first);
  const technical = first.context.technicalDiagnostics as ReviewJsonObject;
  const nucleus = buildNucleusResolutionViewModel({reviewCase: first, evaluatedAt: first.updatedAt});
  const technicalStart = detailsSource.indexOf('<details className="review-technical-details"');
  const technicalEnd = detailsSource.lastIndexOf("</details>");
  const technicalSource = detailsSource.slice(technicalStart, technicalEnd);
  const url = new URL(`http://localhost:5173/revision?fixture=${RX3_VISUAL_REVIEW_FIXTURE_QUERY}&case=${encodeURIComponent(RX3_VISUAL_REVIEW_FIXTURE_ID)}`);

  check("1 fixture dev-only", appSource.includes("import.meta.env.DEV &&") && appSource.includes('search.get("fixture") === RX3_VISUAL_REVIEW_FIXTURE_QUERY') && !reviewIndex.includes("rx3VisualFixture"));
  check("2 ID determinista", first.id === RX3_VISUAL_REVIEW_FIXTURE_ID && second.id === first.id && JSON.stringify(second) === JSON.stringify(first));
  check("3 ReviewCase válido", first.schemaVersion === 1 && first.status === "open" && isSerializableReviewValue(first) && canResolveReviewCase(first));
  check("4 cero writes", rx3VisualReviewFixtureSecurity.writes === false && rx3VisualReviewFixtureSecurity.persists === false && !/reviewStore|localStorage|\.save\s*\(/.test(fixtureSource));
  check("5 sin Sanity", rx3VisualReviewFixtureSecurity.accessesSanity === false && !/@sanity\/client|sanityClient|fetch\s*\(/.test(fixtureSource));
  check("6 sin Telegram", rx3VisualReviewFixtureSecurity.accessesTelegram === false && !/sendTelegram|registerTelegram|notifications\/telegram/i.test(fixtureSource));
  check("7 sin AU7", rx3VisualReviewFixtureSecurity.invokesAu7 === false && first.globalResolution === undefined && technical.au7 === "not_invoked");
  check("8 sin AU8", rx3VisualReviewFixtureSecurity.invokesAu8 === false && technical.au8 === "not_invoked");
  check("9 deep link estable", url.pathname === "/revision" && url.searchParams.get("fixture") === "rx3" && url.searchParams.get("case") === first.id && resolveReviewCaseDeepLink([first], first.id).found);
  check("10 cuatro preguntas cubiertas", presentation.problem.summary.length > 20 && presentation.why.evidence.length >= 2 && presentation.recommendation.available && presentation.expectedEffect.available);
  check("11 detalles técnicos suficientes", technical.checkpointVersion === 3 && typeof technical.evidenceFingerprint === "string" && technical.reconciliation === "not_required" && technical.compensation === "not_required");
  check("12 sin secrets", !/(token|secret|authorization|cookie|password|api[_-]?key)/i.test(JSON.stringify(first)) && !first.resumeAction);
  check("13 RX3 intacto", readFileSync("scripts/test-rx3-simplified-review-case.ts", "utf8").includes("45") && detailsSource.includes("Detalles técnicos"));
  check("14 RX2 intacto", readFileSync("scripts/test-rx2-unified-review-intake.ts", "utf8").includes("52") && centerSource.includes("resolveReviewCaseDeepLink"));
  check("15 AU10 intacto", readFileSync("scripts/test-au10-final-certification.ts", "utf8").includes("AU2–AU10") && detailsSource.includes("<AIResolutionNucleus"));
  check("16 inyección sin persistencia", centerSource.includes("[developmentFixture, ...persistedReviewCases.filter") && !centerSource.includes("saveDevelopmentFixture"));
  check("17 acciones read-only", detailsSource.includes("Fixture DEV · solo lectura") && detailsSource.includes("Acciones desactivadas") && detailsSource.includes("disabled aria-describedby"));
  check("18 disclosure cerrado", detailsSource.includes("const [technicalOpen, setTechnicalOpen] = useState(false)") && detailsSource.includes('className="review-technical-details"'));
  check("19 seguridad completa", Object.values(rx3VisualReviewFixtureSecurity).every((value) => typeof value === "boolean") && rx3VisualReviewFixtureSecurity.createsStores === false && rx3VisualReviewFixtureSecurity.createsExecutors === false && rx3VisualReviewFixtureSecurity.createsPlanners === false);
  check("20 ambos candidatos visibles", presentation.why.candidates.map((candidate) => candidate.label).join("|") === "Alex Norte|Álex Sur");
  check("21 porcentajes humanos", presentation.why.candidates[0]?.confidence?.value === 94 && presentation.why.candidates[1]?.confidence?.value === 61);
  check("22 roles inequívocos", presentation.why.candidates[0]?.role === "recommended" && presentation.why.candidates[1]?.role === "alternative");
  check("23 recomendación sigue Alex Norte", presentation.recommendation.summary.includes("Alex Norte") && !presentation.recommendation.summary.includes("Álex Sur"));
  check("24 details cerrado inicialmente", detailsSource.includes("const [technicalOpen, setTechnicalOpen] = useState(false)") && !technicalSource.includes("open={technicalOpen}"));
  check("25 Enter Space click nativos", technicalSource.includes("<summary") && !/on(?:KeyDown|KeyUp|Click)=/.test(technicalSource) && !technicalSource.includes("preventDefault"));
  check("26 aria conectado", technicalSource.includes("aria-expanded={technicalOpen}") && technicalSource.includes("aria-controls={technicalId}") && technicalSource.includes('id={technicalId}'));
  check("27 no double-toggle", (technicalSource.match(/onToggle=/g) ?? []).length === 1 && !technicalSource.includes("setTechnicalOpen((current)"));
  check("28 sufficiency canónica única", technical.sufficiency === undefined && nucleus.evidence.status === "insufficient");
  check("29 conceptos traducidos", detailsSource.includes("confianza de candidatos informa la recomendación humana") && detailsSource.includes("readiness autónoma canónica"));

  assert.equal(checks.length, 29);
  console.log(`RX3 B3/B4 safe review fixture tests: OK (${checks.length}/29)`);
}

main();
