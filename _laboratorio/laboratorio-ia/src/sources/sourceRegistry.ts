import type {
  ExternalNewsSourceDefinition,
  ExternalSourceId,
  OfficialSourceDefinition,
  OfficialSourceId,
} from "./types";

export const OFFICIAL_SOURCES: OfficialSourceDefinition[] = [
  {
    id: "ufc",
    name: "UFC",
    baseUrl: "https://www.ufc.com",
    enabled: true,
    supportedTypes: [
      "noticia",
      "evento",
      "resultado",
      "pesaje",
      "luchador",
      "combate",
      "actualizacion",
    ],
    refreshIntervalSeconds: 120,
  },
  {
    id: "one",
    name: "ONE Championship",
    baseUrl: "https://www.onefc.com",
    enabled: false,
    supportedTypes: [
      "noticia",
      "evento",
      "resultado",
      "luchador",
      "combate",
      "actualizacion",
    ],
    refreshIntervalSeconds: 300,
  },
  {
    id: "bkfc",
    name: "BKFC",
    baseUrl: "https://www.bkfc.com",
    enabled: false,
    supportedTypes: [
      "noticia",
      "evento",
      "resultado",
      "luchador",
      "combate",
      "actualizacion",
    ],
    refreshIntervalSeconds: 300,
  },
  {
    id: "ibjjf",
    name: "IBJJF",
    baseUrl: "https://ibjjf.com",
    enabled: false,
    supportedTypes: [
      "noticia",
      "evento",
      "resultado",
      "luchador",
      "combate",
      "actualizacion",
    ],
    refreshIntervalSeconds: 600,
  },
];

export const EXTERNAL_NEWS_SOURCES: ExternalNewsSourceDefinition[] = [
  {
    id: "marca",
    name: "Marca",
    baseUrl: "https://www.marca.com",
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  {
    id: "as",
    name: "AS",
    baseUrl: "https://as.com",
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
  {
    id: "eurosport",
    name: "Eurosport España",
    baseUrl: "https://www.eurosport.es",
    enabled: true,
    language: "es",
    kind: "medio_externo",
    refreshIntervalSeconds: 300,
  },
];

export function getOfficialSource(
  sourceId: OfficialSourceId,
): OfficialSourceDefinition | undefined {
  return OFFICIAL_SOURCES.find((source) => source.id === sourceId);
}

export function getEnabledOfficialSources(): OfficialSourceDefinition[] {
  return OFFICIAL_SOURCES.filter((source) => source.enabled);
}

export function getExternalNewsSource(
  sourceId: ExternalSourceId,
): ExternalNewsSourceDefinition | undefined {
  return EXTERNAL_NEWS_SOURCES.find((source) => source.id === sourceId);
}

export function getEnabledExternalNewsSources(): ExternalNewsSourceDefinition[] {
  return EXTERNAL_NEWS_SOURCES.filter((source) => source.enabled);
}
