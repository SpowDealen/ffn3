import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {getNotificationVisual} from "./icons";
import NotificationDeliveryStatus from "./NotificationDeliveryStatus";
import NotificationAuditDetails from "./NotificationAuditDetails";
import NotificationGroupingMetadata from "./NotificationGroupingMetadata";
import NotificationPriorityBadge from "./NotificationPriorityBadge";
import {
  getNotifications,
  markNotificationAsRead,
  subscribeToNotifications,
} from "./store";
import {
  getTelegramHealth,
  type TelegramHealthResponse,
} from "./telegramHealth";
import type {
  LabNotification,
  NotificationLevel,
  NotificationPriority,
} from "./types";
import {
  calculateDeliveryMetrics,
  calculateTelegramDeliveryHealth,
} from "./metrics";
import {
  classifyEditorialReadError,
  presentHistoricalEditorialCopy,
  presentTelegramDeliveryFailure,
} from "../lib/editorialReadError";
import {adaptNotificationFeedback, adaptTelegramHealthFeedback} from "../feedback";
import {FeedbackEmptyState, GlobalFeedbackRegion} from "../components/feedback/VisualFeedback";
import {buildNotificationPresentation} from "./presentation";
import {adaptRefreshInteraction} from "../interactions/adapters";
import {InteractionButton} from "../interactions/InteractionPrimitives";

type LevelFilter = "all" | NotificationLevel;
type PriorityFilter =
  | "all"
  | "unassigned"
  | NotificationPriority;
type MetricFilter =
  | "sent"
  | "failed"
  | "pending"
  | "skipped"
  | "grouped";

const METRIC_CARDS: Array<{
  key: MetricFilter;
  icon: string;
  label: string;
}> = [
  {key: "sent", icon: "🟢", label: "Enviadas"},
  {key: "failed", icon: "🔴", label: "Fallidas"},
  {key: "pending", icon: "🟡", label: "Pendientes"},
  {key: "skipped", icon: "⚪", label: "Omitidas"},
  {key: "grouped", icon: "🔄", label: "Agrupadas"},
];

function normalizeSource(value: string): string {
  return value.trim().toLocaleLowerCase("es-ES");
}

function telegramEditorialError(error: unknown): string {
  return classifyEditorialReadError(error).message;
}

function matchesMetricFilter(
  notification: LabNotification,
  metricFilter: MetricFilter | null,
): boolean {
  if (!metricFilter) return true;

  if (metricFilter === "grouped") {
    return (notification.updateCount ?? 0) > 0;
  }

  return notification.deliveryStatus === metricFilter;
}

function formatRelativeDate(value: string, now: number): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(
    0,
    Math.floor((now - timestamp) / 1000),
  );

  if (seconds < 10) return "Ahora";
  if (seconds < 60) return `Hace ${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  return `Hace ${Math.floor(hours / 24)} d`;
}

function formatDeliveryDuration(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${Math.round(milliseconds)} ms`;
  }

  if (milliseconds < 60_000) {
    return `${(milliseconds / 1_000).toFixed(1)} s`;
  }

  return `${(milliseconds / 60_000).toFixed(1)} min`;
}

function getStateLabel(
  hasLiveIncident: boolean,
  historicalErrors: number,
  reviews: number,
): string {
  if (hasLiveIncident) return "Incidencia activa";
  if (historicalErrors > 0) return `${historicalErrors} registro${historicalErrors === 1 ? "" : "s"} histórico${historicalErrors === 1 ? "" : "s"} con error`;
  if (reviews > 0) {
    return `${reviews} revisión${reviews === 1 ? "" : "es"} pendiente${reviews === 1 ? "" : "s"}`;
  }

  return "Todo en orden";
}

const ActivityItem = memo(function ActivityItem({
  notification,
  now,
  detailExpanded,
  onToggleDetail,
  auditExpanded,
  onToggleAudit,
}: {
  notification: LabNotification;
  now: number;
  detailExpanded: boolean;
  onToggleDetail: (id: string) => void;
  auditExpanded: boolean;
  onToggleAudit: (id: string) => void;
}): ReactElement {
  const visual = getNotificationVisual(
    notification.kind,
    notification.level,
  );
  const title = presentHistoricalEditorialCopy(notification.title);
  const message = presentHistoricalEditorialCopy(notification.message);
  const feedback = adaptNotificationFeedback(notification, {title, message});
  const presentation = buildNotificationPresentation(notification, {title, message});
  const detailId = `notification-detail-${notification.id}`;

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
      className="motion-activity-item"
      style={{...styles.activityItem, ...(!notification.read ? styles.activityItemUnread : {})}}
      data-notification-tone={presentation.tone}
    >
      <div style={styles.latestActivity}>
        <div
          style={{
            ...styles.latestIcon,
            background: visual.background,
            color: visual.color,
            borderColor: visual.borderColor,
          }}
          aria-hidden="true"
        >
          {visual.emoji}
        </div>

        <div style={styles.latestBody}>
          <div style={styles.activityTitleRow}>
            <strong style={styles.latestTitle}>{title}</strong>
            <NotificationPriorityBadge
              priority={notification.priority}
            />
            {!notification.read ? <span style={styles.unreadLabel}>Sin leer</span> : null}
          </div>
          <p style={styles.latestMessage}>{message}</p>
          <div style={styles.summaryLine}>
            <span>{presentation.source}</span>
            <span>{formatRelativeDate(notification.createdAt, now)}</span>
            {presentation.group.label ? <span>{presentation.group.label}</span> : null}
            {presentation.delivery.retryable ? <strong style={styles.actionRequired}>Requiere acción</strong> : null}
          </div>
        </div>
      </div>

      <div style={styles.itemActions}>
        {!notification.read ? (
          <button type="button" onClick={() => markNotificationAsRead(notification.id)} style={styles.itemAction}>
            Marcar como leída
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onToggleDetail(notification.id)}
          style={styles.itemAction}
          aria-expanded={detailExpanded}
          aria-controls={detailId}
        >
          {detailExpanded ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>

      {detailExpanded ? (
        <div id={detailId} className="motion-disclosure-content" style={styles.detailPanel}>
          <GlobalFeedbackRegion feedback={feedback} announce={false} />
          <NotificationGroupingMetadata notification={notification} now={now} />
          <section style={styles.deliverySection} aria-label="Resultado de entrega individual">
            <span style={styles.detailEyebrow}>Entrega individual</span>
            <NotificationDeliveryStatus notification={notification} />
          </section>
          {notification.location ? (
            <button type="button" onClick={openLocation} style={styles.locationAction}>
              {notification.location.label} <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <NotificationAuditDetails notification={notification} expanded={auditExpanded} onToggle={onToggleAudit} />
        </div>
      ) : null}
    </article>
  );
});

export type ActivityCenterView = "summary" | "activity" | "telegram";

export default function ActivityCenter({view = "activity"}: {view?: ActivityCenterView}): ReactElement {
  const [notifications, setNotifications] =
    useState<LabNotification[]>([]);
  const [now, setNow] = useState(Date.now());
  const [levelFilter, setLevelFilter] =
    useState<LevelFilter>("all");
  const [sourceFilter, setSourceFilter] =
    useState("all");
  const [metricFilter, setMetricFilter] =
    useState<MetricFilter | null>(null);
  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>("all");
  const [liveTelegramHealth, setLiveTelegramHealth] =
    useState<TelegramHealthResponse | null>(null);
  const [liveTelegramError, setLiveTelegramError] =
    useState<string | null>(null);
  const [isCheckingTelegram, setIsCheckingTelegram] =
    useState(false);
  const [expandedDetailIds, setExpandedDetailIds] =
    useState<Set<string>>(() => new Set());
  const [expandedAuditIds, setExpandedAuditIds] =
    useState<Set<string>>(() => new Set());

  const toggleNotificationDetail = useCallback((id: string) => {
    setExpandedDetailIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleNotificationAudit = useCallback((id: string) => {
    setExpandedAuditIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    function refresh(): void {
      setNotifications(getNotifications());
      setNow(Date.now());
    }

    refresh();

    const unsubscribe = subscribeToNotifications(refresh);
    const timer = window.setInterval(
      () => setNow(Date.now()),
      30_000,
    );

    setIsCheckingTelegram(true);
    void getTelegramHealth()
      .then((health) => {
        if (!isActive) return;

        setLiveTelegramHealth(health);
        setLiveTelegramError(health.error ? telegramEditorialError(health.error) : null);
      })
      .catch((error: unknown) => {
        if (!isActive) return;

        console.warn("[FFN3] Error técnico comprobando Telegram", error);
        setLiveTelegramError(telegramEditorialError(error));
      })
      .finally(() => { if (isActive) setIsCheckingTelegram(false); });

    return () => {
      isActive = false;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const availableIds = new Set(
      notifications.map((notification) => notification.id),
    );

    setExpandedAuditIds((current) => {
      const remainingIds = new Set(
        [...current].filter((id) => availableIds.has(id)),
      );

      return remainingIds.size === current.size
        ? current
        : remainingIds;
    });

    setExpandedDetailIds((current) => {
      const remainingIds = new Set(
        [...current].filter((id) => availableIds.has(id)),
      );

      return remainingIds.size === current.size
        ? current
        : remainingIds;
    });
  }, [notifications]);

  async function checkTelegram(): Promise<void> {
    if (isCheckingTelegram) return;
    setIsCheckingTelegram(true);
    setLiveTelegramError(null);
    try {
      const health = await getTelegramHealth();
      setLiveTelegramHealth(health);
      setLiveTelegramError(health.error ? telegramEditorialError(health.error) : null);
    } catch (error) {
      console.warn("[FFN3] Error técnico comprobando Telegram", error);
      setLiveTelegramError(telegramEditorialError(error));
    } finally {
      setIsCheckingTelegram(false);
    }
  }

  const availableSources = useMemo(() => {
    const sources = new Map<string, string>();

    for (const notification of notifications) {
      const source = notification.source?.trim();

      if (source) {
        const key = normalizeSource(source);

        if (!sources.has(key)) {
          sources.set(key, source);
        }
      }
    }

    return [...sources.values()].sort((left, right) =>
      left.localeCompare(right, "es-ES", {
        sensitivity: "base",
      }),
    );
  }, [notifications]);

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        const matchesLevel =
          levelFilter === "all" ||
          notification.level === levelFilter;
        const matchesSource =
          sourceFilter === "all" ||
          (notification.source
            ? normalizeSource(notification.source) ===
              normalizeSource(sourceFilter)
            : false);
        const matchesMetric = matchesMetricFilter(
          notification,
          metricFilter,
        );
        const matchesPriority =
          priorityFilter === "all" ||
          (priorityFilter === "unassigned"
            ? notification.priority === undefined
            : notification.priority === priorityFilter);

        return (
          matchesLevel &&
          matchesSource &&
          matchesMetric &&
          matchesPriority
        );
      }),
    [
      levelFilter,
      metricFilter,
      notifications,
      priorityFilter,
      sourceFilter,
    ],
  );

  const hasActiveFilters =
    levelFilter !== "all" ||
    sourceFilter !== "all" ||
    priorityFilter !== "all" ||
    metricFilter !== null;

  const deliveryMetrics = useMemo(
    () => calculateDeliveryMetrics(notifications),
    [notifications],
  );

  const telegramHealth = useMemo(() => {
    const calculated = calculateTelegramDeliveryHealth(notifications);
    return {
      channelStatus: calculated.channelStatus === "Con incidencias"
        ? "Fallos registrados"
        : calculated.channelStatus === "Operativo"
          ? "Entregas correctas"
          : "Sin datos",
      successRate:
        calculated.successRate === null
          ? "—"
          : `${calculated.successRate.toFixed(1)} %`,
      latestSent: calculated.latestSentAt
        ? formatRelativeDate(calculated.latestSentAt, now)
        : "Sin entregas",
      latestFailure: calculated.latestFailedAt
        ? formatRelativeDate(calculated.latestFailedAt, now)
        : deliveryMetrics.failed > 0
          ? "Fecha no disponible"
          : "Sin fallos",
      latestFailureError: calculated.latestFailureError,
      averageDelivery:
        calculated.averageDeliveryMs === null
          ? "—"
          : formatDeliveryDuration(
              calculated.averageDeliveryMs,
            ),
    };
  }, [deliveryMetrics.failed, notifications, now]);

  const reviewCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          !notification.read &&
          notification.level === "review",
      ).length,
    [notifications],
  );

  const errorCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          !notification.read &&
          notification.level === "error",
      ).length,
    [notifications],
  );

  const liveStatus = liveTelegramError
    ? "Error"
    : !liveTelegramHealth
      ? "Sin comprobar"
    : !liveTelegramHealth.enabled
      ? "Deshabilitado"
    : !liveTelegramHealth.configured
      ? "Configuración incompleta"
      : liveTelegramHealth.deliveryMode === "sandbox"
        ? "Sandbox seguro"
        : liveTelegramHealth.ok
            ? "Disponible"
            : "Error";
  const liveCheckedAt = liveTelegramHealth?.checkedAt
    ? formatRelativeDate(liveTelegramHealth.checkedAt, now)
    : "Sin comprobar";
  const liveTelegramFeedback = adaptTelegramHealthFeedback({
    health: liveTelegramHealth,
    error: liveTelegramError,
    checking: isCheckingTelegram,
  });
  const hasLiveTelegramIncident = liveTelegramFeedback.state === "error" || liveTelegramFeedback.state === "blocked";
  const telegramCheckCapability = adaptRefreshInteraction({id: "telegram-health-check", label: "Actualizar estado", busyLabel: "Actualizando estado…", busy: isCheckingTelegram, source: "Telegram Health/Sandbox"});

  return (
    <section id={view === "summary" ? "laboratory-status" : view === "telegram" ? "telegram-status" : "activity-center"} style={styles.card}>
      <div style={styles.headingRow}>
        <div>
          <p style={styles.eyebrow}>
            {view === "telegram" ? "Entregas" : view === "summary" ? "Visión general" : "Seguimiento del laboratorio"}
          </p>

          <h2 style={styles.title}>
            {view === "telegram" ? "Estado del canal" : view === "summary" ? "Resumen de hoy" : "Qué ocurrió"}
          </h2>
          <p style={styles.headingDescription}>
            {view === "telegram" ? "Comprueba la disponibilidad, la última revisión y el resultado de las entregas." : view === "summary" ? "Consulta las señales principales del laboratorio." : "Revisa avisos, resultados y procesos registrados por el laboratorio."}
          </p>
        </div>

        <div
          style={{
            ...styles.healthBadge,
            ...(hasLiveTelegramIncident
              ? styles.healthError
              : errorCount > 0 || reviewCount > 0
                ? styles.healthReview
                : styles.healthOk),
          }}
        >
          <span style={styles.healthDot} />
          {getStateLabel(hasLiveTelegramIncident, errorCount, reviewCount)}
        </div>
      </div>

      {view === "summary" ? (
        <div className="laboratory-summary-grid" aria-label="Resumen del laboratorio">
          <div><strong>{deliveryMetrics.pending}</strong><span>Entregas pendientes</span></div>
          <div><strong>{reviewCount}</strong><span>Revisiones sin leer</span></div>
          <div><strong>{errorCount}</strong><span>Errores históricos sin leer</span></div>
          <div><strong>{isCheckingTelegram ? "Comprobando" : liveStatus}</strong><span>Telegram en vivo</span></div>
          <div><strong>{notifications.length}</strong><span>Actividades registradas</span></div>
        </div>
      ) : null}

      {view === "activity" ? (
      <>
      <div style={styles.filterBar}>
        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Nivel</span>
          <select
            value={levelFilter}
            onChange={(event) => {
              setLevelFilter(event.target.value as LevelFilter);
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todos</option>
            <option value="success">Éxito</option>
            <option value="review">Revisión</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Fuente</span>
          <select
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value);
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todas las fuentes</option>
            {availableSources.map((source) => (
              <option key={normalizeSource(source)} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.filterField}>
          <span style={styles.filterLabel}>Prioridad</span>
          <select
            value={priorityFilter}
            onChange={(event) => {
              setPriorityFilter(
                event.target.value as PriorityFilter,
              );
            }}
            style={styles.filterSelect}
          >
            <option value="all">Todas</option>
            <option value="critical">Crítica</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
            <option value="unassigned">Sin prioridad</option>
          </select>
        </label>

        <span style={styles.resultCount}>
          {filteredNotifications.length}{" "}
          {filteredNotifications.length === 1
            ? "notificación"
            : "notificaciones"}
        </span>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setLevelFilter("all");
              setSourceFilter("all");
              setPriorityFilter("all");
              setMetricFilter(null);
            }}
            style={styles.clearFilters}
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <div style={styles.metricsSection}>
        <div style={styles.metrics}>
          {METRIC_CARDS.map((metric) => {
            const isActive = metricFilter === metric.key;

            return (
              <button
                className="motion-filter-chip"
                key={metric.key}
                type="button"
                onClick={() => setMetricFilter(metric.key)}
                style={{
                  ...styles.metric,
                  ...(isActive ? styles.metricActive : {}),
                }}
                aria-pressed={isActive}
              >
                <span style={styles.metricIcon} aria-hidden="true">
                  {metric.icon}
                </span>
                <span style={styles.metricValue}>
                  {deliveryMetrics[metric.key]}
                </span>
                <span style={styles.metricLabel}>
                  {metric.label}
                </span>
              </button>
            );
          })}
        </div>

      </div>
      </>
      ) : null}

      {view === "telegram" ? (
      <section style={styles.telegramHealth}>
        <div style={styles.telegramHealthHeader}>
          <div>
            <strong style={styles.telegramHealthTitle}>
              Historial de entregas
            </strong>
            <span style={styles.telegramHealthSubtitle}>
              Métricas históricas; no representan por sí solas la salud actual
            </span>
          </div>
        </div>

        <div style={styles.telegramHealthGrid}>
          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Estado del historial
            </span>
            <strong
              style={{
                ...styles.telegramHealthValue,
                ...(telegramHealth.channelStatus === "Entregas correctas"
                  ? styles.telegramHealthOk
                  : telegramHealth.channelStatus === "Fallos registrados"
                    ? styles.telegramHealthIssue
                    : styles.telegramHealthUnknown),
              }}
            >
              {telegramHealth.channelStatus}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Tasa de éxito
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.successRate}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Última entrega correcta
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.latestSent}
            </strong>
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Último fallo
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.latestFailure}
            </strong>
            {telegramHealth.latestFailureError ? (
              <span
                style={styles.telegramHealthError}
              >
                {presentTelegramDeliveryFailure(
                  telegramHealth.latestFailureError,
                )}
              </span>
            ) : null}
          </div>

          <div style={styles.telegramHealthItem}>
            <span style={styles.telegramHealthLabel}>
              Tiempo medio de entrega
            </span>
            <strong style={styles.telegramHealthValue}>
              {telegramHealth.averageDelivery}
            </strong>
          </div>
        </div>

        <div style={styles.liveTelegramSection}>
          <div style={styles.liveTelegramHeader}>
            <div>
              <strong style={styles.liveTelegramTitle}>
                Comprobación actual
              </strong>
              <span style={styles.telegramHealthSubtitle}>
                El estado no incluye ni expone credenciales
              </span>
            </div>

            <InteractionButton
              capability={telegramCheckCapability}
              onInvoke={() => { void checkTelegram(); }}
              showReason={false}
              style={{
                ...styles.checkTelegramButton,
                ...(isCheckingTelegram
                  ? styles.checkTelegramButtonDisabled
                  : {}),
              }}
            />
          </div>

          <div style={styles.liveTelegramGrid}>
            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Estado en vivo
              </span>
              <strong style={styles.telegramHealthValue}>
                {liveStatus}
              </strong>
            </div>

            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Modo de entrega
              </span>
              <strong style={styles.telegramHealthValue}>
                {liveTelegramHealth?.deliveryMode === "sandbox"
                  ? "Sandbox seguro"
                  : "Producción"}
              </strong>
              {liveTelegramHealth?.deliveryMode === "sandbox" ? (
                <span style={styles.liveTelegramCredential}>
                  Sin entregas externas
                </span>
              ) : null}
            </div>

            <div style={styles.liveTelegramDatum}>
              <span style={styles.telegramHealthLabel}>
                Última comprobación
              </span>
              <strong style={styles.telegramHealthValue}>
                {liveCheckedAt}
              </strong>
            </div>
          </div>

          <details style={styles.telegramTechnicalDetails}>
            <summary style={styles.telegramTechnicalSummary}>Detalles técnicos del canal</summary>
            <div style={styles.telegramTechnicalBody}>
              <span style={styles.liveTelegramCredential}>
                Token: {liveTelegramHealth ? liveTelegramHealth.tokenConfigured ? "configurado" : "no configurado" : "—"}
              </span>
              <span style={styles.liveTelegramCredential}>
                Chat ID: {liveTelegramHealth ? liveTelegramHealth.chatIdConfigured ? "configurado" : "no configurado" : "—"}
              </span>
            </div>
          </details>

          {liveTelegramError ? <div role="alert"><GlobalFeedbackRegion feedback={liveTelegramFeedback} announce={false} /></div> : <GlobalFeedbackRegion feedback={liveTelegramFeedback} />}
        </div>
      </section>
      ) : null}

      {view === "activity" ? (
      <div style={styles.contentGrid}>
        <div style={styles.activityPanel}>
          {filteredNotifications.length > 0 ? (
            <div style={styles.activityList}>
              {filteredNotifications.map((notification) => (
                <ActivityItem
                  key={notification.id}
                  notification={notification}
                  now={now}
                  detailExpanded={expandedDetailIds.has(
                    notification.id,
                  )}
                  onToggleDetail={toggleNotificationDetail}
                  auditExpanded={expandedAuditIds.has(
                    notification.id,
                  )}
                  onToggleAudit={toggleNotificationAudit}
                />
              ))}
            </div>
          ) : <FeedbackEmptyState
            title={hasActiveFilters ? "Sin coincidencias" : "Todavía no hay actividad registrada"}
            detail={hasActiveFilters ? "No hay avisos que coincidan con estos filtros." : "Los análisis, borradores y resultados aparecerán aquí cuando se produzcan."}
          />}
        </div>

      </div>
      ) : null}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    display: "grid",
    gap: 16,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    background:
      "linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
  },

  headingRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },

  eyebrow: {
    margin: 0,
    color: "#88939f",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },

  title: {
    margin: "5px 0 0",
    fontSize: 18,
    lineHeight: 1.2,
  },

  headingDescription: {
    maxWidth: 620,
    margin: "7px 0 0",
    color: "#8994a0",
    fontSize: 11,
    lineHeight: 1.45,
  },

  healthBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 30,
    padding: "0 11px",
    border: "1px solid transparent",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  healthOk: {
    background: "rgba(52,211,153,0.1)",
    color: "#6ee7b7",
    borderColor: "rgba(52,211,153,0.18)",
  },

  healthReview: {
    background: "rgba(251,191,36,0.1)",
    color: "#fcd34d",
    borderColor: "rgba(251,191,36,0.18)",
  },

  healthError: {
    background: "rgba(248,113,113,0.1)",
    color: "#fca5a5",
    borderColor: "rgba(248,113,113,0.18)",
  },

  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: "currentColor",
    boxShadow: "0 0 10px currentColor",
  },

  filterBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
    padding: "12px 13px",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    background: "rgba(5,8,12,0.24)",
  },

  filterField: {
    display: "grid",
    flex: "1 1 150px",
    gap: 5,
    minWidth: 0,
  },

  filterLabel: {
    color: "#7d8894",
    fontSize: 9,
    fontWeight: 750,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },

  filterSelect: {
    width: "100%",
    minHeight: 44,
    padding: "0 28px 0 9px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 9,
    background: "#151b22",
    color: "#dce3ea",
    fontSize: 11,
  },

  resultCount: {
    flex: "0 0 auto",
    paddingBottom: 8,
    color: "#8994a0",
    fontSize: 10,
    whiteSpace: "nowrap",
  },

  clearFilters: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    minHeight: 44,
    marginBottom: 0,
    padding: "8px 10px",
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 650,
    cursor: "pointer",
  },

  contentGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
    gap: 14,
  },

  activityPanel: {
    minWidth: 0,
    padding: 15,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 15,
    background: "rgba(5,8,12,0.32)",
  },

  activityList: {
    display: "grid",
    maxHeight: 430,
    overflowY: "auto",
    overscrollBehavior: "contain",
  },

  activityItem: {
    padding: 12,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    borderLeft: "2px solid transparent",
    borderRadius: 10,
  },

  activityItemUnread: {
    borderLeftColor: "#60a5fa",
    background: "rgba(96,165,250,0.045)",
  },

  latestActivity: {
    display: "grid",
    gridTemplateColumns: "38px minmax(0, 1fr)",
    gap: 12,
    alignItems: "flex-start",
  },

  latestIcon: {
    display: "grid",
    placeItems: "center",
    width: 37,
    height: 37,
    border: "1px solid transparent",
    borderRadius: 11,
    fontSize: 17,
  },

  latestBody: {
    minWidth: 0,
  },

  activityTitleRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    minWidth: 0,
  },

  latestEyebrow: {
    display: "block",
    marginBottom: 4,
    color: "#727e8a",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  latestTitle: {
    display: "block",
    overflow: "hidden",
    flex: "1 1 180px",
    minWidth: 0,
    fontSize: 13,
    lineHeight: 1.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  latestMessage: {
    display: "-webkit-box",
    overflow: "hidden",
    margin: "5px 0 0",
    color: "#aeb7c0",
    fontSize: 11,
    lineHeight: 1.45,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },

  unreadLabel: {
    padding: "2px 6px",
    borderRadius: 999,
    background: "rgba(96,165,250,0.12)",
    color: "#93c5fd",
    fontSize: 9,
    fontWeight: 750,
  },

  summaryLine: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    color: "#6f7a86",
    fontSize: 9,
  },

  actionRequired: {
    color: "#fca5a5",
    fontWeight: 800,
  },

  itemActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
  },

  itemAction: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "8px 10px",
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  detailPanel: {
    display: "grid",
    gap: 10,
    marginTop: 11,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    background: "rgba(2,6,10,0.32)",
  },

  deliverySection: {
    display: "grid",
    gap: 2,
    paddingTop: 8,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },

  detailEyebrow: {
    color: "#727e8a",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  locationAction: {
    justifySelf: "start",
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  latestMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
    paddingTop: 11,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    color: "#6f7a86",
    fontSize: 10,
  },

  metricsSection: {
    display: "grid",
    justifyItems: "end",
    gap: 8,
  },

  metrics: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 105px), 1fr))",
    gap: 8,
    width: "100%",
  },

  metric: {
    display: "grid",
    alignContent: "center",
    justifyItems: "center",
    minHeight: 88,
    padding: 10,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    background: "rgba(5,8,12,0.32)",
    color: "#f5f7fa",
    textAlign: "center",
    cursor: "pointer",
    transition:
      "border-color var(--motion-duration-fast) var(--motion-ease-standard), background-color var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard)",
  },

  metricActive: {
    borderColor: "rgba(96,165,250,0.52)",
    background: "rgba(59,130,246,0.13)",
    boxShadow: "inset 0 0 0 1px rgba(96,165,250,0.12)",
  },

  metricIcon: {
    marginBottom: 6,
    fontSize: 15,
    lineHeight: 1,
  },

  metricValue: {
    fontSize: 22,
    fontWeight: 850,
    lineHeight: 1,
  },

  metricLabel: {
    marginTop: 7,
    color: "#7d8894",
    fontSize: 9,
    fontWeight: 750,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
  },

  telegramHealth: {
    display: "grid",
    gap: 11,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 15,
    background: "rgba(5,8,12,0.24)",
  },

  telegramHealthHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  telegramHealthTitle: {
    display: "block",
    fontSize: 12,
    lineHeight: 1.3,
  },

  telegramHealthSubtitle: {
    display: "block",
    marginTop: 3,
    color: "#707b87",
    fontSize: 9,
    lineHeight: 1.4,
  },

  telegramHealthGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 145px), 1fr))",
    gap: 8,
  },

  telegramHealthItem: {
    display: "grid",
    alignContent: "start",
    gap: 5,
    minHeight: 68,
    padding: "10px 11px",
    border: "1px solid rgba(255,255,255,0.055)",
    borderRadius: 11,
    background: "rgba(255,255,255,0.025)",
  },

  telegramHealthLabel: {
    color: "#77828e",
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1.35,
  },

  telegramHealthValue: {
    color: "#e2e7ec",
    fontSize: 12,
    lineHeight: 1.35,
  },

  telegramHealthOk: {
    color: "#6ee7b7",
  },

  telegramHealthIssue: {
    color: "#fca5a5",
  },

  telegramHealthUnknown: {
    color: "#a8b1bb",
  },

  telegramHealthError: {
    display: "-webkit-box",
    overflow: "hidden",
    color: "#d88f8f",
    fontSize: 9,
    lineHeight: 1.35,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },

  liveTelegramSection: {
    display: "grid",
    gap: 10,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.065)",
  },

  liveTelegramHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  liveTelegramTitle: {
    display: "block",
    fontSize: 11,
    lineHeight: 1.35,
  },

  checkTelegramButton: {
    minHeight: 44,
    padding: "8px 12px",
    border: "1px solid rgba(96,165,250,0.28)",
    borderRadius: 9,
    background: "rgba(59,130,246,0.1)",
    color: "#9bc5f8",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  checkTelegramButtonDisabled: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.035)",
    color: "#68737f",
    cursor: "default",
  },

  liveTelegramGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
    gap: 8,
  },

  liveTelegramDatum: {
    display: "grid",
    alignContent: "start",
    gap: 4,
    minHeight: 58,
    padding: "9px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
  },

  liveTelegramCredential: {
    color: "#b2bbc4",
    fontSize: 10,
    lineHeight: 1.35,
  },

  telegramTechnicalDetails: {
    borderTop: "1px solid rgba(255,255,255,0.065)",
  },

  telegramTechnicalSummary: {
    display: "flex",
    alignItems: "center",
    minHeight: 44,
    color: "#8d98a4",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  telegramTechnicalBody: {
    display: "grid",
    gap: 5,
    padding: "0 0 10px",
  },

  liveTelegramSuccess: {
    color: "#6ee7b7",
    fontSize: 10,
    lineHeight: 1.4,
  },

  liveTelegramNotice: {
    color: "#c8b77c",
    fontSize: 10,
    lineHeight: 1.4,
  },

  liveTelegramError: {
    color: "#fca5a5",
    fontSize: 10,
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },

  emptyState: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
  },

  emptyIcon: {
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 36,
    borderRadius: 11,
    background: "rgba(52,211,153,0.1)",
    color: "#6ee7b7",
    fontWeight: 900,
  },

  emptyText: {
    margin: "5px 0 0",
    color: "#707b87",
    fontSize: 11,
    lineHeight: 1.45,
  },

  "@media": {},
};
