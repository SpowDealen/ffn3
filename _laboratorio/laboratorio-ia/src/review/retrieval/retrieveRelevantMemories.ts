import type {DecisionMemoryCluster, DecisionMemoryRecord} from "../memory";
import {RETRIEVAL_ENGINE_VERSION, RETRIEVAL_SCORING_VERSION} from "./constants";
import {generateMemoryCandidates} from "./candidateGeneration";
import {detectRetrievalContradictions} from "./contradictions";
import {hashRetrievalValue} from "./normalization";
import {scoreRetrievalCandidate} from "./scoring";
import type {RetrievalQuery, RetrievalResult} from "./types";

export function retrieveRelevantMemoriesPure(query: RetrievalQuery, memories: DecisionMemoryRecord[], clusters: DecisionMemoryCluster[]): RetrievalResult {
  const memoryLedgerFingerprint = `rml1:${hashRetrievalValue({memories: memories.map((item) => [item.id, item.updatedAt, item.memoryFingerprint, item.status]).sort(), clusters: clusters.map((item) => [item.id, item.updatedAt, item.status, item.memoryIds]).sort()})}`;
  const base = generateMemoryCandidates(query, memories); const clusterMap = new Map(clusters.map((item) => [item.id, item]));
  const candidates = base.map((memory) => scoreRetrievalCandidate(query, memory, clusterMap.get(memory.clusterId))).sort((left, right) => right.finalScore - left.finalScore || left.memoryId.localeCompare(right.memoryId));
  const includedCandidates = candidates.filter((item) => item.candidateStatus !== "excluded"); const excludedCandidates = candidates.filter((item) => !includedCandidates.includes(item));
  const positiveEvidence = includedCandidates.filter((item) => item.positiveOrNegative === "positive"); const negativeEvidence = includedCandidates.filter((item) => item.positiveOrNegative === "negative");
  const contradictions = detectRetrievalContradictions(candidates); const contestedClusters = [...new Set(candidates.filter((item) => item.clusterState === "contested").map((item) => item.clusterId))].sort();
  const status: RetrievalResult["status"] = !memories.length ? "no_memory" : query.missingDimensions.includes("entityType") && query.missingDimensions.includes("decisionType") ? "insufficient_context" : !candidates.length ? "no_memory" : contradictions.length ? "contradictory_evidence" : negativeEvidence.length ? "negative_evidence_found" : positiveEvidence.length ? "relevant_memory_found" : candidates.every((item) => item.compatibilityStatus === "incompatible") ? "incompatible_memory_only" : "candidates_found";
  const summary = [`${candidates.length} candidatas inspeccionadas.`, `${positiveEvidence.length} evidencias confirmadas y ${negativeEvidence.length} rechazadas.`, "El resultado presenta historia editorial y no autoriza aplicar ninguna decisión."];
  return {schemaVersion: 1, id: `retrieval:${hashRetrievalValue([query.queryFingerprint, memoryLedgerFingerprint, RETRIEVAL_SCORING_VERSION])}`, query, status, candidates, includedCandidates, excludedCandidates, positiveEvidence, negativeEvidence, contradictions, contestedClusters, summary, limitations: [...query.limitations, "5D no conserva el cuerpo completo de la resolución histórica; no se reconstruye."], stale: false, staleReasons: [], createdAt: query.createdAt, engineVersion: RETRIEVAL_ENGINE_VERSION, scoringVersion: RETRIEVAL_SCORING_VERSION, memoryLedgerFingerprint, eventIds: []};
}
