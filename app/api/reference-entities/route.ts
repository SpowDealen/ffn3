import { NextResponse } from "next/server";
import {
  referenceEntities,
  type ReferenceEntityOption,
} from "../../../_laboratorio/laboratorio-ia/src/data/referenceEntities";
import type { ReferenceTarget } from "../../../_laboratorio/laboratorio-ia/src/types";

type ReferenceEntitiesResponse = {
  ok: true;
  data: Record<ReferenceTarget, ReferenceEntityOption[]>;
};

function toArray(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesDiscipline(
  option: ReferenceEntityOption,
  selectedDisciplineIds: string[]
): boolean {
  if (selectedDisciplineIds.length === 0) return true;
  if (!option.disciplineIds || option.disciplineIds.length === 0) return true;

  return option.disciplineIds.some((id: string) =>
    selectedDisciplineIds.includes(id)
  );
}

function matchesOrganization(
  option: ReferenceEntityOption,
  selectedOrganizationIds: string[]
): boolean {
  if (selectedOrganizationIds.length === 0) return true;
  if (!option.organizationIds || option.organizationIds.length === 0) return true;

  return option.organizationIds.some((id: string) =>
    selectedOrganizationIds.includes(id)
  );
}

function matchesEvent(
  option: ReferenceEntityOption,
  selectedEventIds: string[]
): boolean {
  if (selectedEventIds.length === 0) return true;
  if (!option.eventIds || option.eventIds.length === 0) return true;

  return option.eventIds.some((id: string) =>
    selectedEventIds.includes(id)
  );
}

function matchesCategoriaPeso(
  option: ReferenceEntityOption,
  selectedCategoriaPesoIds: string[]
): boolean {
  if (selectedCategoriaPesoIds.length === 0) return true;
  if (!option.categoryPesoIds || option.categoryPesoIds.length === 0) return true;

  return option.categoryPesoIds.some((id: string) =>
    selectedCategoriaPesoIds.includes(id)
  );
}

function filterOptions(
  options: ReferenceEntityOption[],
  selectedDisciplineIds: string[],
  selectedOrganizationIds: string[],
  selectedEventIds: string[],
  selectedCategoriaPesoIds: string[]
): ReferenceEntityOption[] {
  return options.filter((option) => {
    return (
      matchesDiscipline(option, selectedDisciplineIds) &&
      matchesOrganization(option, selectedOrganizationIds) &&
      matchesEvent(option, selectedEventIds) &&
      matchesCategoriaPeso(option, selectedCategoriaPesoIds)
    );
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const selectedDisciplineIds = toArray(searchParams.get("disciplinas"));
  const selectedOrganizationIds = toArray(searchParams.get("organizaciones"));
  const selectedEventIds = toArray(searchParams.get("eventos"));
  const selectedCategoriaPesoIds = toArray(searchParams.get("categoriasPeso"));

  const data: Record<ReferenceTarget, ReferenceEntityOption[]> = {
    disciplina: filterOptions(
      referenceEntities.disciplina,
      selectedDisciplineIds,
      selectedOrganizationIds,
      selectedEventIds,
      selectedCategoriaPesoIds
    ),
    organizacion: filterOptions(
      referenceEntities.organizacion,
      selectedDisciplineIds,
      selectedOrganizationIds,
      selectedEventIds,
      selectedCategoriaPesoIds
    ),
    evento: filterOptions(
      referenceEntities.evento,
      selectedDisciplineIds,
      selectedOrganizationIds,
      selectedEventIds,
      selectedCategoriaPesoIds
    ),
    luchador: filterOptions(
      referenceEntities.luchador,
      selectedDisciplineIds,
      selectedOrganizationIds,
      selectedEventIds,
      selectedCategoriaPesoIds
    ),
    categoriaPeso: filterOptions(
      referenceEntities.categoriaPeso,
      selectedDisciplineIds,
      selectedOrganizationIds,
      selectedEventIds,
      selectedCategoriaPesoIds
    ),
  };

  const response: ReferenceEntitiesResponse = {
    ok: true,
    data,
  };

  return NextResponse.json(response);
}