import type {ProcessExperiencePresentation} from "../processes/presentation";
import {buildInteractionCapability, type InteractionCapability} from "./model";

export function adaptRefreshInteraction(input: Readonly<{
  id: string;
  label: string;
  busyLabel: string;
  busy: boolean;
  source: string;
}>): InteractionCapability {
  return buildInteractionCapability({
    id: input.id,
    label: input.label,
    busyLabel: input.busyLabel,
    kind: "secondary",
    intent: "refresh",
    authority: {allowed: true, source: input.source},
    busy: input.busy,
    busyReason: "La comprobación ya está en curso.",
  });
}

export function adaptRetryInteraction(input: Readonly<{
  id: string;
  label?: string;
  authorized: boolean;
  busy?: boolean;
  source: string;
  reason?: string;
}>): InteractionCapability {
  return buildInteractionCapability({
    id: input.id,
    label: input.label ?? "Reintentar",
    busyLabel: "Reintentando…",
    kind: "secondary",
    intent: "retry",
    authority: {allowed: input.authorized, source: input.source, reason: input.reason},
    busy: input.busy,
    busyReason: "El reintento ya está en curso.",
  });
}

export function adaptNavigationInteraction(input: Readonly<{id: string; label: string; href: string; source: string; enabled?: boolean; reason?: string}>): InteractionCapability {
  return buildInteractionCapability({
    id: input.id,
    label: input.label,
    kind: "subtle",
    intent: "navigate",
    authority: {allowed: input.enabled ?? true, source: input.source, reason: input.reason},
    href: input.href,
  });
}

export function adaptProcessInteraction(process: ProcessExperiencePresentation, intent: "retry" | "cancel"): InteractionCapability {
  const authorized = intent === "retry" ? process.retryAuthorized : process.cancelAuthorized;
  const terminal = process.isHistorical || ["completed", "cancelled"].includes(process.state);
  return buildInteractionCapability({
    id: `${intent}-${process.id}`,
    label: intent === "retry" ? "Reintentar" : "Cancelar",
    kind: intent === "cancel" ? "destructive" : "secondary",
    intent,
    authority: {
      allowed: !terminal && authorized,
      source: process.source,
      reason: terminal
        ? "El proceso ya es terminal; esta acción no está disponible."
        : authorized ? undefined : `La autoridad de origen no autoriza ${intent === "retry" ? "el reintento" : "la cancelación"}.`,
      confirmation: intent === "cancel" && authorized ? "domain" : "none",
    },
  });
}

export const interactionAdaptersSecurity = Object.freeze({pure: true, fetches: false, persists: false, writes: false, createsAuthority: false} as const);
