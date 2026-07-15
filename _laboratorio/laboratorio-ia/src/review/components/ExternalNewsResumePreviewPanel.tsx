import {useState, type ReactElement} from "react";
import {buildExternalNewsResumePreview, type ExternalNewsResumePreview} from "../resume/externalNews";
import type {ReviewCase} from "../types";

const STATUS = {ready: "LISTO PARA REANUDACIÓN", not_ready: "BLOQUEADO", snapshot_incomplete: "SNAPSHOT INCOMPLETO", blocked_by_duplicate: "BLOQUEADO POR DUPLICADO", blocked_by_prepared_entity: "BLOQUEADO POR ENTIDAD PREPARADA", invalid_payload: "PAYLOAD INVÁLIDO"} as const;
const json = (value: unknown): string => { try { return JSON.stringify(value, null, 2); } catch { return "Contenido no serializable"; } };

export default function ExternalNewsResumePreviewPanel({reviewCase}: {reviewCase: ReviewCase}): ReactElement | null {
  const [preview, setPreview] = useState<ExternalNewsResumePreview | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (reviewCase.context.producer !== "external_news") return null;
  const toggle = (key: string): void => setOpen((current) => ({...current, [key]: !current[key]}));
  const disclosure = (key: string, label: string, content: ReactElement): ReactElement => {
    const id = `resume-preview-${reviewCase.id}-${key}`;
    return <div><button type="button" className="review-disclosure" aria-expanded={Boolean(open[key])} aria-controls={id} onClick={() => toggle(key)}>{open[key] ? `Ocultar ${label}` : `Ver ${label}`}</button>{open[key] ? <div id={id} className="resume-preview-detail">{content}</div> : null}</div>;
  };
  return <section className="review-subsection resume-preview" aria-labelledby={`resume-preview-title-${reviewCase.id}`}>
    <div className="review-row review-row-wrap"><div><p className="review-kicker">PREVISUALIZACIÓN · NO EJECUTADO</p><h4 className="review-subtitle" id={`resume-preview-title-${reviewCase.id}`}>Reanudación de noticia externa</h4></div>{preview ? <strong className="review-mode-label">{STATUS[preview.status]}</strong> : null}</div>
    <p className="review-muted">Reconstruye una copia local del payload. No guarda, no reanuda y no cambia el caso.</p>
    <button type="button" className="review-button" onClick={() => setPreview(buildExternalNewsResumePreview(reviewCase))}>Preparar reanudación</button>
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
    </> : null}
  </section>;
}
