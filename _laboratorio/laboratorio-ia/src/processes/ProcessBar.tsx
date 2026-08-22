import {
  useEffect,
  useState,
  type ReactElement,
} from "react";
import {
  getProcesses,
  subscribeToProcess,
} from "./store";
import type {LabProcess} from "./types";
import ProcessExperienceSummary from "./ProcessExperienceSummary";
import {buildLabProcessPresentation, selectProcessPresentations} from "./presentation";
import {adaptLabProcessFeedback} from "../feedback";

export default function ProcessBar(): ReactElement | null {
  const [processes, setProcesses] = useState<readonly LabProcess[]>(() => getProcesses());

  useEffect(() => {
    const refresh = (): void => setProcesses(getProcesses());
    refresh();
    return subscribeToProcess(refresh);
  }, []);

  if (!processes.length) return null;
  const presentations = selectProcessPresentations(processes.map((process) => buildLabProcessPresentation(process)));
  const feedback = processes.map(adaptLabProcessFeedback);
  const hasLive = feedback.some((item) => item.state === "loading" || item.state === "processing");

  return (
    <section className="global-feedback-region global-feedback-global process-experience-region" data-feedback-scope="process" data-process-count={presentations.length} aria-busy={hasLive ? true : undefined}>
      {presentations.length > 1 ? <strong className="process-experience-region-title">{presentations.length} procesos visibles</strong> : null}
      <div className="process-experience-list">
        {presentations.map((process) => <ProcessExperienceSummary key={process.id} process={process} compact={presentations.length > 2} announce={process.isLive} />)}
      </div>
    </section>
  );
}
