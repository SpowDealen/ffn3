import type {
  ExternalNewsImage,
  ExternalNewsItem,
  ExternalNewsRawPayload,
  ExternalSourceId,
} from "./types";

const MOJIBAKE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u00c3\u00a1/g, "á"],
  [/\u00c3\u00a9/g, "é"],
  [/\u00c3\u00ad/g, "í"],
  [/\u00c3\u00b3/g, "ó"],
  [/\u00c3\u00ba/g, "ú"],
  [/\u00c3\u0081/g, "Á"],
  [/\u00c3\u0089/g, "É"],
  [/\u00c3\u008d/g, "Í"],
  [/\u00c3\u0093/g, "Ó"],
  [/\u00c3\u009a/g, "Ú"],
  [/\u00c3\u00b1/g, "ñ"],
  [/\u00c3\u0091/g, "Ñ"],
  [/\u00c3\u00bc/g, "ü"],
  [/\u00c3\u009c/g, "Ü"],
  [/\u00c2\u00bf/g, "¿"],
  [/\u00c2\u00a1/g, "¡"],
  [/\u00c2\u00ba/g, "º"],
  [/\u00c2\u00aa/g, "ª"],
  [/\u00c2\u00b7/g, "·"],
  [/\u00c2\u00a0/g, " "],
  [/\u00c2/g, ""],
  [/\u00e2\u20ac\u02dc/g, "‘"],
  [/\u00e2\u20ac\u2122/g, "’"],
  [/\u00e2\u20ac\u0153/g, "“"],
  [/\u00e2\u20ac\u009d/g, "”"],
  [/\u00e2\u20ac\u009e/g, "„"],
  [/\u00e2\u20ac\u00a6/g, "…"],
  [/\u00e2\u20ac\u201c/g, "–"],
  [/\u00e2\u20ac\u201d/g, "—"],
  [/\u00e2\u20ac\u00a2/g, "•"],
  [/\u00e2\u201e\u00a2/g, "™"],
  [/\u00e2\u201a\u00ac/g, "€"],
  [/\u00ef\u00bf\u00bd/g, ""],
  [/\ufffd/g, ""],
];

type CreateExternalNewsItemParams = {
  source: ExternalSourceId;
  sourceName: string;
  title: string;
  sourceUrl: string;
  canonicalUrl?: string;
  excerpt?: string;
  bodyText?: string;
  publishedAt?: string;
  image?: ExternalNewsImage;
  authors?: string[];
  tags?: string[];
  language?: "es" | "en" | "unknown";
  detectedAt?: string;
  raw?: ExternalNewsRawPayload;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&hellip;/gi, "…")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rsquo;/gi, "’")
    .replace(/&#(\d+);/g, (_, codePoint: string) => {
      const parsedCodePoint = Number.parseInt(codePoint, 10);

      return Number.isFinite(parsedCodePoint)
        ? String.fromCodePoint(parsedCodePoint)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint: string) => {
      const parsedCodePoint = Number.parseInt(codePoint, 16);

      return Number.isFinite(parsedCodePoint)
        ? String.fromCodePoint(parsedCodePoint)
        : "";
    });
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeParagraphs(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function countBrokenEncodingMarkers(value: string): number {
  const matches = value.match(/Ã|Â|â€|â€™|â€œ|â€\u009d|â€¦|â€“|â€”|ï¿½|�/g);

  return matches?.length ?? 0;
}

function decodeLatin1AsUtf8(value: string): string {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function chooseCleanerText(originalValue: string, decodedValue: string): string {
  if (!decodedValue) {
    return originalValue;
  }

  const originalScore =
    countBrokenEncodingMarkers(originalValue) +
    (originalValue.includes("�") ? 25 : 0);
  const decodedScore =
    countBrokenEncodingMarkers(decodedValue) +
    (decodedValue.includes("�") ? 25 : 0);

  if (decodedScore < originalScore) {
    return decodedValue;
  }

  return originalValue;
}

export function repairMojibake(value: string): string {
  if (!value) {
    return value;
  }

  let repaired = decodeHtmlEntities(value);

  for (let pass = 0; pass < 3; pass += 1) {
    const previousValue = repaired;
    const decodedValue = decodeLatin1AsUtf8(repaired);

    repaired = chooseCleanerText(repaired, decodedValue);

    for (const [brokenPattern, correct] of MOJIBAKE_REPLACEMENTS) {
      repaired = repaired.replace(brokenPattern, correct);
    }

    repaired = decodeHtmlEntities(repaired);

    if (repaired === previousValue) {
      break;
    }
  }

  return repaired;
}

export function cleanText(value: string): string {
  return normalizeParagraphs(repairMojibake(value));
}

export function cleanInlineText(value: string): string {
  return normalizeWhitespace(repairMojibake(value));
}

export function cleanOptionalText(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleanedValue = cleanText(value);

  return cleanedValue || undefined;
}

export function cleanOptionalInlineText(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleanedValue = cleanInlineText(value);

  return cleanedValue || undefined;
}

export function normalizeUrl(value: string, baseUrl: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(trimmedValue)) {
      return new URL(trimmedValue).toString();
    }

    if (trimmedValue.startsWith("//")) {
      return new URL(`https:${trimmedValue}`).toString();
    }

    return new URL(trimmedValue, baseUrl).toString();
  } catch {
    return "";
  }
}

export function createCanonicalUrl(value: string, baseUrl: string): string {
  const absoluteUrl = normalizeUrl(value, baseUrl);

  if (!absoluteUrl) {
    return "";
  }

  try {
    const url = new URL(absoluteUrl);
    url.hash = "";
    url.search = "";

    return url.toString().replace(/\/+$/, "");
  } catch {
    return absoluteUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
  }
}

export function createStableSourceId(
  source: ExternalSourceId,
  canonicalUrl: string,
): string {
  try {
    const url = new URL(canonicalUrl);
    const normalizedPath = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `${source}-news-${normalizedPath || "home"}`;
  } catch {
    const fallback = canonicalUrl
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();

    return `${source}-news-${fallback || Date.now().toString()}`;
  }
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleanedValue = cleanInlineText(value);
    const key = cleanedValue.toLowerCase();

    if (!cleanedValue || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleanedValue);
  }

  return result;
}

export function createExternalNewsItem(
  params: CreateExternalNewsItemParams,
): ExternalNewsItem | undefined {
  const canonicalUrl = createCanonicalUrl(
    params.canonicalUrl || params.sourceUrl,
    params.sourceUrl,
  );

  const title = cleanInlineText(params.title);

  if (!title || !canonicalUrl) {
    return undefined;
  }

  const sourceUrl = normalizeUrl(params.sourceUrl, canonicalUrl) || canonicalUrl;
  const excerpt = cleanOptionalText(params.excerpt);
  const bodyText = cleanOptionalText(params.bodyText);
  const imageUrl = params.image?.url
    ? normalizeUrl(params.image.url, canonicalUrl)
    : "";

  return {
    id: createStableSourceId(params.source, canonicalUrl),
    source: params.source,
    sourceName: params.sourceName,
    sourceKind: "medio_externo",
    title,
    ...(excerpt ? { excerpt } : {}),
    ...(bodyText ? { bodyText } : {}),
    sourceUrl,
    canonicalUrl,
    ...(params.publishedAt ? { publishedAt: params.publishedAt } : {}),
    detectedAt: params.detectedAt || new Date().toISOString(),
    ...(imageUrl
      ? {
          image: {
            url: imageUrl,
            ...(params.image?.alt
              ? { alt: cleanInlineText(params.image.alt) }
              : {}),
          },
        }
      : {}),
    authors: uniqueStrings(params.authors ?? []),
    tags: uniqueStrings(params.tags ?? []),
    language: params.language ?? "es",
    ...(params.raw ? { raw: params.raw } : {}),
  };
}
