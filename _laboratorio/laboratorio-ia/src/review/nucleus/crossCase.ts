import {readKnowledgeCenterSnapshot, buildKnowledgeCenterViewModel} from "../knowledge";
import type {ReviewCase, ReviewIssue, ReviewJsonValue} from "../types";
import {computeUniversalFingerprint} from "../universal";
import {CROSS_CASE_INTELLIGENCE_VERSION, type BuildCrossCaseGraphInput, type CrossCaseEdge, type CrossCaseEvidence, type CrossCaseEvidenceKind, type CrossCaseGraph, type CrossCaseGroup, type CrossCaseNode, type CrossCaseRank, type CrossCaseRelation, type CrossCaseRelationKind} from "./crossCaseTypes";

type Signal = Readonly<{kind: CrossCaseEvidenceKind; key: string; authority: CrossCaseEvidence["authority"]; fingerprint: string; summary: string}>;
type CaseProjection = Readonly<{reviewCase: ReviewCase; node: CrossCaseNode; signals: readonly Signal[]; dependencyIds: readonly string[]; blockedByIds: readonly string[]; semanticFingerprint: string}>;

const fingerprint = (value: unknown): string => computeUniversalFingerprint(value as ReviewJsonValue);
const unique = (values: readonly string[]): readonly string[] => Object.freeze([...new Set(values.filter(Boolean))].sort());
const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);
const supportedSubjects = new Set(["news", "noticia", "event", "evento", "fighter", "luchador", "organization", "organizacion", "weight_category", "category", "categoria", "fight", "combate", "result", "resultado", "relationship", "discipline", "disciplina", "external_news"]);

function domain(value: string | undefined): CrossCaseEvidenceKind {
  const normalized = (value ?? "entity").trim().toLowerCase().replace(/-/g, "_");
  if (["fighter", "luchador"].includes(normalized)) return "fighter";
  if (["event", "evento"].includes(normalized)) return "event";
  if (["organization", "organizacion", "organisation"].includes(normalized)) return "organization";
  if (["news", "noticia", "external_news"].includes(normalized)) return "news";
  if (["result", "resultado"].includes(normalized)) return "result";
  if (["fight", "combate"].includes(normalized)) return "fight";
  if (["category", "categoria", "weight_category"].includes(normalized)) return "category";
  if (["discipline", "disciplina"].includes(normalized)) return "discipline";
  return "entity";
}

function signal(kind: CrossCaseEvidenceKind, key: string, authority: Signal["authority"], summary: string): Signal | undefined {
  const normalized = key.trim();
  if (!normalized) return undefined;
  return freeze({kind, key: normalized, authority, summary, fingerprint: fingerprint({kind, key: normalized, authority})});
}

function explicitCaseIds(value: unknown): readonly string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return unique(value.filter((entry): entry is string => typeof entry === "string"));
}

function issueCaseIds(issue: ReviewIssue): readonly string[] {
  if (issue.kind !== "blocked_dependency") return [];
  const expected = issue.expected;
  return unique([...(expected ? explicitCaseIds(expected.caseId) : []), ...(expected ? explicitCaseIds(expected.caseIds) : [])]);
}

function project(reviewCase: ReviewCase, evaluatedAt: string): CaseProjection {
  const current = reviewCase.status !== "stale";
  const checkpoint = reviewCase.globalResolution && reviewCase.globalResolution.caseVersion === reviewCase.version ? reviewCase.globalResolution : undefined;
  const signals: Signal[] = [];
  const subjectKey = reviewCase.subject.sanityId ?? reviewCase.subject.id;
  const subjectKind = domain(reviewCase.subject.type);
  if (subjectKey) signals.push(signal(subjectKind, `${subjectKind}:${subjectKey}`, "case", `Misma clave confirmada de ${subjectKind}.`)!);
  if (reviewCase.subject.sourceUrl && subjectKind === "news") signals.push(signal("news", `news-url:${fingerprint(reviewCase.subject.sourceUrl)}`, "case", "Misma fuente canónica de noticia.")!);
  const producer = typeof reviewCase.context.producer === "string" ? reviewCase.context.producer : checkpoint?.producer;
  if (producer) signals.push(signal("producer", producer, "case", "Mismo productor editorial declarado.")!);

  for (const resolution of reviewCase.resolutions) {
    const issue = reviewCase.issues.find((entry) => entry.id === resolution.issueId);
    if (resolution.type === "select_candidate") {
      const candidate = issue?.candidates?.find((entry) => entry.id === resolution.candidateId);
      const key = candidate?.sanityId ?? candidate?.id;
      if (key) {
        const kind = domain(candidate?.entityType ?? issue?.valueKind);
        signals.push(signal(kind, `${kind}:${key}`, "resolution", `Misma identidad seleccionada para ${kind}.`)!);
      }
    } else if (resolution.type === "link_reference") {
      const kind = domain(issue?.valueKind);
      signals.push(signal(kind, `${kind}:${resolution.sanityId}`, "resolution", `Misma referencia enlazada para ${kind}.`)!);
    } else if (resolution.type === "confirm_duplicate") {
      signals.push(signal("dedupe", `duplicate:${resolution.duplicateId}`, "resolution", "Duplicado confirmado por resolución editorial.")!);
    }
  }

  if (checkpoint) {
    signals.push(signal("resolution", checkpoint.planFingerprint, "checkpoint", "Mismo fingerprint de plan resolutivo vigente.")!);
    for (const capability of checkpoint.plan.requiredCapabilities) signals.push(signal("capability", capability, "checkpoint", "Misma capability requerida por el plan vigente.")!);
    for (const operation of checkpoint.plan.operations) {
      const key = operation.target?.entityId ?? operation.target?.identityKey;
      if (key && operation.kind === "reuse_entity") {
        const kind = domain(operation.entityType);
        signals.push(signal(kind, `${kind}:${key}`, "resolution", `Misma entidad reutilizada por AU6.`)!);
      }
    }
    if (checkpoint.transaction) signals.push(signal("transaction", checkpoint.transaction.transactionFingerprint, "transaction", "Misma transacción AU7 recuperada.")!);
  }

  const knowledge = readKnowledgeCenterSnapshot(reviewCase.context);
  if (knowledge) {
    const view = buildKnowledgeCenterViewModel(knowledge, evaluatedAt, [reviewCase.subject.type]);
    if (view.safeToAct) {
      for (const entry of view.entries.filter((candidate) => candidate.actionable)) signals.push(signal("knowledge", `${entry.item.subjectKey}:${entry.item.contentFingerprint}`, "knowledge", "Mismo conocimiento AU9 vigente y gobernado.")!);
      for (const conflict of knowledge.governance.conflicts) signals.push(signal("conflict", conflict.conflictFingerprint, "knowledge", "Mismo conflicto de conocimiento AU9 vigente.")!);
    }
  }

  const dedupeSignal = signal("dedupe", reviewCase.dedupeKey, "case", "Misma clave explícita de deduplicación del caso.");
  if (dedupeSignal) signals.push(dedupeSignal);
  const resolutionSemantics = reviewCase.resolutions.map((entry) => {
    const issue = reviewCase.issues.find((candidate) => candidate.id === entry.issueId);
    if (entry.type === "select_candidate") return {type: entry.type, kind: issue?.valueKind, candidateId: entry.candidateId};
    if (entry.type === "link_reference") return {type: entry.type, kind: issue?.valueKind, sanityId: entry.sanityId};
    if (entry.type === "confirm_duplicate") return {type: entry.type, duplicateId: entry.duplicateId};
    return {type: entry.type, kind: issue?.valueKind};
  });
  if (resolutionSemantics.length) signals.push(signal("resolution", fingerprint(resolutionSemantics), "resolution", "Misma resolución editorial explícita.")!);

  const semanticFingerprint = fingerprint({dedupeKey: reviewCase.dedupeKey, module: reviewCase.module, subject: {type: reviewCase.subject.type, id: reviewCase.subject.id, sanityId: reviewCase.subject.sanityId}, issues: reviewCase.issues.map((entry) => ({kind: entry.kind, valueKind: entry.valueKind, fieldPath: entry.fieldPath, required: entry.required, blocking: entry.blocking})), resolutions: resolutionSemantics});
  signals.push(signal("fingerprint", semanticFingerprint, "case", "Mismo fingerprint semántico del caso.")!);
  const dependencyIds = unique([...explicitCaseIds(reviewCase.context.dependsOnCaseIds), ...reviewCase.issues.flatMap(issueCaseIds)]).filter((id) => id !== reviewCase.id);
  const blockedByIds = unique([...explicitCaseIds(reviewCase.context.blockedByCaseId), ...explicitCaseIds(reviewCase.context.blockedByCaseIds), ...reviewCase.issues.flatMap(issueCaseIds)]).filter((id) => id !== reviewCase.id);
  const nodeFingerprint = fingerprint({caseId: reviewCase.id, caseVersion: reviewCase.version, status: reviewCase.status, priority: reviewCase.priority, subjectType: reviewCase.subject.type, current});
  const node = freeze({caseId: reviewCase.id, caseVersion: reviewCase.version, title: reviewCase.title, status: reviewCase.status, priority: reviewCase.priority, subjectType: reviewCase.subject.type, current, nodeFingerprint});
  return freeze({reviewCase, node, signals: Object.freeze(signals.filter(Boolean).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint))), dependencyIds, blockedByIds, semanticFingerprint});
}

const relationFor = (kind: Signal["kind"]): CrossCaseRelationKind => kind === "event" ? "shared_event" : kind === "organization" ? "shared_organization" : kind === "fighter" ? "shared_fighter" : kind === "news" ? "shared_news" : kind === "resolution" || kind === "capability" || kind === "producer" ? "shared_resolution" : kind === "transaction" ? "shared_transaction" : kind === "knowledge" ? "shared_knowledge" : kind === "conflict" ? "shared_conflict" : kind === "dedupe" || kind === "fingerprint" ? "possible_duplicate_case" : "shared_entity";
const impact: Readonly<Record<CrossCaseRelationKind, number>> = Object.freeze({shared_entity: 14, possible_duplicate_case: 23, shared_event: 18, shared_organization: 16, shared_fighter: 18, shared_news: 17, shared_resolution: 14, shared_transaction: 20, shared_knowledge: 13, shared_conflict: 22, dependency_chain: 24, merge_candidate: 23, blocked_by_other_case: 25});
const riskScore = (cases: readonly ReviewCase[]): number => Math.max(...cases.map((entry) => entry.priority === "critical" ? 10 : entry.priority === "high" ? 8 : entry.priority === "normal" ? 5 : 2), 0);
const temporalScore = (cases: readonly ReviewCase[]): number => {
  const times = cases.map((entry) => Date.parse(entry.updatedAt)).filter(Number.isFinite);
  if (times.length < 2) return 0;
  const days = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  return days <= 1 ? 15 : days <= 7 ? 12 : days <= 30 ? 8 : days <= 90 ? 4 : 0;
};

function rank(kind: CrossCaseRelationKind, evidence: readonly CrossCaseEvidence[], cases: readonly ReviewCase[]): CrossCaseRank {
  const authorities = new Set(evidence.map((entry) => entry.authority)).size;
  const producers = new Set(cases.map((entry) => typeof entry.context.producer === "string" ? entry.context.producer : entry.module)).size;
  const result = {impact: impact[kind], evidence: Math.min(25, 9 + evidence.length * 7), recurrence: Math.min(15, Math.max(0, cases.length - 2) * 5 + Math.max(0, evidence.length - 1) * 2), independence: Math.min(15, Math.max(authorities, producers) * 5), temporalProximity: temporalScore(cases), risk: riskScore(cases)};
  return freeze({...result, total: Object.values(result).reduce((sum, value) => sum + value, 0)});
}

function recommendation(kind: CrossCaseRelationKind): string {
  if (kind === "blocked_by_other_case" || kind === "dependency_chain") return "Coordinar el caso dependiente después de resolver su caso precursor.";
  if (kind === "possible_duplicate_case" || kind === "merge_candidate") return "Comparar ambos casos antes de continuar; nunca fusionar automáticamente.";
  if (kind === "shared_conflict") return "Revisar conjuntamente el conflicto sin elegir un ganador automáticamente.";
  return "Revisar juntos para reutilizar contexto confirmado, manteniendo decisiones independientes.";
}

function makeRelation(kind: CrossCaseRelationKind, cases: readonly CaseProjection[], evidence: readonly CrossCaseEvidence[]): CrossCaseRelation {
  const caseIds = unique(cases.map((entry) => entry.reviewCase.id));
  const relationFingerprint = fingerprint({version: CROSS_CASE_INTELLIGENCE_VERSION, kind, caseIds, evidence: evidence.map((entry) => entry.evidenceFingerprint).sort()});
  return freeze({relationId: `cross:${relationFingerprint}`, kind, caseIds, safeReason: evidence[0]?.safeSummary ?? "Relación explícita entre casos.", evidence: Object.freeze([...evidence].sort((a, b) => a.evidenceFingerprint.localeCompare(b.evidenceFingerprint))), rank: rank(kind, evidence, cases.map((entry) => entry.reviewCase)), recommendation: recommendation(kind), limitations: Object.freeze(["Relación advisory-only; exige volver a comprobar la evidencia actual.", "No autoriza ejecución, fusión ni modificación de casos."]), relationFingerprint, advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false});
}

function evidenceFor(signalValue: Signal, caseIds: readonly string[]): CrossCaseEvidence {
  return freeze({kind: signalValue.kind, authority: signalValue.authority, safeSummary: signalValue.summary, sourceCaseIds: unique(caseIds), evidenceFingerprint: fingerprint({signal: signalValue.fingerprint, caseIds: unique(caseIds)}), current: true});
}

function groups(relations: readonly CrossCaseRelation[]): readonly CrossCaseGroup[] {
  const relevant = relations.filter((entry) => entry.kind !== "shared_resolution" || entry.evidence.some((evidence) => evidence.kind !== "producer"));
  const adjacency = new Map<string, Set<string>>();
  for (const relation of relevant) for (const id of relation.caseIds) {
    const set = adjacency.get(id) ?? new Set<string>();
    relation.caseIds.filter((other) => other !== id).forEach((other) => set.add(other));
    adjacency.set(id, set);
  }
  const visited = new Set<string>();
  const result: CrossCaseGroup[] = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (visited.has(start)) continue;
    const stack = [start]; const ids: string[] = [];
    while (stack.length) { const id = stack.pop()!; if (visited.has(id)) continue; visited.add(id); ids.push(id); for (const next of adjacency.get(id) ?? []) if (!visited.has(next)) stack.push(next); }
    const caseIds = unique(ids);
    if (caseIds.length < 2) continue;
    const included = relevant.filter((entry) => entry.caseIds.every((id) => caseIds.includes(id)));
    const dependency = included.some((entry) => entry.kind === "dependency_chain" || entry.kind === "blocked_by_other_case");
    const duplicate = included.some((entry) => entry.kind === "possible_duplicate_case" || entry.kind === "merge_candidate");
    const groupFingerprint = fingerprint({caseIds, relations: included.map((entry) => entry.relationFingerprint).sort()});
    const groupRecommendation = dependency ? "coordinate_dependency" : duplicate ? "compare_before_resolution" : "review_together";
    result.push(freeze({groupId: `cross-group:${groupFingerprint}`, caseIds, relationIds: unique(included.map((entry) => entry.relationId)), safeSummary: `${caseIds.length} casos comparten evidencia vigente y pueden revisarse coordinadamente.`, recommendation: groupRecommendation, limitations: Object.freeze(["La agrupación no fusiona casos ni comparte autorizaciones."]), groupFingerprint, neverAutoMerged: true, advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false}));
  }
  return Object.freeze(result.sort((a, b) => a.groupFingerprint.localeCompare(b.groupFingerprint)));
}

export function buildCrossCaseGraph(input: BuildCrossCaseGraphInput): CrossCaseGraph {
  if (!input.evaluatedAt || Number.isNaN(Date.parse(input.evaluatedAt))) throw new Error("cross_case_evaluated_at_invalid");
  const byId = new Map<string, ReviewCase>();
  for (const reviewCase of input.cases) {
    const current = byId.get(reviewCase.id);
    if (!current || reviewCase.version > current.version) byId.set(reviewCase.id, reviewCase);
  }
  const all = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const projections = all.map((entry) => project(entry, input.evaluatedAt));
  const unsupportedCaseIds = unique(projections.filter((entry) => !supportedSubjects.has(entry.reviewCase.subject.type.toLowerCase())).map((entry) => entry.reviewCase.id));
  const staleCaseIds = unique(projections.filter((entry) => !entry.node.current).map((entry) => entry.reviewCase.id));
  const eligible = projections.filter((entry) => entry.node.current && !unsupportedCaseIds.includes(entry.reviewCase.id));
  const relationMap = new Map<string, CrossCaseRelation>();
  const register = (relation: CrossCaseRelation): void => {
    const key = `${relation.kind}:${relation.caseIds.join("|")}`;
    const existing = relationMap.get(key);
    if (!existing) { relationMap.set(key, relation); return; }
    const combinedEvidence = [...new Map([...existing.evidence, ...relation.evidence].map((entry) => [entry.evidenceFingerprint, entry])).values()];
    const cases = relation.caseIds.map((id) => eligible.find((entry) => entry.reviewCase.id === id)!).filter(Boolean);
    relationMap.set(key, makeRelation(relation.kind, cases, combinedEvidence));
  };
  const signalGroups = new Map<string, Array<{projection: CaseProjection; signal: Signal}>>();
  for (const projection of eligible) for (const entry of projection.signals) {
    const key = `${entry.kind}:${entry.key}`;
    signalGroups.set(key, [...(signalGroups.get(key) ?? []), {projection, signal: entry}]);
  }
  for (const entries of signalGroups.values()) {
    const distinct = [...new Map(entries.map((entry) => [entry.projection.reviewCase.id, entry])).values()];
    if (distinct.length < 2) continue;
    for (let left = 0; left < distinct.length; left += 1) for (let right = left + 1; right < distinct.length; right += 1) {
      const pair = [distinct[left].projection, distinct[right].projection];
      const kind = relationFor(distinct[left].signal.kind);
      const relation = makeRelation(kind, pair, [evidenceFor(distinct[left].signal, pair.map((entry) => entry.reviewCase.id))]);
      register(relation);
    }
  }
  for (const source of eligible) {
    for (const targetId of source.dependencyIds) {
      const target = eligible.find((entry) => entry.reviewCase.id === targetId); if (!target) continue;
      const evidence = evidenceFor(signal("dependency", `${source.reviewCase.id}:${targetId}`, "case", "Dependencia explícita declarada entre casos.")!, [source.reviewCase.id, targetId]);
      const relation = makeRelation("dependency_chain", [source, target], [evidence]); register(relation);
    }
    for (const targetId of source.blockedByIds) {
      const target = eligible.find((entry) => entry.reviewCase.id === targetId); if (!target) continue;
      const evidence = evidenceFor(signal("dependency", `${source.reviewCase.id}:blocked:${targetId}`, "case", "Bloqueo explícito por otro caso.")!, [source.reviewCase.id, targetId]);
      const relation = makeRelation("blocked_by_other_case", [source, target], [evidence]); register(relation);
    }
  }
  const baseRelations = [...relationMap.values()];
  const pairs = new Map<string, CrossCaseRelation[]>();
  for (const relation of baseRelations) if (relation.caseIds.length === 2) { const key = relation.caseIds.join("|"); pairs.set(key, [...(pairs.get(key) ?? []), relation]); }
  for (const pairRelations of pairs.values()) {
    const duplicate = pairRelations.some((entry) => entry.kind === "possible_duplicate_case");
    const independentStrong = new Set(pairRelations.flatMap((entry) => entry.evidence.filter((evidence) => evidence.kind !== "producer" && evidence.kind !== "capability").map((evidence) => `${evidence.authority}:${evidence.kind}`))).size >= 2;
    if (!duplicate && !independentStrong) continue;
    const ids = pairRelations[0].caseIds;
    const pair = ids.map((id) => eligible.find((entry) => entry.reviewCase.id === id)!).filter(Boolean);
    const evidence = pairRelations.flatMap((entry) => entry.evidence).slice(0, 4);
    const relation = makeRelation("merge_candidate", pair, evidence); register(relation);
  }
  const maximum = Math.max(0, Math.floor(input.maxRelations ?? 100));
  const relations = Object.freeze([...relationMap.values()].sort((a, b) => b.rank.total - a.rank.total || a.relationFingerprint.localeCompare(b.relationFingerprint)).slice(0, maximum));
  const edges: readonly CrossCaseEdge[] = Object.freeze(relations.flatMap((relation) => {
    const ids = relation.caseIds;
    const result: CrossCaseEdge[] = [];
    for (let left = 0; left < ids.length; left += 1) for (let right = left + 1; right < ids.length; right += 1) {
      const edgeFingerprint = fingerprint({relation: relation.relationFingerprint, from: ids[left], to: ids[right]});
      result.push(freeze({edgeId: `cross-edge:${edgeFingerprint}`, fromCaseId: ids[left], toCaseId: ids[right], relationId: relation.relationId, relationFingerprint: relation.relationFingerprint}));
    }
    return result;
  }).sort((a, b) => a.edgeId.localeCompare(b.edgeId)));
  const snapshotFingerprint = fingerprint(all.map((entry) => ({id: entry.id, version: entry.version, status: entry.status, updatedAt: entry.updatedAt, semantic: projections.find((projection) => projection.reviewCase.id === entry.id)?.semanticFingerprint})));
  const grouped = groups(relations);
  const nodes = Object.freeze(projections.map((entry) => entry.node).sort((a, b) => a.caseId.localeCompare(b.caseId)));
  const graphFingerprint = fingerprint({version: CROSS_CASE_INTELLIGENCE_VERSION, snapshotFingerprint, nodes: nodes.map((entry) => entry.nodeFingerprint), relations: relations.map((entry) => entry.relationFingerprint), groups: grouped.map((entry) => entry.groupFingerprint)});
  return freeze({version: CROSS_CASE_INTELLIGENCE_VERSION, snapshotFingerprint, graphFingerprint, nodes, edges, relations, groups: grouped, unsupportedCaseIds, staleCaseIds, advisoryOnly: true, requiresCurrentEvidence: true, replacesCurrentEvidence: false, persistsGraph: false, writes: false});
}

export function relationsForCase(graph: CrossCaseGraph, caseId: string): readonly CrossCaseRelation[] { return Object.freeze(graph.relations.filter((entry) => entry.caseIds.includes(caseId))); }
