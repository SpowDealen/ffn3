import {isSerializableReviewValue} from "../cases/validateResolution";
import type {EditorialCapabilityResult} from "./types";

const SENSITIVE = /(token|secret|authorization|cookie|password|api[_-]?key|headers?)/i;
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);

function unsafeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(unsafeKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => SENSITIVE.test(key) || DANGEROUS.has(key) || unsafeKey(child));
}

export function validateCapabilityResult(result: EditorialCapabilityResult): {valid: boolean; errors: string[]} {
  const errors: string[] = [];
  if (!isSerializableReviewValue(result)) errors.push("El resultado no es JSON serializable.");
  if (unsafeKey(result)) errors.push("El resultado contiene claves sensibles o peligrosas.");
  if (!result.reasoningSummary.trim()) errors.push("Falta un resumen de razonamiento auditable.");
  if (result.status === "completed" && !result.producedOutcomes.length) errors.push("Una capacidad completada debe declarar resultados producidos.");
  if (result.facts.some((fact) => !Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1)) errors.push("Existe una confianza fuera del intervalo 0..1.");
  return {valid: errors.length === 0, errors};
}
