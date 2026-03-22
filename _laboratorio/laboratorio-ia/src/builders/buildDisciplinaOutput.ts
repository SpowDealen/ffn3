import type {
  BuildOutputResult,
  ContentFormState,
  DisciplinaSanityOutput,
  ValidationIssue,
} from "../types";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildDisciplinaOutputParams = {
  form: ContentFormState;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function addIssue(
  issues: ValidationIssue[],
  field: string,
  message: string,
  severity: "error" | "warning" = "error"
): void {
  issues.push({ field, message, severity });
}

export function buildDisciplinaOutput({
  form,
}: BuildDisciplinaOutputParams): BuildOutputResult<DisciplinaSanityOutput> {
  const issues: ValidationIssue[] = [];

  const nombre = getString(form.nombre);
  const descripcion = getString(form.descripcion);
  const activa = getBoolean(form.activa, true);

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(nombre, { maxLength: 96, fallback: "sin-slug" });

  if (!nombre) {
    addIssue(issues, "nombre", "El nombre es obligatorio.");
  } else {
    if (nombre.length < 2) {
      addIssue(issues, "nombre", "El nombre debe tener al menos 2 caracteres.");
    }

    if (nombre.length > 100) {
      addIssue(issues, "nombre", "El nombre no puede superar 100 caracteres.");
    }
  }

  if (!descripcion) {
    addIssue(issues, "descripcion", "La descripción es obligatoria.");
  } else {
    if (descripcion.length < 10) {
      addIssue(
        issues,
        "descripcion",
        "La descripción debe tener al menos 10 caracteres."
      );
    }

    if (descripcion.length > 800) {
      addIssue(
        issues,
        "descripcion",
        "La descripción no puede superar 800 caracteres."
      );
    }
  }

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

  const output: DisciplinaSanityOutput = {
    nombre,
    slug,
    descripcion,
    activa,
  };

  return {
    ok: true,
    output,
    issues,
  };
}