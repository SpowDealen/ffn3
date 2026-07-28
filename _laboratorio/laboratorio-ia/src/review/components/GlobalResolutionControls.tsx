import {useEffect, useRef, useState, type ReactElement} from "react";
import {
  authorizeAndResumeExternalNews,
  authorizeExternalNewsGlobalResume,
  buildExternalNewsControlPlanningInput,
  buildExternalNewsControlSimulationContext,
  buildGlobalResolutionControlsView,
  executeExternalNewsResolutionOperation,
  initializeExternalNewsGlobalResolution,
  prepareExternalNewsGlobalResume,
  recoverExternalNewsGlobalResolution,
  simulateExternalNewsGlobalResolution,
  abbreviateGlobalResolutionValue,
  GlobalResolutionRequestGate,
  applyConfirmedReconciliation,
  assessReconciliation,
  collectReconciliationEvidence,
  reconciliationOperationIds,
  type ExternalNewsApplicationRecovery,
  type GlobalResolutionReconciliationAssessment,
  type PreparedExternalNewsResume,
} from "../globalResolution";
import {clearGlobalResolutionCheckpoint, getReviewCase} from "../store/reviewStore";
import type {ReviewCase} from "../types";

type Feedback = {kind: "status" | "error" | "critical"; message: string};

const resultWarnings = (value: unknown): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const results = "execution" in value && value.execution && typeof value.execution === "object" && "results" in value.execution && Array.isArray(value.execution.results) ? value.execution.results : [];
  return results.flatMap((result) => result && typeof result === "object" && !Array.isArray(result) && result.output && typeof result.output === "object" && !Array.isArray(result.output) && Array.isArray(result.output.warnings) ? (result.output.warnings as unknown[]).filter((warning): warning is string => typeof warning === "string") : []);
};

export default function GlobalResolutionControls({reviewCase}: {reviewCase: ReviewCase}): ReactElement | null {
  const [recovery, setRecovery] = useState<ExternalNewsApplicationRecovery>();
  const [prepared, setPrepared] = useState<PreparedExternalNewsResume>();
  const [feedback, setFeedback] = useState<Feedback>();
  const [reconciliations, setReconciliations] = useState<Record<string, GlobalResolutionReconciliationAssessment>>({});
  const [busy, setBusy] = useState(false);
  const gate = useRef(new GlobalResolutionRequestGate());
  const recoverySequence = useRef(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const compatible = reviewCase.context.producer === "external_news";
  const view = buildGlobalResolutionControlsView(reviewCase, recovery);
  const locked = busy || !recovery;

  useEffect(() => {
    if (!compatible) return;
    const sequence = ++recoverySequence.current;
    let cancelled = false;
    void recoverExternalNewsGlobalResolution(reviewCase.id).then((next) => {
      if (!cancelled && sequence === recoverySequence.current) setRecovery(next);
    }).catch((error) => {
      if (!cancelled && sequence === recoverySequence.current) setFeedback({kind: "error", message: error instanceof Error ? error.message : "No se pudo recuperar el estado universal."});
    });
    return () => { cancelled = true; };
  }, [compatible, reviewCase.id, reviewCase.version, reviewCase.globalResolution?.checkpointFingerprint]);

  useEffect(() => {
    if (feedback?.kind === "error" || feedback?.kind === "critical") errorRef.current?.focus();
  }, [feedback]);

  useEffect(() => () => gate.current.cancel(), []);

  if (!compatible) return null;

  async function refresh(caseId: string): Promise<ExternalNewsApplicationRecovery> {
    const next = await recoverExternalNewsGlobalResolution(caseId);
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
      const result = await initializeExternalNewsGlobalResolution({caseId: current.id, planning: buildExternalNewsControlPlanningInput(current), regenerateStale: regenerate});
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
      const result = await simulateExternalNewsGlobalResolution({caseId: current.id, context: buildExternalNewsControlSimulationContext(current)});
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
      const result = await executeExternalNewsResolutionOperation({
        caseId: current.id,
        expectedCaseVersion: current.version,
        expectedCheckpointFingerprint: checkpoint.checkpointFingerprint,
        operationId,
        simulationContext: buildExternalNewsControlSimulationContext(current),
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
      const result = await prepareExternalNewsGlobalResume({caseId: current.id, expectedCaseVersion: current.version, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint});
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
      const authorization = authorizeExternalNewsGlobalResume({prepared, checkpoint, operationId, confirmedAt: new Date().toISOString()});
      if (!authorization) return {kind: "error", message: "La confirmación quedó obsoleta. Prepara de nuevo la reanudación."};
      const result = await authorizeAndResumeExternalNews({caseId: current.id, prepared, authorization, expectedCheckpointFingerprint: checkpoint.checkpointFingerprint, idempotencyContext: `review-center:resume:${current.id}:${operationId}`});
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
    void runAction("Comprobando resultado real", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const reconciliationCase = await collectReconciliationEvidence({reviewCase: current, operationId});
      const assessment = assessReconciliation(reconciliationCase, checkpoint);
      setReconciliations((previous) => ({...previous, [operationId]: assessment}));
      if (assessment.status === "confirmed_succeeded") return {kind: "status", message: "Se ha confirmado que la operación ocurrió."};
      if (assessment.status === "confirmed_not_applied") return {kind: "status", message: "Se ha confirmado que la operación no se aplicó."};
      if (assessment.status === "conflicting_evidence") return {kind: "critical", message: "La evidencia disponible es contradictoria. La operación continúa bloqueada."};
      if (assessment.status === "already_reconciled") return {kind: "status", message: "El checkpoint ya refleja este resultado."};
      return {kind: "critical", message: "No hay evidencia suficiente para determinar el resultado. La operación continúa bloqueada."};
    });
  }

  function applyReconciliation(operationId: string): void {
    const assessment = reconciliations[operationId];
    if (!assessment || assessment.status !== "confirmed_succeeded" && assessment.status !== "confirmed_not_applied") return;
    const confirmation = assessment.status === "confirmed_succeeded"
      ? "La evidencia indica que la operación real ya ocurrió.\nEsta acción sólo reparará el checkpoint y no repetirá el efecto.\n\n¿Continuar?"
      : "La evidencia indica que la operación no ocurrió.\nEsta acción permitirá un nuevo intento, pero no lo ejecutará.\n\n¿Continuar?";
    if (!window.confirm(confirmation)) return;
    void runAction(assessment.status === "confirmed_succeeded" ? "Reparando checkpoint" : "Habilitando nuevo intento", async (current) => {
      const checkpoint = current.globalResolution;
      if (!checkpoint) throw new Error("El checkpoint ya no existe.");
      const result = await applyConfirmedReconciliation({
        assessment,
        expectedCaseVersion: current.version,
        expectedCheckpointFingerprint: checkpoint.checkpointFingerprint,
        expectedAssessmentFingerprint: assessment.assessmentFingerprint,
      });
      if (result.status === "applied" || result.status === "already_reconciled") {
        setReconciliations((previous) => {
          const next = {...previous};
          delete next[operationId];
          return next;
        });
        return {kind: "status", message: assessment.status === "confirmed_succeeded" ? "Checkpoint reparado sin repetir el efecto real." : "Nuevo intento habilitado. No se ha ejecutado ninguna operación."};
      }
      return {kind: "error", message: result.reason};
    });
  }

  const reconciliationIds = reconciliationOperationIds(reviewCase);

  return <section className="review-subsection global-resolution-controls" aria-labelledby={`global-resolution-title-${reviewCase.id}`} aria-busy={locked}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">MOTOR UNIVERSAL · CONTROL MANUAL</p><h4 className="review-subtitle" id={`global-resolution-title-${reviewCase.id}`}>Resolución global</h4></div>
      <strong className={`review-mode-label global-resolution-status-${view.recoveryStatus}`}>{view.phaseLabel}</strong>
    </div>
    <p className="review-muted">Recuperar, inicializar y simular no ejecutan operaciones. Cada efecto real requiere una acción explícita.</p>
    <p className={view.reconciliation > 0 ? "global-resolution-alert" : "review-feedback"} role="status">{view.recoveryLabel}</p>

    <dl className="global-resolution-summary" aria-label="Resumen del checkpoint universal">
      <div><dt>Recuperación</dt><dd>{view.recoveryStatus}</dd></div>
      <div><dt>Fase</dt><dd>{view.phaseLabel}</dd></div>
      <div><dt>Productor</dt><dd>{view.producer}</dd></div>
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
        return <article className="global-resolution-reconciliation" key={operationId}>
          <header><div><strong>Reconciliación necesaria</strong><small>{label} · {abbreviateGlobalResolutionValue(operationId)}</small></div><span className="review-badge review-badge-danger">BLOQUEADA</span></header>
          <p>La operación no puede repetirse hasta determinar mediante evidencia qué ocurrió realmente.</p>
          <button className="review-button review-button-secondary" type="button" disabled={locked} onClick={() => inspectReconciliation(operationId)}>Comprobar resultado real</button>
          {assessment ? <div className="global-resolution-evidence" role={assessment.status === "conflicting_evidence" || assessment.status === "insufficient_evidence" ? "alert" : "status"}>
            <p><strong>Evaluación:</strong> {assessment.status === "confirmed_succeeded" ? "Se ha confirmado que la operación ocurrió." : assessment.status === "confirmed_not_applied" ? "Se ha confirmado que la operación no se aplicó." : assessment.status === "conflicting_evidence" ? "Evidencia contradictoria." : assessment.status === "already_reconciled" ? "El checkpoint ya refleja el resultado equivalente." : "Evidencia insuficiente."}</p>
            <ul className="global-resolution-evidence-list">
              {assessment.evidence.map((item) => <li key={item.id}>
                <strong>{item.type}</strong>
                <span>{item.source} · {item.confidence} · {new Date(item.observedAt).toLocaleString("es-ES")}</span>
                <span>{item.summary}</span>
              </li>)}
            </ul>
            {assessment.missingEvidence.length ? <ul className="global-resolution-reasons">{assessment.missingEvidence.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
            {assessment.status === "confirmed_succeeded" ? <button className="review-button review-button-danger" type="button" disabled={locked} onClick={() => applyReconciliation(operationId)}>Reparar checkpoint</button> : null}
            {assessment.status === "confirmed_not_applied" ? <button className="review-button review-button-danger" type="button" disabled={locked} onClick={() => applyReconciliation(operationId)}>Habilitar nuevo intento</button> : null}
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
