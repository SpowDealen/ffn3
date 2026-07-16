export const INVESTIGATION_THRESHOLDS = {exactExisting: .97, contextualExisting: .93, prepareEntity: .96, conflictCandidate: .85, conflictGap: .10} as const;
export const normalizeIdentity = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
export function identityScore(name: string, candidate: {name: string; aliases?: string[]}, reliability = 1): number { const target = normalizeIdentity(name); const names = [candidate.name, ...(candidate.aliases ?? [])].map(normalizeIdentity); return names.includes(target) ? Math.min(1, .99 * reliability) : 0; }
export function stableIdentityKey(entityType: string, name: string): string { return `${entityType}:${normalizeIdentity(name).replace(/\s+/g, "-")}`; }
