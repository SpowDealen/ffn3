export type InteractionKind = "primary" | "secondary" | "destructive" | "subtle";

export type InteractionIntent =
  | "execute"
  | "retry"
  | "refresh"
  | "navigate"
  | "toggle"
  | "authorize"
  | "cancel"
  | "resume"
  | "confirm"
  | "filter";

export type InteractionConfirmation = "none" | "visual" | "domain";

export type InteractionAuthority = Readonly<{
  allowed: boolean;
  source: string;
  reason?: string;
  confirmation?: InteractionConfirmation;
}>;

export type InteractionCapability = Readonly<{
  id: string;
  label: string;
  presentedLabel: string;
  kind: InteractionKind;
  intent: InteractionIntent;
  enabled: boolean;
  busy: boolean;
  destructive: boolean;
  disabledReason?: string;
  confirmation: InteractionConfirmation;
  requiresConfirmation: boolean;
  authoritySource: string;
  href?: string;
  presentationOnly: true;
}>;

export type InteractionCapabilityInput = Readonly<{
  id: string;
  label: string;
  busyLabel?: string;
  kind: InteractionKind;
  intent: InteractionIntent;
  authority: InteractionAuthority;
  busy?: boolean;
  busyReason?: string;
  href?: string;
}>;

export function buildInteractionCapability(input: InteractionCapabilityInput): InteractionCapability {
  const busy = Boolean(input.busy);
  const enabled = input.authority.allowed && !busy;
  const confirmation = input.authority.confirmation ?? "none";
  return Object.freeze({
    id: input.id,
    label: input.label,
    presentedLabel: busy ? input.busyLabel ?? input.label : input.label,
    kind: input.kind,
    intent: input.intent,
    enabled,
    busy,
    destructive: input.kind === "destructive",
    disabledReason: enabled ? undefined : busy
      ? input.busyReason ?? "La acción ya está en curso."
      : input.authority.reason ?? "La autoridad de origen no permite esta acción.",
    confirmation,
    requiresConfirmation: confirmation !== "none",
    authoritySource: input.authority.source,
    href: input.href,
    presentationOnly: true,
  });
}

export function canInvokeInteraction(capability: InteractionCapability): boolean {
  return capability.enabled && !capability.busy;
}

export const interactionSystemSecurity = Object.freeze({
  createsStore: false,
  createsAuthorizationAuthority: false,
  createsRetryAuthority: false,
  createsCommandBus: false,
  fetches: false,
  persists: false,
  writes: false,
  schedules: false,
  mutatesDomain: false,
} as const);
