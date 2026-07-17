import {useSyncExternalStore} from "react";
import type {ReviewCase} from "../../types";
import {getOutcomesForCase} from "../../outcomes";
import {evaluateOutcomeMemoryEligibility} from "../policy";
import {importExistingOutcomesToMemory, reconcileMemory} from "../createMemoryFromOutcome";
import {addDecisionMemoryNote, deprecateDecisionMemory, invalidateDecisionMemory, markDecisionMemoryObsolete, restoreDecisionMemory, supersedeDecisionMemory} from "../lifecycle";
import {getMemoriesForCase, getMemoryClusters, getMemoryEvents, getMemoryStoreVersion, subscribeMemoryStore} from "../memoryStore";
import MemoryClusterSummary from "./MemoryClusterSummary";
import MemoryConfidenceBadge from "./MemoryConfidenceBadge";
import MemoryTimeline from "./MemoryTimeline";

export default function DecisionMemoryPanel({reviewCase}: {reviewCase: ReviewCase}) {
  useSyncExternalStore(subscribeMemoryStore, getMemoryStoreVersion, getMemoryStoreVersion);
  const records = getMemoriesForCase(reviewCase.id);
  const eligible = getOutcomesForCase(reviewCase.id).filter((item) => evaluateOutcomeMemoryEligibility(item).eligible);
  if (!records.length && !eligible.length) return null;
  const action = (kind: "note" | "invalidate" | "deprecate" | "obsolete" | "restore", id: string) => {
    const actor = window.prompt("Identificador del editor:", "editor")?.trim();
    const reason = window.prompt("Motivo auditable:", "")?.trim();
    if (!actor || !reason) return;
    if (kind === "note") addDecisionMemoryNote(id, actor, reason);
    if (kind === "invalidate") invalidateDecisionMemory(id, actor, reason);
    if (kind === "deprecate") deprecateDecisionMemory(id, actor, reason);
    if (kind === "obsolete") markDecisionMemoryObsolete(id, actor, reason);
    if (kind === "restore") restoreDecisionMemory(id, actor, reason);
  };
  const supersede = (id: string) => { const replacement = window.prompt("ID de la memoria reemplazante válida:", "")?.trim(); const actor = window.prompt("Identificador del editor:", "editor")?.trim(); const reason = window.prompt("Motivo auditable:", "")?.trim(); if (replacement && actor && reason) supersedeDecisionMemory(id, replacement, actor, reason); };
  return <section className="review-subsection memory-panel">
    <p className="review-kicker">MEMORIA DE DECISIONES · SOLO LOCAL</p><h4 className="review-subtitle">Experiencia editorial trazable</h4>
    <p className="review-muted">Registra outcomes confirmados o rechazados. No recomienda, aplica ni reutiliza decisiones automáticamente.</p>
    {!records.length ? <div><p>{eligible.length} outcomes elegibles pendientes de importación explícita.</p><button className="review-button" onClick={() => importExistingOutcomesToMemory(reviewCase.id)}>Importar outcomes elegibles</button></div> : <div className="memory-records">{records.map((record) => {
      const cluster = getMemoryClusters().find((item) => item.fingerprint === record.clusterFingerprint);
      const current = record.status === "confirmed" || record.status === "rejected";
      return <article className="memory-record" key={record.id}><header><div><h5>{record.decisionType} · {record.editorialDecision}</h5><p>{record.id}</p></div><span className="review-badge">{record.status}</span></header>
        <div className="memory-metrics"><MemoryConfidenceBadge {...record.confidence} /><span className="review-badge">{record.compatibility.status}</span><span className="review-badge">{record.reusePolicy}</span></div>
        <p>{record.confidenceReason}</p>{record.reuseBlockedReasons.map((reason) => <p className="review-readonly-message" key={reason}>{reason}</p>)}<MemoryClusterSummary cluster={cluster} />
        <dl className="review-definition-grid"><dt>Outcome</dt><dd>{record.outcomeId}</dd><dt>Incidencia</dt><dd>{record.issueId}</dd><dt>Entidad</dt><dd>{record.entityType ?? "No aplicable"}</dd><dt>Versiones</dt><dd>Memory {record.memorySchemaVersion} · Outcome {record.provenance.outcomeSchemaVersion} · Review {record.provenance.reviewSchemaVersion}</dd><dt>Actualizada</dt><dd>{new Date(record.updatedAt).toLocaleString("es-ES")}</dd></dl>
        <div className="review-actions"><button className="review-button review-button-secondary" onClick={() => action("note", record.id)}>Nota</button><button className="review-button review-button-secondary" onClick={() => reconcileMemory(record.id)}>Reconciliar</button>{current ? <><button className="review-button review-button-danger" onClick={() => action("invalidate", record.id)}>Invalidar</button><button className="review-button review-button-secondary" onClick={() => action("deprecate", record.id)}>Deprecar</button><button className="review-button review-button-secondary" onClick={() => action("obsolete", record.id)}>Obsoleta</button><button className="review-button review-button-secondary" onClick={() => supersede(record.id)}>Reemplazar</button></> : record.status !== "superseded" ? <button className="review-button review-button-secondary" onClick={() => action("restore", record.id)}>Restaurar explícitamente</button> : null}</div>
        <details><summary>Timeline ({record.eventIds.length})</summary><MemoryTimeline events={getMemoryEvents(record.id)} /></details><details><summary>Provenance y fingerprints</summary><pre>{JSON.stringify({memoryFingerprint: record.memoryFingerprint, clusterFingerprint: record.clusterFingerprint, decisionFingerprint: record.decisionFingerprint, provenance: record.provenance}, null, 2)}</pre></details>
      </article>;
    })}</div>}
  </section>;
}
