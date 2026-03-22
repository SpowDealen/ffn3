import type { ReferenceTarget, ReferenceValue } from "../types";

export type ReferenceInput =
  | string
  | null
  | undefined
  | {
      _ref?: string | null;
      _type?: string;
    };

export type ReferenceArrayInput = ReferenceInput[] | null | undefined;

function normalizeRefString(value: string): string {
  return value.trim();
}

export function isReferenceValue(value: unknown): value is ReferenceValue {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReferenceValue>;

  return (
    candidate._type === "reference" &&
    typeof candidate._ref === "string" &&
    candidate._ref.trim().length > 0
  );
}

export function extractRef(input: ReferenceInput): string | null {
  if (!input) {
    return null;
  }

  if (typeof input === "string") {
    const normalized = normalizeRefString(input);
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof input === "object" && typeof input._ref === "string") {
    const normalized = normalizeRefString(input._ref);
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

export function createReference(_ref: string): ReferenceValue {
  return {
    _type: "reference",
    _ref: normalizeRefString(_ref),
  };
}

export function createOptionalReference(
  input: ReferenceInput
): ReferenceValue | undefined {
  const ref = extractRef(input);

  if (!ref) {
    return undefined;
  }

  return createReference(ref);
}

export function createRequiredReference(
  input: ReferenceInput,
  fieldLabel = "Referencia"
): ReferenceValue {
  const ref = extractRef(input);

  if (!ref) {
    throw new Error(`${fieldLabel} es obligatoria.`);
  }

  return createReference(ref);
}

export function createReferenceArray(
  input: ReferenceArrayInput,
  options: {
    unique?: boolean;
    removeEmpty?: boolean;
  } = {}
): ReferenceValue[] {
  const { unique = true, removeEmpty = true } = options;
  const items = Array.isArray(input) ? input : [];

  const refs = items
    .map((item) => extractRef(item))
    .filter((item): item is string => {
      if (removeEmpty) {
        return Boolean(item && item.trim());
      }

      return item !== null;
    });

  if (!unique) {
    return refs.map((ref) => createReference(ref));
  }

  const uniqueRefs = Array.from(new Set(refs));
  return uniqueRefs.map((ref) => createReference(ref));
}

export function hasReference(input: ReferenceInput): boolean {
  return extractRef(input) !== null;
}

export function sameReference(
  left: ReferenceInput,
  right: ReferenceInput
): boolean {
  const leftRef = extractRef(left);
  const rightRef = extractRef(right);

  if (!leftRef || !rightRef) {
    return false;
  }

  return leftRef === rightRef;
}

export function isReferenceIncluded(
  target: ReferenceInput,
  candidates: ReferenceArrayInput
): boolean {
  const targetRef = extractRef(target);

  if (!targetRef || !Array.isArray(candidates)) {
    return false;
  }

  return candidates.some((candidate) => extractRef(candidate) === targetRef);
}

export function assertDifferentReferences(
  left: ReferenceInput,
  right: ReferenceInput,
  message = "Las referencias no pueden ser iguales."
): void {
  if (sameReference(left, right)) {
    throw new Error(message);
  }
}

export function assertReferenceIncluded(
  value: ReferenceInput,
  allowedValues: ReferenceArrayInput,
  message = "La referencia no está permitida."
): void {
  if (!isReferenceIncluded(value, allowedValues)) {
    throw new Error(message);
  }
}

export function getReferenceTargetLabel(target: ReferenceTarget): string {
  switch (target) {
    case "disciplina":
      return "Disciplina";
    case "organizacion":
      return "Organización";
    case "luchador":
      return "Luchador";
    case "evento":
      return "Evento";
    case "categoriaPeso":
      return "Categoría de peso";
  }
}