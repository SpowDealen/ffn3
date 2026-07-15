import {useMemo, useState, type FormEvent, type ReactElement} from "react";
import {resolutionFactories} from "../resolution/resolutionFactories";
import {REVIEW_RESOLUTION_LABELS} from "../resolution/resolutionFormatters";
import {
  REVIEW_REASON_LIMIT,
  REVIEW_URL_LIMIT,
  validateEntityDraft,
  validateReviewEditorValue,
  validateReviewReason,
} from "../resolution/valueValidation";
import type {ReviewIssue, ReviewResolution, ReviewValueKind} from "../types";
import ReviewCandidatePicker from "./ReviewCandidatePicker";
import ReviewValueEditor from "./ReviewValueEditor";

type ResolutionMode = ReviewResolution["type"];
const REFERENCE_KINDS = new Set<ReviewValueKind>([
  "sanityReference", "discipline", "organization", "event", "fighter", "fight", "category",
]);

function formatStoredDateForInput(value: string, currentValue: unknown): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  if (typeof currentValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(currentValue)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return new Date(timestamp).toISOString().slice(0, 16);
}

export default function ReviewIssueEditor({issue, resolution, onSave}: {
  issue: ReviewIssue;
  resolution?: ReviewResolution;
  onSave(resolution: ReviewResolution): void;
}): ReactElement {
  const referenceIssue = issue.valueKind ? REFERENCE_KINDS.has(issue.valueKind) : false;
  const defaultMode: ResolutionMode = issue.kind === "duplicate_candidate"
    ? "confirm_duplicate"
    : issue.valueKind === "image" || issue.kind === "missing_image"
      ? "select_image"
      : issue.candidates?.length ? "select_candidate"
        : referenceIssue ? "link_reference" : "set_value";
  const [mode, setMode] = useState<ResolutionMode>(resolution?.type ?? defaultMode);
  const initialValue = resolution?.type === "set_value"
    ? issue.valueKind === "date" && typeof resolution.value === "string"
      ? formatStoredDateForInput(resolution.value, issue.currentValue)
      : typeof resolution.value === "string" || typeof resolution.value === "number" ? String(resolution.value) : ""
    : resolution?.type === "link_reference" ? resolution.sanityId
      : resolution?.type === "select_image" ? resolution.url ?? ""
        : resolution?.type === "confirm_duplicate" ? resolution.duplicateId
          : resolution && "reason" in resolution ? resolution.reason ?? "" : "";
  const [value, setValue] = useState(initialValue);
  const [booleanValue, setBooleanValue] = useState(resolution?.type === "set_value" && typeof resolution.value === "boolean" ? resolution.value : false);
  const [candidateId, setCandidateId] = useState(resolution?.type === "select_candidate" ? resolution.candidateId : "");
  const [assetId, setAssetId] = useState(resolution?.type === "select_image" ? resolution.assetId ?? "" : "");
  const [entityType, setEntityType] = useState(resolution?.type === "create_entity" ? resolution.entityType : issue.valueKind ?? "entity");
  const [draftJson, setDraftJson] = useState(resolution?.type === "create_entity" ? JSON.stringify(resolution.draft, null, 2) : "{}");
  const [error, setError] = useState<string | null>(null);
  const errorId = `review-editor-error-${issue.id}`;

  const modes = useMemo(() => {
    const available: ResolutionMode[] = [];
    if (issue.kind === "duplicate_candidate") {
      available.push("confirm_duplicate", "reject_duplicate");
    } else if (referenceIssue) {
      if (issue.candidates?.length) available.push("select_candidate");
      available.push("link_reference", "create_entity");
    } else if (issue.valueKind === "image" || issue.kind === "missing_image") {
      available.push("select_image");
    } else {
      available.push("set_value");
      if (issue.candidates?.length) available.push("select_candidate");
    }
    if (!issue.blocking) available.push("accept_value");
    if (!issue.required && !issue.blocking) available.push("discard");
    if (issue.kind === "recoverable_error" || issue.kind === "partial_creation" || issue.kind === "blocked_dependency") available.push("retry");
    if (resolution && !available.includes(resolution.type)) available.unshift(resolution.type);
    return Array.from(new Set(available));
  }, [issue, referenceIssue, resolution]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    try {
      let next: ReviewResolution;
      switch (mode) {
        case "set_value": {
          const validation = validateReviewEditorValue(issue.valueKind === "boolean" ? booleanValue : value, issue.valueKind, {
            expected: issue.expected,
            longText: issue.kind === "insufficient_content" || String(issue.currentValue ?? "").length > 180,
          });
          if (!validation.valid) throw new Error(validation.error);
          next = resolutionFactories.setValue(issue.id, validation.value);
          break;
        }
        case "select_candidate":
          if (!candidateId) throw new Error("Selecciona un candidato.");
          next = resolutionFactories.selectCandidate(issue.id, candidateId);
          break;
        case "link_reference":
          if (!value.trim()) throw new Error("Introduce el ID de Sanity.");
          next = resolutionFactories.linkReference(issue.id, value);
          break;
        case "create_entity": {
          if (!entityType.trim()) throw new Error("Indica el tipo de entidad.");
          let parsed: unknown;
          try { parsed = JSON.parse(draftJson) as unknown; } catch { throw new Error("El borrador no contiene JSON válido."); }
          const validation = validateEntityDraft(parsed);
          if (!validation.valid) throw new Error(validation.error);
          next = resolutionFactories.createEntity(issue.id, entityType, validation.draft);
          break;
        }
        case "select_image": {
          if (!value.trim() && !assetId.trim()) throw new Error("Introduce una URL o un asset ID.");
          if (value.trim()) {
            const validation = validateReviewEditorValue(value, "image");
            if (!validation.valid) throw new Error(validation.error);
          }
          next = resolutionFactories.selectImage(issue.id, value, assetId);
          break;
        }
        case "confirm_duplicate":
          if (!value.trim()) throw new Error("Introduce el ID del duplicado.");
          if (!window.confirm("¿Confirmas que ambos registros representan el mismo contenido?")) return;
          next = resolutionFactories.confirmDuplicate(issue.id, value);
          break;
        case "reject_duplicate": {
          const reasonError = validateReviewReason(value, false);
          if (reasonError) throw new Error(reasonError);
          next = resolutionFactories.rejectDuplicate(issue.id, value);
          break;
        }
        case "accept_value": {
          const reasonError = validateReviewReason(value, false);
          if (reasonError) throw new Error(reasonError);
          next = resolutionFactories.acceptValue(issue.id, value);
          break;
        }
        case "discard": {
          const reasonError = validateReviewReason(value, true);
          if (reasonError) throw new Error(reasonError);
          next = resolutionFactories.discard(issue.id, value);
          break;
        }
        case "retry": next = resolutionFactories.retry(issue.id); break;
      }
      onSave(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la resolución.");
    }
  }

  return (
    <form className="review-issue-editor" onSubmit={submit}>
      <label className="review-editor-label" htmlFor={`review-mode-${issue.id}`}>Modo de resolución
        <select id={`review-mode-${issue.id}`} value={mode} onChange={(event) => { setMode(event.target.value as ResolutionMode); setError(null); }}>
          {modes.map((item) => <option key={item} value={item}>{REVIEW_RESOLUTION_LABELS[item]}</option>)}
        </select>
      </label>
      {mode === "set_value" ? <ReviewValueEditor issue={issue} value={value} booleanValue={booleanValue} onValueChange={setValue} onBooleanChange={setBooleanValue} errorId={errorId} /> : null}
      {mode === "select_candidate" ? <ReviewCandidatePicker candidates={issue.candidates ?? []} value={candidateId} onChange={setCandidateId} groupName={issue.id} onUseReference={(sanityId) => { setValue(sanityId); setMode("link_reference"); }} errorId={errorId} /> : null}
      {mode === "link_reference" ? <label className="review-editor-label" htmlFor={`review-ref-${issue.id}`}>ID de Sanity<input id={`review-ref-${issue.id}`} value={value} maxLength={500} onChange={(event) => setValue(event.target.value)} aria-describedby={errorId} /></label> : null}
      {mode === "create_entity" ? <><label className="review-editor-label" htmlFor={`review-entity-${issue.id}`}>Tipo de entidad<input id={`review-entity-${issue.id}`} value={entityType} maxLength={120} onChange={(event) => setEntityType(event.target.value)} aria-describedby={errorId} /></label><label className="review-editor-label" htmlFor={`review-draft-${issue.id}`}>Borrador JSON<textarea id={`review-draft-${issue.id}`} rows={7} value={draftJson} onChange={(event) => setDraftJson(event.target.value)} aria-describedby={errorId} /></label></> : null}
      {mode === "select_image" ? <div className="review-image-editor"><div className="review-editor-grid"><label className="review-editor-label" htmlFor={`review-image-url-${issue.id}`}>URL de imagen<input id={`review-image-url-${issue.id}`} type="url" maxLength={REVIEW_URL_LIMIT} value={value} onChange={(event) => { setValue(event.target.value); if (event.target.value) setAssetId(""); }} aria-describedby={errorId} /></label><label className="review-editor-label" htmlFor={`review-image-asset-${issue.id}`}>Asset ID de Sanity<input id={`review-image-asset-${issue.id}`} value={assetId} maxLength={500} onChange={(event) => { setAssetId(event.target.value); if (event.target.value) setValue(""); }} aria-describedby={errorId} /></label></div>{/^https?:\/\//i.test(value) ? <img className="review-image-preview" src={value} alt="Previsualización de la imagen propuesta" referrerPolicy="no-referrer" /> : null}<button className="review-inline-button" type="button" onClick={() => { setValue(""); setAssetId(""); }}>Eliminar selección</button></div> : null}
      {["confirm_duplicate", "reject_duplicate", "accept_value", "discard"].includes(mode) ? <label className="review-editor-label" htmlFor={`review-reason-${issue.id}`}>{mode === "confirm_duplicate" ? "ID del duplicado" : "Motivo u observación"}<textarea id={`review-reason-${issue.id}`} rows={2} maxLength={mode === "confirm_duplicate" ? 500 : REVIEW_REASON_LIMIT} value={value} onChange={(event) => setValue(event.target.value)} aria-describedby={errorId} /></label> : null}
      {mode === "retry" ? <p className="review-editor-note">Solo se registrará la solicitud. No se ejecutará ninguna operación.</p> : null}
      {error ? <p className="review-editor-error" id={errorId} role="alert">{error}</p> : <span id={errorId} className="review-visually-hidden">Sin errores de validación</span>}
      <button className="review-button" type="submit">Guardar corrección</button>
    </form>
  );
}
