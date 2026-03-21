import type { ReferenceFilterContext, ReferenceTarget } from "../types";

export type ReferenceDisciplineId = "mma" | "boxeo" | "muay-thai";

export type ReferenceEntityOption = {
  label: string;
  value: string;
  target: ReferenceTarget;
  disciplineIds?: ReferenceDisciplineId[];
  organizationIds?: string[];
  eventIds?: string[];
  categoryPesoIds?: string[];
};

const MMA: ReferenceDisciplineId = "mma";
const BOXEO: ReferenceDisciplineId = "boxeo";
const MUAY_THAI: ReferenceDisciplineId = "muay-thai";

const referenceEntities: Record<ReferenceTarget, ReferenceEntityOption[]> = {
  disciplina: [
    {
      label: "MMA",
      value: "mma",
      target: "disciplina",
    },
    {
      label: "Boxeo",
      value: "boxeo",
      target: "disciplina",
    },
    {
      label: "Muay Thai",
      value: "muay-thai",
      target: "disciplina",
    },
  ],

  organizacion: [
    {
      label: "UFC",
      value: "ufc",
      target: "organizacion",
      disciplineIds: [MMA],
      eventIds: ["ufc-300", "ufc-306", "ufc-308", "ufc-309", "ufc-311"],
    },
    {
      label: "ONE Championship",
      value: "one-championship",
      target: "organizacion",
      disciplineIds: [MMA, MUAY_THAI],
      eventIds: ["one-fight-night-18", "superlek-vs-rodtang"],
    },
    {
      label: "Matchroom Boxing",
      value: "matchroom-boxing",
      target: "organizacion",
      disciplineIds: [BOXEO],
      eventIds: ["beterbiev-vs-bivol"],
    },
    {
      label: "Queensberry Promotions",
      value: "queensberry-promotions",
      target: "organizacion",
      disciplineIds: [BOXEO],
      eventIds: ["fury-vs-usyk"],
    },
    {
      label: "Top Rank",
      value: "top-rank",
      target: "organizacion",
      disciplineIds: [BOXEO],
    },
    {
      label: "RWS",
      value: "rws",
      target: "organizacion",
      disciplineIds: [MUAY_THAI],
      eventIds: ["rws-rajadamnern-world-series"],
    },
  ],

  evento: [
    {
      label: "UFC 300",
      value: "ufc-300",
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
    },
    {
      label: "UFC 306",
      value: "ufc-306",
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
    },
    {
      label: "UFC 308",
      value: "ufc-308",
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
    },
    {
      label: "UFC 309",
      value: "ufc-309",
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
    },
    {
      label: "UFC 311",
      value: "ufc-311",
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
    },
    {
      label: "ONE Fight Night 18",
      value: "one-fight-night-18",
      target: "evento",
      disciplineIds: [MMA, MUAY_THAI],
      organizationIds: ["one-championship"],
    },
    {
      label: "Superlek vs Rodtang",
      value: "superlek-vs-rodtang",
      target: "evento",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["one-championship"],
    },
    {
      label: "RWS Rajadamnern World Series",
      value: "rws-rajadamnern-world-series",
      target: "evento",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["rws"],
    },
    {
      label: "Beterbiev vs Bivol",
      value: "beterbiev-vs-bivol",
      target: "evento",
      disciplineIds: [BOXEO],
      organizationIds: ["matchroom-boxing"],
    },
    {
      label: "Tyson Fury vs Oleksandr Usyk",
      value: "fury-vs-usyk",
      target: "evento",
      disciplineIds: [BOXEO],
      organizationIds: ["queensberry-promotions"],
    },
  ],

  luchador: [
    {
      label: "Ilia Topuria",
      value: "ilia-topuria",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-308"],
      categoryPesoIds: ["peso-pluma"],
    },
    {
      label: "Max Holloway",
      value: "max-holloway",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-308"],
      categoryPesoIds: ["peso-pluma"],
    },
    {
      label: "Islam Makhachev",
      value: "islam-makhachev",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-311"],
      categoryPesoIds: ["peso-ligero"],
    },
    {
      label: "Charles Oliveira",
      value: "charles-oliveira",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-300", "ufc-311"],
      categoryPesoIds: ["peso-ligero"],
    },
    {
      label: "Alex Pereira",
      value: "alex-pereira",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-300", "ufc-306", "ufc-309"],
      categoryPesoIds: ["peso-semipesado"],
    },
    {
      label: "Tom Aspinall",
      value: "tom-aspinall",
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: ["ufc"],
      eventIds: ["ufc-309"],
      categoryPesoIds: ["peso-pesado"],
    },
    {
      label: "Artur Beterbiev",
      value: "artur-beterbiev",
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: ["matchroom-boxing"],
      eventIds: ["beterbiev-vs-bivol"],
      categoryPesoIds: ["peso-semipesado-boxeo"],
    },
    {
      label: "Dmitry Bivol",
      value: "dmitry-bivol",
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: ["matchroom-boxing"],
      eventIds: ["beterbiev-vs-bivol"],
      categoryPesoIds: ["peso-semipesado-boxeo"],
    },
    {
      label: "Tyson Fury",
      value: "tyson-fury",
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: ["queensberry-promotions"],
      eventIds: ["fury-vs-usyk"],
      categoryPesoIds: ["peso-pesado-boxeo"],
    },
    {
      label: "Oleksandr Usyk",
      value: "oleksandr-usyk",
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: ["queensberry-promotions"],
      eventIds: ["fury-vs-usyk"],
      categoryPesoIds: ["peso-pesado-boxeo"],
    },
    {
      label: "Naoya Inoue",
      value: "naoya-inoue",
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: ["top-rank"],
      categoryPesoIds: ["peso-superwelter"],
    },
    {
      label: "Canelo Álvarez",
      value: "canelo-alvarez",
      target: "luchador",
      disciplineIds: [BOXEO],
      categoryPesoIds: ["peso-superwelter"],
    },
    {
      label: "Rodtang Jitmuangnon",
      value: "rodtang-jitmuangnon",
      target: "luchador",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["one-championship"],
      eventIds: ["superlek-vs-rodtang"],
      categoryPesoIds: ["peso-gallo-muay-thai"],
    },
    {
      label: "Superlek Kiatmoo9",
      value: "superlek-kiatmoo9",
      target: "luchador",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["one-championship"],
      eventIds: ["superlek-vs-rodtang"],
      categoryPesoIds: ["peso-gallo-muay-thai"],
    },
    {
      label: "Tawanchai PK Saenchai",
      value: "tawanchai-pk-saenchai",
      target: "luchador",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["one-championship"],
      eventIds: ["one-fight-night-18"],
      categoryPesoIds: ["peso-pluma-muay-thai"],
    },
    {
      label: "Nong-O Hama",
      value: "nong-o-hama",
      target: "luchador",
      disciplineIds: [MUAY_THAI],
      organizationIds: ["one-championship"],
      eventIds: ["one-fight-night-18"],
      categoryPesoIds: ["peso-gallo-muay-thai"],
    },
  ],

  categoriaPeso: [
    {
      label: "Peso mosca",
      value: "peso-mosca",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso gallo",
      value: "peso-gallo",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso pluma",
      value: "peso-pluma",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso ligero",
      value: "peso-ligero",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso wélter",
      value: "peso-welter",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso medio",
      value: "peso-medio",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso semipesado",
      value: "peso-semipesado",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso pesado",
      value: "peso-pesado",
      target: "categoriaPeso",
      disciplineIds: [MMA],
    },
    {
      label: "Peso superwélter",
      value: "peso-superwelter",
      target: "categoriaPeso",
      disciplineIds: [BOXEO],
    },
    {
      label: "Peso semipesado boxeo",
      value: "peso-semipesado-boxeo",
      target: "categoriaPeso",
      disciplineIds: [BOXEO],
    },
    {
      label: "Peso pesado boxeo",
      value: "peso-pesado-boxeo",
      target: "categoriaPeso",
      disciplineIds: [BOXEO],
    },
    {
      label: "Peso mosca Muay Thai",
      value: "peso-mosca-muay-thai",
      target: "categoriaPeso",
      disciplineIds: [MUAY_THAI],
    },
    {
      label: "Peso gallo Muay Thai",
      value: "peso-gallo-muay-thai",
      target: "categoriaPeso",
      disciplineIds: [MUAY_THAI],
    },
    {
      label: "Peso pluma Muay Thai",
      value: "peso-pluma-muay-thai",
      target: "categoriaPeso",
      disciplineIds: [MUAY_THAI],
    },
  ],
};

export function getReferenceEntityOptions(
  target?: ReferenceTarget
): ReferenceEntityOption[] {
  if (!target) {
    return [];
  }

  return referenceEntities[target] ?? [];
}

function matchesSelectedRelation(
  optionValues: string[] | undefined,
  selectedValue: string | undefined
): boolean {
  if (!selectedValue) {
    return true;
  }

  if (!optionValues || optionValues.length === 0) {
    return true;
  }

  return optionValues.includes(selectedValue);
}

function matchesDiscipline(
  option: ReferenceEntityOption,
  selectedDisciplineRef?: string
): boolean {
  if (option.target === "disciplina") {
    return true;
  }

  if (!selectedDisciplineRef) {
    return true;
  }

  if (!option.disciplineIds || option.disciplineIds.length === 0) {
    return false;
  }

  return option.disciplineIds.includes(
    selectedDisciplineRef as ReferenceDisciplineId
  );
}

function sanitizeFilterContext(
  context: ReferenceFilterContext
): ReferenceFilterContext {
  return {
    selectedDisciplineRef: context.selectedDisciplineRef || undefined,
    selectedOrganizationRef: context.selectedOrganizationRef || undefined,
    selectedEventRef: context.selectedEventRef || undefined,
    selectedCategoriaPesoRef: context.selectedCategoriaPesoRef || undefined,
  };
}

export function getFilteredReferenceEntityOptions(
  params: {
    target?: ReferenceTarget;
  } & ReferenceFilterContext
): ReferenceEntityOption[] {
  const { target, ...rawContext } = params;
  const context = sanitizeFilterContext(rawContext);

  if (!target) {
    return [];
  }

  const options = referenceEntities[target] ?? [];

  return options.filter((option) => {
    const matchesCurrentDiscipline = matchesDiscipline(
      option,
      context.selectedDisciplineRef
    );

    const matchesOrganization =
      target === "organizacion"
        ? true
        : matchesSelectedRelation(
            option.organizationIds,
            context.selectedOrganizationRef
          );

    const matchesEvent =
      target === "evento"
        ? true
        : matchesSelectedRelation(option.eventIds, context.selectedEventRef);

    const matchesCategoriaPeso =
      target === "categoriaPeso"
        ? true
        : matchesSelectedRelation(
            option.categoryPesoIds,
            context.selectedCategoriaPesoRef
          );

    return (
      matchesCurrentDiscipline &&
      matchesOrganization &&
      matchesEvent &&
      matchesCategoriaPeso
    );
  });
}