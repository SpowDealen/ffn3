import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  getActiveProcess,
  subscribeToProcess,
} from "./store";
import type {LabProcess} from "./types";

function getPercentage(
  process: LabProcess,
): number | null {
  if (
    typeof process.current !== "number" ||
    typeof process.total !== "number" ||
    process.total <= 0
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (process.current / process.total) * 100,
      ),
    ),
  );
}

export default function ProcessBar(): ReactElement | null {
  const [process, setProcess] =
    useState<LabProcess | null>(null);

  useEffect(() => {
    function refresh(): void {
      setProcess(getActiveProcess());
    }

    refresh();

    return subscribeToProcess(refresh);
  }, []);

  const percentage = useMemo(
    () => (process ? getPercentage(process) : null),
    [process],
  );

  if (!process) return null;

  const isError = process.status === "error";
  const isSuccess = process.status === "success";

  return (
    <section
      style={{
        ...styles.wrapper,
        ...(isError
          ? styles.wrapperError
          : isSuccess
            ? styles.wrapperSuccess
            : {}),
      }}
    >
      <div style={styles.textRow}>
        <div style={styles.textBlock}>
          <strong style={styles.label}>
            {isError
              ? "Proceso interrumpido"
              : isSuccess
                ? "Proceso completado"
                : process.label}
          </strong>

          {process.detail ? (
            <span style={styles.detail}>
              {process.detail}
            </span>
          ) : null}
        </div>

        <span style={styles.progressText}>
          {percentage !== null
            ? `${process.current} de ${process.total} · ${percentage}%`
            : isSuccess
              ? "100%"
              : isError
                ? "Error"
                : "En curso"}
        </span>
      </div>

      <div style={styles.track}>
        <div
          style={{
            ...styles.fill,
            ...(percentage === null
              ? styles.fillIndeterminate
              : {
                  width: `${percentage}%`,
                }),
            ...(isError ? styles.fillError : {}),
            ...(isSuccess ? styles.fillSuccess : {}),
          }}
        />
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: "grid",
    gap: 9,
    padding: "11px 14px",
    border: "1px solid rgba(96,165,250,0.18)",
    borderRadius: 14,
    background: "rgba(96,165,250,0.07)",
  },

  wrapperSuccess: {
    borderColor: "rgba(52,211,153,0.2)",
    background: "rgba(52,211,153,0.07)",
  },

  wrapperError: {
    borderColor: "rgba(248,113,113,0.2)",
    background: "rgba(248,113,113,0.07)",
  },

  textRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },

  textBlock: {
    display: "grid",
    gap: 3,
    minWidth: 0,
  },

  label: {
    fontSize: 12,
  },

  detail: {
    overflow: "hidden",
    color: "#8e99a5",
    fontSize: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  progressText: {
    flexShrink: 0,
    color: "#9aa5b1",
    fontSize: 10,
    fontWeight: 700,
  },

  track: {
    position: "relative",
    height: 5,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
  },

  fill: {
    height: "100%",
    borderRadius: 999,
    background: "#60a5fa",
    transition: "width 220ms ease",
  },

  fillIndeterminate: {
    width: "35%",
    animation:
      "ffn3-process-indeterminate 1.1s ease-in-out infinite",
  },

  fillSuccess: {
    width: "100%",
    background: "#34d399",
  },

  fillError: {
    background: "#f87171",
  },
};
