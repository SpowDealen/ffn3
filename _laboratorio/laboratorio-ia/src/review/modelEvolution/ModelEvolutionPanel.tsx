import type { ReactElement } from "react";
import type { EvolutionAlternativeSimulation, EvolutionImpactFinding, ModelEvolutionResult } from "./types";

const AREA_LABELS: Record<EvolutionImpactFinding["area"], string> = { builders: "Builders", queries: "Consultas", producers: "Productores", review: "Centro de revisión", resume: "Reanudación", materialization: "Materializador", preview: "Preview", sanity_schema: "Schema editorial", existing_documents: "Documentos existentes", public_web: "Web pública", panel_ia: "Panel editorial", laboratory: "Laboratorio" };
const confidenceLabel = { low: "baja", medium: "media", high: "alta" } as const;
const roiLabel = { provisional: "provisional", partially_verified: "parcialmente verificado", verified: "verificado" } as const;

function ExistingDocuments({ alternative }: { alternative: EvolutionAlternativeSimulation }): ReactElement {
  const migration = alternative.migration;
  return (
    <p>
      <strong>Documentos existentes:</strong>{" "}
      {migration.existingDocumentAuditStatus === "not_started"
        ? "pendiente de inventario."
        : migration.affectedExistingDocumentEstimate !== undefined
          ? `${migration.affectedExistingDocumentEstimate} estimado(s); auditoría ${migration.existingDocumentAuditStatus === "complete" ? "completa" : "parcial"}.`
          : `${migration.knownAffectedDocumentIds.length} identificado(s); auditoría parcial.`}
      {migration.preparedEntityCount ? ` Los ${migration.preparedEntityCount} drafts preparados son casos de origen y no se contabilizan como documentos a migrar.` : ""}
    </p>
  );
}

export default function ModelEvolutionPanel({ result }: { result: ModelEvolutionResult | null }): ReactElement | null {
  if (!result || result.status !== "simulations_ready" || !result.simulations.length) return null;
  return (
    <section className="review-subsection model-evolution-panel" aria-labelledby={`model-evolution-title-${result.caseId}`}>
      <div>
        <p className="review-kicker">SIMULACIÓN DE EVOLUCIÓN · SIN CAMBIOS</p>
        <h4 className="review-subtitle" id={`model-evolution-title-${result.caseId}`}>¿Qué ocurriría si se aceptara la propuesta?</h4>
        <p>Estimaciones provisionales separadas por evidencia. No ejecuta schemas, migraciones ni escrituras.</p>
      </div>
      {result.simulations.map((simulation) => (
        <article className="model-evolution-simulation" key={simulation.id}>
          <header><div><h5>{simulation.entityType} · {simulation.field}</h5><p>{simulation.occurrenceCount} incidencia(s) de origen</p></div><span className="review-badge">{simulation.alternatives.length} ALTERNATIVAS</span></header>
          <div className="model-evolution-alternatives">
            {simulation.alternatives.map((alternative) => {
              const recommended = alternative.id === simulation.recommendedSimulationId;
              const confirmed = alternative.impacts.filter((impact) => impact.status === "confirmed");
              const pending = alternative.impacts.filter((impact) => impact.status === "likely" || impact.status === "possible");
              return (
                <section className={recommended ? "model-evolution-alternative model-evolution-recommended" : "model-evolution-alternative"} key={alternative.id}>
                  <header><div><h6>{alternative.title}</h6><small>Recomendación editorial: {alternative.alternativeScore}/100</small></div><span>{recommended ? "RECOMENDADA" : "ALTERNATIVA"}</span></header>
                  <p>{alternative.summary}</p>
                  <div className="model-evolution-metrics" aria-label={`Estimación de ${alternative.title}`}>
                    <span><strong>{alternative.cost.changeCost.totalHours.min}–{alternative.cost.changeCost.totalHours.max} h</strong> coste de cambio provisional</span>
                    <span><strong>{confidenceLabel[alternative.cost.confidence]}</strong> confianza</span>
                    <span><strong>{alternative.risk.technicalRisk}</strong> riesgo técnico</span>
                    <span><strong>{alternative.risk.editorialRiskOfInaction}</strong> riesgo editorial de no actuar</span>
                    <span><strong>{alternative.risk.migrationRisk}</strong> riesgo de migración</span>
                    <span><strong>{alternative.editorialCoverage}/100</strong> cobertura editorial</span>
                    <span><strong>{alternative.roi.score}/100</strong> ROI {roiLabel[alternative.roi.status]}</span>
                  </div>
                  <div className="model-evolution-impact-groups">
                    <section><h6>Impactos confirmados</h6>{confirmed.length ? <ul>{confirmed.map((impact) => <li key={impact.area}><strong>{AREA_LABELS[impact.area]}</strong>: {impact.reason}</li>)}</ul> : <p>Ninguno confirmado todavía.</p>}</section>
                    <section><h6>Pendiente de auditoría</h6>{pending.length ? <ul>{pending.map((impact) => <li key={impact.area}><strong>{AREA_LABELS[impact.area]}</strong>: {impact.reason}</li>)}</ul> : <p>No quedan impactos pendientes.</p>}</section>
                  </div>
                  <ExistingDocuments alternative={alternative} />
                  <details open={recommended}>
                    <summary>Coste, dependencias, pasos y rollback</summary>
                    <h6>Desglose provisional</h6>
                    <ul>
                      <li>Auditoría: {alternative.cost.changeCost.auditHours.min}–{alternative.cost.changeCost.auditHours.max} h</li>
                      <li>Implementación: {alternative.cost.changeCost.implementationHours.min}–{alternative.cost.changeCost.implementationHours.max} h</li>
                      <li>Migración: {alternative.cost.changeCost.migrationHours.min}–{alternative.cost.changeCost.migrationHours.max} h</li>
                      <li>Validación: {alternative.cost.changeCost.validationHours.min}–{alternative.cost.changeCost.validationHours.max} h</li>
                    </ul>
                    <h6>Coste de mantener la situación</h6>
                    {alternative.cost.ongoingCost.length ? <ul>{alternative.cost.ongoingCost.map((cost) => <li key={cost.type}><strong>{cost.type.replace(/_/g, " ")}</strong> · riesgo {cost.severity}. {cost.description}</li>)}</ul> : <p>La alternativa pretende resolver el coste editorial recurrente diagnosticado.</p>}
                    <h6>Dependencias</h6><ul>{alternative.dependencies.map((dependency) => <li key={dependency.id}><strong>{dependency.label}</strong> · {dependency.status === "needs_verification" ? "por verificar" : dependency.status === "satisfied" ? "demostrada" : "obligatoria"}. {dependency.reason}</li>)}</ul>
                    <h6>Pasos necesarios</h6><ol>{alternative.steps.map((step) => <li key={step.id}>{step.action} · {step.effort.min}–{step.effort.max} h</li>)}</ol>
                    <h6>Riesgos, migración y rollback</h6><p>Riesgo técnico: {alternative.risk.technicalRisk}. Riesgo migratorio: {alternative.risk.migrationRisk}. Riesgo operativo: {alternative.risk.operationalRisk}. Riesgo editorial de no actuar: {alternative.risk.editorialRiskOfInaction}. Riesgo editorial del cambio: {alternative.risk.editorialChangeRisk}.</p><p>{alternative.migration.strategy}</p><p><strong>{alternative.rollbackPossible ? "Rollback posible" : "Rollback no garantizado"}:</strong> {alternative.rollbackPlan}</p>
                    <h6>Supuestos e incógnitas</h6><p><strong>Supuestos:</strong> {alternative.cost.assumptions.join(" ")}</p><p><strong>Incógnitas:</strong> {alternative.cost.unknowns.join(" ") || "Ninguna dentro del alcance auditado."}</p>
                    <h6>Beneficios e inconvenientes</h6><p><strong>Beneficios:</strong> {alternative.consequences.benefits.join(" ") || "Sin beneficio adicional demostrado."}</p><p><strong>Inconvenientes:</strong> {alternative.consequences.drawbacks.join(" ") || "Sin inconvenientes adicionales detectados."}</p>
                  </details>
                </section>
              );
            })}
          </div>
          <p className="review-readonly-message">La recomendación procede de 4D5. Esta simulación únicamente calibra consecuencias y requiere decisión humana.</p>
        </article>
      ))}
    </section>
  );
}
