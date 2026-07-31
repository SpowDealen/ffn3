import {useEffect, useRef, useState, type ReactElement} from "react";
import {
  GLOBAL_RESOLUTION_INSPECTION_DEV_PRODUCERS,
  GlobalResolutionInspectionDevFixtureSession,
  applyGlobalResolutionInspectionDevFixtureAssessment,
  buildGlobalResolutionInspectionDevResult,
  type GlobalResolutionInspectionDevScenario,
  type GlobalResolutionInspectionDevProducer,
  type GlobalResolutionInspectionDevResult,
  GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIO_LABELS,
  GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS,
} from "../globalResolution/inspection/devFixture";
import {
  GLOBAL_RESOLUTION_ASSESSMENT_LABELS,
  GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS,
  summarizeGlobalResolutionInspectionObservation,
} from "../globalResolution";

type FixturePhase = "idle" | "confirming" | "inspecting" | "result" | "technical_error";

export default function GlobalResolutionInspectionDevFixture({onExit}: {onExit: () => void}): ReactElement {
  const [scenario, setScenario] = useState<GlobalResolutionInspectionDevScenario>("confirmed_succeeded");
  const [producer, setProducer] = useState<GlobalResolutionInspectionDevProducer>("external_news");
  const [phase, setPhase] = useState<FixturePhase>("idle");
  const [result, setResult] = useState<GlobalResolutionInspectionDevResult>();
  const [fixtureCase, setFixtureCase] = useState(() => buildGlobalResolutionInspectionDevResult("confirmed_succeeded", "external_news").reviewCase);
  const [actionMessage, setActionMessage] = useState<string>();
  const session = useRef(new GlobalResolutionInspectionDevFixtureSession());
  const controller = useRef<AbortController>();
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const busy = phase === "inspecting";
  const assessment = result?.assessment;
  const blockingReasons = assessment?.blockingReasons ?? [];
  const localEvidence = assessment?.localEvidence ?? [];
  const remoteEvidence = assessment?.remoteEvidence ?? [];
  const allowedActions = assessment?.allowedActions ?? [];
  const observations = result?.evidence.observations.map(summarizeGlobalResolutionInspectionObservation) ?? [];
  const producerState = result?.producerState ?? buildGlobalResolutionInspectionDevResult(scenario, producer, session.current.inspectionGeneration).producerState;

  useEffect(() => {
    if (phase === "result") resultRef.current?.focus();
    if (phase === "technical_error") errorRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== "confirming" && phase !== "inspecting") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [phase]);

  useEffect(() => () => {
    controller.current?.abort();
    session.current.dispose();
  }, []);

  function reset(nextScenario: GlobalResolutionInspectionDevScenario, nextProducer = producer): void {
    controller.current?.abort();
    controller.current = undefined;
    session.current.selectScenario();
    setScenario(nextScenario);
    setPhase("idle");
    setResult(undefined);
    setFixtureCase(buildGlobalResolutionInspectionDevResult(nextScenario, nextProducer, session.current.inspectionGeneration).reviewCase);
    setActionMessage(undefined);
  }

  function selectProducer(nextProducer: GlobalResolutionInspectionDevProducer): void {
    session.current.selectProducer();
    setProducer(nextProducer);
    reset(scenario, nextProducer);
  }

  function cancel(): void {
    controller.current?.abort();
    controller.current = undefined;
    session.current.invalidate();
    setPhase("idle");
    setResult(undefined);
    setActionMessage("Comprobación cancelada. El fixture no modificó ningún dato.");
  }

  function inspect(): void {
    const activeController = new AbortController();
    controller.current = activeController;
    setPhase("inspecting");
    setResult(undefined);
    setActionMessage(undefined);
    void session.current.inspect(scenario, producer, {signal: activeController.signal}).then((next) => {
      if (activeController.signal.aborted) return;
      controller.current = undefined;
      if (!next) return;
      setFixtureCase(next.reviewCase);
      setResult(next);
      setPhase(scenario === "technical_error" || scenario === "technical_failure" ? "technical_error" : "result");
    });
  }

  function applyFixtureAction(): void {
    const action = assessment?.allowedActions?.find((candidate) => candidate === "repair_checkpoint" || candidate === "enable_retry");
    if (!assessment || !action) return;
    const prompt = action === "repair_checkpoint"
      ? "Se reparará sólo el checkpoint efímero del fixture. ¿Continuar?"
      : "Se habilitará sólo el nuevo intento del fixture, sin ejecutarlo. ¿Continuar?";
    if (!window.confirm(prompt)) return;
    setFixtureCase((current) => applyGlobalResolutionInspectionDevFixtureAssessment(current, assessment));
    setActionMessage(action === "repair_checkpoint"
      ? "Checkpoint del fixture reparado sin repetir el efecto."
      : "Nuevo intento habilitado en el fixture. No se ejecutó ninguna operación.");
  }

  return <section className="review-subsection global-resolution-controls global-resolution-dev-fixture" aria-labelledby="global-resolution-dev-fixture-title" aria-busy={busy}>
    <div className="review-row review-row-wrap">
      <div>
        <p className="review-kicker">DEV · FIXTURE AISLADO AU4</p>
        <h4 className="review-subtitle" id="global-resolution-dev-fixture-title">Resolución global · inspección visual</h4>
      </div>
      <button className="review-button review-button-secondary" type="button" disabled={busy} onClick={onExit}>Salir del fixture</button>
    </div>
    <p className="review-muted">Simulación local: no consulta Sanity, no ejecuta operaciones y no persiste cambios.</p>

    <label className="global-resolution-dev-fixture-selector">
      <span>Productor DEV</span>
      <select value={producer} disabled={busy} onChange={(event) => selectProducer(event.target.value as GlobalResolutionInspectionDevProducer)}>
        {GLOBAL_RESOLUTION_INSPECTION_DEV_PRODUCERS.map((value) => <option value={value} key={value}>{value}</option>)}
      </select>
    </label>

    <label className="global-resolution-dev-fixture-selector">
      <span>Escenario DEV</span>
      <select value={scenario} disabled={busy} onChange={(event) => reset(event.target.value as GlobalResolutionInspectionDevScenario)}>
        {GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIOS.map((value) => <option value={value} key={value}>{GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIO_LABELS[value]}</option>)}
      </select>
    </label>

    <dl className="global-resolution-summary" aria-label="Resumen del checkpoint universal del fixture">
      <div><dt>Productor</dt><dd>{producerState.displayName ?? producerState.status}</dd></div>
      <div><dt>Versión</dt><dd>{producerState.producerVersion ?? "—"}</dd></div>
      <div><dt>Familia</dt><dd>{producerState.family ?? "—"}</dd></div>
      <div><dt>Capability</dt><dd>{producerState.capability}</dd></div>
      <div><dt>Operation kind</dt><dd>{producerState.operationKind ?? "—"}</dd></div>
      <div><dt>Adapter</dt><dd>{producerState.adapter ?? "—"}</dd></div>
      <div><dt>Inspector</dt><dd>{producerState.inspectorBinding ?? "No disponible"}</dd></div>
      <div><dt>Support status</dt><dd>{producerState.compatibility}</dd></div>
      <div><dt>Manifest fingerprint</dt><dd>{producerState.manifestFingerprint ?? "—"}</dd></div>
      <div><dt>Inspection generation</dt><dd>{producerState.inspectionGeneration ?? 0}</dd></div>
      <div><dt>Estado local</dt><dd>{fixtureCase.globalResolution?.graph.nodes[0]?.state}</dd></div>
      <div><dt>Operación</dt><dd>{fixtureCase.globalResolution?.plan.operations[0]?.id}</dd></div>
      <div><dt>Checkpoint</dt><dd>{fixtureCase.globalResolution?.checkpointFingerprint}</dd></div>
    </dl>

    <article className="global-resolution-reconciliation">
      <header>
        <div><strong>Reconciliación necesaria</strong><small>Crear o reutilizar luchador · fixture efímero</small></div>
        <span className="review-badge review-badge-danger">DEV</span>
      </header>
      <p>La evidencia local indica un resultado incierto. Selecciona un escenario y comprueba la respuesta simulada.</p>
      <div className="global-resolution-inspection-actions">
        <button className="review-button" type="button" disabled={busy} onClick={() => setPhase("confirming")}>Comprobar en Sanity</button>
      </div>

      {phase === "confirming" ? <div className="global-resolution-inspection-confirmation" role="dialog" aria-labelledby="dev-sanity-confirmation">
        <strong id="dev-sanity-confirmation">Confirmar consulta simulada de sólo lectura</strong>
        <p>Se reproducirá localmente el escenario «{GLOBAL_RESOLUTION_INSPECTION_DEV_SCENARIO_LABELS[scenario]}». No se enviará ninguna petición.</p>
        <div className="global-resolution-inspection-actions">
          <button className="review-button review-button-secondary" type="button" onClick={cancel}>Cancelar</button>
          <button className="review-button" type="button" autoFocus onClick={inspect}>Comprobar</button>
        </div>
      </div> : null}

      {phase === "inspecting" ? <div className="global-resolution-inspection-progress" role="status" aria-live="polite">
        <p>Comprobando Sanity… (simulación DEV)</p>
        <button className="review-button review-button-secondary" type="button" onClick={cancel}>Cancelar comprobación</button>
      </div> : null}

      {phase === "technical_error" ? <div ref={errorRef} tabIndex={-1} className="global-resolution-inspection-error" role="alert">
        <strong>Fallo de inspección</strong>
        <p>El motor registró un fallo técnico seguro. Puedes intentarlo de nuevo.</p>
        <section className="global-resolution-evidence-group" aria-label="Evidencia local">
          <h6>Evidencia local</h6>
          <p>El checkpoint aislado mantiene la operación en reconciliación.</p>
        </section>
        <section className="global-resolution-evidence-group" aria-label="Evidencia de Sanity simulada">
          <h6>Evidencia de Sanity simulada</h6>
          <p>No disponible. La evaluación técnica se conserva sin exponer el error original.</p>
        </section>
        <button className="review-button review-button-secondary" type="button" onClick={() => setPhase("confirming")}>Volver a comprobar</button>
      </div> : null}

      {phase === "result" && result ? <div ref={resultRef} tabIndex={-1} className="global-resolution-inspection-result" role="status" aria-live="polite">
        <strong>Evidencia de Sanity simulada</strong>
        <ul className="global-resolution-inspection-observations">
          {observations.map((observation, index) => <li key={`${observation.kind}:${index}`}>
            <span>{observation.label}</span>
            {observation.detail ? <small title={observation.fullValue}>{observation.detail}</small> : null}
          </li>)}
        </ul>
      </div> : null}

      {assessment ? <div className="global-resolution-evidence" role={blockingReasons.length ? "alert" : "status"}>
        <h5>Resultado de la evaluación</h5>
        <p><strong>{GLOBAL_RESOLUTION_ASSESSMENT_LABELS[assessment.status]}</strong></p>
        <p>{assessment.summary}</p>
        <section className="global-resolution-evidence-group" aria-label="Evidencia local">
          <h6>Evidencia local</h6>
          <ul className="global-resolution-evidence-list">{localEvidence.map((item) => <li key={item.id}><strong>{item.category}</strong><span>{item.provenance} · {item.confidence}</span><span>{item.summary}</span></li>)}</ul>
        </section>
        <section className="global-resolution-evidence-group" aria-label="Evidencia de Sanity simulada">
          <h6>Evidencia de Sanity simulada</h6>
          <ul className="global-resolution-evidence-list">{remoteEvidence.map((item) => <li key={item.id}><strong>{item.category}</strong><span>{item.provenance} · {item.confidence}</span><span>{item.summary}</span></li>)}</ul>
        </section>
        {blockingReasons.length ? <ul className="global-resolution-reasons">{blockingReasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul> : null}
        {allowedActions.filter((action) => action === "repair_checkpoint" || action === "enable_retry").map((action) => <button className="review-button review-button-danger" type="button" onClick={applyFixtureAction} key={action}>{GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS[action]}</button>)}
      </div> : null}
    </article>

    {actionMessage ? <p className="review-feedback" role="status">{actionMessage}</p> : null}
  </section>;
}
