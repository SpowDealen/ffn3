const SYMBOL_PATTERNS = [
  /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/,
  /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
];

export function extractSourceSymbol(lines: string[], lineIndex: number): string {
  for (let index = lineIndex; index >= 0; index -= 1) {
    for (const pattern of SYMBOL_PATTERNS) {
      const match = lines[index]?.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  return "module_scope";
}
