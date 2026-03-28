import type { ReferenceTarget } from "../types";

export type ReferenceEntityOption = {
  label: string;
  value: string;
  target: ReferenceTarget;
  disciplineIds?: string[];
  organizationIds?: string[];
  eventIds?: string[];
  categoryPesoIds?: string[];
};

export const referenceEntities: Record<ReferenceTarget, ReferenceEntityOption[]> = {
  disciplina: [],
  organizacion: [],
  evento: [],
  luchador: [],
  categoriaPeso: [],
};

type GetFilteredReferenceEntityOptionsParams = {
  target: ReferenceTarget;
  selectedDisciplineRef?: string;
  selectedOrganizationRef?: string;
  selectedEventRef?: string;
  selectedCategoriaPesoRef?: string;
};

function matchesFilter(
  optionValues: string[] | undefined,
  selectedValue: string | undefined,
  allowEmpty = true
): boolean {
  if (!selectedValue) {
    return true;
  }

  if (!optionValues || optionValues.length === 0) {
    return allowEmpty;
  }

  return optionValues.includes(selectedValue);
}

export function getReferenceEntityOptions(
  target: ReferenceTarget
): ReferenceEntityOption[] {
  return referenceEntities[target] ?? [];
}

export function getFilteredReferenceEntityOptions({
  target,
  selectedDisciplineRef,
  selectedOrganizationRef,
  selectedEventRef,
  selectedCategoriaPesoRef,
}: GetFilteredReferenceEntityOptionsParams): ReferenceEntityOption[] {
  const options = getReferenceEntityOptions(target);

  if (target === "disciplina") {
    return options;
  }

  return options.filter((option) => {
    const matchesDiscipline = matchesFilter(
      option.disciplineIds,
      selectedDisciplineRef,
      true
    );

    const matchesOrganization = matchesFilter(
      option.organizationIds,
      selectedOrganizationRef,
      true
    );

    const matchesEvent = matchesFilter(option.eventIds, selectedEventRef, true);

    const matchesCategoriaPeso = matchesFilter(
      option.categoryPesoIds,
      selectedCategoriaPesoRef,
      true
    );

    return (
      matchesDiscipline &&
      matchesOrganization &&
      matchesEvent &&
      matchesCategoriaPeso
    );
  });
}