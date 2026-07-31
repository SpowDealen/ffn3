import {computeUniversalFingerprint} from "../universal";
import type {ReviewJsonValue} from "../types";
import {getEntityIdentityProfile} from "./profiles";
import type {CorpusReadStatus, DuplicateGroup, DuplicatePair, EntityKind, EntityProjection, ReferenceImpact} from "./types";

const fp = (value: unknown) => computeUniversalFingerprint(value as ReviewJsonValue);
const stable = <T>(values: readonly T[], key: (value: T) => string) => [...values].sort((a, b) => key(a).localeCompare(key(b)));

export function consolidateEntityVariants(records: readonly EntityProjection[]): EntityProjection[] {
  const grouped = new Map<string, EntityProjection[]>();
  for (const record of records) grouped.set(record.logicalId, [...(grouped.get(record.logicalId) ?? []), record]);
  return stable([...grouped.entries()], ([id]) => id).map(([, variants]) => {
    const ordered = stable(variants, (item) => item.variants[0]?.documentId ?? item.logicalId);
    const base = ordered.find((item) => item.variants.some((variant) => variant.variant === "published")) ?? ordered[0];
    const mergedVariants = stable(ordered.flatMap((item) => item.variants), (item) => item.documentId);
    const semantic = new Set(ordered.map((item) => item.identityFingerprint));
    return {...base, variants: mergedVariants, snapshotFingerprint: fp(mergedVariants.map((item) => ({documentId: item.documentId, revision: item.revision ?? null, variant: item.variant, contentFingerprint: item.contentFingerprint}))), contexts: {...base.contexts, draftPublishedDifference: semantic.size > 1}};
  });
}

function aggregateImpact(members: readonly EntityProjection[]): ReferenceImpact {
  const impacts = members.map((member) => member.referenceImpact);
  const relationKinds = [...new Set(impacts.flatMap((item) => item.relationKinds ?? []))].sort();
  if (impacts.some((item) => item.status === "unavailable")) return {status: "unavailable", sampleDocumentIds: [], relationKinds, warning: "El impacto no está disponible para todos los miembros."};
  const status = impacts.some((item) => item.status === "truncated") ? "truncated" : impacts.some((item) => item.status === "estimated") ? "estimated" : "known";
  return {status, count: impacts.reduce((sum, item) => sum + (item.count ?? 0), 0), sampleDocumentIds: [...new Set(impacts.flatMap((item) => item.sampleDocumentIds))].sort().slice(0, 12), relationKinds, warning: status === "known" ? undefined : "El impacto requiere una inspección completa antes de cualquier reconciliación futura."};
}

function canonical(members: readonly EntityProjection[], impact: ReferenceImpact) {
  const ranked = stable(members, (member) => member.logicalId).map((member) => ({member, score: member.externalIds.length * 50 + member.provenance.observedFields.length * 3 + (member.variants.some((item) => item.variant === "published") ? 15 : 0) + (member.referenceImpact.count ?? 0)})).sort((a, b) => b.score - a.score || a.member.logicalId.localeCompare(b.member.logicalId));
  const first = ranked[0];
  return {logicalId: first.member.logicalId, reasons: [first.member.externalIds.length ? "Tiene ID externo namespaced." : "No hay ID externo fiable; selección por completitud.", first.member.variants.some((item) => item.variant === "published") ? "Dispone de variante publicada." : "Sólo dispone de draft.", impact.status === "known" ? "El impacto relacional fue contado." : "El impacto relacional no está completo."], alternatives: ranked.slice(1).map((item) => item.member.logicalId)};
}

export function detectDuplicateGroups(input: {kind: EntityKind; records: readonly EntityProjection[]; readStatus: CorpusReadStatus; maxGroups: number; maxBlockSize: number}): DuplicateGroup[] {
  const records = consolidateEntityVariants(input.records);
  if (input.readStatus === "unavailable" || input.readStatus === "cancelled") return [];
  if (records.some((record) => record.kind !== input.kind)) throw new Error("mixed_entity_kinds_not_allowed");
  const profile = getEntityIdentityProfile(input.kind);
  const blocks = new Map<string, EntityProjection[]>();
  for (const record of records) for (const key of profile.blockKeys(record)) blocks.set(key, [...(blocks.get(key) ?? []), record]);
  const pairs = new Map<string, DuplicatePair>();
  for (const [, block] of stable([...blocks.entries()], ([key]) => key)) {
    const members = stable([...new Map(block.map((item) => [item.logicalId, item])).values()], (item) => item.logicalId).slice(0, input.maxBlockSize);
    for (let left = 0; left < members.length; left += 1) for (let right = left + 1; right < members.length; right += 1) {
      const ids: [string, string] = [members[left].logicalId, members[right].logicalId]; const pairId = fp(ids);
      const compared = profile.compare(members[left], members[right]);
      const previous = pairs.get(pairId);
      if (!previous || compared.score > previous.score) pairs.set(pairId, {pairId, memberIds: ids, ...compared});
    }
  }
  const relevant = stable([...pairs.values()].filter((pair) => pair.state !== "inconclusive"), (item) => item.pairId);
  const parent = new Map(records.map((item) => [item.logicalId, item.logicalId]));
  const root = (id: string): string => { const current = parent.get(id) ?? id; if (current === id) return id; const resolved = root(current); parent.set(id, resolved); return resolved; };
  for (const pair of relevant.filter((item) => !item.conflicts.some((conflict) => conflict.blocking))) {
    const a = root(pair.memberIds[0]); const b = root(pair.memberIds[1]);
    if (a === b) continue;
    const leftSet = records.filter((item) => root(item.logicalId) === a); const rightSet = records.filter((item) => root(item.logicalId) === b);
    const crossConflict = leftSet.some((left) => rightSet.some((right) => profile.compare(left, right).conflicts.some((item) => item.blocking)));
    if (!crossConflict) { const nextRoot = a < b ? a : b; parent.set(b, nextRoot); parent.set(a, nextRoot); }
  }
  const components = new Map<string, EntityProjection[]>();
  for (const record of records) components.set(root(record.logicalId), [...(components.get(root(record.logicalId)) ?? []), record]);
  const groups: DuplicateGroup[] = [];
  for (const members of components.values()) {
    if (members.length < 2) continue;
    const ids = new Set(members.map((item) => item.logicalId)); const groupPairs = relevant.filter((pair) => pair.memberIds.every((id) => ids.has(id)));
    const referenceImpact = aggregateImpact(members);
    let state: DuplicateGroup["state"] = groupPairs.some((pair) => pair.state === "blocked") ? "blocked" : groupPairs.some((pair) => pair.state === "needs_review") ? "needs_review" : "candidate";
    if (input.readStatus !== "complete" && state === "candidate") state = "needs_review";
    const sortedMembers = stable(members, (item) => item.logicalId); const proposed = canonical(sortedMembers, referenceImpact);
    const groupFingerprint = fp({rulesVersion: "1.0.0", readStatus: input.readStatus, members: sortedMembers.map((item) => [item.logicalId, item.snapshotFingerprint]), pairs: groupPairs, proposed, referenceImpact});
    groups.push({groupId: `reconciliation:${sortedMembers[0].kind}:${groupFingerprint}`, kind: sortedMembers[0].kind, members: sortedMembers, pairs: groupPairs, state, canonical: proposed, referenceImpact, groupFingerprint});
  }
  const groupedPairs = new Set(groups.flatMap((group) => group.pairs.map((pair) => pair.pairId)));
  for (const pair of relevant.filter((item) => item.state === "blocked" && !groupedPairs.has(item.pairId))) {
    const members = pair.memberIds.map((id) => records.find((item) => item.logicalId === id)).filter((item): item is EntityProjection => Boolean(item));
    if (members.length !== 2) continue;
    const referenceImpact = aggregateImpact(members); const proposed = canonical(members, referenceImpact);
    const groupFingerprint = fp({rulesVersion: "1.0.0", readStatus: input.readStatus, members: members.map((item) => [item.logicalId, item.snapshotFingerprint]), pair, proposed, referenceImpact});
    groups.push({groupId: `reconciliation:${members[0].kind}:${groupFingerprint}`, kind: members[0].kind, members, pairs: [pair], state: "blocked", canonical: proposed, referenceImpact, groupFingerprint});
  }
  return stable(groups, (item) => item.groupId).slice(0, input.maxGroups);
}
