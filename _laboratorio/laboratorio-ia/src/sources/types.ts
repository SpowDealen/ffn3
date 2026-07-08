export const OFFICIAL_SOURCE_IDS = [
  "ufc",
  "one",
  "bkfc",
  "ibjjf",
] as const;

export type OfficialSourceId = (typeof OFFICIAL_SOURCE_IDS)[number];

export const SOURCE_ITEM_TYPES = [
  "noticia",
  "evento",
  "resultado",
  "pesaje",
  "luchador",
  "combate",
  "actualizacion",
] as const;

export type SourceItemType = (typeof SOURCE_ITEM_TYPES)[number];

export const SOURCE_ITEM_STATUSES = [
  "nuevo",
  "procesado",
  "descartado",
  "error",
] as const;

export type SourceItemStatus = (typeof SOURCE_ITEM_STATUSES)[number];

export type SourceReferenceCandidate = {
  label: string;
  value: string;
  sanityId?: string;
  slug?: string;
  matched: boolean;
};

export type SourceImage = {
  url: string;
  alt?: string;
};

export type OfficialSourceItem = {
  id: string;
  sourceId: OfficialSourceId;
  sourceName: string;

  type: SourceItemType;
  status: SourceItemStatus;

  title: string;
  summary?: string;
  bodyText?: string;

  sourceUrl: string;
  canonicalUrl?: string;

  publishedAt?: string;
  detectedAt: string;
  updatedAt?: string;

  image?: SourceImage;

  disciplineCandidates: SourceReferenceCandidate[];
  organizationCandidates: SourceReferenceCandidate[];
  eventCandidates: SourceReferenceCandidate[];
  fighterCandidates: SourceReferenceCandidate[];
  weightClassCandidates: SourceReferenceCandidate[];

  raw?: Record<string, unknown>;

  metadata?: {
    location?: string;
    eventDate?: string;
    eventStatus?: string;
    language?: string;
    author?: string;
  };
};

export type OfficialSourceDefinition = {
  id: OfficialSourceId;
  name: string;
  baseUrl: string;
  enabled: boolean;

  supportedTypes: SourceItemType[];

  refreshIntervalSeconds: number;
};

export type SourceFetchResult = {
  ok: boolean;
  sourceId: OfficialSourceId;
  fetchedAt: string;

  items: OfficialSourceItem[];

  error?: string;
};

export type SourceDraftTarget =
  | "noticia"
  | "evento"
  | "combate"
  | "luchador";

export type SourceDraftProposal = {
  sourceItemId: string;
  targetType: SourceDraftTarget;

  confidence: number;

  title: string;
  explanation: string;

  missingReferences: string[];
  warnings: string[];

  output: Record<string, unknown>;
};

export const EXTERNAL_SOURCE_IDS = ["marca", "as"] as const;

export type ExternalSourceId = (typeof EXTERNAL_SOURCE_IDS)[number];

export type ExternalNewsSourceDefinition = {
  id: ExternalSourceId;
  name: string;
  baseUrl: string;
  enabled: boolean;
  language: "es" | "en" | "unknown";
  kind: "medio_externo";
  refreshIntervalSeconds: number;
};

export type ExternalNewsImage = {
  url: string;
  alt?: string;
};

export type ExternalNewsRawPayload = Record<string, unknown>;

export type ExternalNewsItem = {
  id: string;
  source: ExternalSourceId;
  sourceName: string;
  sourceKind: "medio_externo";

  title: string;
  excerpt?: string;
  bodyText?: string;

  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  detectedAt: string;

  image?: ExternalNewsImage;

  authors: string[];
  tags: string[];

  language: "es" | "en" | "unknown";

  raw?: ExternalNewsRawPayload;
};

export type ExternalNewsFetchResult = {
  ok: boolean;
  source: ExternalSourceId;
  sourceName: string;
  fetchedAt: string;
  count: number;
  items: ExternalNewsItem[];
  error?: string;
};

export type ExternalNewsAdapter = {
  source: ExternalNewsSourceDefinition;
  fetchNews: () => Promise<ExternalNewsFetchResult>;
};

export function isExternalSourceId(
  value: string,
): value is ExternalSourceId {
  return (EXTERNAL_SOURCE_IDS as readonly string[]).includes(value);
}
