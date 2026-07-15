import type {
  CSSProperties,
  ReactElement,
} from "react";
import type {NotificationPriority} from "./types";

export type NotificationPriorityPresentation = {
  icon: string;
  label: string;
  color: string;
  background: string;
  borderColor: string;
};

const PRIORITY_PRESENTATIONS: Record<
  NotificationPriority,
  NotificationPriorityPresentation
> = {
  critical: {
    icon: "🔴",
    label: "CRÍTICA",
    color: "#fca5a5",
    background: "rgba(248,113,113,0.08)",
    borderColor: "rgba(248,113,113,0.18)",
  },
  high: {
    icon: "🟠",
    label: "ALTA",
    color: "#fdba74",
    background: "rgba(251,146,60,0.08)",
    borderColor: "rgba(251,146,60,0.18)",
  },
  normal: {
    icon: "🔵",
    label: "NORMAL",
    color: "#93c5fd",
    background: "rgba(96,165,250,0.08)",
    borderColor: "rgba(96,165,250,0.18)",
  },
  low: {
    icon: "⚪",
    label: "BAJA",
    color: "#b8c1cb",
    background: "rgba(184,193,203,0.06)",
    borderColor: "rgba(184,193,203,0.14)",
  },
};

export function getNotificationPriorityPresentation(
  priority: NotificationPriority,
): NotificationPriorityPresentation {
  return PRIORITY_PRESENTATIONS[priority];
}

export default function NotificationPriorityBadge({
  priority,
}: {
  priority: NotificationPriority | undefined;
}): ReactElement | null {
  if (!priority) return null;

  const presentation = getNotificationPriorityPresentation(priority);

  return (
    <span
      style={{
        ...styles.badge,
        color: presentation.color,
        background: presentation.background,
        borderColor: presentation.borderColor,
      }}
    >
      <span aria-hidden="true">{presentation.icon}</span>
      {presentation.label}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  badge: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
    minHeight: 18,
    padding: "1px 6px",
    border: "1px solid transparent",
    borderRadius: 999,
    fontSize: 8,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  },
};
