import type { ContentTypeId, SlugValue } from "../types";

const ACCENT_MAP: Record<string, string> = {
  á: "a",
  à: "a",
  ä: "a",
  â: "a",
  ã: "a",
  å: "a",
  é: "e",
  è: "e",
  ë: "e",
  ê: "e",
  í: "i",
  ì: "i",
  ï: "i",
  î: "i",
  ó: "o",
  ò: "o",
  ö: "o",
  ô: "o",
  õ: "o",
  ú: "u",
  ù: "u",
  ü: "u",
  û: "u",
  ñ: "n",
  ç: "c",
};

export type SlugSourceValue = string | null | undefined;

export type CreateSlugOptions = {
  maxLength?: number;
  fallback?: string;
};

export type SlugBuildableContentType = Extract<
  ContentTypeId,
  "noticia" | "evento" | "luchador" | "categoriaPeso" | "disciplina"
>;

function replaceAccents(value: string): string {
  return value.replace(
    /[áàäâãåéèëêíìïîóòöôõúùüûñç]/gi,
    (match) => ACCENT_MAP[match.toLowerCase()] ?? match
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeForSlug(value: string): string {
  return replaceAccents(value)
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createSlugString(
  source: SlugSourceValue,
  options: CreateSlugOptions = {}
): string {
  const { maxLength = 96, fallback = "sin-slug" } = options;

  const normalized = normalizeWhitespace(source ?? "");
  const sanitized = sanitizeForSlug(normalized);

  if (!sanitized) {
    return fallback;
  }

  const trimmed = sanitized
    .slice(0, maxLength)
    .replace(/-+$/g, "")
    .trim();

  return trimmed || fallback;
}

export function createSlugValue(
  source: SlugSourceValue,
  options: CreateSlugOptions = {}
): SlugValue {
  return {
    current: createSlugString(source, options),
  };
}

export function hasValidSlugValue(value: unknown): value is SlugValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SlugValue>;

  return (
    typeof candidate.current === "string" &&
    candidate.current.trim().length > 0
  );
}

export function resolveSlugSource(
  data: Record<string, unknown>,
  preferredKeys: string[]
): string {
  for (const key of preferredKeys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function buildSlugFromContentType(
  type: SlugBuildableContentType,
  data: Record<string, unknown>,
  options: CreateSlugOptions = {}
): SlugValue {
  switch (type) {
    case "noticia":
      return createSlugValue(resolveSlugSource(data, ["titulo"]), options);

    case "evento":
    case "luchador":
    case "categoriaPeso":
    case "disciplina":
      return createSlugValue(resolveSlugSource(data, ["nombre"]), options);
  }
}