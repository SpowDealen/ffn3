import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { EditorialAgentRun } from "../../agent";
import type { ReviewCase, ReviewJsonObject, ReviewJsonValue } from "../../types";
import { applyPreparedEntityEnrichment, inspectPreparedEntityRequirements, runPreparedEntityRequirementAgent, type EntitySchemaRequirement, type PreparedEntityRequirementItem, type PreparedEntityRequirementReport, type RequirementResolutionConclusion } from "..";
import SchemaEvolutionPanel from "../../schemaEvolution/components/SchemaEvolutionPanel";
import { runSchemaEvolutionEngine } from "../../schemaEvolution/schemaEvolutionEngine";

type PanelError = "case_not_found" | "no_prepared_entities" | "schema_adapter_unavailable" | "inspection_failed" | "investigation_failed" | "blocked_by_policy" | "enrichment_failed" | "revalidation_failed" | "stale_case" | "invalid_state" | "unknown_error";
const READ_ONLY = new Set(["resuming", "resumed", "dismissed"]);
const APPLYABLE = new Set(["open", "in_review", "resolved", "stale", "resume_failed"]);
const isObject = (value: ReviewJsonValue | undefined): value is ReviewJsonObject => Boolean(value && typeof value === "object" && !Array.isArray(value));
const hasValue = (draft: ReviewJsonObject, requirement: EntitySchemaRequirement): boolean => (requirement.field === "slug" ? typeof draft.name === "string" && Boolean(draft.name.trim()) : requirement.expectedType === "references" ? Array.isArray(draft[requirement.field]) && (draft[requirement.field] as ReviewJsonValue[]).some((value) => typeof value === "string" && Boolean(value.trim())) : typeof draft[requirement.field] === "string" ? Boolean(String(draft[requirement.field]).trim()) : draft[requirement.field] !== undefined && draft[requirement.field] !== null);
const conclusionLabel = (status: RequirementResolutionConclusion["status"]): string => (status === "resolved" ? "REQUISITO DEMOSTRADO" : status === "conflict" ? "REQUISITO AMBIGUO" : status === "schema_policy_required" ? "POLÍTICA NECESARIA" : status === "schema_change_recommended" ? "POSIBLE PROBLEMA DE SCHEMA" : status === "not_applicable" ? "NO APLICABLE" : "BLOQUEADO");
const entityName = (item: PreparedEntityRequirementItem): string => (typeof item.draft.name === "string" ? item.draft.name : item.issueId);
const identityKey = (item: PreparedEntityRequirementItem): string => (typeof item.draft.identityKey === "string" ? item.draft.identityKey : "Sin identityKey");
function reportFromRun(run: EditorialAgentRun): PreparedEntityRequirementReport | null {
  for (const artifact of [...run.artifacts].reverse()) {
    const value = artifact.data;
    if (isObject(value) && typeof value.caseId === "string" && Array.isArray(value.items)) return value as unknown as PreparedEntityRequirementReport;
  }
  return null;
}
function errorMessage(code: PanelError): string {
  const messages: Record<PanelError, string> = {
    case_not_found: "El caso ya no existe.",
    no_prepared_entities: "Ya no quedan entidades preparadas.",
    schema_adapter_unavailable: "No existe un adapter de schema compatible.",
    inspection_failed: "No se pudieron inspeccionar los requisitos.",
    investigation_failed: "La investigación no pudo completarse.",
    blocked_by_policy: "La investigación terminó. Aplicar el enriquecimiento requiere una acción separada y confirmada.",
    enrichment_failed: "No se pudieron aplicar los requisitos demostrados.",
    revalidation_failed: "No se pudo volver a validar la entidad.",
    stale_case: "El caso cambió durante la operación. Revisa los datos actuales.",
    invalid_state: "El estado actual solo permite consultar los requisitos.",
    unknown_error: "Se produjo un error controlado.",
  };
  return messages[code];
}

export default function PreparedEntitySchemaRequirementsPanel({ reviewCase }: { reviewCase: ReviewCase }): ReactElement | null {
  const prepared = reviewCase.resolutions.filter((resolution) => resolution.type === "create_entity");
  const signature = prepared.map((resolution) => `${resolution.issueId}:${JSON.stringify(resolution.draft)}`).join("|");
  const entityScope = prepared.map((resolution) => `${resolution.issueId}:${resolution.entityType}:${typeof resolution.draft.identityKey === "string" ? resolution.draft.identityKey : ""}`).join("|");
  const [inspection, setInspection] = useState<PreparedEntityRequirementReport | null>(null);
  const [investigation, setInvestigation] = useState<PreparedEntityRequirementReport | null>(null);
  const [run, setRun] = useState<EditorialAgentRun | null>(null);
  const [busy, setBusy] = useState<"investigate" | "apply" | "revalidate" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<PanelError | null>(null);
  const [expanded, setExpanded] = useState(true);
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!prepared.length) {
      setInspection(null);
      setInvestigation(null);
      return;
    }
    try {
      const next = inspectPreparedEntityRequirements(reviewCase.id);
      setInspection(next);
      setError(next.status === "adapter_missing" ? "schema_adapter_unavailable" : next.status === "case_not_found" ? "case_not_found" : next.status === "no_prepared_entities" ? "no_prepared_entities" : null);
    } catch {
      setError("inspection_failed");
    }
  }, [prepared.length, reviewCase.id, reviewCase.version, signature]);
  const investigationScope = investigation?.items.map((item) => `${item.issueId}:${item.entityType}:${typeof item.draft.identityKey === "string" ? item.draft.identityKey : ""}`).join("|");
  useEffect(() => {
    if (investigation && investigationScope !== entityScope) {
      setInvestigation(null);
      setRun(null);
    }
  }, [entityScope, investigation, investigationScope]);
  const display = inspection;
  const historical = investigationScope === entityScope ? investigation : null;
  const metrics = useMemo(() => {
    const items = display?.items ?? [];
    const total = items.reduce((sum, item) => sum + item.requirements.length, 0);
    const pending = items.reduce((sum, item) => sum + item.missing.length, 0);
    const blocking = items.reduce((sum, item) => sum + item.missing.filter((entry) => entry.requirement.blocking).length, 0);
    return {
      entities: items.length,
      total,
      satisfied: total - pending,
      pending,
      blocking,
    };
  }, [display]);
  const proposed = useMemo(
    () =>
      (historical?.items ?? []).flatMap((item) =>
        item.conclusions
          .filter((entry) => {
            const currentDraft = display?.items.find((candidate) => candidate.issueId === item.issueId)?.draft ?? item.draft;
            return entry.status === "resolved" && entry.proposedDraftPatch && Object.keys(entry.proposedDraftPatch).some((field) => currentDraft[field] === undefined || currentDraft[field] === null || currentDraft[field] === "");
          })
          .map((entry) => ({ item, entry })),
      ),
    [display, historical],
  );
  const schemaEvolution = useMemo(() => (historical ? runSchemaEvolutionEngine({ report: historical }) : null), [historical]);
  if (!prepared.length) return null;
  const readOnly = READ_ONLY.has(reviewCase.status);
  const canApply = APPLYABLE.has(reviewCase.status) && !readOnly;
  async function investigate(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("investigate");
    setError(null);
    setMessage("");
    try {
      const nextRun = await runPreparedEntityRequirementAgent(reviewCase.id);
      const nextReport = reportFromRun(nextRun);
      setRun(nextRun);
      if (nextReport) setInvestigation(nextReport);
      if (nextRun.status === "blocked_by_policy" && nextReport) {
        setError("blocked_by_policy");
        setMessage("La investigación ha terminado. Existen requisitos demostrados que pueden aplicarse de forma controlada.");
      } else if (!nextReport) setError("investigation_failed");
      else setMessage("Investigación completada sin modificar el caso.");
    } catch {
      setError("investigation_failed");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  function apply(): void {
    if (busyRef.current || !proposed.length || !canApply) return;
    const changes = proposed.map(({ item, entry }) => `${entityName(item)}: ${Object.keys(entry.proposedDraftPatch ?? {}).join(", ")}`).join("\n");
    if (!window.confirm(`Se modificarán únicamente estos campos demostrados:\n${changes}\n\nNo se crearán documentos, no se guardará borrador y no se reanudará el flujo. ¿Continuar?`)) return;
    busyRef.current = true;
    setBusy("apply");
    setError(null);
    try {
      const next = applyPreparedEntityEnrichment(reviewCase.id);
      setInspection(next);
      setMessage("Requisitos demostrados aplicados al store. No se creó ninguna entidad ni se reanudó el flujo.");
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch {
      setError(reviewCase.status === "stale" ? "stale_case" : "enrichment_failed");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  function revalidate(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("revalidate");
    setError(null);
    try {
      const next = inspectPreparedEntityRequirements(reviewCase.id);
      setInspection(next);
      setMessage(next.status === "ready" ? "La entidad satisface los requisitos y está disponible para la materialización manual." : `Revalidación terminada: ${next.items.reduce((sum, item) => sum + item.missing.length, 0)} requisito(s) pendiente(s).`);
    } catch {
      setError("revalidation_failed");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  const globalStatus = historical?.items.some((item) => item.conclusions.some((entry) => entry.status === "schema_change_recommended")) ? "Posible problema de schema" : historical?.items.some((item) => item.conclusions.some((entry) => entry.status === "schema_policy_required")) ? "Bloqueado por política" : metrics.pending === 0 ? "Válido" : metrics.satisfied > 0 ? "Parcialmente resuelto" : "Pendiente";
  return (
    <>
      <section className="review-subsection schema-requirements-panel" aria-labelledby={`schema-requirements-title-${reviewCase.id}`}>
        <div className="review-row review-row-wrap">
          <div>
            <p className="review-kicker">REQUISITOS DEL SCHEMA</p>
            <h4 className="review-subtitle" id={`schema-requirements-title-${reviewCase.id}`} ref={headingRef} tabIndex={-1}>
              Adquisición de requisitos obligatorios
            </h4>
          </div>
          <span className="review-mode-label">{readOnly ? "SOLO LECTURA" : globalStatus}</span>
        </div>
        <div className="schema-requirements-metrics" aria-label="Resumen de requisitos">
          <span>
            <strong>{metrics.entities}</strong> entidades preparadas
          </span>
          <span>
            <strong>{metrics.total}</strong> requisitos
          </span>
          <span>
            <strong>{metrics.satisfied}</strong> satisfechos
          </span>
          <span>
            <strong>{metrics.pending}</strong> pendientes
          </span>
          <span>
            <strong>{metrics.blocking}</strong> bloqueantes
          </span>
        </div>
        {readOnly ? <p className="review-readonly-message">El caso está {reviewCase.status}; los requisitos permanecen visibles en modo solo lectura.</p> : null}
        <div className="schema-requirements-actions">
          <button className="review-button" type="button" disabled={Boolean(busy)} onClick={investigate}>
            {busy === "investigate" ? "Investigando…" : "Investigar requisitos obligatorios"}
          </button>
          {proposed.length > 0 && canApply ? (
            <button className="review-button review-button-secondary" type="button" disabled={Boolean(busy)} onClick={apply}>
              {busy === "apply" ? "Aplicando…" : "Aplicar requisitos demostrados"}
            </button>
          ) : null}
          <button className="review-button review-button-secondary" type="button" disabled={Boolean(busy)} onClick={revalidate}>
            {busy === "revalidate" ? "Validando…" : "Volver a validar entidad"}
          </button>
        </div>
        <p className={error ? "review-readonly-message" : "review-feedback"} role="status" aria-live="polite">
          {message || (error ? errorMessage(error) : "La inspección local no modifica el caso.")}
        </p>
        <button className="review-disclosure" type="button" aria-expanded={expanded} aria-controls={`schema-requirements-content-${reviewCase.id}`} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Ocultar requisitos" : "Mostrar requisitos"}
        </button>
        {expanded ? (
          <div id={`schema-requirements-content-${reviewCase.id}`} className="schema-requirements-entities">
            {(display?.items ?? []).map((item) => (
              <EntityCard key={item.issueId} item={item} historical={historical?.items.find((candidate) => candidate.issueId === item.issueId)} />
            ))}
          </div>
        ) : null}
        {run ? (
          <details className="schema-requirements-technical">
            <summary>Detalles técnicos del agente</summary>
            <p>Estado: {run.status}</p>
            <p>Outcomes satisfechos: {run.satisfiedOutcomes.join(", ") || "ninguno"}</p>
            <p>Outcomes pendientes: {run.unresolvedOutcomes.join(", ") || "ninguno"}</p>
            {run.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </details>
        ) : null}
      </section>
      <SchemaEvolutionPanel result={schemaEvolution} />
    </>
  );
}

function EntityCard({ item, historical }: { item: PreparedEntityRequirementItem; historical?: PreparedEntityRequirementItem }): ReactElement {
  const conclusions = new Map(historical?.conclusions.map((entry) => [entry.requirementId, entry]) ?? []);
  const hasSchemaProblem = [...conclusions.values()].some((entry) => entry.status === "schema_change_recommended");
  const state = item.validAfterEnrichment ? "VÁLIDA" : hasSchemaProblem ? "PROBLEMA DE SCHEMA" : "BLOQUEADA";
  return (
    <article className="schema-requirements-entity">
      <header>
        <div>
          <h5>{entityName(item)}</h5>
          <p>
            {item.entityType} · <span className="schema-requirements-id">{identityKey(item)}</span>
          </p>
        </div>
        <span className="review-badge">{state}</span>
      </header>
      <div className="schema-requirements-list">
        {item.requirements.map((requirement) => {
          const applied = hasValue(item.draft, requirement);
          const conclusion = conclusions.get(requirement.id);
          const label = applied ? "APLICADO" : conclusion ? conclusionLabel(conclusion.status) : "REQUISITO PENDIENTE";
          return (
            <details key={requirement.id} open={!applied}>
              <summary>
                {requirement.label} · {label}
              </summary>
              <dl className="review-definition-grid">
                <dt>Campo</dt>
                <dd>{requirement.field}</dd>
                <dt>Tipo</dt>
                <dd>{requirement.requirementType}</dd>
                <dt>Origen</dt>
                <dd>{requirement.source}</dd>
                <dt>Significado editorial</dt>
                <dd>{requirement.semanticRole ?? "No documentado"}</dd>
                {conclusion ? (
                  <>
                    <dt>Confianza</dt>
                    <dd>{Math.round(conclusion.confidence * 100)} %</dd>
                    <dt>Conclusión</dt>
                    <dd>{conclusion.reasoningSummary}</dd>
                  </>
                ) : null}
              </dl>
              {conclusion?.proposedReference ? (
                <p>
                  <strong>{conclusion.proposedReference.label ?? "Referencia"}</strong>
                  <br />
                  <span className="schema-requirements-id">ID: {conclusion.proposedReference.entityId}</span>
                </p>
              ) : null}
              {conclusion?.evidence.length ? (
                <details>
                  <summary>Evidencia ({conclusion.evidence.length})</summary>
                  <ul className="review-plain-list">{conclusion.evidence.flatMap((proof) => proof.reasons.map((reason) => <li key={`${proof.id}:${reason}`}>{reason}</li>))}</ul>
                </details>
              ) : null}
              {conclusion?.schemaRecommendation ? (
                <details>
                  <summary>Recomendación: {conclusion.schemaRecommendation.type}</summary>
                  <p>{conclusion.schemaRecommendation.reason}</p>
                  <p>{conclusion.schemaRecommendation.alternative}</p>
                </details>
              ) : null}
              {conclusion?.warnings.map((warning) => (
                <p key={warning} className="review-readonly-message">
                  {warning}
                </p>
              ))}
            </details>
          );
        })}
      </div>
      {item.blockingReasons.length ? <p className="review-readonly-message">Bloqueo: {item.blockingReasons.join(" ")}</p> : <p className="review-feedback">Todos los requisitos están satisfechos.</p>}
    </article>
  );
}
