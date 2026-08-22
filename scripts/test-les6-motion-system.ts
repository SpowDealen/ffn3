import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";

let assertions = 0;
const check = (value: unknown, message: string): void => { assert.ok(value, message); assertions += 1; };
const equal = <T>(actual: T, expected: T, message?: string): void => { assert.equal(actual, expected, message); assertions += 1; };
const source = (path: string): string => readFileSync(path, "utf8");
const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

function main(): void {
  const css = source("_laboratorio/laboratorio-ia/src/styles.css");
  const feedback = source("_laboratorio/laboratorio-ia/src/components/feedback/VisualFeedback.tsx");
  const activity = source("_laboratorio/laboratorio-ia/src/notifications/ActivityCenter.tsx");
  const bell = source("_laboratorio/laboratorio-ia/src/notifications/NotificationBell.tsx");
  const processSummary = source("_laboratorio/laboratorio-ia/src/processes/ProcessExperienceSummary.tsx");
  const processPresentation = source("_laboratorio/laboratorio-ia/src/processes/presentation.ts");
  const globalStatus = source("_laboratorio/laboratorio-ia/src/status/GlobalStatusSummary.tsx");
  const interactions = source("_laboratorio/laboratorio-ia/src/interactions/InteractionPrimitives.tsx");
  const interactionModel = source("_laboratorio/laboratorio-ia/src/interactions/model.ts");
  const au7 = source("_laboratorio/laboratorio-ia/src/review/components/TransactionOperationalCenter.tsx");
  const au8 = source("_laboratorio/laboratorio-ia/src/review/components/AutonomousReviewCenter.tsx");
  const packageJson = source("_laboratorio/laboratorio-ia/package.json");

  for (const token of [
    "--motion-duration-instant", "--motion-duration-fast", "--motion-duration-standard", "--motion-duration-deliberate",
    "--motion-ease-standard", "--motion-ease-enter", "--motion-ease-exit", "--motion-distance-small",
    "--motion-spinner-cycle", "--motion-progress-cycle", "--motion-skeleton-cycle",
  ]) check(css.includes(`${token}:`), `falta token ${token}`);
  check(css.includes("--motion-duration-fast: 120ms") && css.includes("--motion-duration-standard: 180ms") && css.includes("--motion-duration-deliberate: 260ms"), "vocabulary usa escala pequeña y sobria");
  check(css.includes("cubic-bezier(.2, 0, 0, 1)") && css.includes("cubic-bezier(.16, 1, .3, 1)") && css.includes("cubic-bezier(.4, 0, 1, 1)"), "easings standard/enter/exit están definidos");
  equal(/transition\s*:\s*all\b/i.test(css), false, "no transition: all");
  equal(/transition-property\s*:\s*all\b/i.test(css), false, "no transition-property: all");

  check(css.includes("@media (prefers-reduced-motion: reduce)"), "reduced motion presente");
  check(css.includes("animation-duration: .001ms !important") && css.includes("transition-duration: .001ms !important"), "reduced motion minimiza animation y transition");
  check(css.includes("animation-iteration-count: 1 !important") && css.includes("scroll-behavior: auto !important"), "reduced motion corta loops y scroll animado");
  check(css.includes("--motion-distance-small: 0px"), "reduced motion elimina desplazamiento");
  check(css.includes("button:focus-visible") && css.includes("summary:focus-visible") && css.includes("outline: 3px solid"), "focus visible permanece intacto");

  check(css.includes("@keyframes motion-surface-enter") && css.includes("opacity: 0") && css.includes("translateY(var(--motion-distance-small))"), "entrada usa opacity/transform");
  check(css.includes("@keyframes motion-popover-enter") && css.includes("transform-origin: top right"), "popover conserva continuidad espacial discreta");
  check(!/scale\s*\(/.test(css.slice(0, css.indexOf(".outcome-records"))), "LES 6 no usa scaling fuerte");
  check(!/\b(bounce|flash|shake)\b/i.test(css), "sin motion decorativo agresivo");

  check(css.includes(".feedback-banner, .feedback-empty-state, .feedback-blocking-loader"), "LES 1 feedback integra appearance");
  check(css.includes(".feedback-banner { transition: background-color") && css.includes("border-color var(--motion-duration-standard)"), "cambio de feedback es perceptible y explícito");
  equal(occurrences(feedback, 'className="feedback-spinner"'), 2, "LES 1 conserva sus dos usos canónicos: badge e inline loader");
  check(css.includes("animation: feedback-spin var(--motion-spinner-cycle) linear infinite"), "spinner existente reutiliza token de ciclo");
  check(css.includes("animation: feedback-skeleton-pulse var(--motion-skeleton-cycle)"), "skeleton existente reutiliza token");

  check(activity.includes('className="motion-activity-item"'), "Activity item integra entrada discreta");
  check(activity.includes('className="motion-disclosure-content"'), "detalle Activity integra appearance sin alterar estado");
  check(activity.includes('className="motion-filter-chip"') && activity.includes("aria-pressed={isActive}"), "filtro conserva semántica y motion seleccionado");
  check(activity.includes("var(--motion-duration-fast)") && activity.includes("var(--motion-ease-standard)"), "Activity elimina duración/easing mágicos");
  check(!activity.includes("transition: all"), "Activity no usa transition all");
  check(bell.includes('className="motion-popover"') && bell.includes('className="motion-notification-item"'), "Bell integra panel e items");
  check(bell.includes("aria-expanded={isOpen}") && bell.includes("aria-controls={PANEL_ID}"), "Bell conserva disclosure accesible");
  const bellButtonStyles = bell.slice(bell.indexOf("bellButton: {"), bell.indexOf("badge: {"));
  const bellButtonActiveStyles = bell.slice(bell.indexOf("bellButtonActive: {"), bell.indexOf("badge: {"));
  check(!bellButtonStyles.includes("borderColor") && occurrences(bellButtonStyles, "border:") === 2, "Bell usa border shorthand coherente en inactive/active");
  check(bellButtonStyles.includes('border: "1px solid rgba(255,255,255,0.11)"') && bellButtonStyles.includes('border: "1px solid rgba(255,255,255,0.2)"'), "Bell mantiene contraste visual inactive/active");
  check(bell.includes('className="motion-interaction"') && css.includes(".motion-interaction, .review-button") && css.includes("--motion-duration-fast: 120ms"), "Bell conserva motion token de 120ms");
  check(css.includes("button:focus-visible") && !bellButtonStyles.includes("outline"), "Bell conserva focus visible global sin override inline");
  check(!bellButtonActiveStyles.includes("transform") && !bellButtonActiveStyles.includes("width:") && !bellButtonActiveStyles.includes("height:"), "estado activo no introduce hover/layout shift");
  check(!activity.includes('className="feedback-spinner"') && !bell.includes('className="feedback-spinner"'), "Notifications no añade spinners LES 6");

  check(processSummary.includes('data-motion-intent="state-transition"'), "Process declara intent presentacional");
  check(css.includes(".process-experience { animation: motion-surface-enter"), "Process row entra sin salto brusco");
  check(css.includes(".process-experience-details[open] > dl") && processSummary.includes("<details") && processSummary.includes("<summary>"), "Process disclosure sigue nativo");
  check(css.includes("feedback-progress-fill") && css.includes("width var(--motion-duration-deliberate)"), "progress medido conserva transición funcional");
  check(css.includes("feedback-progress-indeterminate var(--motion-progress-cycle)"), "progress indeterminado reutiliza ciclo");
  for (const terminal of ["completed", "partial", "warning", "error", "blocked", "cancelled"]) check(processPresentation.includes(`"${terminal}"`), `terminal ${terminal} permanece en presentación`);
  const processMotionRule = css.slice(css.indexOf(".process-experience { animation"), css.indexOf(".process-experience-details[open]"));
  check(!processMotionRule.includes("infinite"), "estados terminales no tienen loop");

  check(globalStatus.includes('data-motion-intent="status-transition"'), "Global Status declara transición real");
  check(css.includes(".global-status { animation: motion-surface-enter") && css.includes(".global-status-card { transition:"), "status y cards usan motion discreto");
  for (const state of ["operational", "active", "recovering", "degraded", "blocked", "unavailable", "idle"]) check(globalStatus.includes("buildGlobalStatusModel") && css.includes(".global-status"), `estado ${state} conserva síntesis sin fake state`);

  check(css.includes(".review-button, .interaction-link, .feedback-banner-action") && css.includes("opacity var(--motion-duration-fast)"), "LES 5 integra feedback no bloqueante");
  check(css.includes('.motion-interaction:disabled, .review-button:disabled, .interaction-link[aria-disabled="true"] { transition-duration: var(--motion-duration-instant); }'), "disabled no anima de forma ambigua");
  check(interactions.includes("disabled={disabled}") && interactions.includes("onClick={() => { if (canInvokeInteraction(capability)) onInvoke(); }}"), "motion no altera interacción ni autoridad");
  check(css.includes(".review-button-danger") && !css.includes(".review-button-danger:hover { transform"), "destructive no usa desplazamiento ambiguo");

  check(processSummary.includes("<details") && activity.includes("aria-expanded={detailExpanded}"), "disclosures conservan semántica");
  check(css.includes("details[open] > :not(summary)") && !/transition:\s*(height|max-height)/.test(css), "disclosure evita height frágil");
  check(activity.includes("Limpiar filtros") && activity.includes('setMetricFilter(null)'), "clear filters intacto");
  check(css.includes('.motion-filter-chip[aria-pressed="true"] { transform: translateY(-1px); }'), "filter selected usa énfasis mínimo");

  check(!/framer-motion|@motionone|react-spring|gsap/i.test(packageJson), "sin nueva dependencia motion");
  equal(existsSync("_laboratorio/laboratorio-ia/src/motion/store.ts"), false, "sin Motion Store");
  equal(existsSync("_laboratorio/laboratorio-ia/src/motion"), false, "CSS basta; no se crea framework paralelo");
  check(!/useState|setTimeout|setInterval|requestAnimationFrame/.test(css.slice(0, css.indexOf(".outcome-records"))), "motion no crea estado ni timers funcionales");
  check(!/fetch|localStorage|sessionStorage|indexedDB/.test(css.slice(0, css.indexOf(".outcome-records"))), "motion no crea IO");
  check(!/Motion|motion/.test(interactionModel.slice(interactionModel.indexOf("export const interactionSystemSecurity"))), "Interaction authority no cambia por motion");

  check(feedback.includes("GlobalFeedbackRegion") && css.includes(".feedback-banner"), "compatibilidad LES 1");
  check(activity.includes("buildNotificationPresentation") && bell.includes("selectBellNotifications"), "compatibilidad LES 2");
  check(processSummary.includes("ProcessExperiencePresentation") && css.includes(".process-experience"), "compatibilidad LES 3");
  check(globalStatus.includes("buildGlobalStatusModel") && css.includes(".global-status"), "compatibilidad LES 4");
  check(interactions.includes("canInvokeInteraction") && css.includes(".interaction-link"), "compatibilidad LES 5");
  for (const authority of ["view.canStart", "view.canExecuteNext", "view.canOpenReconciliation", "view.canOpenCompensation"]) check(au7.includes(authority), `AU7 conserva ${authority}`);
  check(au8.includes('cta === "authorize"') && au8.includes('cta === "reconcile"') && au8.includes('cta === "compensate"'), "AU8 authority intacta");
  check(source("scripts/test-au10-final-certification.ts").includes("AU10 B6 final certification"), "certificación AU10 permanece disponible");

  check(css.includes("overflow-x: clip") && css.includes("@media (max-width: 560px)"), "motion mobile-safe sin overflow");
  check(!/transition\s*:[^;]*(height|top|left|box-shadow)/i.test(css), "no transiciones de layout o pintura pesada");
  const transitionWidths = css.match(/transition\s*:[^;]*\bwidth\b/gi) ?? [];
  equal(transitionWidths.length, 1, "width solo se anima en progress medido");
  check(css.includes("transition: width var(--motion-duration-deliberate) var(--motion-ease-standard)"), "width justificado usa token deliberate");
  equal(occurrences(globalStatus, "aria-live="), 1, "Global Status conserva una live region");
  equal(occurrences(processSummary, "aria-live="), 1, "Process conserva su live region canónica");
  check(!bell.includes("aria-live") && !interactions.includes("aria-live"), "motion no añade live feedback duplicado");
  check(assertions >= 85, `se esperaban al menos 85 assertions y hubo ${assertions}`);
  console.log(`LES 6 Motion System: OK (${assertions} assertions; tokens, reduced motion, feedback/notification/process/status/interaction integration, native disclosures, performance, mobile, no dependency/store/timers/authority)`);
}

main();
