import {getEditorialCapability} from "./capabilityRegistry";
import {evaluateCapabilityPolicy} from "./policy";
import type {EditorialAgentArtifact, EditorialAgentFact, EditorialAgentPlan, EditorialAgentPolicy} from "./types";
import {validateCapabilityResult} from "./validateCapabilityResult";

export type EditorialAgentExecution = {facts: EditorialAgentFact[]; artifacts: EditorialAgentArtifact[]; satisfiedOutcomes: string[]; blocked: boolean; failed: boolean; warnings: string[]};

export async function executeEditorialAgentPlan(plan: EditorialAgentPlan, policy: EditorialAgentPolicy, initialFacts: EditorialAgentFact[], now: () => string): Promise<EditorialAgentExecution> {
  const facts = [...initialFacts];
  const artifacts: EditorialAgentArtifact[] = [];
  const satisfied = new Set(facts.map((fact) => fact.key));
  const executions = new Map<string, number>();
  const warnings: string[] = [];
  const runStarted = Date.now();
  let blocked = false;
  let failed = false;

  for (const step of plan.steps.slice(0, policy.maximumSteps)) {
    if (Date.now() - runStarted >= policy.maximumDurationMs) { warnings.push("Se agotó el tiempo máximo de la ejecución."); failed = true; break; }
    const capability = getEditorialCapability(step.capabilityId);
    if (!capability || capability.manifest.version !== step.capabilityVersion) { warnings.push(`Capacidad ausente o con versión distinta: ${step.capabilityId}.`); failed = true; break; }
    const policyDecision = evaluateCapabilityPolicy(capability.manifest.effects, capability.manifest.risk, policy);
    if (!policyDecision.allowed) { warnings.push(...policyDecision.reasons.map((reason) => `${step.capabilityId}: ${reason}`)); blocked = true; break; }
    if (!capability.manifest.requires.every((requirement) => satisfied.has(requirement))) { warnings.push(`Precondiciones no satisfechas para ${step.capabilityId}.`); failed = true; break; }
    const count = executions.get(step.capabilityId) ?? 0;
    if (count >= capability.manifest.maxExecutionsPerRun) { warnings.push(`Límite de ejecuciones alcanzado para ${step.capabilityId}.`); failed = true; break; }
    executions.set(step.capabilityId, count + 1);
    const startedAt = now();
    const controller = new AbortController();
    const timeoutMs = Math.min(capability.manifest.timeoutMs, Math.max(1, policy.maximumDurationMs - (Date.now() - runStarted)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("capability_timeout")); }, timeoutMs); });
      const result = await Promise.race([capability.execute({goal: plan.goal, facts: [...facts], artifacts: [...artifacts], now: startedAt, signal: controller.signal}), timeout]);
      if (timer) clearTimeout(timer);
      const validation = validateCapabilityResult(result);
      const undeclaredOutcomes = result.producedOutcomes.filter((outcome) => !capability.manifest.provides.includes(outcome));
      if (undeclaredOutcomes.length) validation.errors.push(`Resultados no declarados por el manifiesto: ${undeclaredOutcomes.join(", ")}.`);
      validation.valid = validation.errors.length === 0;
      if (!validation.valid) {
        artifacts.push({stepId: step.id, capabilityId: step.capabilityId, status: "failed", producedOutcomes: [], reasoningSummary: "El resultado fue rechazado por la validación del kernel.", evidence: [], warnings: validation.errors, error: {code: "invalid_capability_result", message: validation.errors.join(" ")}, startedAt, completedAt: now()});
        warnings.push(...validation.errors);
        failed = true;
        break;
      }
      facts.push(...result.facts);
      result.producedOutcomes.forEach((outcome) => satisfied.add(outcome));
      artifacts.push({stepId: step.id, capabilityId: step.capabilityId, status: result.status, producedOutcomes: [...result.producedOutcomes], data: result.artifact, reasoningSummary: result.reasoningSummary, evidence: result.evidence, warnings: result.warnings, error: result.error, startedAt, completedAt: now()});
      warnings.push(...result.warnings);
      if (result.status === "failed") { failed = true; break; }
    } catch (error) {
      if (timer) clearTimeout(timer);
      const code = error instanceof Error && error.message === "capability_timeout" ? "capability_timeout" : "capability_failed";
      artifacts.push({stepId: step.id, capabilityId: step.capabilityId, status: "failed", producedOutcomes: [], reasoningSummary: "La capacidad falló de forma controlada.", evidence: [], warnings: [], error: {code, message: code === "capability_timeout" ? `La capacidad superó ${timeoutMs} ms.` : "La capacidad lanzó un error controlado."}, startedAt, completedAt: now()});
      failed = true;
      break;
    }
  }
  return {facts, artifacts, satisfiedOutcomes: [...satisfied].sort(), blocked, failed, warnings: [...new Set(warnings)]};
}
