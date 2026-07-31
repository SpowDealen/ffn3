import {buildEntityIdentity} from "../core";
import type {FighterIdentityInput, IdentityProvenance} from "../types";
import {createSanityFighterCandidateDiscoveryAdapter, type SanityCandidateReadExecutor, type SanityFighterCandidateRecord} from "./adapters/sanity";
import {fingerprintAdapterDescriptor, fingerprintDiscoveryResult} from "./fingerprint";
import {CandidateDiscoveryRegistry} from "./registry";
import {buildCandidateDiscoveryRequest} from "./request";
import {CandidateDiscoveryService, resolveDiscoveredIdentity} from "./service";
import type {CandidateDiscoveryContext, CandidateDiscoveryRequest} from "./types";

const provenance: IdentityProvenance = Object.freeze({producer: "au5-dev-fixture", source: "fixture", field: "name", extractionMethod: "fixture", confidence: .9, verified: false});
export const AU5_DISCOVERY_FIXTURE_RECORDS: readonly SanityFighterCandidateRecord[] = Object.freeze([
  {_id: "fighter-ilia-topuria", _type: "luchador", nombre: "Ilia Topuria", apodo: "El Matador", slug: {current: "ilia-topuria"}, nacionalidad: "España", externalIds: [{namespace: "ufc", value: "ilia-topuria"}]},
  {_id: "drafts.fighter-ilia-topuria", _type: "luchador", nombre: "Ilia “El Matador” Topuria", apodo: "El Matador", slug: {current: "ilia-topuria"}, nacionalidad: "España", externalIds: [{namespace: "ufc", value: "ilia-topuria"}]},
  {_id: "fighter-i-topuria", _type: "luchador", nombre: "I. Topuria", slug: {current: "i-topuria"}},
  {_id: "fighter-george-topuria", _type: "luchador", nombre: "Aleksandre Topuria", slug: {current: "aleksandre-topuria"}},
  {_id: "not-a-fighter", _type: "evento", nombre: "Topuria"},
]);

export const createInMemoryCandidateReader = (records: readonly SanityFighterCandidateRecord[] = AU5_DISCOVERY_FIXTURE_RECORDS): SanityCandidateReadExecutor =>
  Object.freeze({readFighterCandidates: async () => records});

export async function runAu5CandidateDiscoveryDevFixture(input: Partial<FighterIdentityInput> = {}) {
  const identity = buildEntityIdentity({
    entityType: "fighter", source: "fixture", primaryLabel: "Ilia Topuria", slug: "ilia-topuria",
    aliases: [], externalIdentifiers: [], provenance: [provenance], ...input,
  });
  const request = buildCandidateDiscoveryRequest({identity, source: "fixture"});
  const registry = new CandidateDiscoveryRegistry();
  const base = createSanityFighterCandidateDiscoveryAdapter(createInMemoryCandidateReader());
  const descriptorSemantic = {...base.descriptor, adapterId: "fixture.fighter-candidates", source: "fixture"};
  const descriptor = Object.freeze({...descriptorSemantic, fingerprint: fingerprintAdapterDescriptor(descriptorSemantic)});
  registry.register(Object.freeze({
    ...base, descriptor, supports: () => true,
    async discover(candidateRequest: CandidateDiscoveryRequest, context: CandidateDiscoveryContext) {
      const result = await base.discover({...candidateRequest, source: "sanity"}, context);
      const {resultFingerprint: _oldFingerprint, ...semantic} = {...result, adapterFingerprint: descriptor.fingerprint};
      return Object.freeze({...semantic, resultFingerprint: fingerprintDiscoveryResult(semantic)});
    },
  }));
  const discovery = await new CandidateDiscoveryService(registry).discover(request);
  return Object.freeze({mode: "in-memory", readOnly: true, persists: false, request, discovery, resolution: resolveDiscoveredIdentity(request, discovery)});
}

export const au5CandidateDiscoveryRealMode = Object.freeze({
  automatic: false, requiresExplicitAction: true, readsOnly: true,
  creates: false, modifies: false, persists: false, merges: false,
});
