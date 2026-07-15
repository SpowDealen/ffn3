import type {ExternalNewsResumeExecutor} from "../review/resume/externalNews";

type Producer = "external_news";
const executors = new Map<Producer, ExternalNewsResumeExecutor>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

export function registerReviewResumeExecutor(producer: Producer, executor: ExternalNewsResumeExecutor, options: {replace?: boolean} = {}): () => void {
  const current = executors.get(producer);
  if (current && current !== executor && !options.replace) throw new Error(`Ya existe un executor distinto para ${producer}.`);
  executors.set(producer, executor); emit();
  return () => { if (executors.get(producer) === executor) { if (current) executors.set(producer, current); else executors.delete(producer); emit(); } };
}
export const getReviewResumeExecutor = (producer: Producer): ExternalNewsResumeExecutor | undefined => executors.get(producer);
export function subscribeReviewResumeExecutors(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
