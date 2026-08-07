import {useRef, useState, type ReactElement} from "react";
import {buildEntityIdentity, CandidateDiscoveryRegistry, CandidateDiscoveryService, createSanityFighterCandidateDiscoveryHttpAdapter, createSanityMultiEntityCandidateDiscoveryHttpAdapter, type IdentityProvenance, type UniversalEntityIdentityInput} from "../../entityIdentity";
import type {EntityKind} from "../../entityReconciliation";
import {createEntityResolutionEngine} from "../factory";
import type {EngineResult} from "../types";
import {identityCreationGuardProfileForSchema, isIdentityCreationSupported} from "../../globalResolution/identityCreationGuard";

const provenance: IdentityProvenance = Object.freeze({producer: "review-center", source: "operator", field: "identity_lookup", extractionMethod: "explicit", confidence: 1, verified: true});
const labels: Record<EntityKind, string> = {fighter: "Luchador", event: "Evento", organization: "Organización", weight_category: "Categoría de peso"};
const contextLabels: Record<EntityKind, [string, string]> = {fighter: ["Disciplina", "Organización"], event: ["Organización", "Fecha ISO"], organization: ["País", "Web oficial"], weight_category: ["Disciplina", "Límite kg"]};
const completenessLabels = {complete: "lectura completa", partial: "lectura incompleta", truncated: "lectura truncada", unavailable: "fuente no disponible", cancelled: "lectura cancelada", not_applicable: "no aplicable"} as const;
const identityBuilders: Record<EntityKind, (label: string, first: string, second: string) => UniversalEntityIdentityInput> = {
  fighter: (primaryLabel, discipline, organization) => ({entityType: "fighter", source: "review-center", primaryLabel, discipline: discipline || undefined, organizations: organization ? [organization] : undefined, provenance: [provenance]}),
  event: (primaryLabel, organization, date) => ({entityType: "event", source: "review-center", primaryLabel, organization: organization || undefined, date: date || undefined, provenance: [provenance]}),
  organization: (primaryLabel, country, officialDomain) => ({entityType: "organization", source: "review-center", primaryLabel, country: country || undefined, officialDomain: officialDomain || undefined, provenance: [provenance]}),
  weight_category: (primaryLabel, discipline, limit) => ({entityType: "weight_category", source: "review-center", primaryLabel, discipline: discipline || undefined, limit: Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : undefined, unit: "kg", provenance: [provenance]}),
};
const schemaTypes: Record<EntityKind, "luchador" | "evento" | "organizacion" | "categoriaPeso"> = {fighter: "luchador", event: "evento", organization: "organizacion", weight_category: "categoriaPeso"};

function engine() {
  const registry = new CandidateDiscoveryRegistry();
  registry.register(createSanityFighterCandidateDiscoveryHttpAdapter());
  for (const entityType of ["event", "organization", "weight_category"] as const) registry.register(createSanityMultiEntityCandidateDiscoveryHttpAdapter(entityType));
  return createEntityResolutionEngine({candidateDiscoveryService: new CandidateDiscoveryService(registry)});
}

export default function EntityIdentityLookupControls(): ReactElement {
  const [entityType, setEntityType] = useState<EntityKind>("event"); const [label, setLabel] = useState(""); const [firstContext, setFirstContext] = useState(""); const [secondContext, setSecondContext] = useState(""); const [busy, setBusy] = useState(false); const [result, setResult] = useState<EngineResult>(); const controller = useRef<AbortController>();
  const context = contextLabels[entityType];
  async function performLookup(): Promise<void> {
    if (!label.trim()) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setBusy(true); setResult(undefined);
    try {
      const identity = buildEntityIdentity(identityBuilders[entityType](label.trim(), firstContext.trim(), secondContext.trim()));
      const next = await engine().resolve({version: 1, mode: "identity_lookup", entityType, producer: "review-center", source: "sanity", identity, limits: {maxTotal: 20, maxStrategies: 10, timeoutMs: 8_000}}, {signal: abort.signal});
      if (controller.current === abort) setResult(next);
    } finally { if (controller.current === abort) setBusy(false); }
  }
  const lookupResult = result?.mode === "identity_lookup" ? result.identityLookup : undefined;
  const creationProfile = identityCreationGuardProfileForSchema(schemaTypes[entityType]); const creationSupported = Boolean(creationProfile && isIdentityCreationSupported(creationProfile));
  return <section className="review-subsection" aria-label="Búsqueda read-only de identidad">
    <div className="review-row review-row-wrap">
      <div><p className="review-kicker">AU6 · Sólo lectura</p><h3 className="review-subtitle">Buscar coincidencias existentes</h3></div>
      <label>Tipo<select value={entityType} disabled={busy} onChange={(event) => { setEntityType(event.target.value as EntityKind); setFirstContext(""); setSecondContext(""); setResult(undefined); }}><option value="fighter">Luchador</option><option value="event">Evento</option><option value="organization">Organización</option><option value="weight_category">Categoría de peso</option></select></label>
      <label>{labels[entityType]}<input value={label} disabled={busy} maxLength={160} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>{context[0]}<input value={firstContext} disabled={busy} maxLength={160} onChange={(event) => setFirstContext(event.target.value)} /></label>
      <label>{context[1]}<input value={secondContext} disabled={busy} maxLength={180} onChange={(event) => setSecondContext(event.target.value)} /></label>
      <button className="review-button" type="button" disabled={busy || !label.trim()} onClick={() => void performLookup()}>{busy ? "Buscando…" : "Buscar coincidencias existentes"}</button>
      {busy ? <button className="review-button review-button-secondary" type="button" onClick={() => controller.current?.abort()}>Cancelar</button> : null}
    </div>
    <p className="review-muted">Acción explícita y limitada. Sin creación, reconciliación automática ni mutaciones. La reconciliación histórica se inicia, por separado, en su control específico.</p>
    <p className="review-muted">Guard de creación: {creationSupported ? "preflight canónico disponible únicamente dentro del caso y checkpoint autorizados" : `bloqueado · ${creationProfile?.unsupportedReason ?? "identity_resolution_unsupported"}`}. Este control nunca acepta tokens ni decisiones del caller.</p>
    {result ? <div className="review-empty" role="status"><p><strong>{result.status}</strong> · {completenessLabels[result.completeness]} · {result.reasonCode}</p><p>Perfil {result.provenance.profileId} v{result.provenance.profileVersion} · {result.provenance.capability}</p>{lookupResult ? <><p>{lookupResult.discovery.candidates.length} candidatos · estrategias: {lookupResult.discovery.executedStrategies.map((item) => item.strategyId).join(", ") || "ninguna"}</p>{lookupResult.resolution.resolution.candidates.map(({candidate, comparison}) => <article key={candidate.candidateId}><strong>{candidate.safeSummary}</strong><p>{comparison.decision} · {comparison.explanationCodes.join(", ")}</p><p>{[...comparison.matchedKeys, ...comparison.supportingEvidence, ...comparison.conflictingEvidence].map((item) => item.code).join(", ") || "Contexto insuficiente"}</p></article>)}{lookupResult.discovery.candidates.map((candidate) => <p key={candidate.fingerprint}>{candidate.candidateId}: {candidate.matchedByStrategies.join(", ")} · {candidate.variants.map((variant) => variant.state).join(" / ")} · fuente {candidate.source}</p>)}{lookupResult.discovery.warnings.map((warning) => <p key={warning.fingerprint}>{warning.message}</p>)}</> : <p>La capability solicitada no está disponible.</p>}</div> : null}
  </section>;
}
