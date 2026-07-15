import type {
  CSSProperties,
  ReactElement,
} from "react";
import type {LabNotification} from "./types";

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Crítica",
  high: "Alta",
  normal: "Normal",
  low: "Baja",
};

const LEVEL_LABELS: Record<string, string> = {
  success: "Éxito",
  review: "Revisión",
  error: "Error",
  info: "Información",
};

const KIND_LABELS: Record<string, string> = {
  source: "Fuente",
  draft: "Borrador",
  system: "Sistema",
};

function getReadableLabel(
  value: string,
  labels: Record<string, string>,
): string {
  return labels[value] ?? value;
}

function formatAuditDate(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Fecha no disponible";
  }

  return `Recibido: ${new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

export default function NotificationAuditDetails({
  notification,
  expanded,
  onToggle,
}: {
  notification: LabNotification;
  expanded: boolean;
  onToggle: (id: string) => void;
}): ReactElement | null {
  const audit = notification.audit;

  if (!audit) return null;

  const detailsId = `notification-audit-${notification.id}`;

  return (
    <div style={styles.container}>
      <button
        type="button"
        onClick={() => onToggle(notification.id)}
        style={styles.toggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        {expanded
          ? "Ocultar decisiones"
          : "Ver decisiones del motor"}
      </button>

      {expanded ? (
        <div id={detailsId} style={styles.details}>
          <span style={styles.receivedAt}>
            {formatAuditDate(audit.receivedAt)}
          </span>

          <dl style={styles.definitionGrid}>
            <div style={styles.definition}>
              <dt style={styles.term}>Evento</dt>
              <dd style={styles.value}>{audit.eventType}</dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Prioridad</dt>
              <dd style={styles.value}>
                {getReadableLabel(
                  audit.priority,
                  PRIORITY_LABELS,
                )}
              </dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Nivel normalizado</dt>
              <dd style={styles.value}>
                {getReadableLabel(
                  audit.normalizedLevel,
                  LEVEL_LABELS,
                )}
              </dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Tipo normalizado</dt>
              <dd style={styles.value}>
                {audit.normalizedKind
                  ? getReadableLabel(
                      audit.normalizedKind,
                      KIND_LABELS,
                    )
                  : "—"}
              </dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Activity Center</dt>
              <dd style={styles.value}>
                {audit.channels.activityCenter
                  ? "Activo"
                  : "Inactivo"}
              </dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Telegram</dt>
              <dd style={styles.value}>
                {audit.channels.telegram
                  ? "Activo"
                  : "Omitido por política"}
              </dd>
            </div>
            <div style={styles.definition}>
              <dt style={styles.term}>Agrupación</dt>
              <dd style={styles.value}>
                {audit.grouped ? "Sí" : "No"}
              </dd>
            </div>
            {audit.groupKey ? (
              <div style={styles.definition}>
                <dt style={styles.term}>Clave de agrupación</dt>
                <dd style={styles.value}>{audit.groupKey}</dd>
              </div>
            ) : null}
          </dl>

          <div style={styles.decisions}>
            <strong style={styles.decisionsTitle}>
              Decisiones del motor
            </strong>
            <ul style={styles.decisionList}>
              {audit.decisions.map((decision, index) => (
                <li key={`${index}-${decision}`}>{decision}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    marginTop: 10,
    paddingTop: 9,
    borderTop: "1px solid rgba(255,255,255,0.055)",
  },
  toggle: {
    padding: 0,
    border: 0,
    background: "transparent",
    color: "#8dbcf5",
    fontSize: 9,
    fontWeight: 700,
    cursor: "pointer",
  },
  details: {
    display: "grid",
    gap: 10,
    marginTop: 9,
    padding: 11,
    border: "1px solid rgba(255,255,255,0.065)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.018)",
  },
  receivedAt: {
    color: "#7f8a96",
    fontSize: 9,
  },
  definitionGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
    gap: 8,
    margin: 0,
  },
  definition: {
    minWidth: 0,
  },
  term: {
    color: "#707b87",
    fontSize: 8,
    fontWeight: 750,
    textTransform: "uppercase",
  },
  value: {
    overflowWrap: "anywhere",
    margin: "3px 0 0",
    color: "#c4ccd4",
    fontSize: 9,
    lineHeight: 1.35,
  },
  decisions: {
    display: "grid",
    gap: 5,
  },
  decisionsTitle: {
    color: "#aeb7c0",
    fontSize: 9,
  },
  decisionList: {
    display: "grid",
    gap: 4,
    margin: 0,
    paddingLeft: 16,
    color: "#909ba6",
    fontSize: 9,
    lineHeight: 1.4,
  },
};
