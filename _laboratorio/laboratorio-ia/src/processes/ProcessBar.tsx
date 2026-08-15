import {
  useEffect,
  useState,
  type ReactElement,
} from "react";
import {ProgressBar} from "../components/feedback/VisualFeedback";
import {
  getActiveProcess,
  subscribeToProcess,
} from "./store";
import type {LabProcess} from "./types";

function toFeedbackState(process: LabProcess): "processing" | "success" | "error" {
  if (process.status === "success") return "success";
  if (process.status === "error") return "error";
  return "processing";
}

export default function ProcessBar(): ReactElement | null {
  const [process, setProcess] = useState<LabProcess | null>(null);

  useEffect(() => {
    const refresh = (): void => setProcess(getActiveProcess());
    refresh();
    return subscribeToProcess(refresh);
  }, []);

  if (!process) return null;

  return (
    <ProgressBar
      label={
        process.status === "success"
          ? "Proceso completado"
          : process.status === "error"
            ? "Proceso interrumpido"
            : process.label
      }
      current={process.current}
      total={process.total}
      detail={process.detail}
      state={toFeedbackState(process)}
    />
  );
}
