import type { AlternativeSimulationContext, EditorialConsequences } from "./types";

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

export function simulateEditorialConsequences({ proposal, alternative }: AlternativeSimulationContext): EditorialConsequences {
  const resolvesConstraint = alternative.type !== "keep_current" && alternative.type !== "fallback_policy";
  return {
    benefits: unique([...alternative.benefits, ...(resolvesConstraint ? proposal.benefits : [])]),
    drawbacks: unique([...alternative.risks, ...(alternative.type === "keep_current" ? ["La restricción editorial detectada permanecería activa."] : [])]),
    technicalDebtRemoved: resolvesConstraint ? [`Acoplamiento entre ${proposal.field} y un significado editorial que no siempre corresponde.`] : [],
    editorialChanges: resolvesConstraint ? [`Los editores distinguirían explícitamente el significado de ${proposal.field}.`] : ["El flujo editorial seguiría aplicando la política actual."],
  };
}
