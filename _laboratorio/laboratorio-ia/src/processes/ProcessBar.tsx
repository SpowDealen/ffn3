import {
  useEffect,
  useState,
  type ReactElement,
} from "react";
import {FeedbackMeta, ProgressBar, toVisualFeedbackState} from "../components/feedback/VisualFeedback";
import {adaptLabProcessFeedback} from "../feedback";
import {
  getActiveProcess,
  subscribeToProcess,
} from "./store";
import type {LabProcess} from "./types";

export default function ProcessBar(): ReactElement | null {
  const [process, setProcess] = useState<LabProcess | null>(null);

  useEffect(() => {
    const refresh = (): void => setProcess(getActiveProcess());
    refresh();
    return subscribeToProcess(refresh);
  }, []);

  if (!process) return null;
  const feedback = adaptLabProcessFeedback(process);
  const progress = feedback.progress;

  return (
    <section className="global-feedback-region global-feedback-global" data-feedback-scope={feedback.scope} data-feedback-state={feedback.state} role={process.status === "error" ? "alert" : "status"} aria-live={process.status === "error" ? "assertive" : "polite"} aria-busy={process.status === "running"}>
      <ProgressBar
        label={feedback.title}
        current={progress?.kind === "determinate" ? progress.current : undefined}
        total={progress?.kind === "determinate" ? progress.total : undefined}
        detail={feedback.detail}
        state={toVisualFeedbackState(feedback.state)}
        announce={false}
      />
      <FeedbackMeta feedback={feedback} />
    </section>
  );
}
