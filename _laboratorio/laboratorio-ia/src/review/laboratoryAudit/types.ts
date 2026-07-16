export type LaboratoryAuditArea = "builders" | "queries" | "producers" | "materialization" | "preview" | "resume" | "review" | "panel_ia" | "laboratory" | "public_web";
export type DependencyUseType = "read" | "write" | "validation" | "transformation" | "render";
export type AuditConfidence = "low" | "medium" | "high";

export type LaboratorySourceFile = {
  path: string;
  content: string;
};

export type LaboratoryAuditRequest = {
  field: string;
  aliases?: string[];
  generatedAt?: string;
};

export type LaboratoryDependencyFinding = {
  id: string;
  field: string;
  matchedToken: string;
  area: LaboratoryAuditArea;
  file: string;
  symbol: string;
  line: number;
  column: number;
  useType: DependencyUseType;
  confidence: AuditConfidence;
  evidence: string;
  justification: string;
};

export type LaboratoryDependencyNode =
  | { id: string; kind: "field"; label: string }
  | { id: string; kind: "consumer"; label: string; area: LaboratoryAuditArea; file: string; symbol: string };

export type LaboratoryDependencyEdge = {
  id: string;
  from: string;
  to: string;
  relation: "consumed_by";
  findingIds: string[];
  useTypes: DependencyUseType[];
  confidence: AuditConfidence;
};

export type LaboratoryDependencyGraph = {
  version: 1;
  field: string;
  aliases: string[];
  generatedAt: string;
  sourceFileCount: number;
  findings: LaboratoryDependencyFinding[];
  nodes: LaboratoryDependencyNode[];
  edges: LaboratoryDependencyEdge[];
  areas: Record<LaboratoryAuditArea, { findingCount: number; consumerCount: number; confidence: AuditConfidence | "none" }>;
  warnings: string[];
};

export type LaboratoryDependencyAuditResult = {
  status: "completed" | "invalid_request" | "no_findings";
  graph: LaboratoryDependencyGraph;
  errors: string[];
};
