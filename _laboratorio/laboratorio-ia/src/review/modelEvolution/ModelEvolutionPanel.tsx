import type { ReactElement } from "react";
import type { ModelEvolutionResult } from "./types";

export default function ModelEvolutionPanel({ result }: { result: ModelEvolutionResult | null }): ReactElement | null {
  if (!result || result.status !== "simulations_ready" || !result.simulations.length) return null;
  return (
    <section className="review-subsection model-evolution-panel" aria-labelledby={`model-evolution-title-${result.caseId}`}>
      <div>
        <p className="review-kicker">SIMULACIÓN DE EVOLUCIÓN · SIN CAMBIOS</p>
        <h4 className="review-subtitle" id={`model-evolution-title-${result.caseId}`}>¿Qué ocurriría si se aceptara la propuesta?</h4>
        <p>Comparación estimada de todas las alternativas. No ejecuta schemas, migraciones ni escrituras.</p>
      </div>
      {result.simulations.map((simulation) => (
        <article className="model-evolution-simulation" key={simulation.id}>
          <header>
            <div><h5>{simulation.entityType} · {simulation.field}</h5><p>{simulation.occurrenceCount} incidencia(s) consolidada(s)</p></div>
            <span className="review-badge">{simulation.alternatives.length} ALTERNATIVAS</span>
          </header>
          <div className="model-evolution-alternatives">
            {simulation.alternatives.map((alternative) => {
              const recommended = alternative.id === simulation.recommendedSimulationId;
              return (
                <section className={recommended ? "model-evolution-alternative model-evolution-recommended" : "model-evolution-alternative"} key={alternative.id}>
                  <header><h6>{alternative.title}</h6><span>{recommended ? "RECOMENDADA" : `ROI ${alternative.roi}/100`}</span></header>
                  <p>{alternative.summary}</p>
                  <div className="model-evolution-metrics" aria-label={`Estimación de ${alternative.title}`}>
                    <span><strong>{alternative.cost.estimatedHours} h</strong> coste estimado</span>
                    <span><strong>{alternative.cost.complexity}</strong> complejidad</span>
                    <span><strong>{alternative.risk.level}</strong> riesgo ({alternative.risk.score}/100)</span>
                    <span><strong>{alternative.roi}/100</strong> ROI</span>
                    <span><strong>{alternative.priority}</strong> prioridad</span>
                  </div>
                  <details open={recommended}>
                    <summary>Impacto, pasos y rollback</summary>
                    <h6>Áreas afectadas</h6>
                    <ul>{alternative.impacts.filter((impact) => impact.affected).map((impact) => <li key={impact.area}><strong>{impact.area}</strong>: {impact.reason}</li>)}</ul>
                    <h6>Pasos necesarios</h6>
                    <ol>{alternative.steps.map((step) => <li key={step.id}>{step.action} · {step.estimatedHours} h</li>)}</ol>
                    <h6>Migración y rollback</h6>
                    <p>{alternative.migration.strategy} {alternative.migration.estimatedDocuments ? `Impacto estimado: ${alternative.migration.estimatedDocuments} documento(s).` : ""}</p>
                    <p><strong>{alternative.rollbackPossible ? "Rollback posible" : "Rollback no garantizado"}:</strong> {alternative.rollbackPlan}</p>
                    <h6>Beneficios e inconvenientes</h6>
                    <p><strong>Beneficios:</strong> {alternative.consequences.benefits.join(" ") || "Sin beneficio adicional demostrado."}</p>
                    <p><strong>Inconvenientes:</strong> {alternative.consequences.drawbacks.join(" ") || "Sin inconvenientes adicionales detectados."}</p>
                    <p><strong>Deuda técnica eliminada:</strong> {alternative.consequences.technicalDebtRemoved.join(" ") || "No elimina deuda técnica detectada."}</p>
                    <p><strong>Dependencias:</strong> {alternative.dependencies.join(", ") || "Ninguna dependencia adicional."}</p>
                  </details>
                </section>
              );
            })}
          </div>
          <p className="review-readonly-message">La comparación es diagnóstica. Requiere auditoría y decisión humana antes de cualquier cambio.</p>
        </article>
      ))}
    </section>
  );
}
