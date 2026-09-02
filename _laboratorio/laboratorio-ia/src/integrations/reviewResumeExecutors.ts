import type {ExternalNewsResumeExecutor} from "../review/resume/externalNews";
import type {OfficialReviewResumeProducer, ReviewOriginResumeAuthority} from "../review/resume/origin";

type Producer = "external_news";
const executors = new Map<Producer, ExternalNewsResumeExecutor>();
const originAuthorities = new Map<OfficialReviewResumeProducer, ReviewOriginResumeAuthority>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

export function registerReviewResumeExecutor(producer: Producer, executor: ExternalNewsResumeExecutor, options: {replace?: boolean} = {}): () => void {
  const current = executors.get(producer);
  if (current && current !== executor && !options.replace) throw new Error(`Ya existe un executor distinto para ${producer}.`);
  executors.set(producer, executor); emit();
  return () => { if (executors.get(producer) === executor) { if (current) executors.set(producer, current); else executors.delete(producer); emit(); } };
}
export const getReviewResumeExecutor = (producer: Producer): ExternalNewsResumeExecutor | undefined => executors.get(producer);
export function registerReviewOriginResumeAuthority(producer: OfficialReviewResumeProducer, authority: ReviewOriginResumeAuthority, options: {replace?: boolean} = {}): () => void {
  if (authority.producer !== producer || !authority.authorityId.trim()) throw new Error(`Autoridad de reanudación inválida para ${producer}.`);
  const current = originAuthorities.get(producer);
  if (current && current !== authority && !options.replace) throw new Error(`Ya existe una autoridad distinta para ${producer}.`);
  originAuthorities.set(producer, authority); emit();
  return () => { if (originAuthorities.get(producer) === authority) { if (current) originAuthorities.set(producer, current); else originAuthorities.delete(producer); emit(); } };
}
export const getReviewOriginResumeAuthority = (producer: OfficialReviewResumeProducer): ReviewOriginResumeAuthority | undefined => originAuthorities.get(producer);
export function subscribeReviewResumeExecutors(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
