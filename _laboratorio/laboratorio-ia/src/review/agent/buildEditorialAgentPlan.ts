import {listEditorialCapabilities} from "./capabilityRegistry";
import type {EditorialAgentFact, EditorialAgentGoal, EditorialAgentPlan, EditorialAgentPlanStep, EditorialCapabilityAdapter} from "./types";

export function buildEditorialAgentPlan(goal: EditorialAgentGoal, facts: EditorialAgentFact[] = [], generatedAt = new Date().toISOString()): EditorialAgentPlan {
  const available = listEditorialCapabilities().filter((capability) => capability.supports(goal, facts));
  let selected = new Map<string, EditorialCapabilityAdapter>();
  const unresolved = new Set<string>();
  const factKeys = new Set(facts.map((fact) => fact.key));

  function resolveOutcome(outcome: string, chosen: Map<string, EditorialCapabilityAdapter>, visiting: Set<string>): Map<string, EditorialCapabilityAdapter> | null {
    if (factKeys.has(outcome) || [...chosen.values()].some((capability) => capability.manifest.provides.includes(outcome))) return chosen;
    if (visiting.has(outcome)) return null;
    const nextVisiting = new Set(visiting).add(outcome);
    const candidates = available.filter((capability) => capability.manifest.provides.includes(outcome));
    for (const capability of candidates) {
      let branch = new Map(chosen).set(capability.manifest.id, capability);
      let valid = true;
      for (const requirement of capability.manifest.requires) {
        const resolved = resolveOutcome(requirement, branch, nextVisiting);
        if (!resolved) { valid = false; break; }
        branch = resolved;
      }
      if (valid) return branch;
    }
    return null;
  }

  for (const outcome of goal.requiredOutcomes) {
    const resolved = resolveOutcome(outcome, selected, new Set());
    if (resolved) selected = resolved;
    else unresolved.add(outcome);
  }
  const ordered: EditorialCapabilityAdapter[] = [];
  const pending = new Set(selected.keys());
  while (pending.size) {
    const next = [...pending].map((id) => selected.get(id)!).find((capability) => capability.manifest.requires.every((requirement) => factKeys.has(requirement) || ordered.some((item) => item.manifest.provides.includes(requirement))));
    if (!next) break;
    ordered.push(next);
    next.manifest.provides.forEach((outcome) => factKeys.add(outcome));
    pending.delete(next.manifest.id);
  }
  pending.forEach((id) => selected.get(id)?.manifest.provides.forEach((outcome) => unresolved.add(outcome)));
  const steps: EditorialAgentPlanStep[] = ordered.map((capability, index) => ({id: `step-${index + 1}-${capability.manifest.id}`, capabilityId: capability.manifest.id, capabilityVersion: capability.manifest.version, requires: [...capability.manifest.requires], provides: [...capability.manifest.provides], effects: [...capability.manifest.effects], reason: `La capacidad aporta: ${capability.manifest.provides.join(", ")}.`}));
  return {id: `plan:${goal.id}:${generatedAt}`, goal, steps, unresolvedOutcomes: [...unresolved].sort(), generatedAt, version: 1};
}
