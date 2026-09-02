export function normalizeConversationInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[¿?¡!.,;:()[\]{}"“”'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const agentConversationNormalizerSecurity = Object.freeze({
  pure: true,
  deterministic: true,
  accentInsensitive: true,
  fuzzy: false,
  fetches: false,
  writes: false,
} as const);
