import type {CSSProperties, MouseEvent, ReactElement} from "react";
import {canInvokeInteraction, type InteractionCapability} from "./model";

function interactionClass(capability: InteractionCapability): string {
  if (capability.kind === "destructive") return "review-button review-button-danger";
  if (capability.kind === "primary") return "review-button";
  return `review-button review-button-secondary${capability.kind === "subtle" ? " interaction-button-subtle" : ""}`;
}

export function ActionReason({capability}: {capability: InteractionCapability}): ReactElement | null {
  if (!capability.disabledReason) return null;
  return <small className="interaction-reason" id={`${capability.id}-reason`}>{capability.disabledReason}</small>;
}

export function InteractionButton({capability, onInvoke, className, style, showReason = true}: {
  capability: InteractionCapability;
  onInvoke: () => void;
  className?: string;
  style?: CSSProperties;
  showReason?: boolean;
}): ReactElement {
  const disabled = !canInvokeInteraction(capability);
  return <span className="interaction-control" data-interaction-intent={capability.intent} data-interaction-kind={capability.kind} data-authority-source={capability.authoritySource}>
    <button
      type="button"
      className={`${interactionClass(capability)}${capability.busy ? " interaction-button-busy" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      disabled={disabled}
      aria-busy={capability.busy || undefined}
      aria-describedby={showReason && capability.disabledReason ? `${capability.id}-reason` : undefined}
      data-requires-confirmation={capability.requiresConfirmation ? capability.confirmation : undefined}
      onClick={() => { if (canInvokeInteraction(capability)) onInvoke(); }}
    >{capability.presentedLabel}</button>
    {showReason ? <ActionReason capability={capability} /> : null}
  </span>;
}

export function InteractionLink({capability, onNavigate, className}: {
  capability: InteractionCapability;
  onNavigate?: (href: string) => void;
  className?: string;
}): ReactElement {
  const href = capability.href ?? "";
  if (!canInvokeInteraction(capability) || !href) {
    return <span className={`interaction-link interaction-link-disabled${className ? ` ${className}` : ""}`} role="link" aria-disabled="true" aria-describedby={capability.disabledReason ? `${capability.id}-reason` : undefined}>{capability.presentedLabel}<ActionReason capability={capability} /></span>;
  }
  return <a className={`interaction-link${className ? ` ${className}` : ""}`} href={href} data-interaction-intent="navigate" onClick={onNavigate ? (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onNavigate(href); } : undefined}>{capability.presentedLabel}</a>;
}

export const interactionPrimitivesSecurity = Object.freeze({createsState: false, fetches: false, persists: false, writes: false, authorizes: false, confirms: false} as const);
