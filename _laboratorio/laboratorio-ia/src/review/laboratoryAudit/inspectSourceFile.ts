import { classifyAuditAreas } from "./classifyAuditArea";
import { extractSourceSymbol } from "./extractSourceSymbol";
import type { AuditConfidence, DependencyUseType, LaboratoryAuditRequest, LaboratoryDependencyFinding, LaboratorySourceFile } from "./types";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hash = (value: string): string => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
};
const stable = (value: string): string => `${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54)}-${hash(value)}`;
const classifyUse = (line: string, token: string): DependencyUseType => {
  if (line.includes("<") && new RegExp(`<[^>]+[^>]*\\b${escapeRegExp(token)}\\s*=|\\{[^}]*${escapeRegExp(token)}[^}]*\\}`).test(line)) return "render";
  if (/\b(validate|validation|required|missing|invalid|assert|guard|check|has[A-Z]|is[A-Z])\b/i.test(line) || /\b(if|filter|some|every)\s*\(/.test(line)) return "validation";
  if (new RegExp(`(?:\\.|["'])?${escapeRegExp(token)}(?:["'])?\\s*:`).test(line) || new RegExp(`\\b${escapeRegExp(token)}\\s*=`).test(line)) return "write";
  if (/\b(build|map|transform|normalize|serialize|parse|reduce)\b/i.test(line)) return "transformation";
  return "read";
};

export function inspectSourceFile(request: LaboratoryAuditRequest, source: LaboratorySourceFile): LaboratoryDependencyFinding[] {
  const tokens = [...new Set([request.field, ...(request.aliases ?? [])].map((value) => value.trim()).filter(Boolean))].sort((left, right) => right.length - left.length || left.localeCompare(right));
  const lines = source.content.split(/\r?\n/);
  const findings: LaboratoryDependencyFinding[] = [];
  lines.forEach((line, lineIndex) => {
    for (const token of tokens) {
      const exact = new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(token)}([^A-Za-z0-9_$]|$)`, "i");
      const match = exact.exec(line);
      if (!match) continue;
      const column = match.index + match[1].length + 1;
      const symbol = extractSourceSymbol(lines, lineIndex);
      const areas = classifyAuditAreas(source.path, line, symbol);
      const confidence: AuditConfidence = token === request.field && line.includes(token) ? "high" : token === request.field ? "medium" : "medium";
      const useType = classifyUse(line, token);
      for (const area of areas) {
        findings.push({
          id: `finding:${stable(`${source.path}:${lineIndex + 1}:${column}:${area}:${token}`)}`,
          field: request.field,
          matchedToken: token,
          area,
          file: source.path,
          symbol,
          line: lineIndex + 1,
          column,
          useType,
          confidence,
          evidence: line.trim().slice(0, 300),
          justification: `${token === request.field ? "Coincidencia directa" : "Alias declarado"} del campo en ${area}; uso clasificado como ${useType}.`,
        });
      }
    }
  });
  return findings;
}
