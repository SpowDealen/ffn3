import {EntityResolutionEngine} from "./engine";
import {createCanonicalEntityResolutionProfiles, type EntityResolutionProfileDependencies} from "./profiles";
import {EntityResolutionProfileRegistry} from "./registry";

export function createEntityResolutionEngine(dependencies: EntityResolutionProfileDependencies, options: {clock?: () => Date; monotonic?: () => number} = {}): EntityResolutionEngine {
  const registry = new EntityResolutionProfileRegistry();
  for (const profile of createCanonicalEntityResolutionProfiles(dependencies)) registry.register(profile);
  return new EntityResolutionEngine(registry, options.clock, options.monotonic);
}
