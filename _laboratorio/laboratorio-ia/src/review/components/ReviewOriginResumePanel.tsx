import {useEffect, useState, type ReactElement} from "react";
import {getReviewOriginResumeAuthority, subscribeReviewResumeExecutors} from "../../integrations/reviewResumeExecutors";
import {dispatchReviewResume, readReviewOriginResumeContext, type DispatchReviewResumeResult} from "../resume/origin";
import type {ReviewCase} from "../types";

export default function ReviewOriginResumePanel({reviewCase}: {reviewCase: ReviewCase}): ReactElement | null {
  const context = readReviewOriginResumeContext(reviewCase);
  const [available, setAvailable] = useState(() => Boolean(context && getReviewOriginResumeAuthority(context.producer)));
  const [executing, setExecuting] = useState(false);
  const [execution, setExecution] = useState<DispatchReviewResumeResult>();

  useEffect(() => {
    const syncAvailability = (): void => setAvailable(Boolean(context && getReviewOriginResumeAuthority(context.producer)));
    const unsubscribe = subscribeReviewResumeExecutors(syncAvailability);
    syncAvailability();
    return unsubscribe;
  }, [context?.producer]);
  if (!context) return null;

  const canResume = reviewCase.status === "resolved" && available && !executing;
  return <section className="review-subsection review-origin-resume" aria-labelledby={`review-origin-resume-${reviewCase.id}`}>
    <div>
      <p className="review-kicker">CONTINUACIÓN DEL FLUJO</p>
      <h4 className="review-subtitle" id={`review-origin-resume-${reviewCase.id}`}>Volver al origen</h4>
      <p className="review-muted">La decisión ya está registrada. El productor original continuará solo tras validar versión, contexto y autorización.</p>
    </div>
    {!available ? <p className="review-readonly-message">El productor todavía no ofrece una reanudación segura en esta sesión. El caso permanece bloqueado.</p> : null}
    {reviewCase.status !== "resolved" && reviewCase.status !== "resumed" ? <p className="review-readonly-message">Primero completa y aprueba la decisión del caso.</p> : null}
    <button className="review-button review-origin-resume-action" type="button" disabled={!canResume} onClick={async () => {
      if (!window.confirm("La decisión se enviará al productor original para continuar el procesamiento. ¿Quieres continuar?")) return;
      setExecuting(true);
      const next = await dispatchReviewResume({caseId: reviewCase.id, expectedCaseVersion: reviewCase.version, expectedFingerprint: context.fingerprint, authorized: true});
      setExecution(next);
      setExecuting(false);
    }}>{executing ? "Continuando flujo…" : reviewCase.status === "resumed" ? "Flujo continuado" : "Continuar flujo original"}</button>
    {execution ? <p className={execution.success ? "review-feedback" : "review-readonly-message"} role="status">{execution.success ? "La incidencia se resolvió. El flujo original continuó correctamente y el resultado fue confirmado." : execution.message}</p> : null}
  </section>;
}
