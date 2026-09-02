import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {LABORATORY_ROUTES} from "../_laboratorio/laboratorio-ia/src/app/laboratoryRoutes";
import {
  humanLanguageSecurity,
  presentHumanState,
} from "../_laboratorio/laboratorio-ia/src/presentation/humanLanguage";

const checks: string[] = [];
const source = (path: string): string => readFileSync(path, "utf8");
const check = (contract: string, condition: unknown): void => {
  assert.ok(condition, contract);
  checks.push(contract);
};

function main(): void {
  const shell = source("_laboratorio/laboratorio-ia/src/app/LaboratoryShell.tsx");
  const menu = source("_laboratorio/laboratorio-ia/src/components/LaboratoryMenu.tsx");
  const status = source("_laboratorio/laboratorio-ia/src/status/GlobalStatusSummary.tsx");
  const statusAdapters = source("_laboratorio/laboratorio-ia/src/status/adapters.ts");
  const operator = source("_laboratorio/laboratorio-ia/src/operator/OperatorSummary.tsx");
  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const editorial = source("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx");
  const reviewCenter = source("_laboratorio/laboratorio-ia/src/review/components/ReviewCenter.tsx");
  const reviewInbox = source("_laboratorio/laboratorio-ia/src/review/components/ReviewInbox.tsx");
  const reviewInboxModel = source("_laboratorio/laboratorio-ia/src/review/inbox/model.ts");
  const styles = source("_laboratorio/laboratorio-ia/src/styles.css");
  const humanLanguage = source("_laboratorio/laboratorio-ia/src/presentation/humanLanguage.ts");
  const changedFiles = execFileSync("git", ["status", "--short"], {encoding: "utf8"});

  check("1 navegación principal clara", LABORATORY_ROUTES.length === 5 && LABORATORY_ROUTES.map((route) => route.navLabel).join("|") === "Inicio|Editorial|Revisión|Actividad|Telegram" && menu.includes("{route.navLabel}"));
  check("2 sin rutas AU", LABORATORY_ROUTES.every((route) => !/\bAU\d+\b/i.test(`${route.path} ${route.navLabel} ${route.title}`)));
  check("3 títulos únicos", new Set(LABORATORY_ROUTES.map((route) => route.title)).size === LABORATORY_ROUTES.length);
  check("4 descripciones por pantalla", LABORATORY_ROUTES.every((route) => route.description.trim().endsWith(".") && route.description.length > 20));
  check("5 Review Inbox prominente", reviewCenter.indexOf("<ReviewInbox") >= 0 && reviewCenter.indexOf("<ReviewInbox") < reviewCenter.indexOf('<details className="review-inbox-technical">') && ["Necesitan atención", "En proceso", "Resueltos"].every((label) => reviewInbox.includes(label)));
  check("6 advanced tools secondary", reviewCenter.includes('<details className="review-inbox-technical"><summary>Herramientas avanzadas</summary>') && reviewCenter.indexOf("<NucleusGlobalDashboard") > reviewCenter.indexOf('<summary>Herramientas avanzadas</summary>'));
  check("7 AU labels ocultas en main", !/\bAU(?:7|8|10)\b/i.test(reviewInbox + shell + menu));
  check("8 fingerprint oculto en main", !/fingerprint/i.test(reviewInbox + shell + menu + status + operator));
  check("9 checkpoint oculto en main", !/checkpoint/i.test(reviewInbox + shell + menu + status + operator));
  check("10 stale traducido", presentHumanState("stale") === "Información desactualizada");
  check("11 unsupported traducido", presentHumanState("unsupported") === "No se puede resolver automáticamente");
  check("12 blocked traducido", presentHumanState("blocked") === "Necesita una decisión");
  check("13 Activity usa lenguaje humano", activity.includes('"Qué ocurrió"') && activity.includes("Revisa avisos, resultados y procesos registrados por el laboratorio.") && !activity.includes(">Activity Center<"));
  check("14 Telegram usa lenguaje humano", activity.includes('"Estado del canal"') && activity.includes("Comprobación actual") && activity.includes("Sin entregas externas") && activity.includes("Actualizar estado"));
  check("15 Editorial usa lenguaje humano", editorial.includes("Campos del contenido") && editorial.includes("Información adicional") && editorial.includes("Resultado preparado") && editorial.includes("Contenido listo"));
  check("16 CTA humanos", ["Preparar resultado", "Actualizar estado", "Abrir trabajo editorial", "Ver actividad"].every((label) => editorial.includes(label) || activity.includes(label) || operator.includes(label)));
  check("17 sin acción primaria duplicada", (reviewInbox.match(/review-inbox-primary-action/g) ?? []).length === 1 && (reviewInbox.slice(reviewInbox.indexOf("function InboxCard"), reviewInbox.indexOf("export default function ReviewInbox")).match(/<a\s/g) ?? []).length === 1);
  check("18 empty states humanos", reviewInbox.includes("No hay nada que requiera tu atención.") && reviewInbox.includes("No hay revisiones en proceso.") && activity.includes("Todavía no hay actividad registrada"));
  check("19 mobile target mínimo 44", styles.includes(".laboratory-menu-trigger { display: grid; place-items: center; width: 44px; height: 44px") && styles.includes(".review-button.review-inbox-primary-action") && styles.includes("min-height: 44px") && activity.includes("minHeight: 44") && styles.includes("@media (max-width: 560px)"));
  check("20 sin filtros técnicos", ["<label>Fuente", "<label>Tipo", "<label>Prioridad"].every((label) => reviewInbox.includes(label)) && !/checkpoint|fingerprint|staleness|capability/i.test(reviewInbox));
  check("21 progressive disclosure", reviewCenter.includes("<details") && activity.includes("<details style={styles.telegramTechnicalDetails}>") && editorial.includes("<details style={styles.resultPanel}>") && activity.indexOf("Detalles técnicos del canal") < activity.indexOf("Token:"));
  check("22 RX2 intacto", reviewInbox.includes("selectReviewInbox") && reviewInbox.includes("fixtureHref") && reviewInboxModel.includes("reviewInboxSecurity") && reviewCenter.includes("resolveReviewCaseDeepLink"));
  check("23 RX3 intacto", reviewCenter.includes("<ReviewCaseDetails") && source("_laboratorio/laboratorio-ia/src/review/components/ReviewCaseDetails.tsx").includes("¿Qué ocurrirá si apruebo?"));
  check("24 sin store nuevo", humanLanguageSecurity.presentationOnly && !/\b(?:Store|createStore|localStorage|sessionStorage|indexedDB)\b/.test(humanLanguage));
  check("25 sin writes", !humanLanguageSecurity.writes && !humanLanguageSecurity.persists && !humanLanguageSecurity.executes && !/\b(?:fetch|POST|PUT|PATCH|DELETE|save|persist)\b/.test(humanLanguage));
  check("26 sin cambios AU", !/_laboratorio\/laboratorio-ia\/src\/review\/(?:globalResolution|transactions|autonomous|resume|store|materialization)/.test(changedFiles));
  check("27 presentación determinista", humanLanguageSecurity.deterministic && presentHumanState("operational") === presentHumanState("operational") && presentHumanState("unknown") === "Estado pendiente");
  check("28 estructura accesible", shell.includes("<main") && menu.includes("<nav") && reviewInbox.includes('role="tablist"') && reviewInbox.includes('role="tabpanel"') && reviewInbox.includes("aria-controls") && reviewCenter.includes("<details"));
  check("29 sin headings duplicados", (shell.match(/<h1\b/g) ?? []).length === 1 && !reviewCenter.includes(">Review Inbox<") && !reviewInbox.includes(">Review Inbox<") && reviewCenter.includes('aria-label="Bandeja de casos de revisión"'));
  check("30 sin destinos duplicados", new Set(LABORATORY_ROUTES.map((route) => route.path)).size === LABORATORY_ROUTES.length && LABORATORY_ROUTES.map((route) => route.path).join("|") === "/|/editorial|/revision|/actividad|/telegram");

  assert.equal(checks.length, 30);
  console.log(`RX4 Global UX Cleanup: OK (${checks.length}/30 contracts)`);
}

main();
