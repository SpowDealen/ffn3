import type { LaboratoryAuditArea } from "./types";

const unique = <T,>(values: T[]): T[] => [...new Set(values)];

export function classifyAuditAreas(path: string, line: string, symbol: string): LaboratoryAuditArea[] {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const value = `${line} ${symbol}`.toLowerCase();
  const areas: LaboratoryAuditArea[] = [];
  if (normalized.includes("/builders/") || /\bbuild[a-z0-9_]*/i.test(symbol)) areas.push("builders");
  if (/\*\[|\.fetch\s*[<(]|\bgroq\b/i.test(line) || normalized.includes("/queries/")) areas.push("queries");
  if (normalized.includes("/review/producers/") || normalized.includes("/api/sources/") || /producer/i.test(value)) areas.push("producers");
  if (normalized.includes("/materialization/") || /materializ/i.test(value)) areas.push("materialization");
  if (normalized.includes("preview") || /preview/i.test(value)) areas.push("preview");
  if (normalized.includes("/resume/") || /\bresume|reanud/i.test(value)) areas.push("resume");
  if (normalized.includes("/review/") || /reviewcase|reviewcenter|review/i.test(value)) areas.push("review");
  if (normalized.endsWith("/components/panelia.tsx") || normalized.includes("/panel-ia-off/") || /panelia/i.test(symbol)) areas.push("panel_ia");
  if (normalized.includes("_laboratorio/laboratorio-ia/")) areas.push("laboratory");
  if ((/\/(app|pages)\//.test(normalized) || /^(app|pages)\//.test(normalized)) && !normalized.includes("/api/") && !normalized.startsWith("app/api/")) areas.push("public_web");
  return unique(areas);
}
