import { buildDependencyGraph } from "./buildDependencyGraph";
import { inspectSourceFile } from "./inspectSourceFile";
import type { LaboratoryAuditRequest, LaboratoryDependencyAuditResult, LaboratorySourceFile } from "./types";
import { validateDependencyGraph } from "./validateDependencyGraph";

export function auditLaboratorySources(request: LaboratoryAuditRequest, sources: LaboratorySourceFile[]): LaboratoryDependencyAuditResult {
  const field = request.field.trim();
  const generatedAt = request.generatedAt ?? new Date().toISOString();
  if (!field) {
    const graph = buildDependencyGraph("", [], [], sources.length, generatedAt);
    return { status: "invalid_request", graph, errors: ["field_required"] };
  }
  const aliases = [...new Set((request.aliases ?? []).map((value) => value.trim()).filter((value) => value && value !== field))];
  const findings = sources.flatMap((source) => inspectSourceFile({ field, aliases }, source));
  const graph = buildDependencyGraph(field, aliases, findings, sources.length, generatedAt);
  const validation = validateDependencyGraph(graph);
  return { status: validation.valid ? (findings.length ? "completed" : "no_findings") : "invalid_request", graph, errors: validation.errors };
}
