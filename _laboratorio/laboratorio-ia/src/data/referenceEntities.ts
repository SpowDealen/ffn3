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

type GetFilteredReferenceEntityOptionsParams = {
  target: ReferenceTarget;
  selectedDisciplineRef?: string;
  selectedOrganizationRef?: string;
  selectedEventRef?: string;
  selectedCategoriaPesoRef?: string;
};

const MMA = "f1cf0cbc-3bb1-4e4f-9cbf-a4d06227af24";
const UFC = "2352ff66-a625-497f-820f-4fbd4a080ca6";
const UFC_308 = "9bb50701-907b-4c3d-ad37-a3ed54d655b7";
const ILIA_TOPURIA = "9d3a5b7f-ec4f-4bb6-8ee2-81be63bce7c3";
const PESO_PLUMA = "761e3a81-7212-4e52-995f-dc9eb4d264d7";

// Valores provisionales / mock donde aún no hay _id real
const BOXEO = "boxeo";
const MUAY_THAI = "muay-thai";
const ONE = "one";
const MATCHROOM = "matchroom";
const GLORY = "glory";
const UFC_300 = "ufc-300";
const UFC_306 = "ufc-306";
const UFC_309 = "ufc-309";
const UFC_311 = "ufc-311";
const MATCHROOM_LONDON_SERIES = "matchroom-london-series";
const MATCHROOM_MADRID_NIGHT = "matchroom-madrid-night";
const ONE_LUMPINEE = "one-lumpinee";
const ALEX_PEREIRA = "alex-pereira";
const ISLAM_MAKHACHEV = "islam-makhachev";
const ALEXANDER_VOLKANOVSKI = "alexander-volkanovski";
const DMITRY_BIVOL = "dmitry-bivol";
const RODTANG = "rodtang";
const PESO_LIGERO = "peso-ligero";
const PESO_WELTER = "peso-welter";
const PESO_MEDIO = "peso-medio";
const PESO_SEMIPESADO = "peso-semipesado";
const PESO_PESADO = "peso-pesado";
const PESO_SUPERMEDIO = "peso-supermedio";

const referenceEntities: Record<ReferenceTarget, ReferenceEntityOption[]> = {
  disciplina: [
    { label: "MMA", value: MMA, target: "disciplina" },
    { label: "Boxeo", value: BOXEO, target: "disciplina" },
    { label: "Muay Thai", value: MUAY_THAI, target: "disciplina" },
  ],

  organizacion: [
    {
      label: "UFC",
      value: UFC,
      target: "organizacion",
      disciplineIds: [MMA],
    },
    {
      label: "Matchroom",
      value: MATCHROOM,
      target: "organizacion",
      disciplineIds: [BOXEO],
    },
    {
      label: "ONE Championship",
      value: ONE,
      target: "organizacion",
      disciplineIds: [MUAY_THAI],
    },
    {
      label: "GLORY",
      value: GLORY,
      target: "organizacion",
      disciplineIds: [MUAY_THAI],
    },
  ],

  evento: [
    {
      label: "UFC 308",
      value: UFC_308,
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "UFC 300",
      value: UFC_300,
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "UFC 306",
      value: UFC_306,
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "UFC 309",
      value: UFC_309,
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "UFC 311",
      value: UFC_311,
      target: "evento",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Matchroom London Series",
      value: MATCHROOM_LONDON_SERIES,
      target: "evento",
      disciplineIds: [BOXEO],
      organizationIds: [MATCHROOM],
    },
    {
      label: "Matchroom Madrid Night",
      value: MATCHROOM_MADRID_NIGHT,
      target: "evento",
      disciplineIds: [BOXEO],
      organizationIds: [MATCHROOM],
    },
    {
      label: "ONE Lumpinee",
      value: ONE_LUMPINEE,
      target: "evento",
      disciplineIds: [MUAY_THAI],
      organizationIds: [ONE],
    },
  ],

  luchador: [
    {
      label: "Ilia Topuria",
      value: ILIA_TOPURIA,
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: [UFC],
      eventIds: [UFC_308],
      categoryPesoIds: [PESO_PLUMA],
    },
    {
      label: "Alex Pereira",
      value: ALEX_PEREIRA,
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: [UFC],
      eventIds: [UFC_300, UFC_306],
      categoryPesoIds: [PESO_SEMIPESADO, PESO_MEDIO],
    },
    {
      label: "Islam Makhachev",
      value: ISLAM_MAKHACHEV,
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: [UFC],
      eventIds: [UFC_309, UFC_311],
      categoryPesoIds: [PESO_LIGERO],
    },
    {
      label: "Alexander Volkanovski",
      value: ALEXANDER_VOLKANOVSKI,
      target: "luchador",
      disciplineIds: [MMA],
      organizationIds: [UFC],
      eventIds: [UFC_308],
      categoryPesoIds: [PESO_PLUMA],
    },
    {
      label: "Dmitry Bivol",
      value: DMITRY_BIVOL,
      target: "luchador",
      disciplineIds: [BOXEO],
      organizationIds: [MATCHROOM],
      eventIds: [MATCHROOM_LONDON_SERIES, MATCHROOM_MADRID_NIGHT],
      categoryPesoIds: [PESO_SUPERMEDIO, PESO_SEMIPESADO],
    },
    {
      label: "Rodtang",
      value: RODTANG,
      target: "luchador",
      disciplineIds: [MUAY_THAI],
      organizationIds: [ONE],
      eventIds: [ONE_LUMPINEE],
    },
  ],

  categoriaPeso: [
    {
      label: "Peso pluma",
      value: PESO_PLUMA,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso ligero",
      value: PESO_LIGERO,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso wélter",
      value: PESO_WELTER,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso medio",
      value: PESO_MEDIO,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso semipesado",
      value: PESO_SEMIPESADO,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso pesado",
      value: PESO_PESADO,
      target: "categoriaPeso",
      disciplineIds: [MMA],
      organizationIds: [UFC],
    },
    {
      label: "Peso supermedio",
      value: PESO_SUPERMEDIO,
      target: "categoriaPeso",
      disciplineIds: [BOXEO],
      organizationIds: [MATCHROOM],
    },
  ],
};

function matchesFilter(
  optionValues: string[] | undefined,
  selectedValue: string | undefined
): boolean {
  if (!selectedValue) {
    return true;
  }

  if (!optionValues || optionValues.length === 0) {
    return false;
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
}: GetFilteredReferenceEntityOptionsParams): ReferenceEntityOption[] {
  const options = getReferenceEntityOptions(target);

  if (target === "disciplina") {
    return options;
  }

  return options.filter((option) => {
    const matchesDiscipline = matchesFilter(
      option.disciplineIds,
      selectedDisciplineRef
    );

    if (!matchesDiscipline) {
      return false;
    }

    if (target === "organizacion" || target === "evento" || target === "categoriaPeso") {
      return true;
    }

    if (target === "luchador") {
      return matchesFilter(option.organizationIds, selectedOrganizationRef);
    }

    return true;
  });
}

export { referenceEntities };