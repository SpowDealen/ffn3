import {useMemo, type ReactElement} from "react";
import {buildCrossCaseGraph, relationsForCase, type CrossCaseRelationKind} from "../nucleus";
import type {ReviewCase} from "../types";

const relationLabels: Readonly<Record<CrossCaseRelationKind, string>> = Object.freeze({shared_entity: "Entidad compartida", possible_duplicate_case: "Posible caso duplicado", shared_event: "Evento compartido", shared_organization: "Organización compartida", shared_fighter: "Luchador compartido", shared_news: "Noticia compartida", shared_resolution: "Resolución compartida", shared_transaction: "Transacción compartida", shared_knowledge: "Conocimiento compartido", shared_conflict: "Conflicto compartido", dependency_chain: "Cadena de dependencia", merge_candidate: "Candidato a revisión conjunta", blocked_by_other_case: "Bloqueado por otro caso"});
const short = (value: string): string => value.length <= 18 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;

export default function CrossCaseIntelligencePanel({reviewCase, cases}: {reviewCase: ReviewCase; cases: readonly ReviewCase[]}): ReactElement {
  const graph = useMemo(() => buildCrossCaseGraph({cases, evaluatedAt: new Date().toISOString(), maxRelations: 60}), [cases]);
  const relations = useMemo(() => relationsForCase(graph, reviewCase.id), [graph, reviewCase.id]);
  const titles = useMemo(() => new Map(cases.map((entry) => [entry.id, entry.title])), [cases]);
  const visible = relations.slice(0, 3);
  const relatedCount = new Set(relations.flatMap((entry) => entry.caseIds).filter((id) => id !== reviewCase.id)).size;
  const unsupported = graph.unsupportedCaseIds.includes(reviewCase.id);

  return <section className="cross-case-intelligence" aria-labelledby={`cross-case-title-${reviewCase.id}`}>
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">AU10 · ADVISORY ONLY</p><h5 id={`cross-case-title-${reviewCase.id}`}>Inteligencia transversal</h5><p className="review-muted">{unsupported ? "Este tipo de caso no tiene contrato transversal soportado." : relations.length ? `${relatedCount} casos relacionados · ${relations.length} relaciones respaldadas por evidencia vigente.` : "No hay relaciones confirmadas en el snapshot actual."}</p></div>
      <span className="review-badge" role="status">{relations.length ? `${relations.length} relaciones` : "Sin relaciones"}</span>
    </div>
    {visible.length ? <ul className="cross-case-list">{visible.map((relation) => {
      const related = relation.caseIds.filter((id) => id !== reviewCase.id);
      return <li key={relation.relationId}>
        <div className="review-row review-row-wrap"><strong>{relationLabels[relation.kind]}</strong><span className="review-badge">impacto {relation.rank.impact} · ranking {relation.rank.total}</span></div>
        <p>{relation.safeReason}</p>
        <small>Casos: {related.map((id) => titles.get(id) ?? id).join(" · ")}</small>
        <small>Evidencia: {relation.evidence.map((entry) => `${entry.authority}/${entry.kind} ${short(entry.evidenceFingerprint)}`).join(" · ")}</small>
        <small>Recomendación: {relation.recommendation}</small>
        <details><summary>Ver límites</summary><ul>{relation.limitations.map((entry) => <li key={entry}>{entry}</li>)}</ul></details>
      </li>;
    })}</ul> : <p className="cross-case-empty">{unsupported ? "Estado unsupported visible; no se infieren relaciones." : "El sistema no usa similitud textual ni candidatos ambiguos para forzar relaciones."}</p>}
    {relations.length > visible.length ? <details className="nucleus-details"><summary>Ver {relations.length - visible.length} relaciones adicionales</summary><ol className="cross-case-more">{relations.slice(visible.length).map((relation) => <li key={relation.relationId}><strong>{relationLabels[relation.kind]}</strong><span>{relation.safeReason}</span><small>{short(relation.relationFingerprint)}</small></li>)}</ol></details> : null}
    <footer>Requiere evidencia actual · no sustituye decisiones · nunca fusiona ni ejecuta casos.</footer>
  </section>;
}
