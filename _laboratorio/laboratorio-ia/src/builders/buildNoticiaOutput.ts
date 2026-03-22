import type {
  BuildOutputResult,
  ContentFormState,
  NoticiaSanityOutput,
  PortableTextBlock,
  PortableTextValue,
  ReferenceValue,
  ValidationIssue,
} from "../types";
import {
  createPortableText,
  hasPortableTextContent,
} from "../utils/portableText";
import {
  createOptionalReference,
  createReferenceArray,
  createRequiredReference,
} from "../utils/references";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildNoticiaOutputParams = {
  form: ContentFormState;
};

type ReferenceInput = string | { _ref?: string | null; _type?: string };

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isPortableTextBlock(value: unknown): value is PortableTextBlock {
  return (
    value !== null &&
    typeof value === "object" &&
    "_type" in value &&
    (value as { _type?: unknown })._type === "block"
  );
}

function getPortableTextInput(
  value: unknown
): string | string[] | PortableTextValue | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => isPortableTextBlock(item))) {
    return value;
  }

  return null;
}

function getReferenceInput(value: unknown): ReferenceInput | null {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as { _ref?: unknown; _type?: unknown };

    if (
      typeof candidate._ref === "string" ||
      typeof candidate._ref === "undefined" ||
      candidate._ref === null
    ) {
      return {
        _ref:
          typeof candidate._ref === "string" || candidate._ref === null
            ? candidate._ref
            : undefined,
        _type: typeof candidate._type === "string" ? candidate._type : undefined,
      };
    }
  }

  return null;
}

function getReferenceArrayInput(value: unknown): ReferenceInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => getReferenceInput(item))
    .filter((item): item is ReferenceInput => item !== null);
}

function addIssue(
  issues: ValidationIssue[],
  field: string,
  message: string,
  severity: "error" | "warning" = "error"
): void {
  issues.push({ field, message, severity });
}

function hasImageValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return typeof value === "object";
}

function isReference(value: unknown): value is ReferenceValue {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as ReferenceValue)._type === "reference" &&
    typeof (value as ReferenceValue)._ref === "string" &&
    (value as ReferenceValue)._ref.trim().length > 0
  );
}

export function buildNoticiaOutput({
  form,
}: BuildNoticiaOutputParams): BuildOutputResult<NoticiaSanityOutput> {
  const issues: ValidationIssue[] = [];

  const titulo = getString(form.titulo);
  const extracto = getString(form.extracto);
  const fechaPublicacion = getString(form.fechaPublicacion);
  const destacada = getBoolean(form.destacada, false);
  const imagenPrincipal = form.imagenPrincipal;

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(titulo, { maxLength: 96, fallback: "sin-slug" });

  const contenido = createPortableText(getPortableTextInput(form.contenido));

  if (!titulo) {
    addIssue(issues, "titulo", "El título es obligatorio.");
  } else {
    if (titulo.length < 8) {
      addIssue(issues, "titulo", "El título debe tener al menos 8 caracteres.");
    }

    if (titulo.length > 160) {
      addIssue(
        issues,
        "titulo",
        "El título no puede superar 160 caracteres."
      );
    }
  }

  if (!extracto) {
    addIssue(issues, "extracto", "El extracto es obligatorio.");
  } else {
    if (extracto.length < 20) {
      addIssue(
        issues,
        "extracto",
        "El extracto debe tener al menos 20 caracteres."
      );
    }

    if (extracto.length > 200) {
      addIssue(
        issues,
        "extracto",
        "El extracto no puede superar 200 caracteres."
      );
    }
  }

  if (!hasPortableTextContent(contenido)) {
    addIssue(issues, "contenido", "La noticia debe tener contenido.");
  }

  if (!fechaPublicacion) {
    addIssue(
      issues,
      "fechaPublicacion",
      "La fecha de publicación es obligatoria."
    );
  }

  let disciplina: ReferenceValue | null = null;

  try {
    disciplina = createRequiredReference(
      getReferenceInput(form.disciplina),
      "La disciplina"
    );
  } catch (error) {
    addIssue(
      issues,
      "disciplina",
      error instanceof Error ? error.message : "La disciplina es obligatoria."
    );
  }

  const organizacionRelacionada = createOptionalReference(
    getReferenceInput(form.organizacionRelacionada)
  );

  const eventoRelacionado = createOptionalReference(
    getReferenceInput(form.eventoRelacionado)
  );

  const luchadoresRelacionados = createReferenceArray(
    getReferenceArrayInput(form.luchadoresRelacionados),
    { unique: true, removeEmpty: true }
  );

  if (!slug.current.trim()) {
    addIssue(issues, "slug", "No se pudo generar un slug válido.");
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      output: null,
      issues,
    };
  }

  const output: NoticiaSanityOutput = {
    _type: "noticia",
    titulo,
    slug,
    extracto,
    contenido,
    fechaPublicacion,
    disciplina: disciplina as ReferenceValue,
    destacada,
  };

  if (hasImageValue(imagenPrincipal)) {
    output.imagenPrincipal = imagenPrincipal;
  }

  if (organizacionRelacionada && isReference(organizacionRelacionada)) {
    output.organizacionRelacionada = organizacionRelacionada;
  }

  if (eventoRelacionado && isReference(eventoRelacionado)) {
    output.eventoRelacionado = eventoRelacionado;
  }

  if (luchadoresRelacionados.length > 0) {
    output.luchadoresRelacionados = luchadoresRelacionados;
  }

  return {
    ok: true,
    output,
    issues,
  };
}