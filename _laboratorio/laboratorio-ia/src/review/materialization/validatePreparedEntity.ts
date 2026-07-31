import {isSerializableReviewValue} from "../cases/validateResolution";
import type {ReviewJsonObject} from "../types";
import type {PreparedEntityDraft, ValidatedPreparedEntity} from "./types";

const ALLOWED = new Set(["entityType", "name", "aliases", "externalIdentifiers", "disciplineId", "organizationIds", "sourceEvidence", "identityKey", "unknownFields"]);
const INTERNAL = new Set(["entityType", "sourceEvidence", "identityKey", "unknownFields"]);
const SENSITIVE = /(token|secret|authorization|cookie|password|api[_-]?key|headers?)/i;
const DANGEROUS = new Set(["__proto__", "prototype", "constructor"]);
const slug = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
function unsafe(value: unknown): boolean { return Boolean(value && typeof value === "object" && Object.entries(value).some(([key, child]) => SENSITIVE.test(key) || DANGEROUS.has(key) || unsafe(child))); }
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];

export function validatePreparedEntity(input: PreparedEntityDraft): {valid: boolean; entity?: ValidatedPreparedEntity; errors: string[]} {
  const errors: string[] = [];
  const draft = input.draft;
  if (!isSerializableReviewValue(draft)) errors.push("El draft no es JSON serializable.");
  if (unsafe(draft)) errors.push("El draft contiene claves sensibles o peligrosas.");
  if (input.entityType !== "fighter" || draft.entityType !== "fighter") errors.push("Solo se admite entityType fighter en esta fase.");
  const unknown = Object.keys(draft).filter((key) => !ALLOWED.has(key));
  if (unknown.length) errors.push(`Campos no permitidos: ${unknown.join(", ")}.`);
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  if (name.length < 2 || name.length > 120) errors.push("El nombre debe tener entre 2 y 120 caracteres.");
  const identityKey = typeof draft.identityKey === "string" ? draft.identityKey.trim() : "";
  if (identityKey !== `fighter:${slug(name)}`) errors.push("identityKey no es estable para el nombre.");
  const evidence = Array.isArray(draft.sourceEvidence) ? draft.sourceEvidence.filter((item): item is ReviewJsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  if (!evidence.length) errors.push("Falta evidencia de origen.");
  const disciplineId = typeof draft.disciplineId === "string" ? draft.disciplineId.trim() : "";
  const organizationIds = strings(draft.organizationIds);
  if (!disciplineId) errors.push("El schema luchador exige disciplineId demostrado.");
  if (organizationIds.length !== 1) errors.push("El schema luchador exige exactamente una organización demostrada.");
  if (errors.length) return {valid: false, errors};
  const aliases = strings(draft.aliases).slice(0, 20);
  const sanityPayload: ReviewJsonObject = {_type: "luchador", nombre: name, slug: {_type: "slug", current: slug(name)}, disciplina: {_type: "reference", _ref: disciplineId}, organizacion: {_type: "reference", _ref: organizationIds[0]}, activo: true, destacadoHome: false};
  return {valid: true, errors: [], entity: {issueId: input.issueId, entityType: "fighter", identityKey, name, aliases, disciplineId, sanityPayload, omittedFields: [...INTERNAL].filter((key) => key in draft), evidence}};
}
