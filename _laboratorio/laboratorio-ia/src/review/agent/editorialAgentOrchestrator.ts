import {buildEditorialAgentPlan} from "./buildEditorialAgentPlan";
import {executeEditorialAgentPlan} from "./executeEditorialAgentPlan";
import {buildEditorialAgentPolicy} from "./policy";
import type {EditorialAgentGoal, EditorialAgentRun, EditorialAgentRunOptions} from "./types";

export async function runEditorialAgent(goal: EditorialAgentGoal, options: EditorialAgentRunOptions = {}): Promise<EditorialAgentRun> {
  const now = options.now ?? (() => new Date().toISOString());
  const generatedAt = now();
  const policy = buildEditorialAgentPolicy(options.policy);
  const initialFacts = options.initialFacts ?? [];
  const plan = buildEditorialAgentPlan(goal, initialFacts, generatedAt);
  const execution = await executeEditorialAgentPlan(plan, policy, initialFacts, now);
  const unresolvedOutcomes = [...new Set([...plan.unresolvedOutcomes, ...goal.requiredOutcomes.filter((outcome) => !execution.satisfiedOutcomes.includes(outcome))])].sort();
  const status = execution.blocked ? "blocked_by_policy" : execution.failed ? "failed" : unresolvedOutcomes.length ? "needs_capability" : "completed";
  return {runId: `run:${goal.id}:${generatedAt}`, status, goal, plan, facts: execution.facts, artifacts: execution.artifacts, satisfiedOutcomes: execution.satisfiedOutcomes, unresolvedOutcomes, policy, reasoningSummary: status === "completed" ? "El plan completó todos los resultados requeridos con capacidades autorizadas y trazables." : `La ejecución terminó como ${status}; quedan ${unresolvedOutcomes.length} resultados pendientes.`, warnings: execution.warnings, generatedAt, completedAt: now()};
}
