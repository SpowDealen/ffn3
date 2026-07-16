import {useEffect, useState, type ReactElement} from "react";
import {buildExternalNewsResumePreview, createExternalNewsPreviewFingerprint, executeExternalNewsResume, type ExecuteExternalNewsResumeResult, type ExternalNewsResumeExecutor, type ExternalNewsResumePreview} from "../resume/externalNews";
import type {ReviewCase} from "../types";
import {getReviewResumeExecutor, subscribeReviewResumeExecutors} from "../../integrations/reviewResumeExecutors";
import {observeResumeForCase} from "../outcomes";

const STATUS = {ready: "LISTO PARA REANUDACIÓN", not_ready: "BLOQUEADO", snapshot_incomplete: "SNAPSHOT INCOMPLETO", blocked_by_duplicate: "BLOQUEADO POR DUPLICADO", blocked_by_prepared_entity: "BLOQUEADO POR ENTIDAD PREPARADA", invalid_payload: "PAYLOAD INVÁLIDO"} as const;
const json = (value: unknown): string => { try { return JSON.stringify(value, null, 2); } catch { return "Contenido no serializable"; } };

export default function ExternalNewsResumePreviewPanel({reviewCase}: {reviewCase: ReviewCase}): ReactElement | null {
  const [preview, setPreview] = useState<ExternalNewsResumePreview | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [executor, setExecutor] = useState<ExternalNewsResumeExecutor | undefined>(() => getReviewResumeExecutor("external_news"));
  const [execution, setExecution] = useState<ExecuteExternalNewsResumeResult | null>(null);
  const [executing, setExecuting] = useState(false);
  useEffect(() => subscribeReviewResumeExecutors(() => setExecutor(getReviewResumeExecutor("external_news"))), []);
  if (reviewCase.context.producer !== "external_news") return null;
  const toggle = (key: string): void => setOpen((current) => ({...current, [key]: !current[key]}));
  const disclosure = (key: string, label: string, content: ReactElement): ReactElement => {
    const id = `resume-preview-${reviewCase.id}-${key}`;
    return <div><button type="button" className="review-disclosure" aria-expanded={Boolean(open[key])} aria-controls={id} onClick={() => toggle(key)}>{open[key] ? `Ocultar ${label}` : `Ver ${label}`}</button>{open[key] ? <div id={id} className="resume-preview-detail">{content}</div> : null}</div>;
  };
  return <section className="review-subsection resume-preview" aria-labelledby={`resume-preview-title-${reviewCase.id}`}>
    <div className="review-row review-row-wrap"><div><p className="review-kicker">PREVISUALIZACIÓN · NO EJECUTADO</p><h4 className="review-subtitle" id={`resume-preview-title-${reviewCase.id}`}>Reanudación de noticia externa</h4></div>{preview ? <strong className="review-mode-label">{STATUS[preview.status]}</strong> : null}</div>
    <p className="review-muted">Reconstruye una copia local del payload. No guarda, no reanuda y no cambia el caso.</p>
    <button type="button" className="review-button" disabled={executing} onClick={() => {const next = buildExternalNewsResumePreview(reviewCase); setPreview(next); setPreviewVersion(reviewCase.version); setExecution(null); observeResumeForCase(reviewCase, {type: "resume_preview_generated", idempotencyKey: `resume-preview:${reviewCase.id}:${reviewCase.version}:${createExternalNewsPreviewFingerprint(reviewCase, next)}`, status: next.status, previewFingerprint: createExternalNewsPreviewFingerprint(reviewCase, next), occurredAt: next.generatedAt});}}>Preparar reanudación</button>
    {preview ? <>
      <p className="review-feedback" role="status">Can resume: {preview.canResume ? "Sí, preparado para una ejecución futura" : "No, bloqueado"}.</p>
      {preview.reasons.length ? <ul className="resume-preview-reasons">{preview.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
      <div className="autonomous-summary"><span>Aplicadas: {preview.application.applied.length}</span><span>Omitidas: {preview.application.skipped.length}</span><span>Fallidas: {preview.application.failed.length}</span><span>Cambios: {preview.changes.length}</span></div>
      {disclosure("application", "aplicación", <><h5>Aplicadas</h5><pre className="review-json review-json-small">{json(preview.application.applied)}</pre><h5>Omitidas y fallidas</h5><pre className="review-json review-json-small">{json({skipped: preview.application.skipped, failed: preview.application.failed})}</pre></>)}
      {disclosure("diff", "diff antes/después", <div className="resume-diff">{preview.changes.length ? preview.changes.map((change) => <div key={change.path}><strong>{change.kind.toUpperCase()} · {change.path}</strong><pre className="review-json review-json-small">{json({before: change.before, after: change.after, issueId: change.issueId})}</pre></div>) : <p>Sin cambios editoriales.</p>}</div>)}
      {disclosure("payload", "payload resultante", <pre className="review-json">{json(preview.resultingPayload)}</pre>)}
      {disclosure("validation", "validación", <pre className="review-json review-json-small">{json(preview.validation)}</pre>)}
      {preview.preparedEntities.length ? disclosure("entities", "entidades preparadas", <pre className="review-json review-json-small">{json(preview.preparedEntities)}</pre>) : null}
      {preview.duplicateDecision ? <p><strong>Decisión de duplicado:</strong> {preview.duplicateDecision.confirmed ? `Confirmado (${preview.duplicateDecision.targetId ?? "sin target"})` : "Rechazado"}</p> : null}
      {preview.canResume && executor && reviewCase.status !== "resumed" && previewVersion === reviewCase.version ? <button type="button" className="review-button review-button-danger" disabled={executing} onClick={async () => {
        const title = typeof preview.resultingPayload.titulo === "string" ? preview.resultingPayload.titulo : reviewCase.title;
        const source = typeof reviewCase.context.sourceName === "string" ? reviewCase.context.sourceName : reviewCase.source ?? "Fuente externa";
        if (!window.confirm(`Se guardará un borrador real, no publicado.\n\nTítulo: ${title}\nFuente: ${source}\nCambios: ${preview.changes.length}\n\n¿Quieres reanudar y guardar el borrador?`)) return;
        setExecuting(true); setExecution(null);
        const fingerprint = createExternalNewsPreviewFingerprint(reviewCase, preview);
        const next = await executeExternalNewsResume({caseId: reviewCase.id, executor, options: {expectedCaseVersion: reviewCase.version, expectedPreviewFingerprint: fingerprint}});
        setExecution(next); setExecuting(false);
      }}>{executing ? "GUARDANDO BORRADOR…" : "Reanudar y guardar borrador"}</button> : null}
      {preview.canResume && previewVersion !== reviewCase.version && reviewCase.status !== "resumed" ? <p className="review-readonly-message">PREVIEW OBSOLETA. Regenera la previsualización antes de reintentar.</p> : null}
      {!executor ? <p className="review-readonly-message">Ejecutor de guardado no disponible en esta sesión.</p> : null}
      <div className="resume-execution-feedback" aria-live="polite">{executing ? <strong>PREPARANDO · GUARDANDO BORRADOR</strong> : execution ? <><strong>{execution.success ? "COMPLETADO" : execution.status === "stale_preview" ? "PREVIEW OBSOLETA" : "ERROR"}</strong><span>{execution.message}</span>{execution.draftId || execution.documentId ? <span>ID: {execution.draftId ?? execution.documentId}</span> : null}</> : null}</div>
    </> : null}
  </section>;
}
