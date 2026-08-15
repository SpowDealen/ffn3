import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from "./store";
import {getNotificationVisual} from "./icons";
import NotificationDeliveryStatus from "./NotificationDeliveryStatus";
import NotificationGroupingMetadata from "./NotificationGroupingMetadata";
import NotificationPriorityBadge from "./NotificationPriorityBadge";
import type {
  LabNotification,
} from "./types";
import {presentHistoricalEditorialCopy} from "../lib/editorialReadError";
import {FeedbackEmptyState} from "../components/feedback/VisualFeedback";

const MAX_VISIBLE_NOTIFICATIONS = 20;

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  );

  if (seconds < 60) return "Ahora";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function BellIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 21h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const NotificationItem = memo(function NotificationItem({
  notification,
  now,
}: {
  notification: LabNotification;
  now: number;
}): ReactElement {
  const title = presentHistoricalEditorialCopy(notification.title);
  const message = presentHistoricalEditorialCopy(notification.message);

  function openLocation(): void {
    markNotificationAsRead(notification.id);

    const url = notification.location?.url;

    if (!url) return;

    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(url);
  }

  return (
    <article
      style={{
        ...styles.item,
        ...(!notification.read ? styles.itemUnread : {}),
      }}
    >
      <div
        style={{
          ...styles.statusIcon,
          ...getNotificationVisual(
            notification.kind,
            notification.level,
          ),
        }}
        aria-hidden="true"
      >
        <span style={styles.emojiIcon}>
          {getNotificationVisual(
            notification.kind,
            notification.level,
          ).emoji}
        </span>
      </div>

      <div style={styles.itemBody}>
        <div style={styles.itemHeader}>
          <div style={styles.itemTitleGroup}>
            <strong style={styles.itemTitle}>
              {title}
            </strong>
            <NotificationPriorityBadge
              priority={notification.priority}
            />
          </div>

          <span style={styles.itemTime}>
            {formatRelativeDate(notification.createdAt)}
          </span>
        </div>

        <p style={styles.itemMessage}>
          {message}
        </p>

        <NotificationGroupingMetadata
          notification={notification}
          now={now}
        />

        <NotificationDeliveryStatus
          notification={notification}
        />

        {notification.location ? (
          <button
            type="button"
            onClick={openLocation}
            style={styles.actionButton}
          >
            {notification.location.label}
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      {!notification.read ? (
        <button
          type="button"
          onClick={() => markNotificationAsRead(notification.id)}
          style={styles.unreadButton}
          title="Marcar como leída"
          aria-label={`Marcar ${title} como leída`}
        >
          <span style={styles.unreadDot} />
        </button>
      ) : null}
    </article>
  );
});

export default function NotificationBell(): ReactElement {
  const [notifications, setNotifications] =
    useState<LabNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [now, setNow] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function refresh(): void {
      setNotifications(getNotifications());
      setNow(Date.now());
    }

    refresh();

    const unsubscribe = subscribeToNotifications(refresh);
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: MouseEvent): void {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const unreadCount = useMemo(
    () =>
      notifications.reduce(
        (total, notification) =>
          total + (notification.read ? 0 : 1),
        0,
      ),
    [notifications],
  );

  const visibleNotifications = useMemo(
    () => notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS),
    [notifications],
  );

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        style={{
          ...styles.bellButton,
          ...(isOpen ? styles.bellButtonActive : {}),
        }}
        aria-expanded={isOpen}
        aria-label={`Actividad del laboratorio. ${unreadCount} sin leer`}
        title="Actividad del laboratorio"
      >
        <BellIcon />

        {unreadCount > 0 ? (
          <span style={styles.badge}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section style={styles.panel}>
          <header style={styles.panelHeader}>
            <div>
              <strong style={styles.panelTitle}>
                Actividad
              </strong>

              <p style={styles.panelSubtitle}>
                {unreadCount > 0
                  ? `${unreadCount} pendiente${
                      unreadCount === 1 ? "" : "s"
                    }`
                  : "Todo al día"}
              </p>
            </div>

            <div style={styles.panelActions}>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  style={styles.headerAction}
                >
                  Leer todo
                </button>
              ) : null}

              {notifications.length > 0 ? (
                <button
                  type="button"
                  onClick={clearNotifications}
                  style={styles.headerAction}
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </header>

          {visibleNotifications.length > 0 ? (
            <div style={styles.list}>
              {visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  now={now}
                />
              ))}
            </div>
          ) : <FeedbackEmptyState
            title="Todo en orden"
            detail="Los borradores, revisiones y errores aparecerán aquí."
          />}

          {notifications.length > MAX_VISIBLE_NOTIFICATIONS ? (
            <footer style={styles.panelFooter}>
              Mostrando las últimas {MAX_VISIBLE_NOTIFICATIONS}
            </footer>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "inline-flex",
    justifyContent: "flex-end",
  },

  bellButton: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    padding: 0,
    border: "1px solid rgba(255,255,255,0.11)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.045)",
    color: "#dce3ea",
    cursor: "pointer",
    transition:
      "background 140ms ease, border-color 140ms ease, color 140ms ease",
  },

  bellButtonActive: {
    background: "rgba(255,255,255,0.09)",
    borderColor: "rgba(255,255,255,0.2)",
    color: "#ffffff",
  },

  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    display: "grid",
    placeItems: "center",
    minWidth: 18,
    height: 18,
    padding: "0 4px",
    border: "2px solid #0b0f14",
    borderRadius: 999,
    background: "#ef4444",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1,
  },

  panel: {
    position: "absolute",
    top: 48,
    right: 0,
    zIndex: 1000,
    width: "min(380px, calc(100vw - 32px))",
    maxHeight: "min(560px, calc(100vh - 90px))",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    background: "#12171d",
    color: "#f5f7fa",
    boxShadow: "0 18px 45px rgba(0,0,0,0.34)",
    animation: "none",
  },

  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    padding: "15px 16px 13px",
    borderBottom: "1px solid rgba(255,255,255,0.075)",
  },

  panelTitle: {
    display: "block",
    fontSize: 15,
    lineHeight: 1.2,
  },

  panelSubtitle: {
    margin: "4px 0 0",
    color: "#84909d",
    fontSize: 11,
  },

  panelActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  headerAction: {
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#9aa5b1",
    fontSize: 11,
    cursor: "pointer",
  },

  list: {
    maxHeight: 475,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },

  item: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "30px minmax(0, 1fr)",
    gap: 11,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.065)",
    contentVisibility: "auto",
    containIntrinsicSize: "90px",
  },

  itemUnread: {
    background: "rgba(255,255,255,0.025)",
  },

  statusIcon: {
    display: "grid",
    placeItems: "center",
    width: 29,
    height: 29,
    border: "1px solid transparent",
    borderRadius: 9,
  },

  emojiIcon: {
    display: "block",
    fontSize: 15,
    lineHeight: 1,
  },

  itemBody: {
    minWidth: 0,
  },

  itemHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  itemTitleGroup: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    flex: "1 1 auto",
    minWidth: 0,
  },

  itemTitle: {
    overflow: "hidden",
    flex: "1 1 150px",
    minWidth: 0,
    color: "#f4f6f8",
    fontSize: 13,
    fontWeight: 650,
    lineHeight: 1.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  itemTime: {
    flexShrink: 0,
    paddingTop: 1,
    color: "#6f7a86",
    fontSize: 10,
  },

  itemMessage: {
    margin: "5px 0 0",
    color: "#aeb7c0",
    fontSize: 12,
    lineHeight: 1.45,
  },

  actionButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },

  unreadButton: {
    position: "absolute",
    top: 9,
    right: 5,
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 22,
    padding: 0,
    border: 0,
    background: "transparent",
    cursor: "pointer",
  },

  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "#60a5fa",
  },

  emptyState: {
    display: "grid",
    justifyItems: "center",
    padding: "42px 24px",
    textAlign: "center",
  },

  emptyIcon: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    marginBottom: 11,
    borderRadius: 10,
    background: "rgba(52,211,153,0.12)",
    color: "#6ee7b7",
  },

  emptyTitle: {
    fontSize: 13,
  },

  emptyMessage: {
    maxWidth: 245,
    margin: "6px 0 0",
    color: "#7f8a96",
    fontSize: 11,
    lineHeight: 1.45,
  },

  panelFooter: {
    padding: "10px 16px",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    color: "#6f7a86",
    fontSize: 10,
    textAlign: "center",
  },
};
