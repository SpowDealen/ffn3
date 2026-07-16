import type {InvestigationSourceAdapter, InvestigationSourceType} from "./types";
const sources = new Map<InvestigationSourceType, InvestigationSourceAdapter>();
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());
export function registerInvestigationSource(sourceType: InvestigationSourceType, adapter: InvestigationSourceAdapter): () => void { if (adapter.sourceType !== sourceType) throw new Error("El adapter no coincide con el tipo de fuente."); const current = sources.get(sourceType); if (current && current !== adapter) throw new Error(`Ya existe una fuente distinta para ${sourceType}.`); sources.set(sourceType, adapter); emit(); return () => { if (sources.get(sourceType) === adapter) { sources.delete(sourceType); emit(); } }; }
export const getInvestigationSource = (sourceType: InvestigationSourceType): InvestigationSourceAdapter | undefined => sources.get(sourceType);
export function unregisterInvestigationSource(sourceType: InvestigationSourceType): void { if (sources.delete(sourceType)) emit(); }
export const hasInvestigationSource = (sourceType: InvestigationSourceType): boolean => sources.has(sourceType);
export function subscribeInvestigationSources(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
