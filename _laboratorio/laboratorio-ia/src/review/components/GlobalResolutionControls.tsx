import {lazy, Suspense, useEffect, useRef, useState, type ReactElement} from "react";
import {
  buildGlobalResolutionControlsView,
  buildGlobalResolutionInspectionControlView,
  buildGlobalResolutionInspectionRequest,
  abbreviateGlobalResolutionValue,
  GlobalResolutionRequestGate,
  applyConfirmedReconciliation,
  assessReconciliation,
  collectReconciliationEvidence,
  GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS,
  reconciliationOperationIds,
  type ExternalNewsApplicationRecovery,
  type ExternalNewsInspectionRuntime,
  type GlobalResolutionInspectionUiState,
  type GlobalResolutionReconciliationAssessment,
  type PreparedExternalNewsResume,
} from "../globalResolution";
import {resolveGlobalResolutionProducerControls} from "../globalResolution/producerControls";
import {clearGlobalResolutionCheckpoint, getReviewCase} from "../store/reviewStore";
import type {ReviewCase} from "../types";

const GlobalResolutionInspectionDevFixture = import.meta.env.DEV
  ? lazy(() => import("./GlobalResolutionInspectionDevFixture"))
  : undefined;

type Feedback = {kind: "status" | "error" | "critical"; message: string};

const resultWarnings = (value: unknown): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const results = "execution" in value && value.execution && typeof value.execution === "object" && "results" in value.execution && Array.isArray(value.execution.results) ? value.execution.results : [];
  return results.flatMap((result) => result && typeof result === "object" && !Array.isArray(result) && result.output && typeof result.output === "object" && !Array.isArray(result.output) && Array.isArray(result.output.warnings) ? (result.output.warnings as unknown[]).filter((warning): warning is string => typeof warning === "string") : []);
};

export default function GlobalResolutionControls({reviewCase}: {reviewCase: ReviewCase}): ReactElement | null {
  const [devFixtureOpen, setDevFixtureOpen] = useState(false);
  const [recovery, setRecovery] = useState<ExternalNewsApplicationRecovery>();
  const [prepared, setPrepared] = useState<PreparedExternalNewsResume>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [reconciliations, setReconciliations] = useState<Record<string, GlobalResolutionReconciliationAssessment>>({});
  const [inspectionState, setInspectionState] = useState<GlobalResolutionInspectionUiState>({status: "idle"});
  const [busy, setBusy] = useState(false);
  const gate = useRef(new GlobalResolutionRequestGate());
  const inspectionRuntime = useRef<ExternalNewsInspectionRuntime | undefined>(undefined);
  const producerResolution = resolveGlobalResolutionProducerControls(reviewCase);
  const compatible = producerResolution.status === "resolved";
  const producerControls = producerResolution.status === "resolved" ? producerResolution.controls : undefined;
  if (producerControls && !inspectionRuntime.current) inspectionRuntime.current = producerControls.createInspectionRuntime();
  const inspectionAbort = useRef<AbortController>();
  const recoverySequence = useRef(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inspectionResultRef = useRef<HTMLDivElement>(null);
  const inspectionErrorRef = useRef<HTMLDivElement>(null);
  const view = buildGlobalResolutionControlsView(reviewCase, recovery);
  const locked = busy || inspectionState.status === "confirming" || inspectionState.status === "inspecting" || !recovery;

  useEffect(() => {
    if (!compatible) return;
    const sequence = ++recoverySequence.current;
    let cancelled = false;
    void producerControls!.recover(reviewCase.id).then((next) => {
      if (!cancelled && sequence === recoverySequence.current) setRecovery(next);
    }).catch((error) => {
      if (!cancelled && sequence === recoverySequence.current) setFeedback({kind: "error", message: error instanceof Error ? error.message : "No se pudo recuperar el estado universal."});
    });
    return () => { cancelled = true; };
  }, [compatible, producerControls, reviewCase.id, reviewCase.version, reviewCase.globalResolution?.checkpointFingerprint]);

  useEffect(() => {
    if (feedback?.kind === "error" || feedback?.kind === "critical") errorRef.current?.focus();
  }, [feedback]);

  useEffect(() => {
    if (inspectionState.status === "succeeded") inspectionResultRef.current?.focus();
    if (inspectionState.status === "failed") inspectionErrorRef.current?.focus();
  }, [inspectionState]);

  useEffect(() => {
    if (inspectionState.status !== "confirming") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInspectionState({status: "idle"});
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [inspectionState.status]);

  useEffect(() => {
    inspectionAbort.current?.abort();
    gate.current.cancel();
    setInspectionState({status: "idle"});
    setBusy(false);
  }, [reviewCase.id]);

  useEffect(() => () => {
    inspectionAbort.current?.abort();
    inspectionRuntime.current?.dispose();
    gate.current.cancel();
  }, []);

  if (import.meta.env.DEV && devFixtureOpen && GlobalResolutionInspectionDevFixture) return <Suspense fallback={<p className="review-muted">Cargando fixture DEV…</p>}><GlobalResolutionInspectionDevFixture onExit={() => setDevFixtureOpen(false)} /></Suspense>;
  if (!compatible) return import.meta.env.DEV ? <section className="review-subsection global-resolution-controls global-resolution-dev-launcher" aria-label="Fixture DEV de resolución global">
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">DEV · AU4</p><h4 className="review-subtitle">Fixture visual de inspección</h4></div>
      <button className="review-button review-button-secondary global-resolution-dev-fixture-trigger" type="button" onClick={() => setDevFixtureOpen(true)}>Abrir fixture visual AU4</button>
    </div>
    <p className="review-muted">Estado aislado disponible sin utilizar ni modificar este caso.</p>
  </section> : null;

  async function refresh(caseId: string): Promise<ExternalNewsApplicationRecovery> {
    const next = await producerControls!.recover(caseId);
    setRecovery(next);
    return next;
  }

  async function runAction(label: string, action: (current: ReviewCase) => Promise<Feedback | undefined>): Promise<void> {
    const token = gate.current.begin(reviewCase.id);
    if (!token) return;
    setBusy(true);
    setFeedback({kind: "status", message: `${label}…`});
    recoverySequence.current += 1;
    try {
      const current = getReviewCase(token.caseId);
      if (!current) throw new Error("El caso ya no está disponible.");
      const nextFeedback = await action(current);
      if (!gate.current.isCurrent(token, reviewCase.id)) return;
      await refresh(token.caseId);
      if (nextFeedback) setFeedback(nextFeedback);
    } catch (error) {
      if (gate.current.isCurrent(token, reviewCase.id)) setFeedback({kind: "error", message: error instanceof Error ? error.message : "La acción no pudo completarse."});
    } finally {
      const current = gate.current.isCurrent(token, reviewCase.id);
      gate.current.finish(token);
      if (current) setBusy(false);
    }
  }

  function initialize(regenerate = false): void {
    if (regenerate && !window.confirm("Se reemplazará únicamente el checkpoint universal. No se ejecutará ni simulará ninguna operación. ¿Continuar?")) return;
    void runAction(regenerate ? "Regenerando resolución" : "Inicializando resolución", async (current) => {
      const result = await producerControls!.initialize({caseId: current.id, planning: producerControls!.buildPlanningInput(current), regenerateStale: regenerate});
      if (result.status === "initialized") return {kind: "status", message: regenerate ? "Resolución regenerada. Revisa y simula el plan antes de ejecutar." : "Resolución inicializada. Ninguna operación fue ejecutada."};
      if (result.status === "already_initialized") return {kind: "status", message: "La resolución ya estaba inicializada y vigente."};
      if (result.status === "checkpoint_conflict") return {kind: "error", message: "El caso cambió durante la inicialización. Actualiza el estado antes de continuar."};
      return {kind: "error", message: "reasons" in result ? result.reasons.join(" ") : `Inicialización bloqueada: ${result.status}.`};
    });
  }

  function discardInvalid(): void {
    if (!window.confirm("Se descartará únicamente el checkpoint inválido. El ReviewCase y sus resoluciones se conservarán. ¿Continuar?")) return;
    void runAction("Descartando checkpoint inválido", async (current) => {
      const fingerprint = current.globalResolution?.checkpointFingerprint;
      if (!fingerprint) return {kind: "status", message: "El checkpoint ya no existe."};
      clearGlobalResolutionCheckpoint(current.id, current.version, new Date(), fingerprint);
      setPrepared(undefined);
      return {kind: "status", message: "Checkpoint descartado. Inicializa de nuevo cuando hayas revisado el caso."};
    });
  }

  function simulate(): void {
    void runAction("Simulando plan", async (current) => {
      const result = await producerControls!.simulate({caseId: current.id, context: producerControls!.buildSimulationContext(current)});
      if (result.status === "simulated" || result.status === "already_simulated") return {kind: "status", message: "Simulación completada. No se aplicaron cambios reales."};
      return {kind: "error", message: "reasons" in result ? result.reasons.join(" ") : `Simulación bloqueada: ${result.status}.`};
    });
  }

  function execute(operationId: string, pureValidation = false): void {
    const operation = view.operations.find((item) => item.operationId === operationId);
    if (!operation) return;
    const prompt = operation.capability === "create:luchador"
      ? "Esta acción puede crear o reutilizar un luchador real. No ejecutará las operaciones dependientes. ¿Continuar?"
      : operation.capability === "replace_reference:noticia:luchador"
        ? "Se aplicará la referencia real al payload reconstruido, sin guardar todavía la noticia. ¿Continuar?"
        : "Se validará de forma pura la noticia reconstruida. No se guardará ningún documento. ¿Continuar?";
    if (!pureValidation && !window.confirm(prompt)) return;
    void runAction(pureValidation ? "Validando noticia" : operation.label, async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const result = await producerControls!.executeOperation({
        caseId: current.id,
        expectedCaseVersion: current.version,
        expectedCheckpointFingerprint: checkpoint.checkpointFingerprint,
        operationId,
        simulationContext: producerControls!.buildSimulationContext(current),
        idempotencyContext: `review-center:${current.id}:${operationId}`,
        authorized: !pureValidation,
      });
      if (result.status === "checkpoint_conflict") return {kind: "error", message: "El caso cambió durante la operación. Actualiza el estado antes de continuar."};
      if (result.status === "checkpoint_failed") return {kind: "critical", message: "La operación se realizó, pero no pudo registrarse el progreso. No repitas la operación. Es necesaria una recuperación."};
      if (["succeeded", "reused_existing"].includes(result.status)) {
        const warnings = resultWarnings(result);
        const outcome = result.status === "reused_existing" ? "Se reutilizó el luchador existente." : pureValidation ? "Validación superada. No se guardaron cambios." : "Operación completada.";
        return {kind: "status", message: warnings.length ? `${outcome} Aviso: ${warnings.join(" ")}` : outcome};
      }
      if (result.status === "reconciliation_required") return {kind: "critical", message: "El resultado no puede confirmarse. No repitas la operación; requiere reconciliación."};
      return {kind: "error", message: "reasons" in result ? result.reasons.join(" ") : `La operación terminó como ${result.status}.`};
    });
  }

  function prepareResume(): void {
    void runAction("Preparando reanudación", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const result = await producerControls!.prepareResume({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint});
      if (result.status === "ready_to_resume") {
        setPrepared(result.prepared);
        return {kind: "status", message: `Reanudación preparada y validada. Referencias aplicadas: ${result.prepared.appliedReferences.length}. Requiere confirmación final.`};
      }
      return {kind: "error", message: "reasons" in result ? result.reasons.join(" ") : result.prepared.blockers.map((item) => item.message).join(" ")};
    });
  }

  function resume(): void {
    if (!prepared) return;
    if (!window.confirm(`Esta acción guardará el borrador real, no publicado.\n\nTítulo: ${String(prepared.payload.titulo ?? reviewCase.title)}\nReferencias aplicadas: ${prepared.appliedReferences.length}\n\n¿Quieres guardar el borrador y reanudar?`)) return;
    void runAction("Guardando borrador y reanudando", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const operationId = checkpoint.resume?.operationId;
      if (!operationId) throw new Error("La operación de reanudación ya no está preparada.");
      const authorization = producerControls!.authorizeResume({prepared, checkpoint, operationId, confirmedAt: new Date().toISOString()});
      if (!authorization) return {kind: "error", message: "La confirmación quedó obsoleta. Prepara de nuevo la reanudación."};
      const result = await producerControls!.resume({caseId: current.id, prepared, authorization, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, idempotencyContext: `review-center:resume:${current.id}:${operationId}`});
      setPrepared(undefined);
      if (result.status === "resumed" || result.status === "already_resumed") {
        if (result.checkpoint.status !== "persisted") return {kind: "critical", message: "El borrador fue guardado, pero el checkpoint no se actualizó. Es necesaria una reconciliación antes de continuar."};
        return {kind: "status", message: result.status === "resumed" ? `Borrador guardado y proceso reanudado. ID: ${abbreviateGlobalResolutionValue(result.domainResult.draftId ?? result.domainResult.documentId)}` : "El proceso ya estaba reanudado y se validó como equivalente."};
      }
      if (result.status === "reconciliation_required") return {kind: "critical", message: "El resultado del guardado no puede confirmarse. No repitas la operación."};
      return {kind: "error", message: "reasons" in result ? result.reasons.join(" ") : result.domainResult.error?.message ?? "La reanudación falló."};
    });
  }

  function inspectReconciliation(operationId: string): void {
    setInspectionState({status: "idle"});
    void runAction("Comprobando resultado real", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const reconciliationCase = await collectReconciliationEvidence({reviewCase: current, operationId});
      const assessment = assessReconciliation(reconciliationCase, checkpoint);
      setReconciliations((previous) => ({...previous, [operationId]: assessment}));
      const actionable = assessment.allowedActions?.some((action) => action === "repair_checkpoint" || action === "enable_retry");
      return {kind: actionable || assessment.status === "already_reconciled" ? "status" : "critical", message: assessment.summary ?? assessment.notification};
    });
  }

  function requestSanityInspection(operationId: string): void {
    const control = buildGlobalResolutionInspectionControlView({reviewCase, controls: view, operationId, state: inspectionState});
    if (!control.visible || locked) return;
    setInspectionState({status: "confirming", operationId});
    setFeedback(undefined);
  }

  function cancelSanityInspection(): void {
    inspectionAbort.current?.abort();
    inspectionAbort.current = undefined;
    gate.current.cancel();
    setBusy(false);
    setInspectionState({status: "idle"});
    setFeedback({kind: "status", message: "Comprobación cancelada. No se modificó ningún dato."});
  }

  function confirmSanityInspection(operationId: string): void {
    const token = gate.current.begin(reviewCase.id);
    if (!token || inspectionState.status !== "confirming" || inspectionState.operationId !== operationId) return;
    const controller = new AbortController();
    inspectionAbort.current = controller;
    setBusy(true);
    setInspectionState({status: "inspecting", operationId});
    setReconciliations((previous) => {
      const next = {...previous};
      delete next[operationId];
      return next;
    });
    setFeedback(undefined);
    recoverySequence.current += 1;
    void (async () => {
      try {
        const current = getReviewCase(token.caseId);
        if (!current) throw new Error("El caso ya no está disponible.");
        const built = buildGlobalResolutionInspectionRequest({
          reviewCase: current,
          operationId,
          requestedAt: new Date().toISOString(),
        });
        if (!built.ok) {
          const local = await collectReconciliationEvidence({reviewCase: current, operationId});
          const assessment = assessReconciliation(local, current.globalResolution!, {unsupported: {code: built.code}});
          setReconciliations((previous) => ({...previous, [operationId]: assessment}));
          setInspectionState({status: "failed", operationId, code: built.code, message: assessment.summary ?? "No existe una inspección compatible.", retryable: false, assessment});
          return;
        }
        const result = await inspectionRuntime.current!.reconciliationEngine.inspectAndAssess(built.request, {signal: controller.signal});
        if (!gate.current.isCurrent(token, reviewCase.id) || !result.accepted) return;
        setReconciliations((previous) => ({...previous, [operationId]: result.assessment}));
        if (result.evidence && result.assessment.status !== "technical_failure") {
          setInspectionState({status: "succeeded", operationId, evidence: result.evidence, assessment: result.assessment});
        } else {
          setInspectionState({
            status: "failed",
            operationId,
            code: result.assessment.status,
            message: result.assessment.summary ?? "No se pudo completar la inspección.",
            retryable: result.assessment.allowedActions?.includes("inspect_again") ?? false,
            assessment: result.assessment,
          });
        }
      } catch {
        if (!gate.current.isCurrent(token, reviewCase.id)) return;
        if (controller.signal.aborted) setInspectionState({status: "idle"});
        else setInspectionState({status: "failed", operationId, code: "inspection_failed", message: "No se pudo leer Sanity.", retryable: true});
      } finally {
        inspectionAbort.current = undefined;
        const current = gate.current.isCurrent(token, reviewCase.id);
        gate.current.finish(token);
        if (current) setBusy(false);
      }
    })();
  }

  function applyReconciliation(operationId: string): void {
    const assessment = reconciliations[operationId];
    const action = assessment?.allowedActions?.find((candidate) => candidate === "repair_checkpoint" || candidate === "enable_retry");
    if (!assessment || !action) return;
    const confirmation = action === "repair_checkpoint"
      ? "La evidencia indica que la operación real ya ocurrió.\nEsta acción sólo reparará el checkpoint y no repetirá el efecto.\n\n¿Continuar?"
      : "La evidencia indica que la operación no ocurrió.\nEsta acción permitirá un nuevo intento, pero no lo ejecutará.\n\n¿Continuar?";
    if (!window.confirm(confirmation)) return;
    void runAction(action === "repair_checkpoint" ? "Reparando checkpoint" : "Habilitando nuevo intento", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const result = await applyConfirmedReconciliation({
        assessment,
        expectedCaseVersion: current.version,
        expectedCheckpointFingerprint: checkpoint.checkpointFingerprint,
        expectedAssessmentFingerprint: assessment.assessmentFingerprint,
        inspectionEvidence: inspectionState.status === "succeeded" && inspectionState.operationId === operationId ? [inspectionState.evidence] : undefined,
      });
      if (result.status === "applied" || result.status === "already_reconciled") {
        setReconciliations((previous) => {
          const next = {...previous};
          delete next[operationId];
          return next;
        });
        setInspectionState({status: "idle"});
        return {kind: "status", message: action === "repair_checkpoint" ? "Checkpoint reparado sin repetir el efecto real." : "Nuevo intento habilitado. No se ha ejecutado ninguna operación."};
      }
      return {kind: "error", message: result.reason};
    });
  }

  const reconciliationIds = reconciliationOperationIds(reviewCase);

  return <section className="review-subsection global-resolution-controls" id={`global-resolution-${reviewCase.id}`} tabIndex={-1} aria-labelledby={`global-resolution-title-${reviewCase.id}`} aria-busy={locked}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">MOTOR UNIVERSAL · CONTROL MANUAL</p><h4 className="review-subtitle" id={`global-resolution-title-${reviewCase.id}`}>Resolución global</h4></div>
      <div className="global-resolution-heading-actions">
        {import.meta.env.DEV ? <button className="review-button review-button-secondary global-resolution-dev-fixture-trigger" type="button" onClick={() => setDevFixtureOpen(true)}>Abrir fixture visual AU4</button> : null}
        <strong className={`review-mode-label global-resolution-status-${view.recoveryStatus}`}>{view.phaseLabel}</strong>
      </div>
    </div>
    <p className="review-muted">Recuperar, inicializar y simular no ejecutan operaciones. Cada efecto real requiere una acción explícita.</p>
    <p className={view.reconciliation > 0 ? "global-resolution-alert" : "review-feedback"} role="status">{view.recoveryLabel}</p>

    <dl className="global-resolution-summary" aria-label="Resumen del checkpoint universal">
      <div><dt>Recuperación</dt><dd>{view.recoveryStatus}</dd></div>
      <div><dt>Fase</dt><dd>{view.phaseLabel}</dd></div>
      <div><dt>Productor</dt><dd>{view.producer}</dd></div>
      <div><dt>Manifiesto</dt><dd>{producerResolution.displayName} · {producerResolution.producerVersion}</dd></div>
      <div><dt>Versión del caso</dt><dd>{view.caseVersion}</dd></div>
      <div><dt>Actualizado</dt><dd>{view.updatedAt ? new Date(view.updatedAt).toLocaleString("es-ES") : "—"}</dd></div>
      <div><dt>Operaciones</dt><dd>{view.total}</dd></div>
      <div><dt>Completadas</dt><dd>{view.completed}</dd></div>
      <div><dt>Listas</dt><dd>{view.ready}</dd></div>
      <div><dt>Bloqueadas</dt><dd>{view.blocked}</dd></div>
      <div><dt>Reconciliación</dt><dd>{view.reconciliation}</dd></div>
      <div><dt>Autorización</dt><dd>{view.requiresAuthorization ? "Requerida" : "No requerida ahora"}</dd></div>
      <div><dt>Checkpoint</dt><dd>{abbreviateGlobalResolutionValue(view.checkpointFingerprint)}</dd></div>
    </dl>

    {view.reasons.length ? <ul className="global-resolution-reasons">{view.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    {view.reconciliation > 0 ? <p className="global-resolution-alert" role="alert">Existe una operación en reconciliación. No repitas efectos reales hasta comprobar el resultado almacenado.</p> : null}
    {reconciliationIds.length ? <div className="global-resolution-reconciliations" aria-label="Reconciliaciones necesarias">
      {reconciliationIds.map((operationId) => {
        const assessment = reconciliations[operationId];
        const planned = reviewCase.globalResolution?.plan.operations.find((operation) => operation.id === operationId);
        const storedNode = reviewCase.globalResolution?.graph.nodes.find((node) => node.operationId === operationId);
        const operation = view.operations.find((item) => item.operationId === operationId);
        const label = operation?.label ?? (storedNode?.isResumeNode ? "Guardar borrador y reanudar" : planned?.kind === "create_entity" ? "Crear o reutilizar luchador" : "Operación universal");
        const inspection = buildGlobalResolutionInspectionControlView({reviewCase, controls: view, operationId, state: inspectionState});
        const activeInspection = "operationId" in inspectionState && inspectionState.operationId === operationId ? inspectionState : undefined;
        const actions = assessment?.allowedActions?.filter((action) => action === "repair_checkpoint" || action === "enable_retry") ?? [];
        return <article className="global-resolution-reconciliation" key={operationId}>
          <header><div><strong>Reconciliación necesaria</strong><small>{label} · {abbreviateGlobalResolutionValue(operationId)}</small></div><span className="review-badge review-badge-danger">BLOQUEADA</span></header>
          <p>La operación no puede repetirse hasta determinar mediante evidencia qué ocurrió realmente.</p>
          <div className="global-resolution-inspection-actions">
            <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={() => inspectReconciliation(operationId)}>Comprobar resultado real</button>
            {inspection.visible ? <button className="review-button" type="button" disabled={locked} onClick={() => requestSanityInspection(operationId)}>Comprobar en Sanity</button> : null}
          </div>
          {activeInspection?.status === "confirming" ? <div className="global-resolution-inspection-confirmation" role="dialog" aria-labelledby={`sanity-confirmation-${operationId}`}>
            <strong id={`sanity-confirmation-${operationId}`}>Confirmar consulta de sólo lectura</strong>
            <p>Se realizará una consulta de sólo lectura en Sanity para comprobar si el efecto ya existe. No se modificará ningún documento ni se repetirá la operación.</p>
            <div className="global-resolution-inspection-actions">
              <button className="review-button review-button-secondary" type="button" onClick={cancelSanityInspection}>Cancelar</button>
              <button className="review-button" type="button" autoFocus onClick={() => confirmSanityInspection(operationId)}>Comprobar</button>
            </div>
          </div> : null}
          {activeInspection?.status === "inspecting" ? <div className="global-resolution-inspection-progress" role="status" aria-live="polite">
            <p>Comprobando Sanity…</p>
            <button className="review-button review-button-secondary" type="button" onClick={cancelSanityInspection}>Cancelar comprobación</button>
          </div> : null}
          {activeInspection?.status === "failed" ? <div ref={inspectionErrorRef} tabIndex={-1} className="global-resolution-inspection-error" role="alert">
            <strong>{activeInspection.code === "checkpoint_conflict" || activeInspection.code === "operation_conflict" ? "Conflicto de contexto" : "Fallo de inspección"}</strong>
            <p>{activeInspection.message}</p>
            {activeInspection.retryable ? <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={() => requestSanityInspection(operationId)}>Volver a comprobar</button> : null}
          </div> : null}
          {activeInspection?.status === "succeeded" ? <div ref={inspectionResultRef} tabIndex={-1} className="global-resolution-inspection-result" role="status" aria-live="polite">
            <strong>Evidencia de Sanity</strong>
            <ul className="global-resolution-inspection-observations">
              {inspection.observations.map((observation, index) => <li key={`${observation.kind}:${index}`}>
                <span>{observation.label}</span>
                {observation.detail ? <small title={observation.fullValue}>{observation.detail}</small> : null}
              </li>)}
            </ul>
          </div> : null}
          {assessment ? <div className="global-resolution-evidence" role={assessment.blockingReasons?.length ? "alert" : "status"}>
            <h5>Resultado de la evaluación</h5>
            <p><strong>{inspection.assessmentLabel ?? assessment.status}</strong></p>
            {assessment.summary ? <p>{assessment.summary}</p> : null}
            <section className="global-resolution-evidence-group" aria-label="Evidencia local">
              <h6>Evidencia local</h6>
              <ul className="global-resolution-evidence-list">
                {assessment.localEvidence?.map((item) => <li key={item.id}>
                  <strong>{item.category}</strong>
                  <span>{item.provenance} · {item.confidence}</span>
                  <span>{item.summary}</span>
                </li>)}
              </ul>
            </section>
            <section className="global-resolution-evidence-group" aria-label="Evidencia de Sanity">
              <h6>Evidencia de Sanity</h6>
              {assessment.remoteEvidence?.length ? <ul className="global-resolution-evidence-list">
                {assessment.remoteEvidence.map((item) => <li key={item.id}>
                  <strong>{item.category}</strong>
                  <span>{item.provenance} · {item.confidence}</span>
                  <span>{item.summary}</span>
                </li>)}
              </ul> : <p className="review-muted">Todavía no se ha incorporado evidencia externa.</p>}
            </section>
            {assessment.reasons?.length ? <ul className="global-resolution-reasons">{assessment.reasons.map((item) => <li key={item.code}>{item.message}</li>)}</ul> : null}
            {actions.map((action) => <button className="review-button review-button-danger" type="button" disabled={locked} onClick={() => applyReconciliation(operationId)} key={action}>{GLOBAL_RESOLUTION_RECONCILIATION_ACTION_LABELS[action]}</button>)}
          </div> : null}
        </article>;
      })}
    </div> : null}

    <div className="review-actions" aria-label="Acciones universales">
      {view.canInitialize ? <button className="review-button" type="button" disabled={locked} onClick={() => initialize(false)}>Inicializar resolución</button> : null}
      {view.canRegenerate ? <button className="review-button review-button-danger" type="button" disabled={locked} onClick={() => initialize(true)}>Regenerar resolución</button> : null}
      {view.canDiscardInvalid ? <button className="review-button review-button-danger" type="button" disabled={locked} onClick={discardInvalid}>Descartar checkpoint inválido</button> : null}
      {view.canSimulate ? <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={simulate}>Simular plan</button> : null}
      {view.canPrepareResume ? <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={prepareResume}>Preparar reanudación</button> : null}
      {prepared?.ready ? <button className="review-button review-button-danger" type="button" disabled={locked} onClick={resume}>Guardar borrador y reanudar</button> : null}
    </div>

    {busy ? <p className="review-feedback" role="status" aria-live="polite">Acción en curso. Los demás controles están bloqueados.</p> : null}
    {feedback ? <p ref={feedback.kind === "status" ? undefined : errorRef} tabIndex={feedback.kind === "status" ? undefined : -1} className={feedback.kind === "critical" ? "global-resolution-alert" : feedback.kind === "error" ? "global-resolution-error" : "review-feedback"} role={feedback.kind === "status" ? "status" : "alert"} aria-live="assertive">{feedback.message}</p> : null}

    {prepared ? <div className="global-resolution-preview" role="status" aria-label="Preview universal preparada">
      <div><strong>Preview vigente</strong><span className="review-badge review-badge-ok">{prepared.ready ? "LISTO PARA REANUDAR" : "BLOQUEADO"}</span></div>
      <p><strong>Validación:</strong> {prepared.validation.valid ? "Superada" : "Bloqueada"}</p>
      <p><strong>Referencias aplicadas:</strong> {prepared.appliedReferences.length ? prepared.appliedReferences.map((reference) => `${reference.entityType}: ${abbreviateGlobalResolutionValue(reference.documentId)}`).join(", ") : "Ninguna"}</p>
      <p><strong>Preview:</strong> {abbreviateGlobalResolutionValue(prepared.previewFingerprint)}</p>
      <p><strong>Confirmación:</strong> requerida antes de guardar el borrador real.</p>
      {prepared.blockers.length ? <ul className="global-resolution-reasons">{prepared.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul> : null}
    </div> : null}

    {view.operations.length ? <div className="global-resolution-operations" aria-label="Operaciones del plan">
      {view.operations.map((operation) => <article className="global-resolution-operation" key={operation.operationId}>
        <header><div><strong>{operation.label}</strong><small>{operation.capability} · {operation.shortId}</small></div><span className={`review-badge ${operation.state === "succeeded" ? "review-badge-ok" : ["failed", "reconciliation_required"].includes(operation.state) ? "review-badge-danger" : ""}`}>{operation.stateLabel}</span></header>
        {operation.identity ? <p><strong>Identidad:</strong> {operation.identity}</p> : null}
        {operation.dependencyLabels.length ? <p><strong>Depende de:</strong> {operation.dependencyLabels.join(", ")}</p> : <p>Sin dependencias previas.</p>}
        {operation.blocker ? <p className="global-resolution-error" role="alert">{operation.blocker}</p> : null}
        {operation.outcome ? <p><strong>Resultado:</strong> {operation.outcome}</p> : null}
        {operation.documentId ? <p><strong>Documento:</strong> {abbreviateGlobalResolutionValue(operation.documentId)}</p> : null}
        {reviewCase.globalResolution?.referenceResolution?.replacementOperationId === operation.operationId ? <p><strong>Payload:</strong> {abbreviateGlobalResolutionValue(reviewCase.globalResolution.referenceResolution.payloadFingerprint)}</p> : null}
        <p><strong>Soporte:</strong> {operation.support === "executable" ? "Ejecutable bajo acción explícita" : operation.support === "simulatable" ? "Validación o simulación pura" : operation.support}</p>
        {operation.canExecute ? <button className="review-button" type="button" disabled={locked} onClick={() => execute(operation.operationId)}>Ejecutar</button> : null}
        {operation.isPureValidation && operation.state === "ready" ? <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={() => execute(operation.operationId, true)}>Validar noticia</button> : null}
      </article>)}
    </div> : null}
  </section>;
}
