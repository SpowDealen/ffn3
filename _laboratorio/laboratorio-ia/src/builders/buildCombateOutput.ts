import type {
  BuildOutputResult,
  CombateSanityOutput,
  ContentFormState,
  ReferenceValue,
  ValidationIssue,
} from "../types";
import {
  assertDifferentReferences,
  assertReferenceIncluded,
  createOptionalReference,
  createRequiredReference,
} from "../utils/references";

type BuildCombateOutputParams = {
  form: ContentFormState;
};

type ReferenceInput = string | { _ref?: string | null; _type?: string };

const COMBATE_ESTADOS = ["programado", "finalizado", "cancelado"] as const;
const COMBATE_CARTELERAS = ["preliminar", "principal"] as const;

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

function isCombateEstado(value: string): value is CombateSanityOutput["estado"] {
  return COMBATE_ESTADOS.includes(value as CombateSanityOutput["estado"]);
}

function isCombateCartelera(
  value: string
): value is CombateSanityOutput["cartelera"] {
  return COMBATE_CARTELERAS.includes(value as CombateSanityOutput["cartelera"]);
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

function isValidTiempo(value: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(value);
}

export function buildCombateOutput({
  form,
}: BuildCombateOutputParams): BuildOutputResult<CombateSanityOutput> {
  const issues: ValidationIssue[] = [];

  const metodo = getString(form.metodo);
  const tiempo = getString(form.tiempo);
  const resumen = getString(form.resumen);
  const desarrollo = getString(form.desarrollo);
  const momentoClave = getString(form.momentoClave);
  const consecuencia = getString(form.consecuencia);

  const asalto = getNumber(form.asalto);
  const orden = getNumber(form.orden);
  const tituloEnJuego = getBoolean(form.tituloEnJuego, false);

  const estadoRaw = getString(form.estado);
  const carteleraRaw = getString(form.cartelera);

  let evento: CombateSanityOutput["evento"] | null = null;
  let luchadorRojo: CombateSanityOutput["luchadorRojo"] | null = null;
  let luchadorAzul: CombateSanityOutput["luchadorAzul"] | null = null;
  let categoriaPeso: CombateSanityOutput["categoriaPeso"] | null = null;

  try {
    evento = createRequiredReference(
      getReferenceInput(form.evento),
      "El evento"
    ) as CombateSanityOutput["evento"];
  } catch (error) {
    addIssue(
      issues,
      "evento",
      error instanceof Error ? error.message : "El evento es obligatorio."
    );
  }

  try {
    luchadorRojo = createRequiredReference(
      getReferenceInput(form.luchadorRojo),
      "El luchador rojo"
    ) as CombateSanityOutput["luchadorRojo"];
  } catch (error) {
    addIssue(
      issues,
      "luchadorRojo",
      error instanceof Error ? error.message : "El luchador rojo es obligatorio."
    );
  }

  try {
    luchadorAzul = createRequiredReference(
      getReferenceInput(form.luchadorAzul),
      "El luchador azul"
    ) as CombateSanityOutput["luchadorAzul"];
  } catch (error) {
    addIssue(
      issues,
      "luchadorAzul",
      error instanceof Error ? error.message : "El luchador azul es obligatorio."
    );
  }

  try {
    categoriaPeso = createRequiredReference(
      getReferenceInput(form.categoriaPeso),
      "La categoría de peso"
    ) as CombateSanityOutput["categoriaPeso"];
  } catch (error) {
    addIssue(
      issues,
      "categoriaPeso",
      error instanceof Error
        ? error.message
        : "La categoría de peso es obligatoria."
    );
  }

  if (luchadorRojo && luchadorAzul) {
    try {
      assertDifferentReferences(
        luchadorRojo,
        luchadorAzul,
        "El luchador azul no puede ser el mismo que el luchador rojo."
      );
    } catch (error) {
      addIssue(
        issues,
        "luchadorAzul",
        error instanceof Error
          ? error.message
          : "Los dos luchadores no pueden ser el mismo."
      );
    }
  }

  if (!estadoRaw) {
    addIssue(issues, "estado", "El estado es obligatorio.");
  } else if (!isCombateEstado(estadoRaw)) {
    addIssue(
      issues,
      "estado",
      "El estado debe ser programado, finalizado o cancelado."
    );
  }

  if (!carteleraRaw) {
    addIssue(issues, "cartelera", "La cartelera es obligatoria.");
  } else if (!isCombateCartelera(carteleraRaw)) {
    addIssue(
      issues,
      "cartelera",
      "La cartelera debe ser preliminar o principal."
    );
  }

  const ganador = createOptionalReference(getReferenceInput(form.ganador));

  if (estadoRaw === "finalizado" && !ganador) {
    addIssue(
      issues,
      "ganador",
      "Si el combate está finalizado, debes indicar un ganador."
    );
  }

  if (ganador && luchadorRojo && luchadorAzul) {
    try {
      assertReferenceIncluded(
        ganador,
        [luchadorRojo, luchadorAzul],
        "El ganador debe ser uno de los dos luchadores del combate."
      );
    } catch (error) {
      addIssue(
        issues,
        "ganador",
        error instanceof Error
          ? error.message
          : "El ganador debe ser uno de los dos luchadores."
      );
    }
  }

  if (estadoRaw === "programado" && ganador) {
    addIssue(
      issues,
      "ganador",
      "Si el combate está programado, el ganador debe ir vacío.",
      "warning"
    );
  }

  if (estadoRaw === "cancelado" && ganador) {
    addIssue(
      issues,
      "ganador",
      "Si el combate está cancelado, el ganador debería ir vacío.",
      "warning"
    );
  }

  if (metodo && metodo.length > 120) {
    addIssue(issues, "metodo", "El método no puede superar 120 caracteres.");
  }

  if (asalto !== undefined) {
    if (!Number.isInteger(asalto)) {
      addIssue(issues, "asalto", "El asalto debe ser un número entero.");
    } else if (asalto < 1 || asalto > 15) {
      addIssue(issues, "asalto", "El asalto debe estar entre 1 y 15.");
    }
  }

  if (tiempo && !isValidTiempo(tiempo)) {
    addIssue(issues, "tiempo", "El tiempo debe tener formato 3:42.");
  }

  if (orden !== undefined) {
    if (!Number.isInteger(orden)) {
      addIssue(issues, "orden", "El orden debe ser un número entero.");
    } else if (orden < 1) {
      addIssue(issues, "orden", "El orden debe ser mayor que 0.");
    }
  }

  if (resumen && resumen.length > 400) {
    addIssue(issues, "resumen", "El resumen no puede superar 400 caracteres.");
  }

  if (desarrollo && desarrollo.length > 3000) {
    addIssue(
      issues,
      "desarrollo",
      "El desarrollo no puede superar 3000 caracteres."
    );
  }

  if (momentoClave && momentoClave.length > 500) {
    addIssue(
      issues,
      "momentoClave",
      "El momento clave no puede superar 500 caracteres."
    );
  }

  if (consecuencia && consecuencia.length > 700) {
    addIssue(
      issues,
      "consecuencia",
      "La consecuencia no puede superar 700 caracteres."
    );
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      output: null,
      issues,
    };
  }

  const output: CombateSanityOutput = {
    _type: "combate",
    evento: evento as CombateSanityOutput["evento"],
    luchadorRojo: luchadorRojo as CombateSanityOutput["luchadorRojo"],
    luchadorAzul: luchadorAzul as CombateSanityOutput["luchadorAzul"],
    categoriaPeso: categoriaPeso as CombateSanityOutput["categoriaPeso"],
    tituloEnJuego,
    cartelera: carteleraRaw as CombateSanityOutput["cartelera"],
    estado: estadoRaw as CombateSanityOutput["estado"],
  };

  if (ganador && estadoRaw !== "programado" && isReference(ganador)) {
    output.ganador = ganador;
  }

  if (metodo) {
    output.metodo = metodo;
  }

  if (asalto !== undefined) {
    output.asalto = asalto;
  }

  if (tiempo) {
    output.tiempo = tiempo;
  }

  if (orden !== undefined) {
    output.orden = orden;
  }

  if (resumen) {
    output.resumen = resumen;
  }

  if (desarrollo) {
    output.desarrollo = desarrollo;
  }

  if (momentoClave) {
    output.momentoClave = momentoClave;
  }

  if (consecuencia) {
    output.consecuencia = consecuencia;
  }

  return {
    ok: true,
    output,
    issues,
  };
}