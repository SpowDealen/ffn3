import type {EngineRequest, EntityResolutionMode, ResolutionProfile, ResolutionProfileDescriptor} from "./types";

const key = (descriptor: ResolutionProfileDescriptor) => `${descriptor.entityType}:${descriptor.profileId}@${descriptor.profileVersion}`;
const semantic = (descriptor: ResolutionProfileDescriptor) => JSON.stringify({...descriptor, modes: [...descriptor.modes].sort(), capabilities: [...descriptor.capabilities].sort(), sourcesByMode: Object.fromEntries(Object.entries(descriptor.sourcesByMode).sort(([left], [right]) => left.localeCompare(right)).map(([mode, sources]) => [mode, [...(sources ?? [])].sort()]))});
const expectedCapability = {identity_lookup: "identity_discovery", creation_preflight: "guarded_creation", existing_reconciliation: "reconciliation_scan"} as const;

export class EntityResolutionProfileRegistry {
  readonly #profiles = new Map<string, ResolutionProfile>();

  register(profile: ResolutionProfile): this {
    const descriptor = profile.descriptor;
    if (!descriptor.profileId.trim() || !descriptor.profileVersion.trim() || !descriptor.rulesVersion.trim() || !descriptor.fingerprint.trim() || !descriptor.modes.length || !descriptor.capabilities.length || typeof profile.execute !== "function") throw new Error("entity_resolution_profile_invalid");
    if (new Set(descriptor.modes).size !== descriptor.modes.length || new Set(descriptor.capabilities).size !== descriptor.capabilities.length) throw new Error("entity_resolution_profile_ambiguous");
    if (descriptor.capabilities.length !== descriptor.modes.length || descriptor.modes.some((mode) => !descriptor.capabilities.includes(expectedCapability[mode]))) throw new Error("entity_resolution_profile_capability_inconsistent");
    for (const mode of descriptor.modes) if (!(descriptor.sourcesByMode[mode]?.length)) throw new Error("entity_resolution_profile_capability_inconsistent");
    const existing = this.#profiles.get(key(descriptor));
    if (existing) {
      if (existing !== profile || semantic(existing.descriptor) !== semantic(descriptor)) throw new Error("entity_resolution_profile_duplicate_incompatible");
      return this;
    }
    if ([...this.#profiles.values()].some((item) => item.descriptor.entityType === descriptor.entityType && item.descriptor.modes.some((mode) => descriptor.modes.includes(mode)))) throw new Error("entity_resolution_profile_ambiguous");
    this.#profiles.set(key(descriptor), profile);
    return this;
  }

  listProfiles(): readonly ResolutionProfileDescriptor[] {
    return Object.freeze([...this.#profiles.values()].map((profile) => profile.descriptor).sort((left, right) => left.entityType.localeCompare(right.entityType) || left.profileId.localeCompare(right.profileId) || left.profileVersion.localeCompare(right.profileVersion)));
  }

  resolve(entityType: EngineRequest["entityType"], mode: EntityResolutionMode): ResolutionProfile | undefined {
    return [...this.#profiles.values()].find((profile) => profile.descriptor.entityType === entityType && profile.descriptor.modes.includes(mode));
  }
}
