import {useEffect, useMemo, useState, type ReactElement} from "react";
import {ProcessingBadge, type FeedbackState} from "../components/feedback/VisualFeedback";
import {getNotifications, subscribeToNotifications} from "../notifications/store";
import type {LabNotification} from "../notifications/types";
import {buildLabProcessPresentation} from "../processes/presentation";
import {getProcesses, subscribeToProcess} from "../processes/store";
import type {LabProcess} from "../processes/types";
import {useReviewCases} from "../review/hooks/useReviewCases";
import {adaptNavigationInteraction, adaptRefreshInteraction} from "../interactions/adapters";
import {InteractionButton, InteractionLink} from "../interactions/InteractionPrimitives";
import {
  adaptNotificationsStatus,
  adaptProcessesStatus,
  adaptReferenceEntitiesStatus,
  adaptReviewStatus,
  adaptRuntimeStatus,
  adaptTelegramStatus,
} from "./adapters";
import {INITIAL_GLOBAL_LIVE_CHECKS, readGlobalLiveChecks, type GlobalLiveChecks} from "./liveChecks";
import {buildGlobalStatusModel, type GlobalStatusState} from "./model";

const FEEDBACK_STATE: Readonly<Record<GlobalStatusState, FeedbackState>> = Object.freeze({
  unavailable: "error",
  blocked: "blocked",
  degraded: "warning",
  recovering: "loading",
  active: "processing",
  attention: "warning",
  operational: "success",
  idle: "idle",
});

export default function GlobalStatusSummary({onNavigate}: {onNavigate: (path: string) => void}): ReactElement {
  const [checks, setChecks] = useState<GlobalLiveChecks>(INITIAL_GLOBAL_LIVE_CHECKS);
  const [checkVersion, setCheckVersion] = useState(0);
  const [notifications, setNotifications] = useState<LabNotification[]>(() => getNotifications());
  const [processes, setProcesses] = useState<readonly LabProcess[]>(() => getProcesses());
  const reviewCases = useReviewCases();

  useEffect(() => {
    const updateNotifications = (): void => setNotifications(getNotifications());
    const updateProcesses = (): void => setProcesses(getProcesses());
    updateNotifications(); updateProcesses();
    const unsubscribeNotifications = subscribeToNotifications(updateNotifications);
    const unsubscribeProcesses = subscribeToProcess(updateProcesses);
    return () => { unsubscribeNotifications(); unsubscribeProcesses(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    void readGlobalLiveChecks().then((nextChecks) => { if (mounted) setChecks(nextChecks); });
    return () => { mounted = false; };
  }, [checkVersion]);

  const model = useMemo(() => buildGlobalStatusModel([
    adaptRuntimeStatus(checks.runtime),
    adaptReferenceEntitiesStatus(checks.references),
    adaptTelegramStatus(checks.telegram),
    adaptNotificationsStatus(notifications),
    adaptProcessesStatus(processes.map((process) => buildLabProcessPresentation(process))),
    adaptReviewStatus(reviewCases),
  ]), [checks, notifications, processes, reviewCases]);
  const urgent = model.state === "unavailable" || model.state === "blocked";
  const refreshing = checks.runtime.state === "checking";
  const refreshCapability = adaptRefreshInteraction({id: "global-status-refresh", label: "Actualizar estado", busyLabel: "Actualizando estado…", busy: refreshing, source: "LES 4 · Global Status"});

  return (
    <section className={`global-status global-status-${model.state}`} data-motion-intent="status-transition" aria-labelledby="global-status-title">
      <header className="global-status-heading">
        <div className="global-status-announcement" role={urgent ? "alert" : "status"} aria-live={urgent ? "assertive" : "polite"} aria-atomic="true">
          <p className="review-kicker">LES 4 · ESTADO GLOBAL</p>
          <h2 id="global-status-title">Estado operativo del Laboratorio</h2>
          <p><span className="sr-only">{model.label}. </span>{model.summary}</p>
        </div>
        <div className="global-status-actions">
          <ProcessingBadge state={FEEDBACK_STATE[model.state]} label={model.label} announce={false} />
          <InteractionButton capability={refreshCapability} onInvoke={() => { setChecks(INITIAL_GLOBAL_LIVE_CHECKS); setCheckVersion((version) => version + 1); }} />
        </div>
      </header>

      <dl className="global-status-metrics" aria-label="Síntesis global actual">
        <div><dt>Procesos activos</dt><dd>{model.activeProcessCount}</dd></div>
        <div><dt>Incidencias vivas</dt><dd>{model.currentIncidentCount}</dd></div>
        <div><dt>Registros históricos</dt><dd>{model.historicalRecordCount}</dd></div>
      </dl>

      {model.reasons.length ? <ul className="global-status-reasons" aria-label="Razones del estado global">{model.reasons.slice(0, 4).map((reason) => <li key={`${reason.subsystemId}:${reason.reason}`}><strong>{reason.label}</strong><span>{reason.reason.replaceAll("_", " ")}</span></li>)}</ul> : null}

      <div className="global-status-grid" aria-label="Estado actual por subsistema">
        {model.subsystems.map((subsystem) => (
          <article className={`global-status-card global-status-card-${subsystem.state}`} data-global-status-subsystem={subsystem.id} key={subsystem.id}>
            <header><strong>{subsystem.label}</strong><span>{subsystem.state}</span></header>
            <p>{subsystem.summary}</p>
            {subsystem.detail ? <small>{subsystem.detail}</small> : null}
            {subsystem.route ? <InteractionLink capability={adaptNavigationInteraction({id: `global-status-${subsystem.id}-detail`, label: "Ver detalle", href: subsystem.route, source: subsystem.label})} onNavigate={onNavigate} /> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
