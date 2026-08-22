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
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from "./store";
import {getNotificationVisual} from "./icons";
import NotificationPriorityBadge from "./NotificationPriorityBadge";
import type {LabNotification} from "./types";
import {buildNotificationPresentation, selectBellNotifications} from "./presentation";
import {presentHistoricalEditorialCopy} from "../lib/editorialReadError";
import {adaptNotificationFeedback} from "../feedback";
import {FeedbackEmptyState, FeedbackMeta} from "../components/feedback/VisualFeedback";
import {navigateLaboratory} from "../app/useLaboratoryRouter";

const MAX_VISIBLE_NOTIFICATIONS = 5;
const PANEL_ID = "notification-bell-summary";

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "Ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function BellIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

const NotificationItem = memo(function NotificationItem({notification}: {notification: LabNotification}): ReactElement {
  const title = presentHistoricalEditorialCopy(notification.title);
  const message = presentHistoricalEditorialCopy(notification.message);
  const feedback = adaptNotificationFeedback(notification, {title, message});
  const presentation = buildNotificationPresentation(notification, {title, message});
  const visual = getNotificationVisual(notification.kind, notification.level);

  return (
    <article className="motion-notification-item" style={{...styles.item, ...(!notification.read ? styles.itemUnread : {})}} data-notification-tone={presentation.tone}>
      <div style={{...styles.statusIcon, ...visual}} aria-hidden="true">
        <span style={styles.emojiIcon}>{visual.emoji}</span>
      </div>
      <div style={styles.itemBody}>
        <div style={styles.itemHeader}>
          <strong style={styles.itemTitle}>{title}</strong>
          <span style={styles.itemTime}>{formatRelativeDate(notification.createdAt)}</span>
        </div>
        <div style={styles.summaryMeta}>
          <NotificationPriorityBadge priority={notification.priority} />
          <span>{presentation.source}</span>
          {presentation.group.label ? <span>{presentation.group.label}</span> : null}
          {presentation.delivery.retryable ? <strong style={styles.actionRequired}>Requiere acción</strong> : null}
        </div>
        <FeedbackMeta feedback={feedback} />
      </div>
      {!notification.read ? (
        <button type="button" onClick={() => markNotificationAsRead(notification.id)} style={styles.unreadButton} title="Marcar como leída" aria-label={`Marcar ${title} como leída`}>
          <span style={styles.unreadDot} />
        </button>
      ) : null}
    </article>
  );
});

export default function NotificationBell(): ReactElement {
  const [notifications, setNotifications] = useState<LabNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function refresh(): void { setNotifications(getNotifications()); }
    refresh();
    const unsubscribe = subscribeToNotifications(refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") { setIsOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const unreadCount = useMemo(() => notifications.reduce((total, notification) => total + (notification.read ? 0 : 1), 0), [notifications]);
  const visibleNotifications = useMemo(() => selectBellNotifications(notifications, MAX_VISIBLE_NOTIFICATIONS), [notifications]);

  function openActivityCenter(): void {
    setIsOpen(false);
    navigateLaboratory("/actividad");
  }

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <button className="motion-interaction" ref={buttonRef} type="button" onClick={() => setIsOpen((current) => !current)} style={{...styles.bellButton, ...(isOpen ? styles.bellButtonActive : {})}} aria-expanded={isOpen} aria-controls={PANEL_ID} aria-label={`Actividad del laboratorio. ${unreadCount} sin leer`} title="Actividad del laboratorio">
        <BellIcon />
        {unreadCount > 0 ? <span style={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      {isOpen ? (
        <section className="motion-popover" id={PANEL_ID} style={styles.panel} aria-label="Resumen de actividad histórica">
          <header style={styles.panelHeader}>
            <div>
              <strong style={styles.panelTitle}>Actividad reciente</strong>
              <p style={styles.panelSubtitle}>{unreadCount > 0 ? `${unreadCount} sin leer` : "Todo al día"}</p>
            </div>
            {unreadCount > 0 ? <button type="button" onClick={markAllNotificationsAsRead} style={styles.headerAction}>Leer todo</button> : null}
          </header>
          {visibleNotifications.length > 0 ? (
            <div style={styles.list}>{visibleNotifications.map((notification) => <NotificationItem key={notification.id} notification={notification} />)}</div>
          ) : (
            <FeedbackEmptyState title="Todo en orden" detail="Los borradores, revisiones y errores aparecerán aquí." />
          )}
          <footer style={styles.panelFooter}>
            <button type="button" onClick={openActivityCenter} style={styles.activityLink}>Abrir Activity Center <span aria-hidden="true">→</span></button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {position: "relative", display: "inline-flex", justifyContent: "flex-end"},
  bellButton: {position: "relative", display: "grid", placeItems: "center", width: 40, height: 40, padding: 0, border: "1px solid rgba(255,255,255,0.11)", borderRadius: 12, background: "rgba(255,255,255,0.045)", color: "#dce3ea", cursor: "pointer"},
  bellButtonActive: {background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff"},
  badge: {position: "absolute", top: -5, right: -5, display: "grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 4px", border: "2px solid #0b0f14", borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800},
  panel: {position: "absolute", top: 48, right: 0, zIndex: 1000, width: "min(360px, calc(100vw - 32px))", maxHeight: "min(520px, calc(100vh - 90px))", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, background: "#12171d", color: "#f5f7fa", boxShadow: "0 18px 45px rgba(0,0,0,0.34)"},
  panelHeader: {display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "15px 16px 13px", borderBottom: "1px solid rgba(255,255,255,0.075)"},
  panelTitle: {display: "block", fontSize: 15, lineHeight: 1.2},
  panelSubtitle: {margin: "4px 0 0", color: "#84909d", fontSize: 11},
  headerAction: {padding: 0, border: 0, background: "transparent", color: "#9aa5b1", fontSize: 11, cursor: "pointer"},
  list: {maxHeight: 390, overflowY: "auto", overscrollBehavior: "contain"},
  item: {position: "relative", display: "grid", gridTemplateColumns: "30px minmax(0, 1fr)", gap: 11, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.065)"},
  itemUnread: {background: "rgba(96,165,250,0.055)"},
  statusIcon: {display: "grid", placeItems: "center", width: 29, height: 29, border: "1px solid transparent", borderRadius: 9},
  emojiIcon: {display: "block", fontSize: 15, lineHeight: 1},
  itemBody: {minWidth: 0},
  itemHeader: {display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10},
  itemTitle: {overflow: "hidden", color: "#f4f6f8", fontSize: 12, lineHeight: 1.35, textOverflow: "ellipsis", whiteSpace: "nowrap"},
  itemTime: {flexShrink: 0, color: "#6f7a86", fontSize: 10},
  summaryMeta: {display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 7, color: "#7f8a96", fontSize: 9},
  actionRequired: {color: "#fca5a5", fontWeight: 800},
  unreadButton: {position: "absolute", top: 5, right: 3, display: "grid", placeItems: "center", width: 22, height: 22, padding: 0, border: 0, background: "transparent", cursor: "pointer"},
  unreadDot: {width: 6, height: 6, borderRadius: 999, background: "#60a5fa"},
  panelFooter: {padding: "11px 16px", borderTop: "1px solid rgba(255,255,255,0.07)"},
  activityLink: {display: "flex", justifyContent: "space-between", width: "100%", padding: 0, border: 0, background: "transparent", color: "#8dbcf5", fontSize: 11, fontWeight: 700, cursor: "pointer"},
};
