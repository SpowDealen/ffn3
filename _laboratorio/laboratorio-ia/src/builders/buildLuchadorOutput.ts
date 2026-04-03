import type {
  BuildOutputResult,
  ContentFormState,
  LuchadorSanityOutput,
  ValidationIssue,
} from "../types";
import {
  createOptionalReference,
  createRequiredReference,
} from "../utils/references";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildLuchadorOutputParams = {
  form: ContentFormState;
};

type ReferenceInput = string | { _ref?: string | null; _type?: string };

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }

  return false;
}

function isValidRecord(value: string): boolean {
  return /^[0-9]+-[0-9]+(-[0-9]+)?$/.test(value);
}

export function buildLuchadorOutput({
  form,
}: BuildLuchadorOutputParams): BuildOutputResult<LuchadorSanityOutput> {
  const issues: ValidationIssue[] = [];

  const nombre = getString(form.nombre);
  const apodo = getString(form.apodo);
  const nacionalidad = getString(form.nacionalidad);
  const record = getString(form.record);
  const descripcion = getString(form.descripcion);

  const activo = getBoolean(form.activo, true);
  const destacadoHome = getBoolean(form.destacadoHome, false);
  const rankingDisciplina = getNumber(form.rankingDisciplina);
  const ordenDestacadoHome = getNumber(form.ordenDestacadoHome);
  const imagen = form.imagen;

  const slug = hasValidSlugValue(form.slug)
    ? form.slug
    : createSlugValue(nombre, { maxLength: 96, fallback: "sin-slug" });

  if (!nombre) {
    addIssue(issues, "nombre", "El nombre es obligatorio.");
  } else {
    if (nombre.length < 2) {
      addIssue(issues, "nombre", "El nombre debe tener al menos 2 caracteres.");
    }

    if (nombre.length > 120) {
      addIssue(issues, "nombre", "El nombre no puede superar 120 caracteres.");
    }
  }

  if (apodo && apodo.length > 120) {
    addIssue(issues, "apodo", "El apodo no puede superar 120 caracteres.");
  }

  if (nacionalidad && nacionalidad.length > 80) {
    addIssue(
      issues,
      "nacionalidad",
      "La nacionalidad no puede superar 80 caracteres."
    );
  }

  if (record) {
    if (record.length > 40) {
      addIssue(issues, "record", "El récord no puede superar 40 caracteres.");
    } else if (!isValidRecord(record)) {
      addIssue(
        issues,
        "record",
        "El récord debería tener formato tipo 27-3 o 27-3-1.",
        "warning"
      );
    }
  }

  if (descripcion) {
    if (descripcion.length < 20) {
      addIssue(
        issues,
        "descripcion",
        "La descripción debe tener al menos 20 caracteres."
      );
    }

    if (descripcion.length > 2000) {
      addIssue(
        issues,
        "descripcion",
        "La descripción no puede superar 2000 caracteres."
      );
    }

    if (descripcion.length >= 20 && descripcion.length < 50) {
      addIssue(
        issues,
        "descripcion",
        "La descripción cumple el mínimo, pero sigue siendo pobre editorialmente.",
        "warning"
      );
    }
  }

  if (rankingDisciplina !== undefined) {
    if (!Number.isInteger(rankingDisciplina)) {
      addIssue(
        issues,
        "rankingDisciplina",
        "El ranking editorial debe ser un número entero."
      );
    } else if (rankingDisciplina < 1 || rankingDisciplina > 999) {
      addIssue(
        issues,
        "rankingDisciplina",
        "El ranking editorial debe estar entre 1 y 999."
      );
    }
  }

  if (ordenDestacadoHome !== undefined) {
    if (!Number.isInteger(ordenDestacadoHome)) {
      addIssue(
        issues,
        "ordenDestacadoHome",
        "El orden destacado debe ser un número entero."
      );
    } else if (ordenDestacadoHome < 1) {
      addIssue(
        issues,
        "ordenDestacadoHome",
        "El orden en home debe ser mayor que 0."
      );
    }
  }

  if (destacadoHome && ordenDestacadoHome === undefined) {
    addIssue(
      issues,
      "ordenDestacadoHome",
      "Si el luchador está destacado en inicio, debes indicar su orden."
    );
  }

  if (!destacadoHome && ordenDestacadoHome !== undefined) {
    addIssue(
      issues,
      "ordenDestacadoHome",
      "Hay orden en home, pero el luchador no está marcado como destacado.",
      "warning"
    );
  }

  let disciplina: LuchadorSanityOutput["disciplina"] | null = null;
  let organizacion: LuchadorSanityOutput["organizacion"] | null = null;

  try {
    disciplina = createRequiredReference(
      getReferenceInput(form.disciplina),
      "La disciplina"
    ) as LuchadorSanityOutput["disciplina"];
  } catch (error) {
    addIssue(
      issues,
      "disciplina",
      error instanceof Error ? error.message : "La disciplina es obligatoria."
    );
  }

  try {
    organizacion = createRequiredReference(
      getReferenceInput(form.organizacion),
      "La organización"
    ) as LuchadorSanityOutput["organizacion"];
  } catch (error) {
    addIssue(
      issues,
      "organizacion",
      error instanceof Error ? error.message : "La organización es obligatoria."
    );
  }

  const categoriaPeso = createOptionalReference(
    getReferenceInput(form.categoriaPeso)
  ) as LuchadorSanityOutput["categoriaPeso"] | undefined;

  if (!slug.current.trim()) {
    addIssue(issues, "slug", "No se pudo generar un slug válido.");
  }

  if (
    !hasImageValue(imagen) &&
    !apodo &&
    !nacionalidad &&
    !record &&
    !descripcion
  ) {
    addIssue(
      issues,
      "descripcion",
      "La ficha del luchador cumple lo mínimo, pero está demasiado pelada editorialmente.",
      "warning"
    );
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      output: null,
      issues,
    };
  }

  const output: LuchadorSanityOutput = {
    _type: "luchador",
    nombre,
    slug,
    disciplina: disciplina as LuchadorSanityOutput["disciplina"],
    organizacion: organizacion as LuchadorSanityOutput["organizacion"],
    activo,
    destacadoHome,
  };

  if (apodo) {
    output.apodo = apodo;
  }

  if (hasImageValue(imagen)) {
    output.imagen = imagen;
  }

  if (nacionalidad) {
    output.nacionalidad = nacionalidad;
  }

  if (record) {
    output.record = record;
  }

  if (categoriaPeso) {
    output.categoriaPeso = categoriaPeso;
  }

  if (rankingDisciplina !== undefined) {
    output.rankingDisciplina = rankingDisciplina;
  }

  if (ordenDestacadoHome !== undefined) {
    output.ordenDestacadoHome = ordenDestacadoHome;
  }

  if (descripcion) {
    output.descripcion = descripcion;
  }

  return {
    ok: true,
    output,
    issues,
  };
}