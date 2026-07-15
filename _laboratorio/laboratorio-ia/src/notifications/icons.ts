import type {
  NotificationKind,
  NotificationLevel,
} from "./types";

export type NotificationVisual = {
  emoji: string;
  background: string;
  color: string;
  borderColor: string;
};

const VISUALS: Record<NotificationKind, NotificationVisual> = {
  analysis: {
    emoji: "🤖",
    background: "rgba(96,165,250,0.12)",
    color: "#93c5fd",
    borderColor: "rgba(96,165,250,0.22)",
  },
  news: {
    emoji: "📰",
    background: "rgba(56,189,248,0.12)",
    color: "#7dd3fc",
    borderColor: "rgba(56,189,248,0.22)",
  },
  draft: {
    emoji: "📄",
    background: "rgba(52,211,153,0.12)",
    color: "#6ee7b7",
    borderColor: "rgba(52,211,153,0.22)",
  },
  event: {
    emoji: "🏆",
    background: "rgba(251,191,36,0.12)",
    color: "#fcd34d",
    borderColor: "rgba(251,191,36,0.22)",
  },
  fighter: {
    emoji: "👥",
    background: "rgba(167,139,250,0.12)",
    color: "#c4b5fd",
    borderColor: "rgba(167,139,250,0.22)",
  },
  fight: {
    emoji: "🥊",
    background: "rgba(251,146,60,0.12)",
    color: "#fdba74",
    borderColor: "rgba(251,146,60,0.22)",
  },
  organization: {
    emoji: "🏢",
    background: "rgba(148,163,184,0.12)",
    color: "#cbd5e1",
    borderColor: "rgba(148,163,184,0.22)",
  },
  category: {
    emoji: "⚖️",
    background: "rgba(45,212,191,0.12)",
    color: "#5eead4",
    borderColor: "rgba(45,212,191,0.22)",
  },
  image: {
    emoji: "🖼️",
    background: "rgba(244,114,182,0.12)",
    color: "#f9a8d4",
    borderColor: "rgba(244,114,182,0.22)",
  },
  sanity: {
    emoji: "💾",
    background: "rgba(192,132,252,0.12)",
    color: "#d8b4fe",
    borderColor: "rgba(192,132,252,0.22)",
  },
  source: {
    emoji: "📡",
    background: "rgba(34,211,238,0.12)",
    color: "#67e8f9",
    borderColor: "rgba(34,211,238,0.22)",
  },
  system: {
    emoji: "⚙️",
    background: "rgba(148,163,184,0.12)",
    color: "#cbd5e1",
    borderColor: "rgba(148,163,184,0.22)",
  },
};

export function getNotificationVisual(
  kind: NotificationKind | undefined,
  level: NotificationLevel,
): NotificationVisual {
  if (level === "error") {
    return {
      emoji: "❌",
      background: "rgba(248,113,113,0.12)",
      color: "#fca5a5",
      borderColor: "rgba(248,113,113,0.22)",
    };
  }

  if (level === "review") {
    return {
      emoji: "⚠️",
      background: "rgba(251,191,36,0.12)",
      color: "#fcd34d",
      borderColor: "rgba(251,191,36,0.22)",
    };
  }

  return VISUALS[kind ?? "system"];
}
