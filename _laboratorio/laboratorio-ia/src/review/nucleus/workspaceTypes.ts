import type {BuildNucleusResolutionInput, NucleusPrimaryAction, NucleusResolutionViewModel, NucleusTimelineEvent} from "./types";

export const OPERATIONAL_WORKSPACE_VERSION = "1.0.0" as const;

export type OperationalWorkspaceZoneId = "summary" | "evidence" | "resolution" | "execution" | "knowledge" | "history";
export type OperationalWorkspaceZoneState = "ready" | "attention" | "required" | "empty" | "unsupported";

export type OperationalWorkspaceMetric = Readonly<{label: string; value: string | number; tone: "neutral" | "positive" | "warning" | "critical"}>;

export type OperationalWorkspaceZone = Readonly<{
  id: OperationalWorkspaceZoneId;
  order: number;
  label: string;
  state: OperationalWorkspaceZoneState;
  safeSummary: string;
  metrics: readonly OperationalWorkspaceMetric[];
  timeline: readonly NucleusTimelineEvent[];
  lazy: boolean;
  mountedByDefault: boolean;
  unsupported: readonly string[];
}>;

export type OperationalWorkspaceViewModel = Readonly<{
  version: typeof OPERATIONAL_WORKSPACE_VERSION;
  nucleus: NucleusResolutionViewModel;
  primaryAction: NucleusPrimaryAction;
  zones: readonly OperationalWorkspaceZone[];
  navigation: readonly Exclude<OperationalWorkspaceZoneId, "summary">[];
  suggestedZone: Exclude<OperationalWorkspaceZoneId, "summary"> | undefined;
  contextualTimeline: Readonly<Record<OperationalWorkspaceZoneId, readonly NucleusTimelineEvent[]>>;
  layout: Readonly<{desktopColumns: 2; tabletColumns: 2; mobileColumns: 1; narrowViewport: 390; fingerprintsWrapAnywhere: true}>;
  accessibility: Readonly<{keyboardNavigation: true; nativeButtons: true; focusManaged: true; busyAnnounced: true; alertsAnnounced: true; reducedMotion: true}>;
  onePrimaryAction: true;
  lazyTechnicalSections: true;
  persistsNavigation: false;
  presentationOnly: true;
  invokesExecutors: false;
  writes: false;
}>;

export type BuildOperationalWorkspaceInput = BuildNucleusResolutionInput;

export const operationalWorkspaceSecurity = Object.freeze({pure: true, derivesNucleusOnly: true, createsEngines: false, createsPlanners: false, createsStores: false, createsExecutors: false, persistsNavigation: false, invokesExecutors: false, accessesSanity: false, accessesNetwork: false, autoExecutes: false, autoAppliesKnowledge: false, hidesUnsupported: false, exposesPayloads: false, writes: false} as const);
