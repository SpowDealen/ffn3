import type {
  AuxiliaryFormState,
  BuildOutputResult,
  ContentFormState,
  LuchadorSanityOutput,
  ReferenceValue,
  ValidationIssue,
} from "../types";
import {
  createOptionalReference,
  createRequiredReference,
} from "../utils/references";
import { createSlugValue, hasValidSlugValue } from "../utils/slug";

type BuildLuchadorOutputParams = {
  form: ContentFormState;
  auxiliary?: AuxiliaryFormState;
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

function isValidImageValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
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

  if (record && record.length > 40) {
    addIssue(issues, "record", "El récord no puede superar 40 caracteres.");
  }

  if (descripcion && descripcion.length > 2000) {
    addIssue(
      issues,
      "descripcion",
      "La descripción no puede superar 2000 caracteres."
    );
  }

  if (
    rankingDisciplina !== undefined &&
    (rankingDisciplina < 1 || rankingDisciplina > 999)
  ) {
    addIssue(
      issues,
      "rankingDisciplina",
      "El ranking editorial debe estar entre 1 y 999."
    );
  }

  if (destacadoHome) {
    if (ordenDestacadoHome === undefined) {
      addIssue(
        issues,
        "ordenDestacadoHome",
        "Si el luchador está destacado en inicio, debes indicar su orden."
      );
    } else if (ordenDestacadoHome < 1) {
      addIssue(
        issues,
        "ordenDestacadoHome",
        "El orden en home debe ser mayor que 0."
      );
    }
  } else if (ordenDestacadoHome !== undefined && ordenDestacadoHome < 1) {
    addIssue(
      issues,
      "ordenDestacadoHome",
      "El orden en home debe ser mayor que 0."
    );
  }

  let disciplina: ReferenceValue | null = null;
  let organizacion: ReferenceValue | null = null;

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

  try {
    organizacion = createRequiredReference(
      getReferenceInput(form.organizacion),
      "La organización"
    );
  } catch (error) {
    addIssue(
      issues,
      "organizacion",
      error instanceof Error ? error.message : "La organización es obligatoria."
    );
  }

  const categoriaPeso = createOptionalReference(
    getReferenceInput(form.categoriaPeso)
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

  const output: LuchadorSanityOutput = {
    nombre,
    slug,
    disciplina: disciplina as ReferenceValue,
    organizacion: organizacion as ReferenceValue,
    activo,
    destacadoHome,
  };

  if (apodo) {
    output.apodo = apodo;
  }

  if (isValidImageValue(imagen)) {
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