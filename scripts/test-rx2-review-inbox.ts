import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  buildReviewInboxItem,
  reviewInboxSecurity,
  selectReviewInbox,
  type ReviewCase,
  type ReviewInboxBucket,
} from "../_laboratorio/laboratorio-ia/src/review";
import {
  buildRx2ReviewInboxFixtures,
  RX2_REVIEW_INBOX_FIXTURE_QUERY,
  rx2ReviewInboxFixtureSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/development";

const NOW = "2026-09-01T12:00:00.000Z";
const checks: string[] = [];

function check(area: string, condition: unknown): void {
  assert.ok(condition, area);
  checks.push(area);
}

function reviewCase(id: string, overrides: Partial<ReviewCase> = {}): ReviewCase {
  return {
    schemaVersion: 1,
    id,
    dedupeKey: id,
    module: "ufc.news",
    title: `Caso ${id}`,
    status: "open",
    priority: "normal",
    source: "UFC",
    subject: {type: "news", id: `subject:${id}`},
    issues: [{
      id: `issue:${id}`,
      kind: "ambiguous_reference",
      valueKind: "fighter",
      label: "Luchador",
      message: "Hay dos luchadores posibles.",
      required: true,
      blocking: true,
      candidates: [
        {id: `candidate:${id}:a`, label: "Alex Norte", value: "fighter:a", confidence: 94},
        {id: `candidate:${id}:b`, label: "Álex Sur", value: "fighter:b", confidence: 61},
      ],
    }],
    resolutions: [],
    context: {
      unifiedReviewIntake: {
        sourceLabel: "UFC",
        entityLabel: "Noticia",
        problemTitle: "Luchador no identificado",
        problemSummary: "La noticia necesita confirmar al luchador correcto.",
      },
    },
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    resumeAttempts: 0,
    ...overrides,
  };
}

function main(): void {
  const modelPath = "_laboratorio/laboratorio-ia/src/review/inbox/model.ts";
  const componentPath = "_laboratorio/laboratorio-ia/src/review/components/ReviewInbox.tsx";
  const centerPath = "_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx";
  const appPath = "_laboratorio/laboratorio-ia/src/app/LaboratoryApp.tsx";
  const fixturePath = "_laboratorio/laboratorio-ia/src/review/development/rx2InboxFixture.ts";
  const stylesPath = "_laboratorio/laboratorio-ia/src/styles.css";
  const modelSource = readFileSync(modelPath, "utf8");
  const componentSource = readFileSync(componentPath, "utf8");
  const centerSource = readFileSync(centerPath, "utf8");
  const appSource = readFileSync(appPath, "utf8");
  const fixtureSource = readFileSync(fixturePath, "utf8");
  const styles = readFileSync(stylesPath, "utf8");
  const primaryActionRule = styles.match(/\.review-button\.review-inbox-primary-action\s*\{([^}]*)\}/)?.[1] ?? "";
  const primaryActionMinHeight = Number(primaryActionRule.match(/min-height:\s*(\d+)px/)?.[1] ?? 0);
  const inboxCardSource = componentSource.slice(componentSource.indexOf("function InboxCard"), componentSource.indexOf("export default function ReviewInbox"));

  const attention = reviewCase("attention", {priority: "high", updatedAt: "2026-09-01T11:00:00.000Z"});
  const process = reviewCase("process", {status: "resuming", source: "ONE", module: "one.events", subject: {type: "event"}, context: {humanActionRequired: false, unifiedReviewIntake: {sourceLabel: "ONE", entityLabel: "Evento", problemTitle: "Evento en preparación"}}, updatedAt: "2026-09-01T10:00:00.000Z"});
  const resolved = reviewCase("resolved", {status: "resolved", source: "BKFC", module: "bkfc.news", subject: {type: "organization"}, context: {humanActionRequired: false, unifiedReviewIntake: {sourceLabel: "BKFC", entityLabel: "Organización", problemTitle: "Organización confirmada"}}, resolvedAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z"});
  const base = [resolved, process, attention];
  const inbox = selectReviewInbox(base);

  check("1 Inbox derivada de ReviewCase", inbox.total === 3 && [...inbox.groups.needs_attention, ...inbox.groups.in_process, ...inbox.groups.resolved].every((item) => base.some((entry) => entry.id === item.caseId)));
  check("2 no InboxStore", reviewInboxSecurity.createsStores === false && !/InboxStore|InboxPersistence|InboxRepository/.test(modelSource + componentSource));
  check("3 needs attention", inbox.groups.needs_attention.length === 1 && inbox.groups.needs_attention[0]?.caseId === attention.id);
  check("4 in process", inbox.groups.in_process.length === 1 && inbox.groups.in_process[0]?.caseId === process.id);
  check("5 resolved", inbox.groups.resolved.length === 1 && inbox.groups.resolved[0]?.caseId === resolved.id);
  check("6 resolved excluido de atención", !inbox.groups.needs_attention.some((item) => item.caseId === resolved.id));
  const historical = reviewCase("historical", {context: {historical: true}});
  check("7 historical excluido", selectReviewInbox([historical]).total === 0);
  const diagnostic = reviewCase("diagnostic", {context: {readonlyDiagnostic: true}});
  check("8 readonly diagnostic excluido", selectReviewInbox([diagnostic]).total === 0);
  const activeNoHuman = reviewCase("active-no-human", {status: "resuming", context: {humanActionRequired: false}});
  const activeNoHumanInbox = selectReviewInbox([activeNoHuman]);
  check("9 activo sin acción humana fuera de atención", activeNoHumanInbox.counts.needs_attention === 0 && activeNoHumanInbox.groups.in_process[0]?.caseId === activeNoHuman.id);

  const attentionItem = inbox.groups.needs_attention[0]!;
  check("10 source label", attentionItem.sourceLabel === "UFC");
  check("11 entity label", attentionItem.entityLabel === "Noticia");
  check("12 priority label", attentionItem.priorityLabel === "Alta");
  check("13 problem title", attentionItem.problemTitle === "Luchador no identificado");
  check("14 recommendation summary", attentionItem.recommendationSummary.includes("Alex Norte"));
  check("15 human status", attentionItem.humanStatus === "Necesita tu atención" && inbox.groups.in_process[0]?.humanStatus === "En proceso" && inbox.groups.resolved[0]?.humanStatus === "Resuelto");
  check("16 primary action", attentionItem.primaryAction.label === "Revisar" && inbox.groups.in_process[0]?.primaryAction.label === "Continuar revisión" && inbox.groups.resolved[0]?.primaryAction.label === "Ver resultado");
  check("17 una acción principal", Object.keys(attentionItem).filter((key) => key.toLowerCase().includes("action")).length === 1 && (componentSource.match(/review-inbox-primary-action/g) ?? []).length === 1);
  check("18 deep link", attentionItem.primaryAction.href === "/revision?case=attention");
  check("19 missing deep link intacto", centerSource.includes("El caso indicado no existe o ya no está disponible") && centerSource.includes('setActiveSection("dashboard")'));
  check("20 counts", inbox.counts.needs_attention === 1 && inbox.counts.in_process === 1 && inbox.counts.resolved === 1);
  check("21 counts misma proyección", inbox.counts.needs_attention === inbox.groups.needs_attention.length && inbox.counts.in_process === inbox.groups.in_process.length && inbox.counts.resolved === inbox.groups.resolved.length && inbox.total === Object.values(inbox.counts).reduce((sum, value) => sum + value, 0));

  const attentionOlder = reviewCase("attention-older", {priority: "high", updatedAt: "2026-09-01T08:00:00.000Z"});
  const attentionCritical = reviewCase("attention-critical", {priority: "critical", updatedAt: "2026-08-31T08:00:00.000Z"});
  const ordered = selectReviewInbox([attentionOlder, attentionCritical, attention]);
  check("22 orden determinista", ordered.groups.needs_attention.map((item) => item.caseId).join("|") === "attention-critical|attention|attention-older" && JSON.stringify(ordered) === JSON.stringify(selectReviewInbox([attention, attentionCritical, attentionOlder])));
  check("23 source filter", selectReviewInbox(base, {source: "ONE"}).total === 1 && selectReviewInbox(base, {source: "ONE"}).groups.in_process[0]?.caseId === process.id);
  check("24 type filter", selectReviewInbox(base, {entity: "Organización"}).total === 1 && selectReviewInbox(base, {entity: "Organización"}).groups.resolved[0]?.caseId === resolved.id);
  check("25 priority filter", selectReviewInbox(base, {priority: "high"}).total === 1 && selectReviewInbox(base, {priority: "high"}).groups.needs_attention[0]?.caseId === attention.id);
  check("26 sin filtros técnicos", Object.keys(inbox.filters).every((key) => ["source", "entity", "priority"].includes(key)) && !/checkpoint|fingerprint|staleness|unsupported/i.test(componentSource));
  check("27 empty atención", componentSource.includes("No hay nada que requiera tu atención."));
  check("28 empty proceso", componentSource.includes("No hay revisiones en proceso."));
  check("29 empty resueltos", componentSource.includes("Todavía no hay casos resueltos."));
  check("30 RX3 compatible", centerSource.includes("<ReviewCaseDetails") && readFileSync("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx", "utf8").includes("¿Qué ocurrirá si apruebo?"));
  check("31 Unified Intake compatible", attentionItem.sourceLabel === "UFC" && attentionItem.entityLabel === "Noticia" && attentionItem.problemTitle === "Luchador no identificado");
  const external = reviewCase("external", {module: "external.news", source: "Fuente externa", subject: {type: "external_news"}, context: {unifiedReviewIntake: {sourceLabel: "Externas", entityLabel: "Noticia", problemTitle: "Noticia por revisar"}}});
  check("32 external_news compatible", buildReviewInboxItem(external, "needs_attention").sourceLabel === "Externas" && buildReviewInboxItem(external, "needs_attention").entityLabel === "Noticia");
  const fixtures = buildRx2ReviewInboxFixtures();
  const fixtureInbox = selectReviewInbox(fixtures);
  check("33 UFC ONE BKFC compatibles", fixtureInbox.facets.sources.includes("UFC") && fixtureInbox.facets.sources.includes("ONE") && fixtureInbox.facets.sources.includes("BKFC"));
  check("34 fixture dev-only", RX2_REVIEW_INBOX_FIXTURE_QUERY === "inbox" && rx2ReviewInboxFixtureSecurity.devOnly && appSource.includes("import.meta.env.DEV &&") && appSource.includes("RX2_REVIEW_INBOX_FIXTURE_QUERY"));
  check("35 cero writes", reviewInboxSecurity.writes === false && rx2ReviewInboxFixtureSecurity.writes === false && !/localStorage|fetch\s*\(|\.save\s*\(/.test(modelSource + componentSource + fixtureSource));
  check("36 no store", reviewInboxSecurity.createsStores === false && rx2ReviewInboxFixtureSecurity.createsStores === false && !/from ["'][^"']*reviewStore/.test(modelSource + componentSource + fixtureSource));
  check("37 no polling", reviewInboxSecurity.createsPolling === false && rx2ReviewInboxFixtureSecurity.createsPolling === false && !/setInterval|setTimeout/.test(modelSource + componentSource + fixtureSource));
  check("38 no AU7", reviewInboxSecurity.invokesAu7 === false && rx2ReviewInboxFixtureSecurity.invokesAu7 === false && !/from ["'][^"']*(transactions|au7)/i.test(modelSource + componentSource + fixtureSource));
  check("39 no AU8", reviewInboxSecurity.invokesAu8 === false && rx2ReviewInboxFixtureSecurity.invokesAu8 === false && !/from ["'][^"']*(editorialDecision|au8)/i.test(modelSource + componentSource + fixtureSource));
  check("40 no reanudación", reviewInboxSecurity.createsResumeEngines === false && !/from ["'][^"']*resume/.test(modelSource + componentSource + fixtureSource));
  check("41 accesibilidad", componentSource.includes('role="tablist"') && componentSource.includes('role="tab"') && componentSource.includes('role="tabpanel"') && componentSource.includes("aria-selected") && componentSource.includes("aria-controls") && componentSource.includes("<label>Fuente") && styles.includes("min-height: 44px"));
  check("42 mobile-friendly", styles.includes("@media (max-width: 560px)") && styles.includes(".review-inbox-tabs { grid-template-columns: 1fr; }") && styles.includes(".review-inbox-grid { grid-template-columns: 1fr; }") && styles.includes("overflow-wrap: anywhere"));
  check("43 output determinista", JSON.stringify(selectReviewInbox([...base].reverse())) === JSON.stringify(inbox));
  const serialized = JSON.stringify(inbox);
  check("44 modelo JSON-safe", JSON.stringify(JSON.parse(serialized)) === serialized && inbox.version === "1.0.0");
  const secretCase = reviewCase("safe", {context: {token: "must-not-leak", payloadSnapshot: {secret: "must-not-leak"}}});
  check("45 sin secrets", !JSON.stringify(selectReviewInbox([secretCase])).includes("must-not-leak") && !serialized.includes("checkpoint") && !serialized.includes("fingerprint"));
  check("46 target táctil mínimo", primaryActionMinHeight >= 44 && primaryActionRule.includes("display: inline-flex"));
  check("47 especificidad frente a review-button", styles.indexOf(".review-button.review-inbox-primary-action") < styles.indexOf(".review-button,\n.review-disclosure", styles.indexOf(".review-button.review-inbox-primary-action")) && primaryActionRule.includes("min-height: 44px"));
  check("48 tres acciones mismo contrato", ["Revisar", "Continuar revisión", "Ver resultado"].every((label) => [attentionItem, inbox.groups.in_process[0], inbox.groups.resolved[0]].some((item) => item?.primaryAction.label === label)) && (inboxCardSource.match(/review-inbox-primary-action/g) ?? []).length === 1);
  check("49 mobile conserva target", styles.includes("@media (max-width: 560px)") && styles.includes(".review-inbox-grid { grid-template-columns: 1fr; }") && !/@media[\s\S]*review-inbox-primary-action[^}]*min-height:\s*(?:[0-3]?\d|4[0-3])px/.test(styles));
  check("50 sin segunda acción", (inboxCardSource.match(/<a\s/g) ?? []).length === 1 && !inboxCardSource.includes("<button"));
  check("51 deep link y RX3 intactos", inboxCardSource.includes("href={fixtureHref(item, fixtureQuery)}") && attentionItem.primaryAction.href === "/revision?case=attention" && centerSource.includes("<ReviewCaseDetails"));
  check("52 Enter no intervenido", !inboxCardSource.includes("onKeyDown") && !inboxCardSource.includes("onKeyUp") && !inboxCardSource.includes("preventDefault"));

  assert.equal(checks.length, 52);
  console.log(`RX2 Review Inbox tests: OK (${checks.length}/52)`);
}

main();
