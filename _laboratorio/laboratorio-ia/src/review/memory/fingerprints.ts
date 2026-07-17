const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
};
export const hashMemoryValue = (value: unknown): string => { const text = canonical(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); return (hash >>> 0).toString(36); };
export const buildMemoryFingerprint = (value: object): string => `mem1:${hashMemoryValue(value)}`;
export const buildClusterFingerprint = (value: object): string => `cluster1:${hashMemoryValue(value)}`;
