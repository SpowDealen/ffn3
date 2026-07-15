import type {
  CSSProperties,
  ReactElement,
} from "react";
import type {LabNotification} from "./types";

function formatUpdatedRelativeTime(
  value: string,
  now: number,
): string | undefined {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return undefined;

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000),
  );

  if (seconds < 60) return "Actualizada hace unos segundos";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Actualizada hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Actualizada hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return "Actualizada ayer";

  return `Actualizada hace ${days} días`;
}

export default function NotificationGroupingMetadata({
  notification,
  now,
}: {
  notification: LabNotification;
  now: number;
}): ReactElement | null {
  const updated = notification.updatedAt
    ? formatUpdatedRelativeTime(notification.updatedAt, now)
    : undefined;
  const updateCount = notification.updateCount ?? 0;
  const countLabel =
    updateCount > 0
      ? `${updateCount} actualización${
          updateCount === 1 ? "" : "es"
        }`
      : undefined;
  const metadata = [updated, countLabel].filter(
    (value): value is string => Boolean(value),
  );

  if (metadata.length === 0) return null;

  return (
    <span style={styles.metadata}>
      {metadata.join(" · ")}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  metadata: {
    display: "block",
    marginTop: 7,
    color: "#6f7a86",
    fontSize: 9,
    lineHeight: 1.4,
  },
};
