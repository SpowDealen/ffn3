import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  contentTypeOptions,
  getContentTypeDefinition,
} from "../config/contentTypes";
import { buildContentOutput } from "../lib/buildContentOutput";
import { getInitialFormState } from "../lib/getInitialFormState";
import { saveDraft } from "../lib/saveDraft";
import {
  notifyAnalysisCompleted,
  notifyDraftBatchProcessed,
  notifyDraftCreated,
  notifyEntityBatchProcessed,
  notifyError,
  notifyEventAnalysisCompleted,
  notifyEventCreated,
  notifyEventResolved,
  notifyEventsLoaded,
  notifyReviewRecommended,
  notifySourceLoaded,
} from "../notifications/notify";
import {navigateLaboratory} from "../app/useLaboratoryRouter";
import {
  completeProcess,
  failProcess,
  startProcess,
  updateProcess,
} from "../processes/store";
import type {
  AuxiliaryFormState,
  ContentFormState,
  ContentTypeId,
  FieldKind,
  FormValue,
  ReferenceFilterContext,
  ReferenceTarget,
  SchemaFieldDefinition,
  ValidationIssue,
} from "../types";
import type { ReferenceEntityOption } from "../data/referenceEntities";
import type {
  ExternalNewsFetchResult,
  ExternalNewsItem,
  ExternalSourceId,
} from "../sources/types";
import { getEnabledExternalNewsSources } from "../sources/sourceRegistry";
import {runExternalNewsReviewPilot, type ExternalNewsPilotReview} from "../review/producers/externalNews";
import {registerReviewResumeExecutor} from "../integrations/reviewResumeExecutors";
import {registerPanelSanityInvestigationSource} from "../integrations/reviewInvestigationSources";
import {registerReviewEditorialAgentCapabilities} from "../integrations/reviewEditorialAgentCapabilities";
import {editorialEntityCreationExecutor} from "../integrations/editorialEntityCreationExecutor";
import {registerEntityCreationExecutor, registerPreparedEntityCapabilities} from "../review/materialization";
import {registerSchemaRequirementCapabilities} from "../review/schemaRequirements";
import {registerEditorialSchemaRequirements} from "../integrations/editorialSchemaRequirements";
import type {ExternalNewsResumeExecutor} from "../review/resume/externalNews";
import type {ReviewJsonObject} from "../review/types";
import {registerExternalNewsGlobalResolutionRuntime} from "../review/globalResolution";
import {registerFighterResolutionProposals, type FighterResolutionIntakeResponse} from "../review/fighterResolutionIntake";


type ExternalEditorialAnalysisResponse =
  | {
      ok: true;
      data: {
        analysis: {
          relevancia: "alta" | "media" | "baja" | "descartar";
          debeCrearNoticia: boolean;
          necesitaRevisionManual: boolean;
          razonRevisionManual: string;
          motivoRelevancia: string;
          temaPrincipal: string;
          disciplinaPrincipal: string;
          organizacionPrincipal: string;
          eventoPrincipal: string;
          combatePrincipal: string;
          luchadoresPrincipales: string[];
          luchadoresSecundarios: string[];
          entidadesMencionadas: string[];
          fuenteFormulario: "ufc" | "bkfc" | "otra";
          anguloEditorial: string;
          hechoPrincipal: string;
          contextoPrevio: string;
          instruccionesRedaccion: string;
          confianzaRelaciones: number;
        };
        resolved: {
          disciplina: { id: string; label: string } | null;
          organizacion: { id: string; label: string } | null;
          evento: { id: string; label: string } | null;
          combate: {
            id: string;
            label: string;
            eventoId?: string;
            eventoLabel?: string;
          } | null;
          luchadoresPrincipales: Array<{ id: string; label: string }>;
          luchadoresSecundarios: Array<{ id: string; label: string }>;
        };
        warnings: string[];
      };
    }
  | {
      ok: false;
      error?: string;
    };

type ExternalNewsAnalysisSummary = {
  sourceName: string;
  title: string;
  appliedAt: string;
  relevancia: "alta" | "media" | "baja" | "descartar";
  debeCrearNoticia: boolean;
  necesitaRevisionManual: boolean;
  razonRevisionManual: string;
  motivoRelevancia: string;
  confianzaRelaciones: number;
  disciplina: string;
  organizacion: string;
  evento: string;
  combate: string;
  luchadores: string[];
  warnings: string[];
};


type ExternalNewsBatchResolveStatus =
  | "apta"
  | "revision"
  | "insuficiente"
  | "descartar"
  | "duplicada"
  | "error";

type ExternalNewsBatchResolveItem = {
  id: string;
  title: string;
  sourceName: string;
  url: string;
  status: ExternalNewsBatchResolveStatus;
  reason: string;
  relevancia: "alta" | "media" | "baja" | "descartar";
  confidence: number;
  disciplineLabel: string;
  organizationLabel: string;
  fighterHints: string[];
  warnings: string[];
};

type ExternalNewsBatchResolveSummary = {
  total: number;
  aptas: number;
  revision: number;
  insuficientes: number;
  descartadas: number;
  duplicadas: number;
  errores: number;
};

type ExternalNewsBatchResolveData = {
  source: ExternalSourceId;
  sourceName: string;
  resolvedAt: string;
  summary: ExternalNewsBatchResolveSummary;
  items: ExternalNewsBatchResolveItem[];
};

type ExternalNewsBatchResolveResponse =
  | {
      ok: true;
      data: ExternalNewsBatchResolveData;
    }
  | {
      ok: false;
      error?: string;
    };

type ExternalNewsBatchDraftResult = {
  id: string;
  title: string;
  status: "creado" | "omitido" | "error";
  message: string;
  documentId?: string;
};

type ExternalNewsBatchDraftSummary = {
  created: number;
  skipped: number;
  errors: number;
  attempted: number;
};


const ENABLED_EXTERNAL_NEWS_SOURCES = getEnabledExternalNewsSources();
const DEFAULT_EXTERNAL_NEWS_SOURCE_ID: ExternalSourceId =
  ENABLED_EXTERNAL_NEWS_SOURCES[0]?.id ?? "marca";

type BuildResultState = {
  ok: boolean;
  output: Record<string, unknown> | null;
  issues: ValidationIssue[];
} | null;

type ReferenceFieldConfig = {
  fieldName: string;
  target: ReferenceTarget;
  isArray: boolean;
};

type SaveDraftStatus =
  | {
      type: "idle";
      message: "";
    }
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

type ReferenceEntitiesApiResponse =
  | {
      ok: true;
      data: Record<ReferenceTarget, ReferenceEntityOption[]>;
    }
  | {
      ok: false;
      message?: string;
    };

type UfcOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type UfcNewsBatchPreparationItem = {
  sourceId: string;
  title: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type UfcNewsBatchItem = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: string;
  status:
    | "existente"
    | "nueva_apta"
    | "sin_contenido"
    | "requiere_revision";
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons: string[];
};

type UfcNewsBatchResolveApiResponse =
  | {
      ok: true;
      count: number;
      summary: {
        existing: number;
        ready: number;
        withoutContent: number;
        requiresReview: number;
      };
      items: UfcNewsBatchItem[];
    }
  | {
      ok: false;
      error?: string;
    };



type BkfcOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type BkfcNewsBatchPreparationItem = {
  sourceId: string;
  title: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type BkfcNewsBatchItem = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: string;
  status:
    | "existente"
    | "nueva_apta"
    | "sin_contenido"
    | "requiere_revision";
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons: string[];
};

type BkfcNewsBatchResolveApiResponse =
  | {
      ok: true;
      count: number;
      summary: {
        existing: number;
        ready: number;
        withoutContent: number;
        requiresReview: number;
      };
      items: BkfcNewsBatchItem[];
    }
  | {
      ok: false;
      error?: string;
    };

type BkfcOfficialNewsApiResponse =
  | {
      ok: true;
      source: "bkfc";
      fetchedAt: string;
      count: number;
      items: BkfcOfficialNewsItem[];
    }
  | {
      ok: false;
      source?: "bkfc";
      fetchedAt?: string;
      count?: number;
      items?: BkfcOfficialNewsItem[];
      error?: string;
    };

type UfcOfficialNewsApiResponse =
  | {
      ok: true;
      source: "ufc";
      fetchedAt: string;
      count: number;
      items: UfcOfficialNewsItem[];
    }
  | {
      ok: false;
      source?: "ufc";
      fetchedAt?: string;
      count?: number;
      items?: UfcOfficialNewsItem[];
      error?: string;
    };

type OneOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
};

type OneNewsBatchPreparationItem = {
  sourceId: string;
  title: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type OneNewsBatchItem = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: string;
  status:
    | "existente"
    | "nueva_apta"
    | "sin_contenido"
    | "requiere_revision";
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons: string[];
};

type OneNewsBatchResolveApiResponse =
  | {
      ok: true;
      count: number;
      summary: {
        existing: number;
        ready: number;
        withoutContent: number;
        requiresReview: number;
      };
      items: OneNewsBatchItem[];
    }
  | {
      ok: false;
      error?: string;
    };

type OneOfficialNewsApiResponse =
  | {
      ok: true;
      source: "one";
      fetchedAt: string;
      count: number;
      items: OneOfficialNewsItem[];
    }
  | {
      ok: false;
      source?: "one";
      fetchedAt?: string;
      count?: number;
      items?: OneOfficialNewsItem[];
      error?: string;
    };
type FekmOfficialNewsItem = {
  id: string;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt?: string;
  imageUrl?: string;
  author?: string;
  tags?: string[];
  inferredDiscipline?: "kickboxing" | "muay_thai" | "mixed";
};

type FekmNewsBatchPreparationItem = {
  sourceId: string;
  title: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type FekmNewsBatchItem = {
  sourceId: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: string;
  status: "existente" | "nueva_apta" | "sin_contenido" | "requiere_revision";
  existingSanityId?: string;
  existingTitle?: string;
  matchStrategy?: "fuenteId" | "fuenteUrl" | "titulo";
  reasons: string[];
};

type FekmNewsBatchResolveApiResponse =
  | { ok: true; count: number; summary: { existing: number; ready: number; withoutContent: number; requiresReview: number }; items: FekmNewsBatchItem[] }
  | { ok: false; error?: string };

type OfficialSourceStatus =
  | {
      type: "idle";
      message: "";
    }
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

type SuggestedNewsRelations = {
  luchadores: string[];
  evento: string;
  organizacion: string;
  disciplina: string;
};

type TransformNewsApiResponse =
  | {
      ok: true;
      data: {
        titulo: string;
        extracto: string;
        contenido: string;
        relacionesSugeridas: SuggestedNewsRelations;
      };
    }
  | {
      ok: false;
      error?: string;
    };

type TransformOrganizationApiResponse =
  | {
      ok: true;
      data: {
        descripcionCorta: string;
        descripcion: string;
        paisOrigen: string;
        sede: string;
        anioFundacion?: number;
        identidad: string;
        datosCuriosos: string[];
      };
    }
  | {
      ok: false;
      error?: string;
    };

type NewsRelationsResolution = {
  suggested: SuggestedNewsRelations;
  resolved: {
    luchadores: ReferenceEntityOption[];
    evento?: ReferenceEntityOption;
    organizacion?: ReferenceEntityOption;
    disciplina?: ReferenceEntityOption;
  };
  unresolved: {
    luchadores: string[];
    evento?: string;
    organizacion?: string;
    disciplina?: string;
  };
};

type UfcFightCardItem = {
  id: string;
  section: "principal" | "preliminar";
  sectionLabel: "Main Card" | "Prelims" | "Early Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass: string;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type UfcOfficialEventItem = {
  id: string;
  name: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: "proximo" | "celebrado" | "cancelado";
  fightCard?: UfcFightCardItem[];
};

type UfcResolutionFight = {
  sourceFightId: string;
  readyToCreate: boolean;
  blockingReasons: string[];
};

type UfcEventResolution =
  | {
      ok: true;
      event: {
        sourceName: string;
        found: boolean;
        sanityId?: string;
        sanityName?: string;
        matchStrategy?: string;
      };
      discipline: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      organization: {
        found: boolean;
        sanityId?: string;
        sanityName?: string;
      };
      counts: {
        fights: number;
        readyFights: number;
        existingFights: number;
        pendingFights: number;
        existingFighters: number;
        missingFighters: number;
        resolvedCategories: number;
        unresolvedCategories: number;
      };
      missingFighters: Array<{
        sourceName: string;
        normalizedName: string;
        found: false;
      }>;
      unresolvedCategories: Array<{
        sourceLabel: string;
        normalizedLabel: string;
        found: false;
      }>;
      fights: UfcResolutionFight[];
    }
  | {
      ok: false;
      error?: string;
    };

type UfcEventResolutionSuccess = Extract<
  UfcEventResolution,
  { ok: true }
>;

type UfcBatchPreparationItem = {
  eventId: string;
  eventName: string;
  status: "pendiente" | "procesando" | "completado" | "fallido";
  message: string;
};

type UfcBulkActionResponse =
  | {
      ok: true;
      summary: {
        candidates: number;
        created: number;
        skipped: number;
        failed: number;
      };
    }
  | {
      ok: false;
      error?: string;
      summary?: {
        candidates: number;
        created: number;
        skipped: number;
        failed: number;
      };
    };

type FighterProducerResolutionContext = {
  discipline: {found: boolean; sanityId?: string};
  organization: {found: boolean; sanityId?: string};
  missingFighters: Array<{sourceName: string; normalizedName: string}>;
};

function fighterResolutionRequestBody(event: {id?: string; sourceUrl?: string; canonicalUrl?: string}, resolution: FighterProducerResolutionContext) {
  return {
    confirm: true,
    event,
    resolutionContext: {disciplineId: resolution.discipline.sanityId, organizationId: resolution.organization.sanityId},
    fighters: resolution.missingFighters.map((fighter) => ({name: fighter.sourceName, aliases: fighter.normalizedName !== fighter.sourceName ? [fighter.normalizedName] : []})),
  };
}

function registerPlannedFighterResolutions(payload: FighterResolutionIntakeResponse): number {
  const proposals = payload.items.flatMap((item) => item.proposal ? [item.proposal] : []);
  const registrations = registerFighterResolutionProposals(proposals);
  const blocked = registrations.find((item) => item.status === "blocked");
  if (blocked) throw new Error(`No se pudo registrar la resolución fighter: ${blocked.reasonCode ?? "blocked"}.`);
  return registrations.length;
}

type UfcOfficialEventsApiResponse =
  | {
      ok: true;
      source: "ufc";
      fetchedAt: string;
      count: number;
      items: UfcOfficialEventItem[];
    }
  | {
      ok: false;
      source?: "ufc";
      fetchedAt?: string;
      count?: number;
      items?: UfcOfficialEventItem[];
      error?: string;
    };

type UfcBatchEventAnalysis = {
  eventId: string;
  eventName: string;
  startDate?: string;
  eventFound: boolean;
  eventSanityId?: string;
  fights: number;
  readyFights: number;
  existingFights: number;
  pendingFights: number;
  existingFighters: number;
  missingFighters: number;
  unresolvedCategories: number;
  status:
    | "completo"
    | "evento_pendiente"
    | "requiere_revision"
    | "listo_para_preparar";
  error?: string;
};

type UfcBatchResolveApiResponse =
  | {
      ok: true;
      count: number;
      summary: {
        completed: number;
        eventPending: number;
        readyToPrepare: number;
        requiresReview: number;
        totalMissingFighters: number;
        totalPendingFights: number;
      };
      items: UfcBatchEventAnalysis[];
    }
  | {
      ok: false;
      error?: string;
    };


type BkfcFightCardItem = {
  id: string;
  section: "principal" | "preliminar";
  sectionLabel: "Main Card" | "Prelims";
  order: number;
  redFighter: string;
  blueFighter: string;
  weightClass?: string;
  titleFight: boolean;
  status: "programado" | "finalizado" | "cancelado";
  winnerName?: string;
  method?: string;
  round?: number;
  time?: string;
};

type BkfcOfficialEventItem = {
  id: string;
  name: string;
  headline?: string;
  mainEvent?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  watchText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: "proximo" | "celebrado" | "cancelado";
  fightCard?: BkfcFightCardItem[];
};

type BkfcOfficialEventsApiResponse =
  | {
      ok: true;
      source: "bkfc";
      fetchedAt: string;
      count: number;
      items: BkfcOfficialEventItem[];
    }
  | {
      ok: false;
      source?: "bkfc";
      fetchedAt?: string;
      count?: number;
      items?: BkfcOfficialEventItem[];
      error?: string;
    };

type BkfcEventResolution = UfcEventResolution;
type BkfcEventResolutionSuccess = Extract<
  BkfcEventResolution,
  { ok: true }
>;

type OneFightCardItem = BkfcFightCardItem & {
  discipline?: "mma" | "muay_thai" | "kickboxing" | "submission_grappling" | "jiu_jitsu" | "mixed";
  disciplineLabel?: string;
};

type OneOfficialEventItem = Omit<BkfcOfficialEventItem, "fightCard"> & {
  source?: "one";
  primaryDiscipline?: "mma" | "muay_thai" | "kickboxing" | "submission_grappling" | "jiu_jitsu" | "mixed";
  primaryDisciplineLabel?: string;
  fightCard?: OneFightCardItem[];
};

type OneOfficialEventsApiResponse =
  | {
      ok: true;
      source: "one";
      fetchedAt: string;
      count: number;
      items: OneOfficialEventItem[];
    }
  | {
      ok: false;
      source?: "one";
      fetchedAt?: string;
      count?: number;
      items?: OneOfficialEventItem[];
      error?: string;
    };

type OneEventResolution = UfcEventResolution;
type OneEventResolutionSuccess = Extract<
  OneEventResolution,
  { ok: true }
>;



type FekmOfficialEventItem = {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  timeText?: string;
  venue?: string;
  city?: string;
  region?: string;
  country?: string;
  locationText?: string;
  description?: string;
  sourceUrl: string;
  canonicalUrl: string;
  imageUrl?: string;
  status: "proximo" | "celebrado" | "cancelado";
  discipline?: "kickboxing" | "muay_thai" | "mixed";
  disciplineLabel?: string;
  category?: string;
  scope?: "nacional" | "internacional" | "autonomico" | "otro";
};

type FekmOfficialEventsApiResponse =
  | { ok: true; source: "fekm"; fetchedAt: string; count: number; items: FekmOfficialEventItem[] }
  | { ok: false; source?: "fekm"; fetchedAt?: string; count?: number; items?: FekmOfficialEventItem[]; error?: string };

type FekmEventResolution =
  | {
      ok: true;
      source: "fekm";
      event: FekmOfficialEventItem;
      resolution: {
        readyToCreate: boolean;
        existing: boolean;
        existingEvent: { _id: string; nombre?: string; fecha?: string; confidence: number } | null;
        discipline: { _id: string; nombre?: string; slug?: { current?: string } } | null;
        organization: { _id: string; nombre?: string; slug?: { current?: string } } | null;
        blockingReasons: string[];
        warnings: string[];
      };
    }
  | { ok: false; error?: string };



type FekmEventOrchestration =
  | {
      ok: true;
      source: "fekm";
      mode: "analyze" | "execute";
      readyToExecute: boolean;
      match: {
        automatic: boolean;
        score: number;
        scoreGap: number;
        confidence: "alta" | "media" | "baja";
        document: { title?: string; pdfUrl?: string };
        reasons: string[];
        warnings: string[];
      } | null;
      document?: { title?: string; pdfUrl?: string };
      summary?: {
        extractedParticipants: number;
        highConfidence: number;
        reviewRequired: number;
        categoriesReadyBefore: number;
        categoriesExistingBefore: number;
        participantsExistingBefore: number;
        participantsReadyBefore: number;
        unresolvedCategoriesBefore: number;
        categoriesCreated: number;
        categoriesSkipped: number;
        participantsExistingAfter: number;
        participantsReadyAfter: number;
        unresolvedCategoriesAfter: number;
        participantsCreated: number;
        participantsPlanned: number;
        participantsUpdated: number;
        participantsSkipped: number;
        participantsFailed: number;
      };
      participantsResult?: FighterResolutionIntakeResponse | null;
      warnings: string[];
    }
  | { ok: false; source?: "fekm"; error?: string };

type TransformEventApiResponse =
  | {
      ok: true;
      data: {
        nombre: string;
        horaLocal: string;
        ciudad: string;
        pais: string;
        recinto: string;
        cartelPrincipal: string;
        dondeVer: string;
        descripcionCorta: string;
        descripcion: string;
        notas: string;
      };
    }
  | {
      ok: false;
      error?: string;
    };

const DEFAULT_CONTENT_TYPE: ContentTypeId = "noticia";

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return `${window.location.protocol}//${window.location.hostname}:3000`;
}

const API_BASE_URL = (
  import.meta.env.VITE_FFN3_API_BASE_URL?.trim() || getDefaultApiBaseUrl()
).replace(/\/+$/, "");

const AUTO_REFRESH_MS = 120_000;

const FIELDS_THAT_TRIGGER_CLEANUP = new Set([
  "disciplina",
  "organizacion",
  "organizacionRelacionada",
  "evento",
  "eventoRelacionado",
  "categoriaPeso",
  "luchadorRojo",
  "luchadorAzul",
  "ganador",
  "luchadoresRelacionados",
]);

const CASCADE_REFERENCE_GROUPS: ReferenceFieldConfig[][] = [
  [{ fieldName: "disciplina", target: "disciplina", isArray: false }],
  [
    { fieldName: "organizacion", target: "organizacion", isArray: false },
    {
      fieldName: "organizacionRelacionada",
      target: "organizacion",
      isArray: false,
    },
  ],
  [
    { fieldName: "evento", target: "evento", isArray: false },
    {
      fieldName: "eventoRelacionado",
      target: "evento",
      isArray: false,
    },
    {
      fieldName: "categoriaPeso",
      target: "categoriaPeso",
      isArray: false,
    },
  ],
  [
    { fieldName: "luchadorRojo", target: "luchador", isArray: false },
    { fieldName: "luchadorAzul", target: "luchador", isArray: false },
    { fieldName: "ganador", target: "luchador", isArray: false },
    {
      fieldName: "luchadoresRelacionados",
      target: "luchador",
      isArray: true,
    },
  ],
];

const EMPTY_REFERENCE_DATA: Record<ReferenceTarget, ReferenceEntityOption[]> = {
  disciplina: [],
  organizacion: [],
  evento: [],
  luchador: [],
  categoriaPeso: [],
};

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number): string => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getRequiredPublicationDateTimeLocalValue(value: string | undefined): string {
  return toDateTimeLocalValue(value) || toDateTimeLocalValue(new Date().toISOString());
}

function createSourceExtract(item: UfcOfficialNewsItem): string {
  const sourceText = item.summary?.trim() || item.bodyText?.trim() || "";

  if (sourceText.length <= 220) {
    return sourceText;
  }

  return `${sourceText.slice(0, 217).trimEnd()}...`;
}

function createSafeNewsExtract(value: string): string {
  const cleanedValue = value.replace(/\s+/g, " ").trim();

  if (cleanedValue.length <= 220) {
    return cleanedValue;
  }

  return `${cleanedValue.slice(0, 217).trimEnd()}...`;
}

function createExternalSourceExtract(item: ExternalNewsItem): string {
  const sourceText = item.excerpt?.trim() || item.bodyText?.trim() || item.title;
  return createSafeNewsExtract(sourceText);
}

function createExternalEditorialInstructions(item: ExternalNewsItem): string {
  return [
    "Reescribe la información con estilo periodístico propio de Full Fight News.",
    "No copies frases extensas de la fuente externa ni hagas una traducción literal.",
    "Conserva hechos, nombres, fechas, resultados, declaraciones y contexto relevante sin inventar datos.",
    "Prioriza el ángulo deportivo y editorial para audiencia de deportes de combate.",
    `Fuente externa: ${item.sourceName}.`,
    `URL de referencia: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function getExternalNewsQualityNotes(item: ExternalNewsItem): string[] {
  const notes: string[] = [];
  const bodyLength = item.bodyText?.trim().length ?? 0;

  if (bodyLength === 0) {
    notes.push("Sin cuerpo completo fiable: el formulario usará el resumen y conviene completar el contenido manualmente.");
  } else if (bodyLength < 600) {
    notes.push("Cuerpo corto: revisa que haya contexto suficiente antes de guardar el borrador.");
  }

  if (!item.publishedAt) {
    notes.push("Fecha no disponible: revisa la fecha de publicación antes de guardar.");
  }

  if (!item.image?.url) {
    notes.push("Sin imagen principal: el borrador quedará sin imagen importable desde la fuente.");
  }

  return notes;
}

function getExternalNewsSearchText(item: ExternalNewsItem): string {
  return [
    item.title,
    item.excerpt,
    item.bodyText,
    item.canonicalUrl,
    item.sourceUrl,
    ...item.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es");
}

function inferExternalNewsDisciplineLabel(item: ExternalNewsItem): string | undefined {
  const searchText = getExternalNewsSearchText(item);

  if (searchText.includes("bare knuckle") || searchText.includes("bkfc")) {
    return "Bare Knuckle";
  }

  if (
    searchText.includes("ufc") ||
    searchText.includes("mma") ||
    searchText.includes("artes marciales mixtas")
  ) {
    return "MMA";
  }

  if (
    searchText.includes("jiu-jitsu") ||
    searchText.includes("jiu jitsu") ||
    searchText.includes("grappling") ||
    searchText.includes("ibjjf")
  ) {
    return "Jiu-Jitsu";
  }

  if (searchText.includes("muay thai")) {
    return "Muay Thai";
  }

  if (searchText.includes("kickboxing") || searchText.includes("glory")) {
    return "Kickboxing";
  }

  if (searchText.includes("boxeo") || searchText.includes("púgil") || searchText.includes("pugil")) {
    return "Boxeo";
  }

  return undefined;
}

function inferExternalNewsOrganizationLabel(item: ExternalNewsItem): string | undefined {
  const searchText = getExternalNewsSearchText(item);

  if (searchText.includes("bkfc")) {
    return "BKFC";
  }

  if (searchText.includes("ufc")) {
    return "UFC";
  }

  if (searchText.includes("ibjjf")) {
    return "IBJJF";
  }

  if (searchText.includes("one championship")) {
    return "ONE Championship";
  }

  return undefined;
}

function getAvailableFieldOptionValue(
  schemaFields: SchemaFieldDefinition[],
  fieldName: string,
  candidateValues: string[]
): string {
  const field = schemaFields.find((schemaField) => schemaField.name === fieldName);
  const allowedValues = new Set(
    (field?.options ?? []).map((option) => option.value.trim().toLocaleLowerCase("es"))
  );

  for (const candidateValue of candidateValues) {
    const normalizedCandidate = candidateValue.trim().toLocaleLowerCase("es");

    if (allowedValues.size === 0 || allowedValues.has(normalizedCandidate)) {
      return candidateValue;
    }
  }

  return candidateValues[0] ?? "otra";
}

function findReferenceByLabel(
  options: ReferenceEntityOption[],
  expectedLabel: string
): ReferenceEntityOption | undefined {
  const normalizedExpectedLabel = expectedLabel.trim().toLocaleLowerCase("es");

  return options.find(
    (option) => option.label.trim().toLocaleLowerCase("es") === normalizedExpectedLabel
  );
}

function normalizeEntityLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\bvs\.?\b/g, "vs")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findReferenceBySuggestedLabel(
  options: ReferenceEntityOption[],
  suggestedLabel: string
): ReferenceEntityOption | undefined {
  const normalizedSuggestion = normalizeEntityLabel(suggestedLabel);

  if (!normalizedSuggestion) {
    return undefined;
  }

  return options.find(
    (option) =>
      normalizeEntityLabel(option.label) === normalizedSuggestion
  );
}

function referenceMatchesFilter(
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

function getNormalizedExternalNewsFields(item: ExternalNewsItem): {
  title: string;
  excerpt: string;
  body: string;
  tags: string;
  url: string;
  all: string;
} {
  const title = normalizeEntityLabel(item.title || "");
  const excerpt = normalizeEntityLabel(item.excerpt || "");
  const body = normalizeEntityLabel(item.bodyText || "");
  const tags = normalizeEntityLabel((item.tags || []).join(" "));
  const url = normalizeEntityLabel(
    [item.canonicalUrl, item.sourceUrl].filter(Boolean).join(" ")
  );
  const all = ` ${[title, excerpt, body, tags, url].filter(Boolean).join(" ")} `;

  return { title, excerpt, body, tags, url, all };
}

function createFighterSearchAliases(label: string): string[] {
  const normalizedLabel = normalizeEntityLabel(
    label
      .replace(/["“”‘’'][^"“”‘’']+["“”‘’']/g, " ")
      .replace(/\([^)]*\)/g, " ")
  );

  if (!normalizedLabel) {
    return [];
  }

  const tokens = normalizedLabel.split(" ").filter(Boolean);
  const aliases = new Set<string>([normalizedLabel]);

  if (tokens.length >= 2) {
    aliases.add(`${tokens[0]} ${tokens[tokens.length - 1]}`);
  }

  if (tokens.length >= 3) {
    aliases.add(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
  }

  const lastToken = tokens[tokens.length - 1];

  if (lastToken && lastToken.length >= 5) {
    aliases.add(lastToken);
  }

  return Array.from(aliases).filter((alias) => alias.length >= 5);
}

function textContainsNormalizedPhrase(text: string, phrase: string): boolean {
  if (!text.trim() || !phrase.trim()) {
    return false;
  }

  return ` ${text} `.includes(` ${phrase} `);
}

function scoreExternalNewsFighterMention(
  item: ExternalNewsItem,
  fighterLabel: string
): number {
  const fields = getNormalizedExternalNewsFields(item);
  const aliases = createFighterSearchAliases(fighterLabel);
  let score = 0;

  for (const alias of aliases) {
    const aliasTokens = alias.split(" ").filter(Boolean);
    const isFullName = aliasTokens.length >= 2;

    if (textContainsNormalizedPhrase(fields.title, alias)) {
      score = Math.max(score, isFullName ? 120 : 70);
    }

    if (textContainsNormalizedPhrase(fields.tags, alias)) {
      score = Math.max(score, isFullName ? 105 : 65);
    }

    if (textContainsNormalizedPhrase(fields.excerpt, alias)) {
      score = Math.max(score, isFullName ? 95 : 55);
    }

    if (textContainsNormalizedPhrase(fields.body, alias)) {
      score = Math.max(score, isFullName ? 80 : 45);
    }

    if (textContainsNormalizedPhrase(fields.url, alias)) {
      score = Math.max(score, isFullName ? 75 : 40);
    }
  }

  return score;
}

function getExternalNewsMatchedFighters(params: {
  item: ExternalNewsItem;
  fighters: ReferenceEntityOption[];
  disciplineRef?: string;
  organizationRef?: string;
}): ReferenceEntityOption[] {
  const { item, fighters, disciplineRef, organizationRef } = params;
  const usedIds = new Set<string>();
  const matches: Array<{ fighter: ReferenceEntityOption; score: number }> = [];

  for (const fighter of fighters) {
    if (!referenceMatchesFilter(fighter.disciplineIds, disciplineRef)) {
      continue;
    }

    const baseScore = scoreExternalNewsFighterMention(item, fighter.label);

    if (baseScore <= 0) {
      continue;
    }

    const organizationMatches = referenceMatchesFilter(
      fighter.organizationIds,
      organizationRef
    );

    // Si la noticia menciona al luchador con nombre completo en título/tags/extracto,
    // no lo descartamos solo porque la organización de Sanity esté incompleta o desalineada.
    if (!organizationMatches && baseScore < 90) {
      continue;
    }

    if (usedIds.has(fighter.value)) {
      continue;
    }

    usedIds.add(fighter.value);
    matches.push({
      fighter,
      score: organizationMatches ? baseScore + 10 : baseScore,
    });
  }

  return matches
    .sort((first, second) => second.score - first.score)
    .slice(0, 8)
    .map((match) => match.fighter);
}

function resolveSuggestedNewsRelations(params: {
  suggestions: SuggestedNewsRelations;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): NewsRelationsResolution {
  const { suggestions, referenceData } = params;

  const disciplina = findReferenceBySuggestedLabel(
    referenceData.disciplina,
    suggestions.disciplina || "MMA"
  );
  const organizacion = findReferenceBySuggestedLabel(
    referenceData.organizacion,
    suggestions.organizacion || "UFC"
  );
  const evento = suggestions.evento
    ? findReferenceBySuggestedLabel(
        referenceData.evento,
        suggestions.evento
      )
    : undefined;

  const resolvedFighters: ReferenceEntityOption[] = [];
  const unresolvedFighters: string[] = [];
  const usedFighterIds = new Set<string>();

  for (const fighterName of suggestions.luchadores) {
    const fighter = findReferenceBySuggestedLabel(
      referenceData.luchador,
      fighterName
    );

    if (fighter && !usedFighterIds.has(fighter.value)) {
      usedFighterIds.add(fighter.value);
      resolvedFighters.push(fighter);
    } else if (!fighter) {
      unresolvedFighters.push(fighterName);
    }
  }

  return {
    suggested: suggestions,
    resolved: {
      luchadores: resolvedFighters,
      evento,
      organizacion,
      disciplina,
    },
    unresolved: {
      luchadores: unresolvedFighters,
      evento:
        suggestions.evento && !evento
          ? suggestions.evento
          : undefined,
      organizacion:
        suggestions.organizacion && !organizacion
          ? suggestions.organizacion
          : undefined,
      disciplina:
        suggestions.disciplina && !disciplina
          ? suggestions.disciplina
          : undefined,
    },
  };
}

function createEditorialInstructions(item: UfcOfficialNewsItem): string {
  return [
    "Reescribe la información en español con estilo periodístico propio de Full Fight News.",
    "No traduzcas de forma literal ni copies frases extensas de la fuente.",
    "Conserva todos los hechos, nombres, fechas y declaraciones relevantes sin inventar datos.",
    "Atribuye la información a UFC cuando corresponda.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}



function createBkfcEditorialInstructions(item: BkfcOfficialNewsItem): string {
  return [
    "Reescribe la información en español con estilo periodístico propio de Full Fight News.",
    "No traduzcas de forma literal ni copies frases extensas de la fuente.",
    "Conserva todos los hechos, nombres, fechas y declaraciones relevantes sin inventar datos.",
    "Atribuye la información a BKFC cuando corresponda.",
    "Usa Bare Knuckle como disciplina principal salvo que la fuente indique claramente otra cosa.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function createOneEditorialInstructions(item: OneOfficialNewsItem): string {
  return [
    "Reescribe la información en español con estilo periodístico propio de Full Fight News.",
    "No traduzcas de forma literal ni copies frases extensas de la fuente.",
    "Conserva todos los hechos, nombres, fechas y declaraciones relevantes sin inventar datos.",
    "Atribuye la información a ONE Championship cuando corresponda.",
    "ONE Championship mezcla MMA, Muay Thai, Kickboxing y Submission Grappling: elige la disciplina principal por contexto, no por defecto automático.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function inferOneNewsDisciplineLabel(item: OneOfficialNewsItem): string {
  const searchText = [
    item.title,
    item.summary,
    item.bodyText,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/submission grappling|grappling|jiu jitsu|jiu-jitsu|bjj/.test(searchText)) {
    return "Jiu-Jitsu";
  }

  if (/muay thai|thai boxing|lumpinee/.test(searchText)) {
    return "Muay Thai";
  }

  if (/kickboxing|kickboxer/.test(searchText)) {
    return "Kickboxing";
  }

  if (/mma|mixed martial arts|mixed martial/.test(searchText)) {
    return "MMA";
  }

  return "MMA";
}

function getOneNewsDisciplineOption(
  item: OneOfficialNewsItem,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): ReferenceEntityOption | undefined {
  const inferredLabel = inferOneNewsDisciplineLabel(item);

  return (
    findReferenceByLabel(referenceData.disciplina, inferredLabel) ||
    findReferenceByLabel(referenceData.disciplina, "MMA")
  );
}

function createFekmEditorialInstructions(item: FekmOfficialNewsItem): string {
  return [
    "Reescribe la información en español con estilo periodístico propio de Full Fight News.",
    "No copies literalmente el comunicado oficial ni reproduzcas párrafos extensos.",
    "Conserva nombres, fechas, resultados, sedes y datos verificables sin inventar información.",
    "Atribuye la información a la Federación Española de Kickboxing y Muaythai cuando corresponda.",
    "Distingue Kickboxing y Muay Thai por el contexto real; no uses MMA por defecto.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function inferFekmNewsDisciplineLabel(item: FekmOfficialNewsItem): string {
  if (item.inferredDiscipline === "muay_thai") return "Muay Thai";
  if (item.inferredDiscipline === "kickboxing") return "Kickboxing";
  const searchText = [item.title, item.summary, item.bodyText, ...(item.tags || [])]
    .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/muay thai|muaythai|thai boxing/.test(searchText)) return "Muay Thai";
  return "Kickboxing";
}

function getFekmNewsDisciplineOption(item: FekmOfficialNewsItem, referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>): ReferenceEntityOption | undefined {
  const inferredLabel = inferFekmNewsDisciplineLabel(item);
  return findReferenceByLabel(referenceData.disciplina, inferredLabel) || findReferenceByLabel(referenceData.disciplina, "Kickboxing") || findReferenceByLabel(referenceData.disciplina, "Muay Thai");
}

function createEventEditorialInstructions(item: UfcOfficialEventItem): string {
  return [
    "Redacta una ficha de evento en español con estilo editorial propio de Full Fight News.",
    "Conserva nombre, fecha, recinto, ubicación, cartel principal y plataforma oficial.",
    "No inventes combates, horarios, ubicaciones ni datos que no aparezcan en la fuente.",
    "Usa español de España y evita lenguaje promocional.",
    `Fuente oficial: ${item.canonicalUrl || item.sourceUrl}`,
  ].join("\n");
}

function getTextAreaRows(kind: FieldKind, rows?: number): number {
  if (typeof rows === "number" && rows > 0) {
    return rows;
  }

  if (kind === "portableText") {
    return 10;
  }

  return 4;
}

function getStringValue(
  value: FormValue | string | boolean | null | undefined
): string {
  return typeof value === "string" ? value : "";
}

function getNumberValue(value: FormValue): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function getBooleanValue(
  value: FormValue | string | boolean | null | undefined
): boolean {
  return typeof value === "boolean" ? value : false;
}

function getReferenceValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && "_ref" in value) {
    const candidate = value as { _ref?: unknown };
    return typeof candidate._ref === "string" ? candidate._ref.trim() : "";
  }

  return "";
}

function getReferenceArrayValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value as unknown[];

  return items
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object" && "_ref" in item) {
        const candidate = item as { _ref?: unknown };
        return typeof candidate._ref === "string" ? candidate._ref.trim() : "";
      }

      return "";
    })
    .filter(Boolean);
}

function getPortableTextEditorValue(value: FormValue): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value as unknown[];

    if (items.every((item) => typeof item === "string")) {
      return (items as string[]).join("\n\n");
    }

    return items
      .map((block) => {
        if (
          block &&
          typeof block === "object" &&
          "children" in block &&
          Array.isArray((block as { children?: unknown[] }).children)
        ) {
          return ((block as { children?: Array<{ text?: unknown }> }).children ?? [])
            .map((child) => (typeof child.text === "string" ? child.text : ""))
            .join("");
        }

        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function shouldHideField(
  field: SchemaFieldDefinition,
  form: ContentFormState
): boolean {
  if (!field.hiddenWhen) {
    return false;
  }

  const currentValue = form[field.hiddenWhen.field];

  if ("equals" in field.hiddenWhen && field.hiddenWhen.equals !== undefined) {
    return currentValue === field.hiddenWhen.equals;
  }

  if ("notEquals" in field.hiddenWhen && field.hiddenWhen.notEquals !== undefined) {
    return currentValue !== field.hiddenWhen.notEquals;
  }

  return false;
}

function parseReferenceArrayInput(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getIssueCount(
  issues: ValidationIssue[],
  severity: "error" | "warning"
): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

function toReferenceValue(ref: string): { _type: "reference"; _ref: string } {
  return {
    _type: "reference",
    _ref: ref,
  };
}

function pickFirstReference(...values: unknown[]): string | undefined {
  for (const value of values) {
    const ref = getReferenceValue(value);
    if (ref) {
      return ref;
    }
  }

  return undefined;
}

function getActiveFilterContext(
  form: ContentFormState,
  auxiliary?: AuxiliaryFormState
): ReferenceFilterContext {
  const selectedDisciplineRef = pickFirstReference(
    form.disciplina,
    auxiliary?.disciplina
  );

  const selectedOrganizationRef = pickFirstReference(
    form.organizacion,
    form.organizacionRelacionada,
    auxiliary?.organizacion,
    auxiliary?.organizacionRelacionada
  );

  const selectedEventRef = pickFirstReference(
    form.evento,
    form.eventoRelacionado,
    auxiliary?.evento,
    auxiliary?.eventoRelacionado
  );

  const selectedCategoriaPesoRef = pickFirstReference(
    form.categoriaPeso,
    auxiliary?.categoriaPeso
  );

  return {
    selectedDisciplineRef,
    selectedOrganizationRef,
    selectedEventRef,
    selectedCategoriaPesoRef,
  };
}

function getDisciplineOptions(
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): ReferenceEntityOption[] {
  return referenceData.disciplina ?? [];
}

function getCategoriaPesoOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.categoriaPeso ?? [];

  return options.filter((option) => {
    return (
      !filters.selectedDisciplineRef ||
      !option.disciplineIds ||
      option.disciplineIds.length === 0 ||
      option.disciplineIds.includes(filters.selectedDisciplineRef)
    );
  });
}

function getEventoOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.evento ?? [];

  return options.filter((option) => {
    const matchesDiscipline =
      !filters.selectedDisciplineRef ||
      !option.disciplineIds ||
      option.disciplineIds.length === 0 ||
      option.disciplineIds.includes(filters.selectedDisciplineRef);

    const matchesOrganization =
      !filters.selectedOrganizationRef ||
      !option.organizationIds ||
      option.organizationIds.length === 0 ||
      option.organizationIds.includes(filters.selectedOrganizationRef);

    return matchesDiscipline && matchesOrganization;
  });
}

function getLuchadorOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.luchador ?? [];

  const hasFightersLinkedToSelectedEvent =
    Boolean(filters.selectedEventRef) &&
    options.some(
      (option) =>
        Array.isArray(option.eventIds) &&
        option.eventIds.includes(filters.selectedEventRef as string)
    );

  return options.filter((option) => {
    const matchesDiscipline =
      !filters.selectedDisciplineRef ||
      (Array.isArray(option.disciplineIds) &&
        option.disciplineIds.includes(filters.selectedDisciplineRef));

    const matchesOrganization =
      !filters.selectedOrganizationRef ||
      !option.organizationIds ||
      option.organizationIds.length === 0 ||
      option.organizationIds.includes(filters.selectedOrganizationRef);

    const matchesEvent =
      !filters.selectedEventRef ||
      !hasFightersLinkedToSelectedEvent ||
      (Array.isArray(option.eventIds) &&
        option.eventIds.includes(filters.selectedEventRef));

    const matchesCategoriaPeso =
      !filters.selectedCategoriaPesoRef ||
      !option.categoryPesoIds ||
      option.categoryPesoIds.length === 0 ||
      option.categoryPesoIds.includes(filters.selectedCategoriaPesoRef);

    return (
      matchesDiscipline &&
      matchesOrganization &&
      matchesEvent &&
      matchesCategoriaPeso
    );
  });
}

function getOrganizacionOptions(params: {
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { filters, referenceData } = params;
  const options = referenceData.organizacion ?? [];

  if (!filters.selectedDisciplineRef) {
    return options;
  }

  const eventos = referenceData.evento ?? [];
  const luchadores = referenceData.luchador ?? [];

  return options.filter((organization) => {
    const hasDirectDiscipline =
      Array.isArray(organization.disciplineIds) &&
      organization.disciplineIds.includes(filters.selectedDisciplineRef!);

    const hasEventoInDiscipline = eventos.some((event) => {
      const eventHasDiscipline =
        !event.disciplineIds ||
        event.disciplineIds.length === 0 ||
        event.disciplineIds.includes(filters.selectedDisciplineRef!);

      const eventMatchesOrganization =
        Array.isArray(event.organizationIds) &&
        event.organizationIds.includes(organization.value);

      return eventHasDiscipline && eventMatchesOrganization;
    });

    const hasLuchadorInDiscipline = luchadores.some((fighter) => {
      const fighterHasDiscipline =
        !fighter.disciplineIds ||
        fighter.disciplineIds.length === 0 ||
        fighter.disciplineIds.includes(filters.selectedDisciplineRef!);

      const fighterMatchesOrganization =
        Array.isArray(fighter.organizationIds) &&
        fighter.organizationIds.includes(organization.value);

      return fighterHasDiscipline && fighterMatchesOrganization;
    });

    return hasDirectDiscipline || hasEventoInDiscipline || hasLuchadorInDiscipline;
  });
}

function getFilteredReferenceEntityOptionsFromApiData(params: {
  target: ReferenceTarget;
  filters: ReferenceFilterContext;
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>;
}): ReferenceEntityOption[] {
  const { target, filters, referenceData } = params;

  switch (target) {
    case "disciplina":
      return getDisciplineOptions(referenceData);
    case "organizacion":
      return getOrganizacionOptions({ filters, referenceData });
    case "evento":
      return getEventoOptions({ filters, referenceData });
    case "luchador":
      return getLuchadorOptions({ filters, referenceData });
    case "categoriaPeso":
      return getCategoriaPesoOptions({ filters, referenceData });
    default:
      return [];
  }
}

function getAllowedReferenceValueSet(
  target: ReferenceTarget,
  filters: ReferenceFilterContext,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): Set<string> {
  return new Set(
    getFilteredReferenceEntityOptionsFromApiData({
      target,
      filters,
      referenceData,
    }).map((option) => option.value)
  );
}

function sanitizeReferenceFieldValue(
  value: FormValue,
  isArray: boolean,
  allowedValues: Set<string>
): FormValue {
  if (isArray) {
    return getReferenceArrayValues(value)
      .filter((item) => allowedValues.has(item))
      .map(toReferenceValue);
  }

  const singleValue = getReferenceValue(value);

  if (!singleValue) {
    return undefined;
  }

  return allowedValues.has(singleValue) ? toReferenceValue(singleValue) : undefined;
}

function sanitizeReferenceFieldByConfig(
  form: ContentFormState,
  auxiliary: AuxiliaryFormState,
  config: ReferenceFieldConfig,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): FormValue {
  const filters = getActiveFilterContext(form, auxiliary);
  const allowedValues = getAllowedReferenceValueSet(
    config.target,
    filters,
    referenceData
  );

  return sanitizeReferenceFieldValue(
    form[config.fieldName],
    config.isArray,
    allowedValues
  );
}

function clearInvalidDependentReferences(
  nextForm: ContentFormState,
  auxiliary: AuxiliaryFormState,
  referenceData: Record<ReferenceTarget, ReferenceEntityOption[]>
): ContentFormState {
  const sanitized: ContentFormState = { ...nextForm };

  for (const group of CASCADE_REFERENCE_GROUPS) {
    for (const config of group) {
      if (!(config.fieldName in sanitized)) {
        continue;
      }

      sanitized[config.fieldName] = sanitizeReferenceFieldByConfig(
        sanitized,
        auxiliary,
        config,
        referenceData
      );
    }
  }

  return sanitized;
}

function getReferencePlaceholder(target?: ReferenceTarget): string {
  switch (target) {
    case "disciplina":
      return "Selecciona una disciplina";
    case "organizacion":
      return "Selecciona una organización";
    case "evento":
      return "Selecciona un evento";
    case "luchador":
      return "Selecciona un luchador";
    case "categoriaPeso":
      return "Selecciona una categoría";
    default:
      return "Selecciona una referencia";
  }
}

function getReferenceEmptyStateMessage(
  target?: ReferenceTarget,
  filterContext?: ReferenceFilterContext
): string {
  if (!target) {
    return "Sin opciones disponibles.";
  }

  if (target === "disciplina") {
    return "No hay disciplinas cargadas desde Sanity.";
  }

  if (!filterContext?.selectedDisciplineRef) {
    return "Selecciona primero una disciplina.";
  }

  switch (target) {
    case "organizacion":
      return "No hay organizaciones para esa disciplina.";
    case "evento":
      return "No hay eventos para el filtro actual.";
    case "luchador":
      return filterContext?.selectedEventRef
        ? "No hay luchadores vinculados a ese evento."
        : "No hay luchadores para el filtro actual.";
    case "categoriaPeso":
      return "No hay categorías para esa disciplina.";
    default:
      return "Sin opciones disponibles.";
  }
}

export default function PanelIA(): ReactElement {
  const externalNewsResumeExecutor = useMemo<ExternalNewsResumeExecutor>(() => ({
    buildOutput(formState) {
      const built = buildContentOutput({contentType: "noticia", form: formState});
      if (!built.ok || !built.output) throw new Error(built.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" · ") || "El builder bloqueó el borrador.");
      return built.output as unknown as ReviewJsonObject;
    },
    async saveDraft(output) {
      const saved = await saveDraft({contentType: "noticia", document: output});
      return {success: saved.ok, documentId: saved.documentId, message: saved.message, error: saved.error};
    },
  }), []);

  useEffect(() => registerReviewResumeExecutor("external_news", externalNewsResumeExecutor), [externalNewsResumeExecutor]);
  useEffect(() => registerExternalNewsGlobalResolutionRuntime({
    fighter: {entityCreationExecutor: editorialEntityCreationExecutor},
    resume: {executor: externalNewsResumeExecutor},
  }), [externalNewsResumeExecutor]);
  useEffect(() => registerReviewEditorialAgentCapabilities(), []);
  useEffect(() => registerPreparedEntityCapabilities(), []);
  useEffect(() => registerSchemaRequirementCapabilities(), []);
  useEffect(() => registerEntityCreationExecutor(editorialEntityCreationExecutor), []);
  const [contentType, setContentType] = useState<ContentTypeId>(
    DEFAULT_CONTENT_TYPE
  );

  const [form, setForm] = useState<ContentFormState>(
    () => getInitialFormState(DEFAULT_CONTENT_TYPE).form
  );
  const [auxiliary, setAuxiliary] = useState<AuxiliaryFormState>(
    () => getInitialFormState(DEFAULT_CONTENT_TYPE).auxiliary
  );
  const [result, setResult] = useState<BuildResultState>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [saveDraftStatus, setSaveDraftStatus] = useState<SaveDraftStatus>({
    type: "idle",
    message: "",
  });

  const [organizationAutomationStatus, setOrganizationAutomationStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isTransformingOrganization, setIsTransformingOrganization] =
    useState(false);

  const [referenceData, setReferenceData] = useState<
    Record<ReferenceTarget, ReferenceEntityOption[]>
  >(EMPTY_REFERENCE_DATA);
  useEffect(() => registerPanelSanityInvestigationSource(referenceData), [referenceData]);
  useEffect(() => registerEditorialSchemaRequirements(referenceData), [referenceData]);


  const [officialNewsItems, setOfficialNewsItems] = useState<UfcOfficialNewsItem[]>(
    []
  );
  const [selectedOfficialNewsId, setSelectedOfficialNewsId] = useState("");
  const [isLoadingOfficialNews, setIsLoadingOfficialNews] = useState(false);
  const [isTransformingOfficialNews, setIsTransformingOfficialNews] =
    useState(false);
  const [officialNewsFetchedAt, setOfficialNewsFetchedAt] = useState("");
  const [officialSourceStatus, setOfficialSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [newsRelationsResolution, setNewsRelationsResolution] =
    useState<NewsRelationsResolution | null>(null);
  const [ufcNewsBatchAnalysis, setUfcNewsBatchAnalysis] =
    useState<UfcNewsBatchResolveApiResponse | null>(null);
  const [isAnalyzingUfcNewsBatch, setIsAnalyzingUfcNewsBatch] =
    useState(false);
  const [ufcNewsBatchStatus, setUfcNewsBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isPreparingUfcNewsBatch, setIsPreparingUfcNewsBatch] =
    useState(false);
  const [ufcNewsBatchPreparation, setUfcNewsBatchPreparation] =
    useState<UfcNewsBatchPreparationItem[]>([]);
  const [showAllUfcNewsBatchItems, setShowAllUfcNewsBatchItems] =
    useState(false);



  const [bkfcNewsItems, setBkfcNewsItems] = useState<BkfcOfficialNewsItem[]>([]);
  const [selectedBkfcNewsId, setSelectedBkfcNewsId] = useState("");
  const [isLoadingBkfcNews, setIsLoadingBkfcNews] = useState(false);
  const [isTransformingBkfcNews, setIsTransformingBkfcNews] = useState(false);
  const [bkfcNewsFetchedAt, setBkfcNewsFetchedAt] = useState("");
  const [bkfcNewsStatus, setBkfcNewsStatus] = useState<OfficialSourceStatus>({
    type: "idle",
    message: "",
  });
  const [bkfcNewsRelationsResolution, setBkfcNewsRelationsResolution] =
    useState<NewsRelationsResolution | null>(null);
  const [bkfcNewsBatchAnalysis, setBkfcNewsBatchAnalysis] =
    useState<BkfcNewsBatchResolveApiResponse | null>(null);
  const [isAnalyzingBkfcNewsBatch, setIsAnalyzingBkfcNewsBatch] =
    useState(false);
  const [bkfcNewsBatchStatus, setBkfcNewsBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isPreparingBkfcNewsBatch, setIsPreparingBkfcNewsBatch] =
    useState(false);
  const [bkfcNewsBatchPreparation, setBkfcNewsBatchPreparation] =
    useState<BkfcNewsBatchPreparationItem[]>([]);
  const [showAllBkfcNewsBatchItems, setShowAllBkfcNewsBatchItems] =
    useState(false);

  const [oneNewsItems, setOneNewsItems] = useState<OneOfficialNewsItem[]>([]);
  const [selectedOneNewsId, setSelectedOneNewsId] = useState("");
  const [isLoadingOneNews, setIsLoadingOneNews] = useState(false);
  const [isTransformingOneNews, setIsTransformingOneNews] = useState(false);
  const [oneNewsFetchedAt, setOneNewsFetchedAt] = useState("");
  const [oneNewsStatus, setOneNewsStatus] = useState<OfficialSourceStatus>({
    type: "idle",
    message: "",
  });
  const [oneNewsRelationsResolution, setOneNewsRelationsResolution] =
    useState<NewsRelationsResolution | null>(null);
  const [oneNewsBatchAnalysis, setOneNewsBatchAnalysis] =
    useState<OneNewsBatchResolveApiResponse | null>(null);
  const [isAnalyzingOneNewsBatch, setIsAnalyzingOneNewsBatch] =
    useState(false);
  const [oneNewsBatchStatus, setOneNewsBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isPreparingOneNewsBatch, setIsPreparingOneNewsBatch] =
    useState(false);
  const [oneNewsBatchPreparation, setOneNewsBatchPreparation] =
    useState<OneNewsBatchPreparationItem[]>([]);
  const [showAllOneNewsBatchItems, setShowAllOneNewsBatchItems] =
    useState(false);

  const [fekmNewsItems, setFekmNewsItems] = useState<FekmOfficialNewsItem[]>([]);
  const [selectedFekmNewsId, setSelectedFekmNewsId] = useState("");
  const [isLoadingFekmNews, setIsLoadingFekmNews] = useState(false);
  const [isTransformingFekmNews, setIsTransformingFekmNews] = useState(false);
  const [fekmNewsFetchedAt, setFekmNewsFetchedAt] = useState("");
  const [fekmNewsStatus, setFekmNewsStatus] = useState<OfficialSourceStatus>({ type: "idle", message: "" });
  const [fekmNewsRelationsResolution, setFekmNewsRelationsResolution] = useState<NewsRelationsResolution | null>(null);
  const [fekmNewsBatchAnalysis, setFekmNewsBatchAnalysis] = useState<FekmNewsBatchResolveApiResponse | null>(null);
  const [isAnalyzingFekmNewsBatch, setIsAnalyzingFekmNewsBatch] = useState(false);
  const [fekmNewsBatchStatus, setFekmNewsBatchStatus] = useState<OfficialSourceStatus>({ type: "idle", message: "" });
  const [isPreparingFekmNewsBatch, setIsPreparingFekmNewsBatch] = useState(false);
  const [fekmNewsBatchPreparation, setFekmNewsBatchPreparation] = useState<FekmNewsBatchPreparationItem[]>([]);
  const [showAllFekmNewsBatchItems, setShowAllFekmNewsBatchItems] = useState(false);

  const [selectedExternalSourceId, setSelectedExternalSourceId] =
    useState<ExternalSourceId>(DEFAULT_EXTERNAL_NEWS_SOURCE_ID);
  const [externalNewsItems, setExternalNewsItems] = useState<ExternalNewsItem[]>([]);
  const [selectedExternalNewsId, setSelectedExternalNewsId] = useState("");
  const [isLoadingExternalNews, setIsLoadingExternalNews] = useState(false);
  const [isAnalyzingExternalNews, setIsAnalyzingExternalNews] = useState(false);
  const [isCreatingExternalNewsDraft, setIsCreatingExternalNewsDraft] = useState(false);
  const [externalNewsFetchedAt, setExternalNewsFetchedAt] = useState("");
  const [externalNewsAnalysisSummary, setExternalNewsAnalysisSummary] =
    useState<ExternalNewsAnalysisSummary | null>(null);
  const [externalNewsStatus, setExternalNewsStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [externalNewsReview, setExternalNewsReview] = useState<ExternalNewsPilotReview | null>(null);
  const [externalNewsBatchAnalysis, setExternalNewsBatchAnalysis] =
    useState<ExternalNewsBatchResolveData | null>(null);
  const [isPreparingExternalNewsBatch, setIsPreparingExternalNewsBatch] =
    useState(false);
  const [externalNewsBatchStatus, setExternalNewsBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [showAllExternalNewsBatchItems, setShowAllExternalNewsBatchItems] =
    useState(false);

  const [isCreatingExternalNewsBatchDrafts, setIsCreatingExternalNewsBatchDrafts] =
    useState(false);
  const [externalNewsBatchDraftResults, setExternalNewsBatchDraftResults] =
    useState<ExternalNewsBatchDraftResult[]>([]);

  const [officialEventItems, setOfficialEventItems] = useState<
    UfcOfficialEventItem[]
  >([]);
  const [selectedOfficialEventId, setSelectedOfficialEventId] = useState("");
  const [isLoadingOfficialEvents, setIsLoadingOfficialEvents] = useState(false);
  const [isTransformingOfficialEvent, setIsTransformingOfficialEvent] =
    useState(false);
  const [officialEventsFetchedAt, setOfficialEventsFetchedAt] = useState("");
  const [officialEventSourceStatus, setOfficialEventSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });

  const [ufcEventResolution, setUfcEventResolution] =
    useState<UfcEventResolution | null>(null);
  const [isResolvingUfcEvent, setIsResolvingUfcEvent] = useState(false);
  const [isCreatingUfcFighters, setIsCreatingUfcFighters] = useState(false);
  const [isCreatingUfcFights, setIsCreatingUfcFights] = useState(false);
  const [isPreparingFullUfcCard, setIsPreparingFullUfcCard] = useState(false);
  const [ufcAutomationStatus, setUfcAutomationStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });

  const [ufcBatchAnalysis, setUfcBatchAnalysis] = useState<
    UfcBatchResolveApiResponse | null
  >(null);
  const [isAnalyzingUfcBatch, setIsAnalyzingUfcBatch] = useState(false);
  const [ufcBatchStatus, setUfcBatchStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [isPreparingUfcBatch, setIsPreparingUfcBatch] = useState(false);
  const [ufcBatchPreparation, setUfcBatchPreparation] = useState<
    UfcBatchPreparationItem[]
  >([]);
  const [showAllUfcEventBatchItems, setShowAllUfcEventBatchItems] =
    useState(false);

  const [bkfcEventItems, setBkfcEventItems] = useState<
    BkfcOfficialEventItem[]
  >([]);
  const [selectedBkfcEventId, setSelectedBkfcEventId] = useState("");
  const [isLoadingBkfcEvents, setIsLoadingBkfcEvents] = useState(false);
  const [bkfcEventsFetchedAt, setBkfcEventsFetchedAt] = useState("");
  const [bkfcSourceStatus, setBkfcSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [bkfcEventResolution, setBkfcEventResolution] =
    useState<BkfcEventResolution | null>(null);
  const [isResolvingBkfcEvent, setIsResolvingBkfcEvent] = useState(false);
  const [isCreatingBkfcEvent, setIsCreatingBkfcEvent] = useState(false);
  const [isCreatingBkfcFighters, setIsCreatingBkfcFighters] = useState(false);
  const [isCreatingBkfcFights, setIsCreatingBkfcFights] = useState(false);
  const [isPreparingFullBkfcCard, setIsPreparingFullBkfcCard] =
    useState(false);

  const [oneEventItems, setOneEventItems] = useState<OneOfficialEventItem[]>(
    []
  );
  const [selectedOneEventId, setSelectedOneEventId] = useState("");
  const [isLoadingOneEvents, setIsLoadingOneEvents] = useState(false);
  const [oneEventsFetchedAt, setOneEventsFetchedAt] = useState("");
  const [oneEventSourceStatus, setOneEventSourceStatus] =
    useState<OfficialSourceStatus>({
      type: "idle",
      message: "",
    });
  const [oneEventResolution, setOneEventResolution] =
    useState<OneEventResolution | null>(null);
  const [isResolvingOneEvent, setIsResolvingOneEvent] = useState(false);
  const [isCreatingOneEvent, setIsCreatingOneEvent] = useState(false);
  const [isCreatingOneCategories, setIsCreatingOneCategories] = useState(false);
  const [isCreatingOneFighters, setIsCreatingOneFighters] = useState(false);
  const [isCreatingOneFights, setIsCreatingOneFights] = useState(false);
  const [isPreparingFullOneCard, setIsPreparingFullOneCard] =
    useState(false);



  const [fekmEventItems, setFekmEventItems] = useState<FekmOfficialEventItem[]>([]);
  const [selectedFekmEventId, setSelectedFekmEventId] = useState("");
  const [isLoadingFekmEvents, setIsLoadingFekmEvents] = useState(false);
  const [fekmEventsFetchedAt, setFekmEventsFetchedAt] = useState("");
  const [fekmEventStatus, setFekmEventStatus] = useState<OfficialSourceStatus>({ type: "idle", message: "" });
  const [fekmEventResolution, setFekmEventResolution] = useState<FekmEventResolution | null>(null);
  const [isResolvingFekmEvent, setIsResolvingFekmEvent] = useState(false);
  const [isCreatingFekmOrganization, setIsCreatingFekmOrganization] = useState(false);
  const [isCreatingFekmEvent, setIsCreatingFekmEvent] = useState(false);
  const [fekmEventOrchestration, setFekmEventOrchestration] =
    useState<FekmEventOrchestration | null>(null);
  const [isAnalyzingFullFekmEvent, setIsAnalyzingFullFekmEvent] = useState(false);
  const [isPreparingFullFekmEvent, setIsPreparingFullFekmEvent] = useState(false);

  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [referenceLoadError, setReferenceLoadError] = useState("");

  const definition = useMemo(
    () => getContentTypeDefinition(contentType),
    [contentType]
  );


  const selectedOfficialNews = useMemo(
    () =>
      officialNewsItems.find((item) => item.id === selectedOfficialNewsId) ?? null,
    [officialNewsItems, selectedOfficialNewsId]
  );



  const selectedBkfcNews = useMemo(
    () => bkfcNewsItems.find((item) => item.id === selectedBkfcNewsId) ?? null,
    [bkfcNewsItems, selectedBkfcNewsId]
  );

  const selectedOneNews = useMemo(
    () => oneNewsItems.find((item) => item.id === selectedOneNewsId) ?? null,
    [oneNewsItems, selectedOneNewsId]
  );

  const selectedFekmNews = useMemo(
    () => fekmNewsItems.find((item) => item.id === selectedFekmNewsId) ?? null,
    [fekmNewsItems, selectedFekmNewsId]
  );

  const selectedExternalNewsSource = useMemo(
    () =>
      ENABLED_EXTERNAL_NEWS_SOURCES.find(
        (source) => source.id === selectedExternalSourceId
      ) ?? ENABLED_EXTERNAL_NEWS_SOURCES[0],
    [selectedExternalSourceId]
  );

  const selectedExternalNews = useMemo(
    () =>
      externalNewsItems.find((item) => item.id === selectedExternalNewsId) ?? null,
    [externalNewsItems, selectedExternalNewsId]
  );

  const selectedExternalNewsQualityNotes = useMemo(
    () => (selectedExternalNews ? getExternalNewsQualityNotes(selectedExternalNews) : []),
    [selectedExternalNews]
  );

  const markExternalBatchItemsAsCreated = useCallback((createdIds: string[]): void => {
    const uniqueCreatedIds = Array.from(new Set(createdIds.filter(Boolean)));

    if (uniqueCreatedIds.length === 0) {
      return;
    }

    const createdIdSet = new Set(uniqueCreatedIds);

    setExternalNewsBatchAnalysis((current) => {
      if (!current) {
        return current;
      }

      const nextItems = current.items.map((item) => {
        if (!createdIdSet.has(item.id)) {
          return item;
        }

        return {
          ...item,
          status: "duplicada" as ExternalNewsBatchResolveStatus,
          reason:
            "Borrador creado en Sanity desde esta tanda. Al volver a preparar la fuente debe detectarse como duplicada.",
          warnings: Array.from(
            new Set([
              ...item.warnings,
              "Creada como borrador en esta sesión del laboratorio.",
            ])
          ),
        };
      });

      const nextSummary: ExternalNewsBatchResolveSummary = {
        total: nextItems.length,
        aptas: nextItems.filter((item) => item.status === "apta").length,
        revision: nextItems.filter((item) => item.status === "revision").length,
        insuficientes: nextItems.filter((item) => item.status === "insuficiente").length,
        descartadas: nextItems.filter((item) => item.status === "descartar").length,
        duplicadas: nextItems.filter((item) => item.status === "duplicada").length,
        errores: nextItems.filter((item) => item.status === "error").length,
      };

      return {
        ...current,
        summary: nextSummary,
        items: nextItems,
      };
    });
  }, []);

  const selectedOfficialEvent = useMemo(
    () =>
      officialEventItems.find((item) => item.id === selectedOfficialEventId) ??
      null,
    [officialEventItems, selectedOfficialEventId]
  );

  const selectedBkfcEvent = useMemo(
    () =>
      bkfcEventItems.find((item) => item.id === selectedBkfcEventId) ?? null,
    [bkfcEventItems, selectedBkfcEventId]
  );

  const isBkfcBusy =
    isLoadingBkfcEvents ||
    isResolvingBkfcEvent ||
    isCreatingBkfcEvent ||
    isCreatingBkfcFighters ||
    isCreatingBkfcFights ||
    isPreparingFullBkfcCard;



  const selectedFekmEvent = useMemo(
    () => fekmEventItems.find((item) => item.id === selectedFekmEventId) ?? null,
    [fekmEventItems, selectedFekmEventId]
  );

  const isFekmEventBusy =
    isLoadingFekmEvents ||
    isResolvingFekmEvent ||
    isCreatingFekmOrganization ||
    isCreatingFekmEvent ||
    isAnalyzingFullFekmEvent ||
    isPreparingFullFekmEvent;

  const selectedOneEvent = useMemo(
    () =>
      oneEventItems.find((item) => item.id === selectedOneEventId) ?? null,
    [oneEventItems, selectedOneEventId]
  );

  const isOneEventBusy =
    isLoadingOneEvents ||
    isResolvingOneEvent ||
    isCreatingOneEvent ||
    isCreatingOneCategories ||
    isCreatingOneFighters ||
    isCreatingOneFights ||
    isPreparingFullOneCard;

  const canCreateMissingUfcFighters =
    Boolean(
      selectedOfficialEvent &&
        ufcEventResolution?.ok &&
        ufcEventResolution.counts.missingFighters > 0
    ) &&
    !isCreatingUfcFighters &&
    !isResolvingUfcEvent &&
    !isPreparingFullUfcCard &&
    !isPreparingUfcBatch;

  const canCreateUfcFights =
    Boolean(
      selectedOfficialEvent &&
        ufcEventResolution?.ok &&
        ufcEventResolution.event.found &&
        ufcEventResolution.counts.pendingFights > 0
    ) &&
    !isCreatingUfcFights &&
    !isResolvingUfcEvent &&
    !isPreparingFullUfcCard &&
    !isPreparingUfcBatch;

  const filterContext = useMemo<ReferenceFilterContext>(
    () => getActiveFilterContext(form, auxiliary),
    [form, auxiliary]
  );

  const canSaveDraft = Boolean(result?.ok && result.output) && !isSavingDraft;

  const resetDerivedUiState = useCallback((): void => {
    setResult(null);
    setSaveDraftStatus({
      type: "idle",
      message: "",
    });
  }, []);

  const reloadReferenceEntities = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingReferences(true);
      setReferenceLoadError("");

      const response = await fetch(`${API_BASE_URL}/api/reference-entities`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as ReferenceEntitiesApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "No se pudieron cargar las referencias."
        );
      }

      setReferenceData(payload.data);
      setForm((prev) => clearInvalidDependentReferences(prev, auxiliary, payload.data));
    } catch (error) {
      setReferenceLoadError(
        error instanceof Error
          ? error.message
          : "Error desconocido cargando referencias."
      );
      setReferenceData(EMPTY_REFERENCE_DATA);
    } finally {
      setIsLoadingReferences(false);
    }
  }, [auxiliary]);


  const reloadExternalNews = useCallback(
    async (sourceId: ExternalSourceId = selectedExternalSourceId): Promise<void> => {
      const sourceDefinition =
        ENABLED_EXTERNAL_NEWS_SOURCES.find((source) => source.id === sourceId) ??
        selectedExternalNewsSource;
      const sourceName = sourceDefinition?.name ?? sourceId;

      try {
        setIsLoadingExternalNews(true);
        setExternalNewsStatus({
          type: "idle",
          message: "",
        });
        setExternalNewsBatchAnalysis(null);
        setExternalNewsBatchDraftResults([]);
        setExternalNewsBatchStatus({
          type: "idle",
          message: "",
        });
        setShowAllExternalNewsBatchItems(false);

        const response = await fetch(
          `${API_BASE_URL}/api/sources/external/news?source=${sourceId}&refresh=${Date.now()}`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        const payload = (await response.json()) as ExternalNewsFetchResult;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ||
              `No se pudieron cargar las noticias externas de ${sourceName}.`
          );
        }

        setExternalNewsItems(payload.items);
        setExternalNewsFetchedAt(payload.fetchedAt);
        setExternalNewsAnalysisSummary(null);
        setExternalNewsBatchAnalysis(null);
        setExternalNewsBatchDraftResults([]);
        setExternalNewsBatchStatus({
          type: "idle",
          message: "",
        });
        setShowAllExternalNewsBatchItems(false);
        setSelectedExternalNewsId((currentId) =>
          payload.items.some((item) => item.id === currentId)
            ? currentId
            : payload.items[0]?.id || ""
        );
        setExternalNewsStatus({
          type: "success",
          message: `${payload.count} noticias externas de ${payload.sourceName || sourceName} cargadas.`,
        });
      } catch (error) {
        setExternalNewsItems([]);
        setSelectedExternalNewsId("");
        setExternalNewsFetchedAt("");
        setExternalNewsAnalysisSummary(null);
        setExternalNewsBatchAnalysis(null);
        setExternalNewsBatchDraftResults([]);
        setExternalNewsBatchStatus({
          type: "idle",
          message: "",
        });
        setShowAllExternalNewsBatchItems(false);
        setExternalNewsStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Error desconocido cargando noticias externas de ${sourceName}.`,
        });
      } finally {
        setIsLoadingExternalNews(false);
      }
    },
    [API_BASE_URL, selectedExternalNewsSource, selectedExternalSourceId]
  );


  const prepareExternalNewsBatch = useCallback(async (): Promise<void> => {
    if (externalNewsItems.length === 0) {
      setExternalNewsBatchStatus({
        type: "error",
        message: `Carga primero noticias externas de ${selectedExternalNewsSource?.name ?? "la fuente seleccionada"}.`,
      });
      return;
    }

    const processId = "external-news-batch-analysis";
    const processSourceName =
      selectedExternalNewsSource?.name ?? "Fuente externa";

    try {
      setIsPreparingExternalNewsBatch(true);

      startProcess({
        id: processId,
        label: `Analizando noticias de ${processSourceName}`,
        detail: `${externalNewsItems.length} noticias en preparación`,
      });

      setExternalNewsBatchStatus({
        type: "success",
        message: `Preparando ${externalNewsItems.length} noticias de ${selectedExternalNewsSource?.name ?? "la fuente seleccionada"}...`,
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/external/news/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: selectedExternalSourceId,
            items: externalNewsItems,
          }),
        }
      );

      const payload = (await response.json()) as ExternalNewsBatchResolveResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload && !payload.ok && payload.error
            ? payload.error
            : "No se pudieron preparar las noticias externas."
        );
      }

      setExternalNewsBatchAnalysis(payload.data);
      setExternalNewsBatchDraftResults([]);
      setShowAllExternalNewsBatchItems(false);
      setExternalNewsBatchStatus({
        type: "success",
        message: `Preparación completada: ${payload.data.summary.aptas} aptas, ${payload.data.summary.revision} para revisión, ${payload.data.summary.insuficientes} insuficientes, ${payload.data.summary.duplicadas} duplicadas.`,
      });

      const sourceName =
        selectedExternalNewsSource?.name ?? "Fuente externa";
      const needsReview =
        payload.data.summary.revision > 0 ||
        payload.data.summary.insuficientes > 0;

      notifyAnalysisCompleted({
        source: sourceName,
        count: externalNewsItems.length,
        apt: payload.data.summary.aptas,
        review: payload.data.summary.revision,
        insufficient: payload.data.summary.insuficientes,
        duplicates: payload.data.summary.duplicadas,
        location: needsReview
          ? {
              label: `Laboratorio → Fuentes externas → ${sourceName}`,
              url: window.location.href,
            }
          : undefined,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido preparando noticias externas.";
      const sourceName =
        selectedExternalNewsSource?.name ?? "Fuente externa";

      setExternalNewsBatchAnalysis(null);
      setExternalNewsBatchStatus({
        type: "error",
        message,
      });

      notifyError({
        source: sourceName,
        action: "completar el análisis",
        message,
        location: {
          label: `Laboratorio → Fuentes externas → ${sourceName}`,
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsPreparingExternalNewsBatch(false);
    }
  }, [
    API_BASE_URL,
    externalNewsItems,
    selectedExternalNewsSource,
    selectedExternalSourceId,
  ]);

  const applyExternalNewsToForm = useCallback(async (): Promise<void> => {
    if (!selectedExternalNews) {
      setExternalNewsStatus({
        type: "error",
        message: `Selecciona primero una noticia externa de ${selectedExternalNewsSource?.name ?? "la fuente seleccionada"}.`,
      });
      return;
    }

    if (contentType !== "noticia") {
      setExternalNewsStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de pasar la fuente externa al formulario.",
      });
      return;
    }

    setIsAnalyzingExternalNews(true);
    setExternalNewsAnalysisSummary(null);
    setExternalNewsStatus({
      type: "success",
      message: "Analizando noticia externa con criterio editorial...",
    });

    let analysisPayload: ExternalEditorialAnalysisResponse | null = null;

    try {
      const analysisResponse = await fetch(
        `${API_BASE_URL}/api/sources/external/news/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ item: selectedExternalNews }),
        }
      );

      analysisPayload = (await analysisResponse.json()) as ExternalEditorialAnalysisResponse;

      if (!analysisResponse.ok || !analysisPayload.ok) {
        throw new Error(
          analysisPayload && !analysisPayload.ok && analysisPayload.error
            ? analysisPayload.error
            : "No se pudo analizar la noticia externa."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido analizando la noticia externa.";

      setExternalNewsStatus({
        type: "error",
        message:
          `${message} No se ha cargado el formulario para evitar relaciones incorrectas.`,
      });

      const sourceName =
        selectedExternalNews.sourceName ||
        selectedExternalNewsSource?.name ||
        "Fuente externa";

      notifyError({
        source: sourceName,
        action: "completar el análisis",
        message,
        location: {
          label: `Laboratorio → Fuentes externas → ${sourceName}`,
          url: window.location.href,
        },
      });

      setIsAnalyzingExternalNews(false);
      return;
    }

    if (!analysisPayload?.ok) {
      setExternalNewsStatus({
        type: "error",
        message: "No se pudo analizar la noticia externa.",
      });
      setIsAnalyzingExternalNews(false);
      return;
    }

    const { analysis, resolved, warnings } = analysisPayload.data;
    const pilotResult = runExternalNewsReviewPilot({source: {id: selectedExternalNews.source, name: selectedExternalNews.sourceName || selectedExternalNewsSource?.name || "Fuente externa"}, item: selectedExternalNews, analysis, resolved, warnings, operation: "analyze"});
    setExternalNewsReview(pilotResult.review);
    if (pilotResult.saveBlocked) {
      setIsAnalyzingExternalNews(false);
      setExternalNewsStatus({type: pilotResult.review.status === "error" ? "error" : "success", message: pilotResult.review.status === "ready_for_future_resume" ? "Resoluciones preparadas. Pendiente de reanudación controlada; no se ha cargado ni guardado ningún borrador." : pilotResult.review.status === "error" ? `El Centro de revisión falló: ${pilotResult.review.error ?? "error desconocido"}. No se ha guardado el borrador.` : `Caso de revisión ${pilotResult.review.caseId ?? "sin ID"} creado. Pendiente de más evidencia; no se ha cargado ni guardado ningún borrador.`});
      return;
    }
    const sourceExtract = createExternalSourceExtract(selectedExternalNews);
    const safeExternalExtract = createSafeNewsExtract(
      analysis.hechoPrincipal || sourceExtract || selectedExternalNews.title
    );
    const sourceBody =
      selectedExternalNews.bodyText?.trim() ||
      selectedExternalNews.excerpt?.trim() ||
      selectedExternalNews.title;
    const publicationDate = toDateTimeLocalValue(selectedExternalNews.publishedAt);
    const externalSourceValue = getAvailableFieldOptionValue(definition.schemaFields, "fuente", [
      analysis.fuenteFormulario,
      "otra",
      "otro",
    ]);
    const resolvedFighters = [
      ...resolved.luchadoresPrincipales,
      ...resolved.luchadoresSecundarios,
    ];
    const uniqueFighterIds = Array.from(
      new Set(resolvedFighters.map((fighter) => fighter.id).filter(Boolean))
    );

    const resolvedDisciplineRef = resolved.disciplina
      ? referenceData.disciplina.find((option) => {
          const optionLabel = option.label.trim().toLowerCase();
          const resolvedLabel = resolved.disciplina?.label.trim().toLowerCase() ?? "";

          return (
            option.value === resolved.disciplina?.id ||
            optionLabel === resolvedLabel ||
            optionLabel.replace(/[-\s]/g, "") ===
              resolvedLabel.replace(/[-\s]/g, "")
          );
        })?.value ?? resolved.disciplina.id
      : "";

    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedExternalNews.title,
        extracto: safeExternalExtract,
        contenido: sourceBody,
        fuente: externalSourceValue,
        fuenteUrl:
          selectedExternalNews.canonicalUrl || selectedExternalNews.sourceUrl,
        fuenteId: selectedExternalNews.id,
        destacada: analysis.relevancia === "alta",
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedExternalNews.image?.url) {
        nextForm.imagenPrincipal = selectedExternalNews.image.url;
      }

      if (resolvedDisciplineRef) {
        nextForm.disciplina = toReferenceValue(resolvedDisciplineRef);
      }

      if (resolved.organizacion) {
        nextForm.organizacionRelacionada = toReferenceValue(resolved.organizacion.id);
      }

      if (resolved.evento) {
        nextForm.eventoRelacionado = toReferenceValue(resolved.evento.id);
      } else if (resolved.combate?.eventoId) {
        nextForm.eventoRelacionado = toReferenceValue(resolved.combate.eventoId);
      }

      if (resolved.combate) {
        nextForm.combateRelacionado = toReferenceValue(resolved.combate.id);
      }

      if (uniqueFighterIds.length > 0) {
        nextForm.luchadoresRelacionados = uniqueFighterIds.map((fighterId) =>
          toReferenceValue(fighterId)
        );
      }

      const cleanedForm = clearInvalidDependentReferences(nextForm, auxiliary, referenceData);

      if (resolvedDisciplineRef) {
        cleanedForm.disciplina = toReferenceValue(resolvedDisciplineRef);
      }

      return cleanedForm;
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      ...(resolvedDisciplineRef
        ? { disciplina: toReferenceValue(resolvedDisciplineRef) }
        : {}),
      anguloEditorial:
        analysis.anguloEditorial ||
        "Reescritura informativa en español a partir de una fuente externa, con criterio editorial propio de Full Fight News.",
      hechoPrincipal: analysis.hechoPrincipal || sourceExtract,
      contextoPrevio: analysis.contextoPrevio || sourceBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedExternalNews.title,
      instruccionesRedaccion:
        analysis.instruccionesRedaccion || createExternalEditorialInstructions(selectedExternalNews),
    }));

    // Blindaje final: algunas limpiezas en cascada/re-render pueden dejar el select
    // visualmente vacío aunque el análisis haya resuelto una disciplina real.
    // Reaplicamos la disciplina resuelta después del ciclo de estado para que
    // el formulario y el output conserven disciplinas no-UFC/no-MMA como Kick boxing.
    if (resolvedDisciplineRef) {
      window.setTimeout(() => {
        setForm((currentForm) => ({
          ...currentForm,
          disciplina: toReferenceValue(resolvedDisciplineRef),
        }));
        setAuxiliary((currentAuxiliary) => ({
          ...currentAuxiliary,
          disciplina: toReferenceValue(resolvedDisciplineRef),
        }));
      }, 0);

      window.setTimeout(() => {
        setForm((currentForm) => ({
          ...currentForm,
          disciplina: toReferenceValue(resolvedDisciplineRef),
        }));
      }, 250);
    }

    const relationSummary = [
      resolved.disciplina ? `disciplina ${resolved.disciplina.label} (${resolvedDisciplineRef || resolved.disciplina.id})` : "sin disciplina resuelta",
      resolved.organizacion ? `organización ${resolved.organizacion.label}` : "sin organización resuelta",
      uniqueFighterIds.length > 0
        ? `${uniqueFighterIds.length} luchador(es)`
        : "sin luchadores resueltos",
      resolved.evento ? `evento ${resolved.evento.label}` : null,
      resolved.combate ? `combate ${resolved.combate.label}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    setExternalNewsAnalysisSummary({
      sourceName: selectedExternalNews.sourceName || selectedExternalNewsSource?.name || "Fuente externa",
      title: selectedExternalNews.title,
      appliedAt: new Date().toISOString(),
      relevancia: analysis.relevancia,
      debeCrearNoticia: analysis.debeCrearNoticia,
      necesitaRevisionManual: analysis.necesitaRevisionManual,
      razonRevisionManual: analysis.razonRevisionManual,
      motivoRelevancia: analysis.motivoRelevancia,
      confianzaRelaciones: analysis.confianzaRelaciones,
      disciplina: resolved.disciplina?.label || "Sin disciplina resuelta",
      organizacion: resolved.organizacion?.label || "Sin organización resuelta",
      evento: resolved.evento?.label || "Sin evento resuelto",
      combate: resolved.combate?.label || "Sin combate resuelto",
      luchadores: Array.from(
        new Set(
          [
            ...resolved.luchadoresPrincipales.map((fighter) => fighter.label),
            ...resolved.luchadoresSecundarios.map((fighter) => fighter.label),
          ].filter(Boolean)
        )
      ),
      warnings,
    });

    setIsAnalyzingExternalNews(false);

    const reviewMessage = analysis.necesitaRevisionManual
      ? ` Revisión recomendada: ${analysis.razonRevisionManual || "la noticia mezcla contexto o relaciones con confianza limitada."}`
      : "";
    const warningMessage = warnings.length > 0 ? ` Avisos: ${warnings.join(" | ")}.` : "";

    setExternalNewsStatus({
      type: "success",
      message: `Análisis editorial aplicado: relevancia ${analysis.relevancia}, fuente ${externalSourceValue.toUpperCase()}, ${relationSummary}.${reviewMessage}${warningMessage}`,
    });

    const sourceName =
      selectedExternalNews.sourceName ||
      selectedExternalNewsSource?.name ||
      "Fuente externa";
    const needsReview =
      analysis.necesitaRevisionManual ||
      analysis.confianzaRelaciones < 60 ||
      warnings.length > 0 ||
      !resolved.disciplina;

    if (needsReview) {
      notifyReviewRecommended({
        source: sourceName,
        message: `${selectedExternalNews.title} necesita revisión antes de crear el borrador.`,
        location: {
          label: `Laboratorio → Fuentes externas → ${sourceName}`,
          url: window.location.href,
        },
      });
    } else {
      notifyAnalysisCompleted({
        source: sourceName,
        count: 1,
        apt: 1,
      });
    }
  }, [
    API_BASE_URL,
    auxiliary,
    contentType,
    definition.schemaFields,
    referenceData,
    resetDerivedUiState,
    selectedExternalNews,
    selectedExternalNewsSource,
  ]);



  const createExternalNewsDraftFromSelected = useCallback(async (): Promise<void> => {
    if (!selectedExternalNews) {
      setExternalNewsStatus({
        type: "error",
        message: `Selecciona primero una noticia externa de ${selectedExternalNewsSource?.name ?? "la fuente seleccionada"}.`,
      });
      return;
    }

    if (contentType !== "noticia") {
      setExternalNewsStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de crear el borrador externo.",
      });
      return;
    }

    const selectedBatchItem = externalNewsBatchAnalysis?.items.find(
      (item) => item.id === selectedExternalNews.id
    );

    if (
      selectedBatchItem &&
      !["apta", "revision"].includes(selectedBatchItem.status)
    ) {
      const shouldContinue = window.confirm(
        `La preparación masiva marcó esta noticia como ${selectedBatchItem.status.toUpperCase()}: ${selectedBatchItem.reason}. ¿Quieres crear el borrador igualmente?`
      );

      if (!shouldContinue) {
        return;
      }
    }

    const qualityNotes = getExternalNewsQualityNotes(selectedExternalNews);

    if (qualityNotes.length > 0) {
      const shouldContinue = window.confirm(
        `Esta noticia tiene avisos antes de guardar:\n\n- ${qualityNotes.join("\n- ")}\n\n¿Quieres analizarla y crear el borrador igualmente?`
      );

      if (!shouldContinue) {
        return;
      }
    }

    try {
      setIsCreatingExternalNewsDraft(true);
      setExternalNewsAnalysisSummary(null);
      setExternalNewsStatus({
        type: "success",
        message: "Analizando noticia externa y preparando borrador en Sanity...",
      });
      setSaveDraftStatus({
        type: "idle",
        message: "",
      });

      const analysisResponse = await fetch(
        `${API_BASE_URL}/api/sources/external/news/analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ item: selectedExternalNews }),
        }
      );

      const analysisPayload =
        (await analysisResponse.json()) as ExternalEditorialAnalysisResponse;

      if (!analysisResponse.ok || !analysisPayload.ok) {
        throw new Error(
          analysisPayload && !analysisPayload.ok && analysisPayload.error
            ? analysisPayload.error
            : "No se pudo analizar la noticia externa."
        );
      }

      const { analysis, resolved, warnings } = analysisPayload.data;
      const pilotResult = runExternalNewsReviewPilot({source: {id: selectedExternalNews.source, name: selectedExternalNews.sourceName || selectedExternalNewsSource?.name || "Fuente externa"}, item: selectedExternalNews, analysis, resolved, warnings, operation: "create_draft"});
      setExternalNewsReview(pilotResult.review);
      if (pilotResult.saveBlocked) {
        setExternalNewsStatus({type: pilotResult.review.status === "error" ? "error" : "success", message: pilotResult.review.status === "ready_for_future_resume" ? "Resoluciones preparadas. Pendiente de reanudación controlada; el borrador no se ha guardado." : pilotResult.review.status === "error" ? `El Centro de revisión falló: ${pilotResult.review.error ?? "error desconocido"}. El borrador no se ha guardado.` : `La noticia se envió al Centro de revisión (${pilotResult.review.caseId ?? "sin ID"}). El borrador no se ha guardado.`});
        return;
      }

      if (
        !analysis.debeCrearNoticia ||
        analysis.relevancia === "descartar" ||
        analysis.necesitaRevisionManual ||
        analysis.confianzaRelaciones < 60 ||
        !resolved.disciplina
      ) {
        const cautionMessages = [
          !analysis.debeCrearNoticia
            ? "El análisis no recomienda crear noticia automáticamente."
            : "",
          analysis.relevancia === "descartar"
            ? "La relevancia aparece como DESCARTAR."
            : "",
          analysis.necesitaRevisionManual
            ? `Revisión manual recomendada: ${analysis.razonRevisionManual || "relaciones o contexto con confianza limitada."}`
            : "",
          analysis.confianzaRelaciones < 60
            ? `Confianza de relaciones baja: ${analysis.confianzaRelaciones}/100.`
            : "",
          !resolved.disciplina ? "No hay disciplina resuelta." : "",
        ].filter(Boolean);

        const shouldContinue = window.confirm(
          `${cautionMessages.join("\n")}\n\n¿Quieres crear el borrador igualmente?`
        );

        if (!shouldContinue) {
          setExternalNewsAnalysisSummary({
            sourceName:
              selectedExternalNews.sourceName ||
              selectedExternalNewsSource?.name ||
              "Fuente externa",
            title: selectedExternalNews.title,
            appliedAt: new Date().toISOString(),
            relevancia: analysis.relevancia,
            debeCrearNoticia: analysis.debeCrearNoticia,
            necesitaRevisionManual: analysis.necesitaRevisionManual,
            razonRevisionManual: analysis.razonRevisionManual,
            motivoRelevancia: analysis.motivoRelevancia,
            confianzaRelaciones: analysis.confianzaRelaciones,
            disciplina: resolved.disciplina?.label || "Sin disciplina resuelta",
            organizacion: resolved.organizacion?.label || "Sin organización resuelta",
            evento: resolved.evento?.label || "Sin evento resuelto",
            combate: resolved.combate?.label || "Sin combate resuelto",
            luchadores: Array.from(
              new Set(
                [
                  ...resolved.luchadoresPrincipales.map((fighter) => fighter.label),
                  ...resolved.luchadoresSecundarios.map((fighter) => fighter.label),
                ].filter(Boolean)
              )
            ),
            warnings,
          });
          setExternalNewsStatus({
            type: "error",
            message:
              "Creación de borrador cancelada. El análisis queda visible para revisión manual.",
          });
          return;
        }
      }

      const sourceExtract = createExternalSourceExtract(selectedExternalNews);
      const safeExternalExtract = createSafeNewsExtract(
        analysis.hechoPrincipal || sourceExtract || selectedExternalNews.title
      );
      const sourceBody =
        selectedExternalNews.bodyText?.trim() ||
        selectedExternalNews.excerpt?.trim() ||
        selectedExternalNews.title;
      const publicationDate =
        toDateTimeLocalValue(selectedExternalNews.publishedAt) ||
        getRequiredPublicationDateTimeLocalValue(undefined);
      const externalSourceValue = getAvailableFieldOptionValue(
        definition.schemaFields,
        "fuente",
        [analysis.fuenteFormulario, "otra", "otro"]
      );
      const resolvedFighters = [
        ...resolved.luchadoresPrincipales,
        ...resolved.luchadoresSecundarios,
      ];
      const uniqueFighterIds = Array.from(
        new Set(resolvedFighters.map((fighter) => fighter.id).filter(Boolean))
      );
      const resolvedDisciplineRef = resolved.disciplina
        ? referenceData.disciplina.find((option) => {
            const optionLabel = option.label.trim().toLowerCase();
            const resolvedLabel =
              resolved.disciplina?.label.trim().toLowerCase() ?? "";

            return (
              option.value === resolved.disciplina?.id ||
              optionLabel === resolvedLabel ||
              optionLabel.replace(/[-\s]/g, "") ===
                resolvedLabel.replace(/[-\s]/g, "")
            );
          })?.value ?? resolved.disciplina.id
        : "";

      const initialState = getInitialFormState("noticia");
      const draftForm: ContentFormState = {
        ...initialState.form,
        titulo: selectedExternalNews.title,
        extracto: safeExternalExtract,
        contenido: sourceBody,
        fechaPublicacion: publicationDate,
        fuente: externalSourceValue,
        fuenteUrl:
          selectedExternalNews.canonicalUrl || selectedExternalNews.sourceUrl,
        fuenteId: selectedExternalNews.id,
        destacada: analysis.relevancia === "alta",
      };

      if (selectedExternalNews.image?.url) {
        draftForm.imagenPrincipal = selectedExternalNews.image.url;
      }

      if (resolvedDisciplineRef) {
        draftForm.disciplina = toReferenceValue(resolvedDisciplineRef);
      }

      if (resolved.organizacion) {
        draftForm.organizacionRelacionada = toReferenceValue(
          resolved.organizacion.id
        );
      }

      if (resolved.evento) {
        draftForm.eventoRelacionado = toReferenceValue(resolved.evento.id);
      } else if (resolved.combate?.eventoId) {
        draftForm.eventoRelacionado = toReferenceValue(resolved.combate.eventoId);
      }

      if (resolved.combate) {
        draftForm.combateRelacionado = toReferenceValue(resolved.combate.id);
      }

      if (uniqueFighterIds.length > 0) {
        draftForm.luchadoresRelacionados = uniqueFighterIds.map((fighterId) =>
          toReferenceValue(fighterId)
        );
      }

      const draftAuxiliary: AuxiliaryFormState = {
        ...initialState.auxiliary,
        ...(resolvedDisciplineRef
          ? { disciplina: toReferenceValue(resolvedDisciplineRef) }
          : {}),
        anguloEditorial:
          analysis.anguloEditorial ||
          "Reescritura informativa en español a partir de una fuente externa, con criterio editorial propio de Full Fight News.",
        hechoPrincipal: analysis.hechoPrincipal || sourceExtract,
        contextoPrevio: analysis.contextoPrevio || sourceBody,
        tono: "informativo, directo y periodístico",
        seoObjetivo: selectedExternalNews.title,
        instruccionesRedaccion:
          analysis.instruccionesRedaccion ||
          createExternalEditorialInstructions(selectedExternalNews),
      };

      const cleanedDraftForm = clearInvalidDependentReferences(
        draftForm,
        draftAuxiliary,
        referenceData
      );

      if (resolvedDisciplineRef) {
        cleanedDraftForm.disciplina = toReferenceValue(resolvedDisciplineRef);
      }

      const buildResult = buildContentOutput({
        contentType: "noticia",
        form: cleanedDraftForm,
        auxiliary: draftAuxiliary,
      });

      if (!buildResult.ok || !buildResult.output) {
        const errors = buildResult.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" · ");

        throw new Error(errors || "El builder bloqueó el documento de noticia.");
      }

      const saveResponse = await saveDraft({
        contentType: "noticia",
        document: buildResult.output as Record<string, unknown>,
      });

      setForm(cleanedDraftForm);
      setAuxiliary(draftAuxiliary);
      setResult({
        ok: true,
        output: buildResult.output as Record<string, unknown>,
        issues: buildResult.issues,
      });
      setExternalNewsAnalysisSummary({
        sourceName:
          selectedExternalNews.sourceName ||
          selectedExternalNewsSource?.name ||
          "Fuente externa",
        title: selectedExternalNews.title,
        appliedAt: new Date().toISOString(),
        relevancia: analysis.relevancia,
        debeCrearNoticia: analysis.debeCrearNoticia,
        necesitaRevisionManual: analysis.necesitaRevisionManual,
        razonRevisionManual: analysis.razonRevisionManual,
        motivoRelevancia: analysis.motivoRelevancia,
        confianzaRelaciones: analysis.confianzaRelaciones,
        disciplina: resolved.disciplina?.label || "Sin disciplina resuelta",
        organizacion: resolved.organizacion?.label || "Sin organización resuelta",
        evento: resolved.evento?.label || "Sin evento resuelto",
        combate: resolved.combate?.label || "Sin combate resuelto",
        luchadores: Array.from(
          new Set(
            [
              ...resolved.luchadoresPrincipales.map((fighter) => fighter.label),
              ...resolved.luchadoresSecundarios.map((fighter) => fighter.label),
            ].filter(Boolean)
          )
        ),
        warnings,
      });
      setSaveDraftStatus({
        type: "success",
        message:
          saveResponse.message ||
          `Borrador externo guardado correctamente${
            saveResponse.documentId ? ` (${saveResponse.documentId})` : ""
          }.`,
      });
      setExternalNewsStatus({
        type: "success",
        message: `Borrador creado desde ${selectedExternalNews.sourceName || selectedExternalNewsSource?.name || "fuente externa"}: ${selectedExternalNews.title}`,
      });

      const sourceName =
        selectedExternalNews.sourceName ||
        selectedExternalNewsSource?.name ||
        "Fuente externa";

      notifyDraftCreated({
        source: sourceName,
        count: 1,
        createdAfterReview:
          analysis.necesitaRevisionManual ||
          analysis.confianzaRelaciones < 60 ||
          warnings.length > 0 ||
          !resolved.disciplina,
        location: {
          label: "Sanity Studio → Noticias",
          url: `${API_BASE_URL}/studio`,
        },
      });

      markExternalBatchItemsAsCreated([selectedExternalNews.id]);

      await reloadReferenceEntities();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando el borrador externo.";
      const sourceName =
        selectedExternalNews?.sourceName ||
        selectedExternalNewsSource?.name ||
        "Fuente externa";

      setExternalNewsStatus({
        type: "error",
        message,
      });

      notifyError({
        source: sourceName,
        action: "crear el borrador",
        message,
        location: {
          label: `Laboratorio → Fuentes externas → ${sourceName}`,
          url: window.location.href,
        },
      });
    } finally {
      setIsCreatingExternalNewsDraft(false);
    }
  }, [
    API_BASE_URL,
    contentType,
    definition.schemaFields,
    externalNewsBatchAnalysis,
    referenceData,
    markExternalBatchItemsAsCreated,
    reloadReferenceEntities,
    selectedExternalNews,
    selectedExternalNewsSource,
  ]);

  const createExternalNewsDraftsFromBatch = useCallback(async (): Promise<void> => {
    if (contentType !== "noticia") {
      setExternalNewsBatchStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de crear borradores externos en lote.",
      });
      return;
    }

    if (!externalNewsBatchAnalysis) {
      setExternalNewsBatchStatus({
        type: "error",
        message: "Prepara primero las noticias de la fuente externa.",
      });
      return;
    }

    const eligibleBatchItems = externalNewsBatchAnalysis.items.filter(
      (item) => item.status === "apta"
    );

    if (eligibleBatchItems.length === 0) {
      setExternalNewsBatchStatus({
        type: "error",
        message: "No hay noticias aptas para crear borradores en lote.",
      });
      return;
    }

    const itemsById = new Map(externalNewsItems.map((item) => [item.id, item]));
    const eligibleExternalItems = eligibleBatchItems
      .map((batchItem) => itemsById.get(batchItem.id))
      .filter((item): item is ExternalNewsItem => Boolean(item));

    if (eligibleExternalItems.length === 0) {
      setExternalNewsBatchStatus({
        type: "error",
        message: "No se pudieron emparejar las noticias aptas con la bandeja cargada.",
      });
      return;
    }

    const MAX_BATCH_DRAFTS = 5;
    const itemsToCreate = eligibleExternalItems.slice(0, MAX_BATCH_DRAFTS);
    const omittedByLimit = Math.max(eligibleExternalItems.length - MAX_BATCH_DRAFTS, 0);
    const shouldContinue = window.confirm(
      `Se crearán hasta ${itemsToCreate.length} borradores externos aptos de ${selectedExternalNewsSource?.name ?? "la fuente seleccionada"}.${
        omittedByLimit > 0
          ? `\n\nHay ${omittedByLimit} noticias aptas adicionales que se dejarán para otra tanda.`
          : ""
      }\n\n¿Quieres continuar?`
    );

    if (!shouldContinue) {
      return;
    }

    const batchResults: ExternalNewsBatchDraftResult[] = [];

    try {
      setIsCreatingExternalNewsBatchDrafts(true);
      setExternalNewsBatchDraftResults([]);
      setExternalNewsBatchStatus({
        type: "success",
        message: `Creando ${itemsToCreate.length} borradores externos aptos...`,
      });
      setSaveDraftStatus({
        type: "idle",
        message: "",
      });

      for (const externalItem of itemsToCreate) {
        try {
          const qualityNotes = getExternalNewsQualityNotes(externalItem);

          if (qualityNotes.some((note) => note.toLowerCase().includes("cuerpo"))) {
            batchResults.push({
              id: externalItem.id,
              title: externalItem.title,
              status: "omitido",
              message: `Omitida por calidad insuficiente: ${qualityNotes.join(" | ")}`,
            });
            setExternalNewsBatchDraftResults([...batchResults]);
            continue;
          }

          const analysisResponse = await fetch(
            `${API_BASE_URL}/api/sources/external/news/analyze`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ item: externalItem }),
            }
          );

          const analysisPayload =
            (await analysisResponse.json()) as ExternalEditorialAnalysisResponse;

          if (!analysisResponse.ok || !analysisPayload.ok) {
            throw new Error(
              analysisPayload && !analysisPayload.ok && analysisPayload.error
                ? analysisPayload.error
                : "No se pudo analizar la noticia externa."
            );
          }

          const { analysis, resolved } = analysisPayload.data;

          const blockingWarnings = [
            !analysis.debeCrearNoticia
              ? "El análisis no recomienda crear noticia."
              : "",
            analysis.relevancia === "descartar"
              ? "Relevancia marcada como DESCARTAR."
              : "",
            !resolved.disciplina ? "Sin disciplina resuelta." : "",
          ].filter(Boolean);

          if (blockingWarnings.length > 0) {
            batchResults.push({
              id: externalItem.id,
              title: externalItem.title,
              status: "omitido",
              message: blockingWarnings.join(" | "),
            });
            setExternalNewsBatchDraftResults([...batchResults]);
            continue;
          }

          const sourceExtract = createExternalSourceExtract(externalItem);
          const safeExternalExtract = createSafeNewsExtract(
            analysis.hechoPrincipal || sourceExtract || externalItem.title
          );
          const sourceBody =
            externalItem.bodyText?.trim() ||
            externalItem.excerpt?.trim() ||
            externalItem.title;
          const publicationDate =
            toDateTimeLocalValue(externalItem.publishedAt) ||
            getRequiredPublicationDateTimeLocalValue(undefined);
          const externalSourceValue = getAvailableFieldOptionValue(
            definition.schemaFields,
            "fuente",
            [analysis.fuenteFormulario, "otra", "otro"]
          );
          const resolvedFighters = [
            ...resolved.luchadoresPrincipales,
            ...resolved.luchadoresSecundarios,
          ];
          const uniqueFighterIds = Array.from(
            new Set(resolvedFighters.map((fighter) => fighter.id).filter(Boolean))
          );
          const resolvedDisciplineRef = resolved.disciplina
            ? referenceData.disciplina.find((option) => {
                const optionLabel = option.label.trim().toLowerCase();
                const resolvedLabel =
                  resolved.disciplina?.label.trim().toLowerCase() ?? "";

                return (
                  option.value === resolved.disciplina?.id ||
                  optionLabel === resolvedLabel ||
                  optionLabel.replace(/[-\s]/g, "") ===
                    resolvedLabel.replace(/[-\s]/g, "")
                );
              })?.value ?? resolved.disciplina.id
            : "";

          const initialState = getInitialFormState("noticia");
          const draftForm: ContentFormState = {
            ...initialState.form,
            titulo: externalItem.title,
            extracto: safeExternalExtract,
            contenido: sourceBody,
            fechaPublicacion: publicationDate,
            fuente: externalSourceValue,
            fuenteUrl: externalItem.canonicalUrl || externalItem.sourceUrl,
            fuenteId: externalItem.id,
            destacada: analysis.relevancia === "alta",
          };

          if (externalItem.image?.url) {
            draftForm.imagenPrincipal = externalItem.image.url;
          }

          if (resolvedDisciplineRef) {
            draftForm.disciplina = toReferenceValue(resolvedDisciplineRef);
          }

          if (resolved.organizacion) {
            draftForm.organizacionRelacionada = toReferenceValue(
              resolved.organizacion.id
            );
          }

          if (resolved.evento) {
            draftForm.eventoRelacionado = toReferenceValue(resolved.evento.id);
          } else if (resolved.combate?.eventoId) {
            draftForm.eventoRelacionado = toReferenceValue(resolved.combate.eventoId);
          }

          if (resolved.combate) {
            draftForm.combateRelacionado = toReferenceValue(resolved.combate.id);
          }

          if (uniqueFighterIds.length > 0) {
            draftForm.luchadoresRelacionados = uniqueFighterIds.map((fighterId) =>
              toReferenceValue(fighterId)
            );
          }

          const draftAuxiliary: AuxiliaryFormState = {
            ...initialState.auxiliary,
            ...(resolvedDisciplineRef
              ? { disciplina: toReferenceValue(resolvedDisciplineRef) }
              : {}),
            anguloEditorial:
              analysis.anguloEditorial ||
              "Reescritura informativa en español a partir de una fuente externa, con criterio editorial propio de Full Fight News.",
            hechoPrincipal: analysis.hechoPrincipal || sourceExtract,
            contextoPrevio: analysis.contextoPrevio || sourceBody,
            tono: "informativo, directo y periodístico",
            seoObjetivo: externalItem.title,
            instruccionesRedaccion:
              analysis.instruccionesRedaccion ||
              createExternalEditorialInstructions(externalItem),
          };

          const cleanedDraftForm = clearInvalidDependentReferences(
            draftForm,
            draftAuxiliary,
            referenceData
          );

          if (resolvedDisciplineRef) {
            cleanedDraftForm.disciplina = toReferenceValue(resolvedDisciplineRef);
          }

          const buildResult = buildContentOutput({
            contentType: "noticia",
            form: cleanedDraftForm,
            auxiliary: draftAuxiliary,
          });

          if (!buildResult.ok || !buildResult.output) {
            const errors = buildResult.issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join(" · ");

            throw new Error(errors || "El builder bloqueó el documento de noticia.");
          }


          const saveResponse = await saveDraft({
            contentType: "noticia",
            document: buildResult.output as Record<string, unknown>,
          });

          batchResults.push({
            id: externalItem.id,
            title: externalItem.title,
            status: "creado",
            message: saveResponse.message || "Borrador creado correctamente.",
            documentId: saveResponse.documentId,
          });
          setExternalNewsBatchDraftResults([...batchResults]);
        } catch (error) {
          batchResults.push({
            id: externalItem.id,
            title: externalItem.title,
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Error desconocido creando el borrador.",
          });
          setExternalNewsBatchDraftResults([...batchResults]);
        }
      }

      const summary: ExternalNewsBatchDraftSummary = {
        created: batchResults.filter((item) => item.status === "creado").length,
        skipped: batchResults.filter((item) => item.status === "omitido").length,
        errors: batchResults.filter((item) => item.status === "error").length,
        attempted: batchResults.length,
      };

      markExternalBatchItemsAsCreated(
        batchResults
          .filter((item) => item.status === "creado")
          .map((item) => item.id)
      );

      setExternalNewsBatchStatus({
        type: summary.errors > 0 ? "error" : "success",
        message: `Borradores externos en lote: ${summary.created} creados, ${summary.skipped} omitidos, ${summary.errors} errores.`,
      });
      if (summary.created > 0) {
        setSaveDraftStatus({
          type: "success",
          message: `${summary.created} borradores externos guardados en Sanity.`,
        });
      } else {
        setSaveDraftStatus({
          type: "idle",
          message: "",
        });
      }

      const sourceName =
        selectedExternalNewsSource?.name ?? "Fuente externa";

      notifyDraftBatchProcessed({
        source: sourceName,
        created: summary.created,
        skipped: summary.skipped,
        errors: summary.errors,
        attempted: summary.attempted,
        location:
          summary.errors > 0 || summary.skipped > 0
            ? {
                label: `Laboratorio → Fuentes externas → ${sourceName}`,
                url: window.location.href,
              }
            : {
                label: "Sanity Studio → Noticias",
                url: `${API_BASE_URL}/studio`,
              },
      });

      await reloadReferenceEntities();
    } finally {
      setIsCreatingExternalNewsBatchDrafts(false);
    }
  }, [
    API_BASE_URL,
    contentType,
    definition.schemaFields,
    externalNewsBatchAnalysis,
    externalNewsItems,
    markExternalBatchItemsAsCreated,
    referenceData,
    reloadReferenceEntities,
    selectedExternalNewsSource,
  ]);

  const reloadOfficialUfcNews = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOfficialNews(true);
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/news?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as UfcOfficialNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar las noticias oficiales de UFC."
        );
      }

      setOfficialNewsItems(payload.items);
      setOfficialNewsFetchedAt(payload.fetchedAt);
      setNewsRelationsResolution(null);
      setUfcNewsBatchAnalysis(null);
      setUfcNewsBatchPreparation([]);
      setShowAllUfcNewsBatchItems(false);
      setUfcNewsBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedOfficialNewsId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setOfficialSourceStatus({
        type: "success",
        message: `${payload.count} noticias oficiales de UFC cargadas.`,
      });

      notifySourceLoaded({
        source: "UFC",
        count: payload.count,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando las noticias oficiales de UFC.";

      setOfficialNewsItems([]);
      setSelectedOfficialNewsId("");
      setOfficialNewsFetchedAt("");
      setOfficialSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "cargar las noticias",
        message,
        location: {
          label: "Laboratorio → UFC → Noticias",
          url: window.location.href,
        },
      });
    } finally {
      setIsLoadingOfficialNews(false);
    }
  }, []);

  const analyzeOfficialUfcNews = useCallback(async (): Promise<void> => {
    if (officialNewsItems.length === 0) {
      setUfcNewsBatchStatus({
        type: "error",
        message: "Carga primero las noticias oficiales de UFC.",
      });
      return;
    }

    const processId = "ufc-news-batch-analysis";

    try {
      setIsAnalyzingUfcNewsBatch(true);

      startProcess({
        id: processId,
        label: "Analizando noticias UFC",
        detail: `${officialNewsItems.length} noticias en preparación`,
      });

      setUfcNewsBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/news/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            items: officialNewsItems,
          }),
        }
      );

      const payload =
        (await response.json()) as UfcNewsBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar las noticias oficiales de UFC."
        );
      }

      setUfcNewsBatchAnalysis(payload);
      setUfcNewsBatchStatus({
        type: "success",
        message: `${payload.count} noticias analizadas: ${payload.summary.existing} existentes, ${payload.summary.ready} nuevas aptas, ${payload.summary.withoutContent} sin contenido suficiente y ${payload.summary.requiresReview} para revisión.`,
      });

      notifyAnalysisCompleted({
        source: "UFC",
        count: payload.count,
        apt: payload.summary.ready,
        review: payload.summary.requiresReview,
        insufficient: payload.summary.withoutContent,
        duplicates: payload.summary.existing,
        location:
          payload.summary.requiresReview > 0 ||
          payload.summary.withoutContent > 0
            ? {
                label: "Laboratorio → UFC → Noticias",
                url: window.location.href,
              }
            : undefined,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido analizando noticias UFC.";

      setUfcNewsBatchAnalysis(null);
      setUfcNewsBatchStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "analizar las noticias",
        message,
        location: {
          label: "Laboratorio → UFC → Noticias",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsAnalyzingUfcNewsBatch(false);
    }
  }, [officialNewsItems]);

  const updateUfcNewsBatchPreparationItem = useCallback(
    (
      sourceId: string,
      changes: Partial<UfcNewsBatchPreparationItem>
    ): void => {
      setUfcNewsBatchPreparation((current) =>
        current.map((item) =>
          item.sourceId === sourceId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleUfcNews =
    useCallback(async (): Promise<void> => {
      if (!ufcNewsBatchAnalysis?.ok) {
        setUfcNewsBatchStatus({
          type: "error",
          message:
            "Analiza primero las noticias oficiales UFC antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = ufcNewsBatchAnalysis.items.filter(
        (item) => item.status === "nueva_apta"
      );

      const eligibleNews = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceItem = officialNewsItems.find(
            (item) => item.id === analysisItem.sourceId
          );

          return sourceItem
            ? {
                analysis: analysisItem,
                sourceItem,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: UfcNewsBatchItem;
            sourceItem: UfcOfficialNewsItem;
          } => item !== null
        );

      const confirmed = window.confirm(
        `Se prepararán ${eligibleNews.length} noticias nuevas como borradores en Sanity. Las noticias existentes o inseguras se excluirán. ¿Continuar?`
      );

      if (!confirmed) {
        setUfcNewsBatchStatus({
          type: "idle",
          message: "",
        });
        return;
      }

      if (eligibleNews.length === 0) {
        setUfcNewsBatchStatus({
          type: "error",
          message:
            "No hay noticias nuevas aptas. Las existentes, incompletas o inseguras se excluyen automáticamente.",
        });
        return;
      }

      setUfcNewsBatchPreparation(
        eligibleNews.map(({ sourceItem }) => ({
          sourceId: sourceItem.id,
          title: sourceItem.title,
          status: "pendiente",
          message: "En espera.",
        }))
      );
      setIsPreparingUfcNewsBatch(true);

      const processId = "ufc-news-batch-preparation";

      startProcess({
        id: processId,
        label: "Preparando noticias UFC",
        detail: `${eligibleNews.length} noticias pendientes`,
        current: 0,
        total: eligibleNews.length,
      });

      let completed = 0;
      let failed = 0;

      try {
        for (let index = 0; index < eligibleNews.length; index += 1) {
          const { sourceItem } = eligibleNews[index];

          updateUfcNewsBatchPreparationItem(sourceItem.id, {
            status: "procesando",
            message: `Noticia ${index + 1} de ${eligibleNews.length}: transformando al español...`,
          });

          updateProcess(processId, {
            current: index,
            total: eligibleNews.length,
            detail: `Procesando ${index + 1} de ${eligibleNews.length}: ${sourceItem.title}`,
          });

          try {
            const transformResponse = await fetch(
              `${API_BASE_URL}/api/transformar-noticia`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  title: sourceItem.title,
                  summary: sourceItem.summary,
                  bodyText: sourceItem.bodyText,
                  sourceUrl:
                    sourceItem.canonicalUrl || sourceItem.sourceUrl,
                }),
              }
            );

            const transformPayload =
              (await transformResponse.json()) as TransformNewsApiResponse;

            if (!transformResponse.ok || !transformPayload.ok) {
              throw new Error(
                !transformPayload.ok && transformPayload.error
                  ? transformPayload.error
                  : "No se pudo transformar la noticia al español."
              );
            }

            updateUfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Resolviendo relaciones editoriales reales...",
            });

            const relationResolution = resolveSuggestedNewsRelations({
              suggestions: transformPayload.data.relacionesSugeridas,
              referenceData,
            });

            const mmaOption = findReferenceByLabel(
              referenceData.disciplina,
              "MMA"
            );
            const ufcOption = findReferenceByLabel(
              referenceData.organizacion,
              "UFC"
            );

            const initialState = getInitialFormState("noticia");
            const batchForm: ContentFormState = {
              ...initialState.form,
              titulo: transformPayload.data.titulo,
              extracto: transformPayload.data.extracto,
              contenido: transformPayload.data.contenido,
              fechaPublicacion:
                getRequiredPublicationDateTimeLocalValue(sourceItem.publishedAt),
              imagenPrincipal: sourceItem.imageUrl,
              disciplina: relationResolution.resolved.disciplina
                ? toReferenceValue(
                    relationResolution.resolved.disciplina.value
                  )
                : mmaOption
                ? toReferenceValue(mmaOption.value)
                : undefined,
              organizacionRelacionada:
                relationResolution.resolved.organizacion
                  ? toReferenceValue(
                      relationResolution.resolved.organizacion.value
                    )
                  : ufcOption
                  ? toReferenceValue(ufcOption.value)
                  : undefined,
              eventoRelacionado: relationResolution.resolved.evento
                ? toReferenceValue(
                    relationResolution.resolved.evento.value
                  )
                : undefined,
              luchadoresRelacionados:
                relationResolution.resolved.luchadores.map((fighter) =>
                  toReferenceValue(fighter.value)
                ),
              fuente: "ufc",
              fuenteUrl:
                sourceItem.canonicalUrl || sourceItem.sourceUrl,
              fuenteId: sourceItem.id,
              destacada: false,
            };

            updateUfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Generando documento y validando campos...",
            });

            const buildResult = buildContentOutput({
              contentType: "noticia",
              form: batchForm,
              auxiliary: initialState.auxiliary,
            });

            if (!buildResult.ok || !buildResult.output) {
              const errors = buildResult.issues
                .filter((issue) => issue.severity === "error")
                .map((issue) => issue.message)
                .join(" · ");

              throw new Error(
                errors || "El builder bloqueó el documento de noticia."
              );
            }

            updateUfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Importando imagen y guardando borrador en Sanity...",
            });

            await saveDraft({
              contentType: "noticia",
              document: buildResult.output as Record<string, unknown>,
            });

            completed += 1;
            updateUfcNewsBatchPreparationItem(sourceItem.id, {
              status: "completado",
              message: `${
                relationResolution.resolved.luchadores.length
              } luchadores, ${
                relationResolution.resolved.evento ? 1 : 0
              } evento y trazabilidad UFC guardados.`,
            });
          } catch (error) {
            failed += 1;
            updateUfcNewsBatchPreparationItem(sourceItem.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando esta noticia.",
            });
          }

          updateProcess(processId, {
            current: index + 1,
            total: eligibleNews.length,
            detail: `${completed} completadas · ${failed} fallidas`,
          });
        }

        await reloadReferenceEntities();
        await analyzeOfficialUfcNews();

        setUfcNewsBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva completada: ${completed} noticias guardadas como borrador.`
              : `Preparación masiva terminada: ${completed} noticias completadas y ${failed} fallidas.`,
        });

        notifyDraftBatchProcessed({
          source: "UFC",
          created: completed,
          skipped: 0,
          errors: failed,
          attempted: eligibleNews.length,
          location:
            failed > 0
              ? {
                  label: "Laboratorio → UFC → Noticias",
                  url: window.location.href,
                }
              : {
                  label: "Sanity Studio → Noticias",
                  url: `${API_BASE_URL}/studio`,
                },
        });

        if (failed === 0) {
          completeProcess(processId);
        } else {
          failProcess(
            processId,
            `${completed} completadas · ${failed} fallidas`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido durante la preparación masiva de noticias.";

        setUfcNewsBatchStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "UFC",
          action: "crear los borradores",
          message,
          location: {
            label: "Laboratorio → UFC → Noticias",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
      } finally {
        setIsPreparingUfcNewsBatch(false);
      }
    }, [
      analyzeOfficialUfcNews,
      officialNewsItems,
      referenceData,
      reloadReferenceEntities,
      ufcNewsBatchAnalysis,
      updateUfcNewsBatchPreparationItem,
    ]);



  const reloadOfficialBkfcNews = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingBkfcNews(true);
      setBkfcNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/bkfc/news?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as BkfcOfficialNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar las noticias oficiales de BKFC."
        );
      }

      setBkfcNewsItems(payload.items);
      setBkfcNewsFetchedAt(payload.fetchedAt);
      setBkfcNewsRelationsResolution(null);
      setBkfcNewsBatchAnalysis(null);
      setBkfcNewsBatchPreparation([]);
      setShowAllBkfcNewsBatchItems(false);
      setBkfcNewsBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedBkfcNewsId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setBkfcNewsStatus({
        type: "success",
        message: `${payload.count} noticias oficiales de BKFC cargadas.`,
      });

      notifySourceLoaded({
        source: "BKFC",
        count: payload.count,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando las noticias oficiales de BKFC.";

      setBkfcNewsItems([]);
      setSelectedBkfcNewsId("");
      setBkfcNewsFetchedAt("");
      setBkfcNewsStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "cargar las noticias",
        message,
        location: {
          label: "Laboratorio → BKFC → Noticias",
          url: window.location.href,
        },
      });
    } finally {
      setIsLoadingBkfcNews(false);
    }
  }, []);

  const analyzeOfficialBkfcNews = useCallback(async (): Promise<void> => {
    if (bkfcNewsItems.length === 0) {
      setBkfcNewsBatchStatus({
        type: "error",
        message: "Carga primero las noticias oficiales de BKFC.",
      });
      return;
    }

    const processId = "bkfc-news-batch-analysis";

    try {
      setIsAnalyzingBkfcNewsBatch(true);

      startProcess({
        id: processId,
        label: "Analizando noticias BKFC",
        detail: `${bkfcNewsItems.length} noticias en preparación`,
      });

      setBkfcNewsBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/bkfc/news/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            items: bkfcNewsItems,
          }),
        }
      );

      const payload =
        (await response.json()) as BkfcNewsBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar las noticias oficiales de BKFC."
        );
      }

      setBkfcNewsBatchAnalysis(payload);
      setBkfcNewsBatchStatus({
        type: "success",
        message: `${payload.count} noticias analizadas: ${payload.summary.existing} existentes, ${payload.summary.ready} nuevas aptas, ${payload.summary.withoutContent} sin contenido suficiente y ${payload.summary.requiresReview} para revisión.`,
      });

      notifyAnalysisCompleted({
        source: "BKFC",
        count: payload.count,
        apt: payload.summary.ready,
        review: payload.summary.requiresReview,
        insufficient: payload.summary.withoutContent,
        duplicates: payload.summary.existing,
        location:
          payload.summary.requiresReview > 0 ||
          payload.summary.withoutContent > 0
            ? {
                label: "Laboratorio → BKFC → Noticias",
                url: window.location.href,
              }
            : undefined,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido analizando noticias BKFC.";

      setBkfcNewsBatchAnalysis(null);
      setBkfcNewsBatchStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "analizar las noticias",
        message,
        location: {
          label: "Laboratorio → BKFC → Noticias",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsAnalyzingBkfcNewsBatch(false);
    }
  }, [bkfcNewsItems]);

  const updateBkfcNewsBatchPreparationItem = useCallback(
    (
      sourceId: string,
      changes: Partial<BkfcNewsBatchPreparationItem>
    ): void => {
      setBkfcNewsBatchPreparation((current) =>
        current.map((item) =>
          item.sourceId === sourceId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleBkfcNews =
    useCallback(async (): Promise<void> => {
      if (!bkfcNewsBatchAnalysis?.ok) {
        setBkfcNewsBatchStatus({
          type: "error",
          message:
            "Analiza primero las noticias oficiales BKFC antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = bkfcNewsBatchAnalysis.items.filter(
        (item) => item.status === "nueva_apta"
      );

      const eligibleNews = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceItem = bkfcNewsItems.find(
            (item) => item.id === analysisItem.sourceId
          );

          return sourceItem
            ? {
                analysis: analysisItem,
                sourceItem,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: BkfcNewsBatchItem;
            sourceItem: BkfcOfficialNewsItem;
          } => item !== null
        );

      const confirmed = window.confirm(
        `Se prepararán ${eligibleNews.length} noticias nuevas BKFC como borradores en Sanity. Las noticias existentes o inseguras se excluirán. ¿Continuar?`
      );

      if (!confirmed) {
        setBkfcNewsBatchStatus({
          type: "idle",
          message: "",
        });
        return;
      }

      if (eligibleNews.length === 0) {
        setBkfcNewsBatchStatus({
          type: "error",
          message:
            "No hay noticias BKFC nuevas aptas. Las existentes, incompletas o inseguras se excluyen automáticamente.",
        });
        return;
      }

      setBkfcNewsBatchPreparation(
        eligibleNews.map(({ sourceItem }) => ({
          sourceId: sourceItem.id,
          title: sourceItem.title,
          status: "pendiente",
          message: "En espera.",
        }))
      );
      setIsPreparingBkfcNewsBatch(true);

      const processId = "bkfc-news-batch-preparation";

      startProcess({
        id: processId,
        label: "Preparando noticias BKFC",
        detail: `${eligibleNews.length} noticias pendientes`,
        current: 0,
        total: eligibleNews.length,
      });

      let completed = 0;
      let failed = 0;

      try {
        for (let index = 0; index < eligibleNews.length; index += 1) {
          const { sourceItem } = eligibleNews[index];

          updateBkfcNewsBatchPreparationItem(sourceItem.id, {
            status: "procesando",
            message: `Noticia ${index + 1} de ${eligibleNews.length}: transformando al español...`,
          });

          updateProcess(processId, {
            current: index,
            total: eligibleNews.length,
            detail: `Procesando ${index + 1} de ${eligibleNews.length}: ${sourceItem.title}`,
          });

          try {
            const transformResponse = await fetch(
              `${API_BASE_URL}/api/transformar-noticia-bkfc`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  title: sourceItem.title,
                  summary: sourceItem.summary,
                  bodyText: sourceItem.bodyText,
                  sourceUrl:
                    sourceItem.canonicalUrl || sourceItem.sourceUrl,
                }),
              }
            );

            const transformPayload =
              (await transformResponse.json()) as TransformNewsApiResponse;

            if (!transformResponse.ok || !transformPayload.ok) {
              throw new Error(
                !transformPayload.ok && transformPayload.error
                  ? transformPayload.error
                  : "No se pudo transformar la noticia BKFC al español."
              );
            }

            updateBkfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Resolviendo relaciones editoriales reales...",
            });

            const relationResolution = resolveSuggestedNewsRelations({
              suggestions: transformPayload.data.relacionesSugeridas,
              referenceData,
            });

            const bareKnuckleOption = findReferenceByLabel(
              referenceData.disciplina,
              "Bare Knuckle"
            );
            const bkfcOption = findReferenceByLabel(
              referenceData.organizacion,
              "BKFC"
            );

            const initialState = getInitialFormState("noticia");
            const batchForm: ContentFormState = {
              ...initialState.form,
              titulo: transformPayload.data.titulo,
              extracto: transformPayload.data.extracto,
              contenido: transformPayload.data.contenido,
              fechaPublicacion:
                getRequiredPublicationDateTimeLocalValue(sourceItem.publishedAt),
              imagenPrincipal: sourceItem.imageUrl,
              disciplina: relationResolution.resolved.disciplina
                ? toReferenceValue(
                    relationResolution.resolved.disciplina.value
                  )
                : bareKnuckleOption
                ? toReferenceValue(bareKnuckleOption.value)
                : undefined,
              organizacionRelacionada:
                relationResolution.resolved.organizacion
                  ? toReferenceValue(
                      relationResolution.resolved.organizacion.value
                    )
                  : bkfcOption
                  ? toReferenceValue(bkfcOption.value)
                  : undefined,
              eventoRelacionado: relationResolution.resolved.evento
                ? toReferenceValue(
                    relationResolution.resolved.evento.value
                  )
                : undefined,
              luchadoresRelacionados:
                relationResolution.resolved.luchadores.map((fighter) =>
                  toReferenceValue(fighter.value)
                ),
              fuente: "bkfc",
              fuenteUrl:
                sourceItem.canonicalUrl || sourceItem.sourceUrl,
              fuenteId: sourceItem.id,
              destacada: false,
            };

            updateBkfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Generando documento y validando campos...",
            });

            const buildResult = buildContentOutput({
              contentType: "noticia",
              form: batchForm,
              auxiliary: initialState.auxiliary,
            });

            if (!buildResult.ok || !buildResult.output) {
              const errors = buildResult.issues
                .filter((issue) => issue.severity === "error")
                .map((issue) => issue.message)
                .join(" · ");

              throw new Error(
                errors || "El builder bloqueó el documento de noticia BKFC."
              );
            }

            updateBkfcNewsBatchPreparationItem(sourceItem.id, {
              message: "Importando imagen y guardando borrador en Sanity...",
            });

            await saveDraft({
              contentType: "noticia",
              document: buildResult.output as Record<string, unknown>,
            });

            completed += 1;
            updateBkfcNewsBatchPreparationItem(sourceItem.id, {
              status: "completado",
              message: `${
                relationResolution.resolved.luchadores.length
              } luchadores, ${
                relationResolution.resolved.evento ? 1 : 0
              } evento y trazabilidad BKFC guardados.`,
            });
          } catch (error) {
            failed += 1;
            updateBkfcNewsBatchPreparationItem(sourceItem.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando esta noticia BKFC.",
            });
          }

          updateProcess(processId, {
            current: index + 1,
            total: eligibleNews.length,
            detail: `${completed} completadas · ${failed} fallidas`,
          });
        }

        await reloadReferenceEntities();
        await analyzeOfficialBkfcNews();

        setBkfcNewsBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva BKFC completada: ${completed} noticias guardadas como borrador.`
              : `Preparación masiva BKFC terminada: ${completed} noticias completadas y ${failed} fallidas.`,
        });

        notifyDraftBatchProcessed({
          source: "BKFC",
          created: completed,
          skipped: 0,
          errors: failed,
          attempted: eligibleNews.length,
          location:
            failed > 0
              ? {
                  label: "Laboratorio → BKFC → Noticias",
                  url: window.location.href,
                }
              : {
                  label: "Sanity Studio → Noticias",
                  url: `${API_BASE_URL}/studio`,
                },
        });

        if (failed === 0) {
          completeProcess(processId);
        } else {
          failProcess(
            processId,
            `${completed} completadas · ${failed} fallidas`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido durante la preparación masiva de noticias BKFC.";

        setBkfcNewsBatchStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "BKFC",
          action: "crear los borradores",
          message,
          location: {
            label: "Laboratorio → BKFC → Noticias",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
      } finally {
        setIsPreparingBkfcNewsBatch(false);
      }
    }, [
      analyzeOfficialBkfcNews,
      bkfcNewsBatchAnalysis,
      bkfcNewsItems,
      referenceData,
      reloadReferenceEntities,
      updateBkfcNewsBatchPreparationItem,
    ]);

  const applyBkfcNewsToForm = useCallback((): void => {
    if (!selectedBkfcNews) {
      setBkfcNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de BKFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setBkfcNewsStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Noticia antes de pasar la fuente al formulario.",
      });
      return;
    }

    const bareKnuckleOption = findReferenceByLabel(referenceData.disciplina, "Bare Knuckle");
    const bkfcOption = findReferenceByLabel(referenceData.organizacion, "BKFC");
    const officialSummary =
      selectedBkfcNews.summary?.trim() ||
      createSourceExtract(selectedBkfcNews as unknown as UfcOfficialNewsItem) ||
      selectedBkfcNews.title;
    const officialBody =
      selectedBkfcNews.bodyText?.trim() ||
      selectedBkfcNews.summary?.trim() ||
      selectedBkfcNews.title;
    const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedBkfcNews.publishedAt);

    setBkfcNewsRelationsResolution(null);
    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedBkfcNews.title,
        extracto: createSourceExtract(selectedBkfcNews as unknown as UfcOfficialNewsItem),
        contenido: officialBody,
        fuente: "bkfc",
        fuenteUrl:
          selectedBkfcNews.canonicalUrl || selectedBkfcNews.sourceUrl,
        fuenteId: selectedBkfcNews.id,
        destacada: false,
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedBkfcNews.imageUrl) {
        nextForm.imagenPrincipal = selectedBkfcNews.imageUrl;
      }

      if (bareKnuckleOption) {
        nextForm.disciplina = toReferenceValue(bareKnuckleOption.value);
      }

      if (bkfcOption) {
        nextForm.organizacionRelacionada = toReferenceValue(bkfcOption.value);
      }

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      anguloEditorial:
        "Reescritura informativa en español a partir de una fuente oficial de BKFC, con enfoque propio de Full Fight News.",
      hechoPrincipal: officialSummary,
      contextoPrevio: officialBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedBkfcNews.title,
      instruccionesRedaccion: createBkfcEditorialInstructions(selectedBkfcNews),
    }));

    const missingRelations: string[] = [];

    if (!bareKnuckleOption) {
      missingRelations.push("Bare Knuckle");
    }

    if (!bkfcOption) {
      missingRelations.push("BKFC");
    }

    setBkfcNewsStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Noticia oficial BKFC cargada y mapeada: contenido, relaciones y trazabilidad listas para generar el output."
          : `Noticia BKFC cargada. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedBkfcNews,
  ]);

  const transformBkfcNewsToSpanish = useCallback(async (): Promise<void> => {
    if (!selectedBkfcNews) {
      setBkfcNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de BKFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setBkfcNewsStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de transformar la fuente.",
      });
      return;
    }

    try {
      setIsTransformingBkfcNews(true);
      setBkfcNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-noticia-bkfc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: selectedBkfcNews.title,
          summary: selectedBkfcNews.summary,
          bodyText: selectedBkfcNews.bodyText,
          sourceUrl:
            selectedBkfcNews.canonicalUrl || selectedBkfcNews.sourceUrl,
        }),
      });

      const payload = (await response.json()) as TransformNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la noticia BKFC al español."
        );
      }

      const bareKnuckleOption = findReferenceByLabel(referenceData.disciplina, "Bare Knuckle");
      const bkfcOption = findReferenceByLabel(referenceData.organizacion, "BKFC");
      const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedBkfcNews.publishedAt);
      const relationResolution = resolveSuggestedNewsRelations({
        suggestions: payload.data.relacionesSugeridas,
        referenceData,
      });

      setBkfcNewsRelationsResolution(relationResolution);
      resetDerivedUiState();

      setForm((currentForm) => {
        const nextForm: ContentFormState = {
          ...currentForm,
          titulo: payload.data.titulo,
          extracto: payload.data.extracto,
          contenido: payload.data.contenido,
          fuente: "bkfc",
          fuenteUrl:
            selectedBkfcNews.canonicalUrl ||
            selectedBkfcNews.sourceUrl,
          fuenteId: selectedBkfcNews.id,
          destacada: false,
        };

        if (publicationDate) {
          nextForm.fechaPublicacion = publicationDate;
        }

        if (selectedBkfcNews.imageUrl) {
          nextForm.imagenPrincipal = selectedBkfcNews.imageUrl;
        }

        if (relationResolution.resolved.disciplina) {
          nextForm.disciplina = toReferenceValue(
            relationResolution.resolved.disciplina.value
          );
        } else if (bareKnuckleOption) {
          nextForm.disciplina = toReferenceValue(bareKnuckleOption.value);
        }

        if (relationResolution.resolved.organizacion) {
          nextForm.organizacionRelacionada = toReferenceValue(
            relationResolution.resolved.organizacion.value
          );
        } else if (bkfcOption) {
          nextForm.organizacionRelacionada = toReferenceValue(bkfcOption.value);
        }

        if (relationResolution.resolved.evento) {
          nextForm.eventoRelacionado = toReferenceValue(
            relationResolution.resolved.evento.value
          );
        } else {
          nextForm.eventoRelacionado = undefined;
        }

        nextForm.luchadoresRelacionados =
          relationResolution.resolved.luchadores.map((fighter) =>
            toReferenceValue(fighter.value)
          );

        return clearInvalidDependentReferences(
          nextForm,
          auxiliary,
          referenceData
        );
      });

      setAuxiliary((currentAuxiliary) => ({
        ...currentAuxiliary,
        anguloEditorial:
          "Noticia reescrita en español desde una fuente oficial de BKFC con enfoque propio de Full Fight News.",
        hechoPrincipal: payload.data.extracto,
        contextoPrevio:
          selectedBkfcNews.bodyText?.trim() ||
          selectedBkfcNews.summary?.trim() ||
          selectedBkfcNews.title,
        tono: "informativo, directo y periodístico",
        seoObjetivo: payload.data.titulo,
        instruccionesRedaccion: createBkfcEditorialInstructions(selectedBkfcNews),
      }));

      const unresolvedCount =
        relationResolution.unresolved.luchadores.length +
        (relationResolution.unresolved.evento ? 1 : 0) +
        (relationResolution.unresolved.organizacion ? 1 : 0) +
        (relationResolution.unresolved.disciplina ? 1 : 0);

      const resolvedRelationCount =
        relationResolution.resolved.luchadores.length +
        (relationResolution.resolved.evento ? 1 : 0) +
        (relationResolution.resolved.organizacion ? 1 : 0) +
        (relationResolution.resolved.disciplina ? 1 : 0);

      setBkfcNewsStatus({
        type: "success",
        message:
          unresolvedCount === 0
            ? `Noticia BKFC transformada y relacionada automáticamente: ${resolvedRelationCount} referencias reales resueltas y trazabilidad añadida.`
            : `Noticia BKFC transformada: ${resolvedRelationCount} referencias resueltas, ${unresolvedCount} sugerencias pendientes y trazabilidad añadida.`,
      });
    } catch (error) {
      setBkfcNewsStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la noticia BKFC al español.",
      });
    } finally {
      setIsTransformingBkfcNews(false);
    }
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedBkfcNews,
  ]);



  const reloadOfficialOneNews = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOneNews(true);
      setOneNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/one/news?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as OneOfficialNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar las noticias oficiales de ONE Championship."
        );
      }

      setOneNewsItems(payload.items);
      setOneNewsFetchedAt(payload.fetchedAt);
      setOneNewsRelationsResolution(null);
      setOneNewsBatchAnalysis(null);
      setOneNewsBatchPreparation([]);
      setShowAllOneNewsBatchItems(false);
      setOneNewsBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedOneNewsId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setOneNewsStatus({
        type: "success",
        message: `${payload.count} noticias oficiales de ONE Championship cargadas.`,
      });

      notifySourceLoaded({
        source: "ONE Championship",
        count: payload.count,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando las noticias oficiales de ONE Championship.";

      setOneNewsItems([]);
      setSelectedOneNewsId("");
      setOneNewsFetchedAt("");
      setOneNewsStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "cargar las noticias",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Noticias",
          url: window.location.href,
        },
      });
    } finally {
      setIsLoadingOneNews(false);
    }
  }, []);

  const analyzeOfficialOneNews = useCallback(async (): Promise<void> => {
    if (oneNewsItems.length === 0) {
      setOneNewsBatchStatus({
        type: "error",
        message: "Carga primero las noticias oficiales de ONE Championship.",
      });
      return;
    }

    const processId = "one-news-batch-analysis";

    try {
      setIsAnalyzingOneNewsBatch(true);

      startProcess({
        id: processId,
        label: "Analizando noticias ONE Championship",
        detail: `${oneNewsItems.length} noticias en preparación`,
      });

      setOneNewsBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/one/news/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            items: oneNewsItems,
          }),
        }
      );

      const payload =
        (await response.json()) as OneNewsBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar las noticias oficiales de ONE Championship."
        );
      }

      setOneNewsBatchAnalysis(payload);
      setOneNewsBatchStatus({
        type: "success",
        message: `${payload.count} noticias analizadas: ${payload.summary.existing} existentes, ${payload.summary.ready} nuevas aptas, ${payload.summary.withoutContent} sin contenido suficiente y ${payload.summary.requiresReview} para revisión.`,
      });

      notifyAnalysisCompleted({
        source: "ONE Championship",
        count: payload.count,
        apt: payload.summary.ready,
        review: payload.summary.requiresReview,
        insufficient: payload.summary.withoutContent,
        duplicates: payload.summary.existing,
        location:
          payload.summary.requiresReview > 0 ||
          payload.summary.withoutContent > 0
            ? {
                label: "Laboratorio → ONE Championship → Noticias",
                url: window.location.href,
              }
            : undefined,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido analizando noticias ONE Championship.";

      setOneNewsBatchAnalysis(null);
      setOneNewsBatchStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "analizar las noticias",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Noticias",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsAnalyzingOneNewsBatch(false);
    }
  }, [oneNewsItems]);

  const updateOneNewsBatchPreparationItem = useCallback(
    (
      sourceId: string,
      changes: Partial<OneNewsBatchPreparationItem>
    ): void => {
      setOneNewsBatchPreparation((current) =>
        current.map((item) =>
          item.sourceId === sourceId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleOneNews =
    useCallback(async (): Promise<void> => {
      if (!oneNewsBatchAnalysis?.ok) {
        setOneNewsBatchStatus({
          type: "error",
          message:
            "Analiza primero las noticias oficiales ONE Championship antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = oneNewsBatchAnalysis.items.filter(
        (item) => item.status === "nueva_apta"
      );

      const eligibleNews = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceItem = oneNewsItems.find(
            (item) => item.id === analysisItem.sourceId
          );

          return sourceItem
            ? {
                analysis: analysisItem,
                sourceItem,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: OneNewsBatchItem;
            sourceItem: OneOfficialNewsItem;
          } => item !== null
        );

      const confirmed = window.confirm(
        `Se prepararán ${eligibleNews.length} noticias nuevas ONE Championship como borradores en Sanity. Las noticias existentes o inseguras se excluirán. ¿Continuar?`
      );

      if (!confirmed) {
        setOneNewsBatchStatus({
          type: "idle",
          message: "",
        });
        return;
      }

      if (eligibleNews.length === 0) {
        setOneNewsBatchStatus({
          type: "error",
          message:
            "No hay noticias ONE Championship nuevas aptas. Las existentes, incompletas o inseguras se excluyen automáticamente.",
        });
        return;
      }

      setOneNewsBatchPreparation(
        eligibleNews.map(({ sourceItem }) => ({
          sourceId: sourceItem.id,
          title: sourceItem.title,
          status: "pendiente",
          message: "En espera.",
        }))
      );
      setIsPreparingOneNewsBatch(true);

      const processId = "one-news-batch-preparation";

      startProcess({
        id: processId,
        label: "Preparando noticias ONE Championship",
        detail: `${eligibleNews.length} noticias pendientes`,
        current: 0,
        total: eligibleNews.length,
      });

      let completed = 0;
      let failed = 0;

      try {
        for (let index = 0; index < eligibleNews.length; index += 1) {
          const { sourceItem } = eligibleNews[index];

          updateOneNewsBatchPreparationItem(sourceItem.id, {
            status: "procesando",
            message: `Noticia ${index + 1} de ${eligibleNews.length}: transformando al español...`,
          });

          updateProcess(processId, {
            current: index,
            total: eligibleNews.length,
            detail: `Procesando ${index + 1} de ${eligibleNews.length}: ${sourceItem.title}`,
          });

          try {
            const transformResponse = await fetch(
              `${API_BASE_URL}/api/transformar-noticia-one`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  title: sourceItem.title,
                  summary: sourceItem.summary,
                  bodyText: sourceItem.bodyText,
                  sourceUrl:
                    sourceItem.canonicalUrl || sourceItem.sourceUrl,
                }),
              }
            );

            const transformPayload =
              (await transformResponse.json()) as TransformNewsApiResponse;

            if (!transformResponse.ok || !transformPayload.ok) {
              throw new Error(
                !transformPayload.ok && transformPayload.error
                  ? transformPayload.error
                  : "No se pudo transformar la noticia ONE Championship al español."
              );
            }

            updateOneNewsBatchPreparationItem(sourceItem.id, {
              message: "Resolviendo relaciones editoriales reales...",
            });

            const relationResolution = resolveSuggestedNewsRelations({
              suggestions: transformPayload.data.relacionesSugeridas,
              referenceData,
            });

            const oneDisciplineOption = getOneNewsDisciplineOption(
              sourceItem,
              referenceData
            );
            const oneOption = findReferenceByLabel(
              referenceData.organizacion,
              "ONE Championship"
            );

            const initialState = getInitialFormState("noticia");
            const batchForm: ContentFormState = {
              ...initialState.form,
              titulo: transformPayload.data.titulo,
              extracto: transformPayload.data.extracto,
              contenido: transformPayload.data.contenido,
              fechaPublicacion:
                getRequiredPublicationDateTimeLocalValue(sourceItem.publishedAt),
              imagenPrincipal: sourceItem.imageUrl,
              disciplina: relationResolution.resolved.disciplina
                ? toReferenceValue(
                    relationResolution.resolved.disciplina.value
                  )
                : oneDisciplineOption
                ? toReferenceValue(oneDisciplineOption.value)
                : undefined,
              organizacionRelacionada:
                relationResolution.resolved.organizacion
                  ? toReferenceValue(
                      relationResolution.resolved.organizacion.value
                    )
                  : oneOption
                  ? toReferenceValue(oneOption.value)
                  : undefined,
              eventoRelacionado: relationResolution.resolved.evento
                ? toReferenceValue(
                    relationResolution.resolved.evento.value
                  )
                : undefined,
              luchadoresRelacionados:
                relationResolution.resolved.luchadores.map((fighter) =>
                  toReferenceValue(fighter.value)
                ),
              fuente: "one",
              fuenteUrl:
                sourceItem.canonicalUrl || sourceItem.sourceUrl,
              fuenteId: sourceItem.id,
              destacada: false,
            };

            updateOneNewsBatchPreparationItem(sourceItem.id, {
              message: "Generando documento y validando campos...",
            });

            const buildResult = buildContentOutput({
              contentType: "noticia",
              form: batchForm,
              auxiliary: initialState.auxiliary,
            });

            if (!buildResult.ok || !buildResult.output) {
              const errors = buildResult.issues
                .filter((issue) => issue.severity === "error")
                .map((issue) => issue.message)
                .join(" · ");

              throw new Error(
                errors || "El builder bloqueó el documento de noticia ONE Championship."
              );
            }

            updateOneNewsBatchPreparationItem(sourceItem.id, {
              message: "Importando imagen y guardando borrador en Sanity...",
            });

            await saveDraft({
              contentType: "noticia",
              document: buildResult.output as Record<string, unknown>,
            });

            completed += 1;
            updateOneNewsBatchPreparationItem(sourceItem.id, {
              status: "completado",
              message: `${
                relationResolution.resolved.luchadores.length
              } luchadores, ${
                relationResolution.resolved.evento ? 1 : 0
              } evento y trazabilidad ONE Championship guardados.`,
            });
          } catch (error) {
            failed += 1;
            updateOneNewsBatchPreparationItem(sourceItem.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando esta noticia ONE Championship.",
            });
          }

          updateProcess(processId, {
            current: index + 1,
            total: eligibleNews.length,
            detail: `${completed} completadas · ${failed} fallidas`,
          });
        }

        await reloadReferenceEntities();
        await analyzeOfficialOneNews();

        setOneNewsBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva ONE Championship completada: ${completed} noticias guardadas como borrador.`
              : `Preparación masiva ONE Championship terminada: ${completed} noticias completadas y ${failed} fallidas.`,
        });

        notifyDraftBatchProcessed({
          source: "ONE Championship",
          created: completed,
          skipped: 0,
          errors: failed,
          attempted: eligibleNews.length,
          location:
            failed > 0
              ? {
                  label: "Laboratorio → ONE Championship → Noticias",
                  url: window.location.href,
                }
              : {
                  label: "Sanity Studio → Noticias",
                  url: `${API_BASE_URL}/studio`,
                },
        });

        if (failed === 0) {
          completeProcess(processId);
        } else {
          failProcess(
            processId,
            `${completed} completadas · ${failed} fallidas`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido durante la preparación masiva de noticias ONE Championship.";

        setOneNewsBatchStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "ONE Championship",
          action: "crear los borradores",
          message,
          location: {
            label: "Laboratorio → ONE Championship → Noticias",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
      } finally {
        setIsPreparingOneNewsBatch(false);
      }
    }, [
      analyzeOfficialOneNews,
      oneNewsBatchAnalysis,
      oneNewsItems,
      referenceData,
      reloadReferenceEntities,
      updateOneNewsBatchPreparationItem,
    ]);

  const applyOneNewsToForm = useCallback((): void => {
    if (!selectedOneNews) {
      setOneNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de ONE Championship.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOneNewsStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Noticia antes de pasar la fuente al formulario.",
      });
      return;
    }

    const oneDisciplineOption = getOneNewsDisciplineOption(selectedOneNews, referenceData);
    const oneOption = findReferenceByLabel(referenceData.organizacion, "ONE Championship");
    const officialSummary =
      selectedOneNews.summary?.trim() ||
      createSourceExtract(selectedOneNews as unknown as UfcOfficialNewsItem) ||
      selectedOneNews.title;
    const officialBody =
      selectedOneNews.bodyText?.trim() ||
      selectedOneNews.summary?.trim() ||
      selectedOneNews.title;
    const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedOneNews.publishedAt);

    setOneNewsRelationsResolution(null);
    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedOneNews.title,
        extracto: createSourceExtract(selectedOneNews as unknown as UfcOfficialNewsItem),
        contenido: officialBody,
        fuente: "one",
        fuenteUrl:
          selectedOneNews.canonicalUrl || selectedOneNews.sourceUrl,
        fuenteId: selectedOneNews.id,
        destacada: false,
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedOneNews.imageUrl) {
        nextForm.imagenPrincipal = selectedOneNews.imageUrl;
      }

      if (oneDisciplineOption) {
        nextForm.disciplina = toReferenceValue(oneDisciplineOption.value);
      }

      if (oneOption) {
        nextForm.organizacionRelacionada = toReferenceValue(oneOption.value);
      }

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      anguloEditorial:
        "Reescritura informativa en español a partir de una fuente oficial de ONE Championship, con enfoque propio de Full Fight News.",
      hechoPrincipal: officialSummary,
      contextoPrevio: officialBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedOneNews.title,
      instruccionesRedaccion: createOneEditorialInstructions(selectedOneNews),
    }));

    const missingRelations: string[] = [];

    if (!oneDisciplineOption) {
      missingRelations.push(inferOneNewsDisciplineLabel(selectedOneNews));
    }

    if (!oneOption) {
      missingRelations.push("ONE Championship");
    }

    setOneNewsStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Noticia oficial ONE Championship cargada y mapeada: contenido, relaciones y trazabilidad listas para generar el output."
          : `Noticia ONE Championship cargada. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOneNews,
  ]);

  const transformOneNewsToSpanish = useCallback(async (): Promise<void> => {
    if (!selectedOneNews) {
      setOneNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de ONE Championship.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOneNewsStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de transformar la fuente.",
      });
      return;
    }

    try {
      setIsTransformingOneNews(true);
      setOneNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-noticia-one`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: selectedOneNews.title,
          summary: selectedOneNews.summary,
          bodyText: selectedOneNews.bodyText,
          sourceUrl:
            selectedOneNews.canonicalUrl || selectedOneNews.sourceUrl,
        }),
      });

      const payload = (await response.json()) as TransformNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la noticia ONE Championship al español."
        );
      }

      const oneDisciplineOption = getOneNewsDisciplineOption(selectedOneNews, referenceData);
      const oneOption = findReferenceByLabel(referenceData.organizacion, "ONE Championship");
      const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedOneNews.publishedAt);
      const relationResolution = resolveSuggestedNewsRelations({
        suggestions: payload.data.relacionesSugeridas,
        referenceData,
      });

      setOneNewsRelationsResolution(relationResolution);
      resetDerivedUiState();

      setForm((currentForm) => {
        const nextForm: ContentFormState = {
          ...currentForm,
          titulo: payload.data.titulo,
          extracto: payload.data.extracto,
          contenido: payload.data.contenido,
          fuente: "one",
          fuenteUrl:
            selectedOneNews.canonicalUrl ||
            selectedOneNews.sourceUrl,
          fuenteId: selectedOneNews.id,
          destacada: false,
        };

        if (publicationDate) {
          nextForm.fechaPublicacion = publicationDate;
        }

        if (selectedOneNews.imageUrl) {
          nextForm.imagenPrincipal = selectedOneNews.imageUrl;
        }

        if (relationResolution.resolved.disciplina) {
          nextForm.disciplina = toReferenceValue(
            relationResolution.resolved.disciplina.value
          );
        } else if (oneDisciplineOption) {
          nextForm.disciplina = toReferenceValue(oneDisciplineOption.value);
        }

        if (relationResolution.resolved.organizacion) {
          nextForm.organizacionRelacionada = toReferenceValue(
            relationResolution.resolved.organizacion.value
          );
        } else if (oneOption) {
          nextForm.organizacionRelacionada = toReferenceValue(oneOption.value);
        }

        if (relationResolution.resolved.evento) {
          nextForm.eventoRelacionado = toReferenceValue(
            relationResolution.resolved.evento.value
          );
        } else {
          nextForm.eventoRelacionado = undefined;
        }

        nextForm.luchadoresRelacionados =
          relationResolution.resolved.luchadores.map((fighter) =>
            toReferenceValue(fighter.value)
          );

        return clearInvalidDependentReferences(
          nextForm,
          auxiliary,
          referenceData
        );
      });

      setAuxiliary((currentAuxiliary) => ({
        ...currentAuxiliary,
        anguloEditorial:
          "Noticia reescrita en español desde una fuente oficial de ONE Championship con enfoque propio de Full Fight News.",
        hechoPrincipal: payload.data.extracto,
        contextoPrevio:
          selectedOneNews.bodyText?.trim() ||
          selectedOneNews.summary?.trim() ||
          selectedOneNews.title,
        tono: "informativo, directo y periodístico",
        seoObjetivo: payload.data.titulo,
        instruccionesRedaccion: createOneEditorialInstructions(selectedOneNews),
      }));

      const unresolvedCount =
        relationResolution.unresolved.luchadores.length +
        (relationResolution.unresolved.evento ? 1 : 0) +
        (relationResolution.unresolved.organizacion ? 1 : 0) +
        (relationResolution.unresolved.disciplina ? 1 : 0);

      const resolvedRelationCount =
        relationResolution.resolved.luchadores.length +
        (relationResolution.resolved.evento ? 1 : 0) +
        (relationResolution.resolved.organizacion ? 1 : 0) +
        (relationResolution.resolved.disciplina ? 1 : 0);

      setOneNewsStatus({
        type: "success",
        message:
          unresolvedCount === 0
            ? `Noticia ONE Championship transformada y relacionada automáticamente: ${resolvedRelationCount} referencias reales resueltas y trazabilidad añadida.`
            : `Noticia ONE Championship transformada: ${resolvedRelationCount} referencias resueltas, ${unresolvedCount} sugerencias pendientes y trazabilidad añadida.`,
      });
    } catch (error) {
      setOneNewsStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la noticia ONE Championship al español.",
      });
    } finally {
      setIsTransformingOneNews(false);
    }
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOneNews,
  ]);

  const reloadOfficialFekmNews = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingFekmNews(true);
      setFekmNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/fekm/news?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as OneOfficialNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar las noticias oficiales de FEKM."
        );
      }

      setFekmNewsItems(payload.items);
      setFekmNewsFetchedAt(payload.fetchedAt);
      setFekmNewsRelationsResolution(null);
      setFekmNewsBatchAnalysis(null);
      setFekmNewsBatchPreparation([]);
      setShowAllFekmNewsBatchItems(false);
      setFekmNewsBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedFekmNewsId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setFekmNewsStatus({
        type: "success",
        message: `${payload.count} noticias oficiales de FEKM cargadas.`,
      });
    } catch (error) {
      setFekmNewsItems([]);
      setSelectedFekmNewsId("");
      setFekmNewsFetchedAt("");
      setFekmNewsStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido cargando las noticias oficiales de FEKM.",
      });
    } finally {
      setIsLoadingFekmNews(false);
    }
  }, []);

  const analyzeOfficialFekmNews = useCallback(async (): Promise<void> => {
    if (fekmNewsItems.length === 0) {
      setFekmNewsBatchStatus({
        type: "error",
        message: "Carga primero las noticias oficiales de FEKM.",
      });
      return;
    }

    try {
      setIsAnalyzingFekmNewsBatch(true);
      setFekmNewsBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/fekm/news/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            items: fekmNewsItems,
          }),
        }
      );

      const payload =
        (await response.json()) as FekmNewsBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar las noticias oficiales de FEKM."
        );
      }

      setFekmNewsBatchAnalysis(payload);
      setFekmNewsBatchStatus({
        type: "success",
        message: `${payload.count} noticias analizadas: ${payload.summary.existing} existentes, ${payload.summary.ready} nuevas aptas, ${payload.summary.withoutContent} sin contenido suficiente y ${payload.summary.requiresReview} para revisión.`,
      });
    } catch (error) {
      setFekmNewsBatchAnalysis(null);
      setFekmNewsBatchStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido analizando noticias FEKM.",
      });
    } finally {
      setIsAnalyzingFekmNewsBatch(false);
    }
  }, [fekmNewsItems]);

  const updateFekmNewsBatchPreparationItem = useCallback(
    (
      sourceId: string,
      changes: Partial<FekmNewsBatchPreparationItem>
    ): void => {
      setFekmNewsBatchPreparation((current) =>
        current.map((item) =>
          item.sourceId === sourceId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleFekmNews =
    useCallback(async (): Promise<void> => {
      if (!fekmNewsBatchAnalysis?.ok) {
        setFekmNewsBatchStatus({
          type: "error",
          message:
            "Analiza primero las noticias oficiales FEKM antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = fekmNewsBatchAnalysis.items.filter(
        (item) => item.status === "nueva_apta"
      );

      const eligibleNews = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceItem = fekmNewsItems.find(
            (item) => item.id === analysisItem.sourceId
          );

          return sourceItem
            ? {
                analysis: analysisItem,
                sourceItem,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: FekmNewsBatchItem;
            sourceItem: OneOfficialNewsItem;
          } => item !== null
        );

      const confirmed = window.confirm(
        `Se prepararán ${eligibleNews.length} noticias nuevas FEKM como borradores en Sanity. Las noticias existentes o inseguras se excluirán. ¿Continuar?`
      );

      if (!confirmed) {
        setFekmNewsBatchStatus({
          type: "idle",
          message: "",
        });
        return;
      }

      if (eligibleNews.length === 0) {
        setFekmNewsBatchStatus({
          type: "error",
          message:
            "No hay noticias FEKM nuevas aptas. Las existentes, incompletas o inseguras se excluyen automáticamente.",
        });
        return;
      }

      setFekmNewsBatchPreparation(
        eligibleNews.map(({ sourceItem }) => ({
          sourceId: sourceItem.id,
          title: sourceItem.title,
          status: "pendiente",
          message: "En espera.",
        }))
      );
      setIsPreparingFekmNewsBatch(true);

      let completed = 0;
      let failed = 0;

      try {
        for (let index = 0; index < eligibleNews.length; index += 1) {
          const { sourceItem } = eligibleNews[index];

          updateFekmNewsBatchPreparationItem(sourceItem.id, {
            status: "procesando",
            message: `Noticia ${index + 1} de ${eligibleNews.length}: transformando al español...`,
          });

          try {
            const transformResponse = await fetch(
              `${API_BASE_URL}/api/transformar-noticia-fekm`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({
                  title: sourceItem.title,
                  summary: sourceItem.summary,
                  bodyText: sourceItem.bodyText,
                  sourceUrl:
                    sourceItem.canonicalUrl || sourceItem.sourceUrl,
                }),
              }
            );

            const transformPayload =
              (await transformResponse.json()) as TransformNewsApiResponse;

            if (!transformResponse.ok || !transformPayload.ok) {
              throw new Error(
                !transformPayload.ok && transformPayload.error
                  ? transformPayload.error
                  : "No se pudo transformar la noticia FEKM al español."
              );
            }

            updateFekmNewsBatchPreparationItem(sourceItem.id, {
              message: "Resolviendo relaciones editoriales reales...",
            });

            const relationResolution = resolveSuggestedNewsRelations({
              suggestions: transformPayload.data.relacionesSugeridas,
              referenceData,
            });

            const oneDisciplineOption = getFekmNewsDisciplineOption(
              sourceItem,
              referenceData
            );
            const oneOption = findReferenceByLabel(
              referenceData.organizacion,
              "FEKM"
            );

            const initialState = getInitialFormState("noticia");
            const batchForm: ContentFormState = {
              ...initialState.form,
              titulo: transformPayload.data.titulo,
              extracto: transformPayload.data.extracto,
              contenido: transformPayload.data.contenido,
              fechaPublicacion:
                getRequiredPublicationDateTimeLocalValue(sourceItem.publishedAt),
              imagenPrincipal: sourceItem.imageUrl,
              disciplina: relationResolution.resolved.disciplina
                ? toReferenceValue(
                    relationResolution.resolved.disciplina.value
                  )
                : oneDisciplineOption
                ? toReferenceValue(oneDisciplineOption.value)
                : undefined,
              organizacionRelacionada:
                relationResolution.resolved.organizacion
                  ? toReferenceValue(
                      relationResolution.resolved.organizacion.value
                    )
                  : oneOption
                  ? toReferenceValue(oneOption.value)
                  : undefined,
              eventoRelacionado: relationResolution.resolved.evento
                ? toReferenceValue(
                    relationResolution.resolved.evento.value
                  )
                : undefined,
              luchadoresRelacionados:
                relationResolution.resolved.luchadores.map((fighter) =>
                  toReferenceValue(fighter.value)
                ),
              fuente: "one",
              fuenteUrl:
                sourceItem.canonicalUrl || sourceItem.sourceUrl,
              fuenteId: sourceItem.id,
              destacada: false,
            };

            updateFekmNewsBatchPreparationItem(sourceItem.id, {
              message: "Generando documento y validando campos...",
            });

            const buildResult = buildContentOutput({
              contentType: "noticia",
              form: batchForm,
              auxiliary: initialState.auxiliary,
            });

            if (!buildResult.ok || !buildResult.output) {
              const errors = buildResult.issues
                .filter((issue) => issue.severity === "error")
                .map((issue) => issue.message)
                .join(" · ");

              throw new Error(
                errors || "El builder bloqueó el documento de noticia FEKM."
              );
            }

            updateFekmNewsBatchPreparationItem(sourceItem.id, {
              message: "Importando imagen y guardando borrador en Sanity...",
            });

            await saveDraft({
              contentType: "noticia",
              document: buildResult.output as Record<string, unknown>,
            });

            completed += 1;
            updateFekmNewsBatchPreparationItem(sourceItem.id, {
              status: "completado",
              message: `${
                relationResolution.resolved.luchadores.length
              } luchadores, ${
                relationResolution.resolved.evento ? 1 : 0
              } evento y trazabilidad FEKM guardados.`,
            });
          } catch (error) {
            failed += 1;
            updateFekmNewsBatchPreparationItem(sourceItem.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando esta noticia FEKM.",
            });
          }
        }

        await reloadReferenceEntities();
        await analyzeOfficialFekmNews();

        setFekmNewsBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva FEKM completada: ${completed} noticias guardadas como borrador.`
              : `Preparación masiva FEKM terminada: ${completed} noticias completadas y ${failed} fallidas.`,
        });
      } catch (error) {
        setFekmNewsBatchStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido durante la preparación masiva de noticias FEKM.",
        });
      } finally {
        setIsPreparingFekmNewsBatch(false);
      }
    }, [
      analyzeOfficialFekmNews,
      fekmNewsBatchAnalysis,
      fekmNewsItems,
      referenceData,
      reloadReferenceEntities,
      updateFekmNewsBatchPreparationItem,
    ]);

  const applyFekmNewsToForm = useCallback((): void => {
    if (!selectedFekmNews) {
      setFekmNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de FEKM.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setFekmNewsStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Noticia antes de pasar la fuente al formulario.",
      });
      return;
    }

    const oneDisciplineOption = getFekmNewsDisciplineOption(selectedFekmNews, referenceData);
    const oneOption = findReferenceByLabel(referenceData.organizacion, "FEKM");
    const officialSummary =
      selectedFekmNews.summary?.trim() ||
      createSourceExtract(selectedFekmNews as unknown as UfcOfficialNewsItem) ||
      selectedFekmNews.title;
    const officialBody =
      selectedFekmNews.bodyText?.trim() ||
      selectedFekmNews.summary?.trim() ||
      selectedFekmNews.title;
    const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedFekmNews.publishedAt);

    setFekmNewsRelationsResolution(null);
    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedFekmNews.title,
        extracto: createSourceExtract(selectedFekmNews as unknown as UfcOfficialNewsItem),
        contenido: officialBody,
        fuente: "one",
        fuenteUrl:
          selectedFekmNews.canonicalUrl || selectedFekmNews.sourceUrl,
        fuenteId: selectedFekmNews.id,
        destacada: false,
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedFekmNews.imageUrl) {
        nextForm.imagenPrincipal = selectedFekmNews.imageUrl;
      }

      if (oneDisciplineOption) {
        nextForm.disciplina = toReferenceValue(oneDisciplineOption.value);
      }

      if (oneOption) {
        nextForm.organizacionRelacionada = toReferenceValue(oneOption.value);
      }

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      anguloEditorial:
        "Reescritura informativa en español a partir de una fuente oficial de FEKM, con enfoque propio de Full Fight News.",
      hechoPrincipal: officialSummary,
      contextoPrevio: officialBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedFekmNews.title,
      instruccionesRedaccion: createFekmEditorialInstructions(selectedFekmNews),
    }));

    const missingRelations: string[] = [];

    if (!oneDisciplineOption) {
      missingRelations.push(inferFekmNewsDisciplineLabel(selectedFekmNews));
    }

    if (!oneOption) {
      missingRelations.push("FEKM");
    }

    setFekmNewsStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Noticia oficial FEKM cargada y mapeada: contenido, relaciones y trazabilidad listas para generar el output."
          : `Noticia FEKM cargada. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedFekmNews,
  ]);

  const transformFekmNewsToSpanish = useCallback(async (): Promise<void> => {
    if (!selectedFekmNews) {
      setFekmNewsStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de FEKM.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setFekmNewsStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de transformar la fuente.",
      });
      return;
    }

    try {
      setIsTransformingFekmNews(true);
      setFekmNewsStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-noticia-fekm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: selectedFekmNews.title,
          summary: selectedFekmNews.summary,
          bodyText: selectedFekmNews.bodyText,
          sourceUrl:
            selectedFekmNews.canonicalUrl || selectedFekmNews.sourceUrl,
        }),
      });

      const payload = (await response.json()) as TransformNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la noticia FEKM al español."
        );
      }

      const oneDisciplineOption = getFekmNewsDisciplineOption(selectedFekmNews, referenceData);
      const oneOption = findReferenceByLabel(referenceData.organizacion, "FEKM");
      const publicationDate = getRequiredPublicationDateTimeLocalValue(selectedFekmNews.publishedAt);
      const relationResolution = resolveSuggestedNewsRelations({
        suggestions: payload.data.relacionesSugeridas,
        referenceData,
      });

      setFekmNewsRelationsResolution(relationResolution);
      resetDerivedUiState();

      setForm((currentForm) => {
        const nextForm: ContentFormState = {
          ...currentForm,
          titulo: payload.data.titulo,
          extracto: payload.data.extracto,
          contenido: payload.data.contenido,
          fuente: "one",
          fuenteUrl:
            selectedFekmNews.canonicalUrl ||
            selectedFekmNews.sourceUrl,
          fuenteId: selectedFekmNews.id,
          destacada: false,
        };

        if (publicationDate) {
          nextForm.fechaPublicacion = publicationDate;
        }

        if (selectedFekmNews.imageUrl) {
          nextForm.imagenPrincipal = selectedFekmNews.imageUrl;
        }

        if (relationResolution.resolved.disciplina) {
          nextForm.disciplina = toReferenceValue(
            relationResolution.resolved.disciplina.value
          );
        } else if (oneDisciplineOption) {
          nextForm.disciplina = toReferenceValue(oneDisciplineOption.value);
        }

        if (relationResolution.resolved.organizacion) {
          nextForm.organizacionRelacionada = toReferenceValue(
            relationResolution.resolved.organizacion.value
          );
        } else if (oneOption) {
          nextForm.organizacionRelacionada = toReferenceValue(oneOption.value);
        }

        if (relationResolution.resolved.evento) {
          nextForm.eventoRelacionado = toReferenceValue(
            relationResolution.resolved.evento.value
          );
        } else {
          nextForm.eventoRelacionado = undefined;
        }

        nextForm.luchadoresRelacionados =
          relationResolution.resolved.luchadores.map((fighter) =>
            toReferenceValue(fighter.value)
          );

        return clearInvalidDependentReferences(
          nextForm,
          auxiliary,
          referenceData
        );
      });

      setAuxiliary((currentAuxiliary) => ({
        ...currentAuxiliary,
        anguloEditorial:
          "Noticia reescrita en español desde una fuente oficial de FEKM con enfoque propio de Full Fight News.",
        hechoPrincipal: payload.data.extracto,
        contextoPrevio:
          selectedFekmNews.bodyText?.trim() ||
          selectedFekmNews.summary?.trim() ||
          selectedFekmNews.title,
        tono: "informativo, directo y periodístico",
        seoObjetivo: payload.data.titulo,
        instruccionesRedaccion: createFekmEditorialInstructions(selectedFekmNews),
      }));

      const unresolvedCount =
        relationResolution.unresolved.luchadores.length +
        (relationResolution.unresolved.evento ? 1 : 0) +
        (relationResolution.unresolved.organizacion ? 1 : 0) +
        (relationResolution.unresolved.disciplina ? 1 : 0);

      const resolvedRelationCount =
        relationResolution.resolved.luchadores.length +
        (relationResolution.resolved.evento ? 1 : 0) +
        (relationResolution.resolved.organizacion ? 1 : 0) +
        (relationResolution.resolved.disciplina ? 1 : 0);

      setFekmNewsStatus({
        type: "success",
        message:
          unresolvedCount === 0
            ? `Noticia FEKM transformada y relacionada automáticamente: ${resolvedRelationCount} referencias reales resueltas y trazabilidad añadida.`
            : `Noticia FEKM transformada: ${resolvedRelationCount} referencias resueltas, ${unresolvedCount} sugerencias pendientes y trazabilidad añadida.`,
      });
    } catch (error) {
      setFekmNewsStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la noticia FEKM al español.",
      });
    } finally {
      setIsTransformingFekmNews(false);
    }
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedFekmNews,
  ]);

  const reloadOfficialUfcEvents = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingOfficialEvents(true);
      setOfficialEventSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as UfcOfficialEventsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar los eventos oficiales de UFC."
        );
      }

      setOfficialEventItems(payload.items);
      setOfficialEventsFetchedAt(payload.fetchedAt);
      setUfcBatchAnalysis(null);
      setUfcBatchPreparation([]);
      setShowAllUfcEventBatchItems(false);
      setUfcBatchStatus({
        type: "idle",
        message: "",
      });
      setSelectedOfficialEventId((currentId) =>
        payload.items.some((item) => item.id === currentId) ? currentId : ""
      );

      setOfficialEventSourceStatus({
        type: "success",
        message: `${payload.count} eventos oficiales de UFC cargados.`,
      });

      notifyEventsLoaded({
        source: "UFC",
        count: payload.count,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando los eventos oficiales de UFC.";

      setOfficialEventItems([]);
      setSelectedOfficialEventId("");
      setOfficialEventsFetchedAt("");
      setOfficialEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "cargar los eventos",
        message,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });
    } finally {
      setIsLoadingOfficialEvents(false);
    }
  }, []);

  const analyzeUpcomingUfcEvents = useCallback(async (): Promise<void> => {
    const upcomingEvents = officialEventItems.filter(
      (item) => item.status === "proximo" && (item.fightCard?.length ?? 0) > 0
    );

    if (upcomingEvents.length === 0) {
      setUfcBatchStatus({
        type: "error",
        message:
          "No hay próximos eventos UFC con cartelera disponible para analizar.",
      });
      return;
    }

    const processId = "ufc-events-batch-analysis";

    try {
      setIsAnalyzingUfcBatch(true);

      startProcess({
        id: processId,
        label: "Analizando eventos UFC",
        detail: `${upcomingEvents.length} carteleras en preparación`,
      });

      setUfcBatchStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/batch-resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            events: upcomingEvents,
          }),
        }
      );

      const payload = (await response.json()) as UfcBatchResolveApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron analizar los próximos eventos UFC."
        );
      }

      setUfcBatchAnalysis(payload);
      setUfcBatchStatus({
        type: "success",
        message: `${payload.count} eventos analizados: ${payload.summary.completed} completos, ${payload.summary.readyToPrepare} listos para preparar, ${payload.summary.eventPending} con evento pendiente y ${payload.summary.requiresReview} para revisión.`,
      });

      notifyEventAnalysisCompleted({
        source: "UFC",
        count: payload.count,
        completed: payload.summary.completed,
        ready: payload.summary.readyToPrepare,
        pending: payload.summary.eventPending,
        review: payload.summary.requiresReview,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido analizando los próximos eventos UFC.";

      setUfcBatchAnalysis(null);
      setUfcBatchStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "analizar los eventos",
        message,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsAnalyzingUfcBatch(false);
    }
  }, [officialEventItems]);

  const resolveSelectedUfcEvent = useCallback(
    async (eventOverride?: UfcOfficialEventItem): Promise<void> => {
      const targetEvent = eventOverride ?? selectedOfficialEvent;

      if (!targetEvent) {
        setUfcAutomationStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de UFC.",
        });
        return;
      }

      const processId = "ufc-event-resolution";

      try {
        setIsResolvingUfcEvent(true);

        startProcess({
          id: processId,
          label: "Resolviendo cartelera UFC",
          detail: targetEvent.name,
        });

        setUfcAutomationStatus({
          type: "idle",
          message: "",
        });

        const response = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/resolve`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              event: targetEvent,
            }),
          }
        );

        const payload = (await response.json()) as UfcEventResolution;

        if (!response.ok || !payload.ok) {
          throw new Error(
            !payload.ok && payload.error
              ? payload.error
              : "No se pudo resolver la cartelera contra Sanity."
          );
        }

        setUfcEventResolution(payload);

        setUfcAutomationStatus({
          type: "success",
          message: payload.event.found
            ? `${payload.counts.readyFights} combates resueltos: ${payload.counts.existingFights} ya existen y ${payload.counts.pendingFights} quedan pendientes de crear.`
            : `Cartelera analizada. Falta crear o localizar el evento en Sanity.`,
        });

        notifyEventResolved({
          source: "UFC",
          eventName: targetEvent.name,
          existingFights: payload.counts.existingFights,
          pendingFights: payload.counts.pendingFights,
          missingFighters: payload.counts.missingFighters,
          unresolvedCategories: payload.counts.unresolvedCategories,
          eventFound: payload.event.found,
          location: {
            label: "Laboratorio → UFC → Eventos",
            url: window.location.href,
          },
        });

        completeProcess(processId);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido resolviendo la cartelera.";

        setUfcEventResolution(null);
        setUfcAutomationStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "UFC",
          action: "resolver la cartelera",
          message,
          location: {
            label: "Laboratorio → UFC → Eventos",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
      } finally {
        setIsResolvingUfcEvent(false);
      }
    },
    [selectedOfficialEvent]
  );

  const createMissingUfcFighters = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    const processId = "ufc-create-fighters";

    try {
      setIsCreatingUfcFighters(true);

      startProcess({
        id: processId,
        label: "Creando luchadores UFC",
        detail: selectedOfficialEvent.name,
      });

      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });

      if (!ufcEventResolution?.ok) throw new Error("Analiza primero la cartelera para obtener disciplina, organización e identidades faltantes.");
      const currentResolution = ufcEventResolution;

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(fighterResolutionRequestBody(selectedOfficialEvent, currentResolution)),
        }
      );

      const payload = (await response.json()) as FighterResolutionIntakeResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error
            ? payload.error
            : "No se pudieron crear los luchadores faltantes."
        );
      }

      const registered = registerPlannedFighterResolutions(payload);

      setUfcAutomationStatus({
        type: "success",
        message: `${registered} solicitudes planificadas. Resolver identidad del luchador en el Centro de revisión.`,
      });
      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando luchadores.";

      setUfcAutomationStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "crear los luchadores",
        message,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingUfcFighters(false);
    }
  }, [
    selectedOfficialEvent,
    ufcEventResolution,
  ]);

  const createUfcFights = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    const processId = "ufc-create-fights";

    try {
      setIsCreatingUfcFights(true);

      startProcess({
        id: processId,
        label: "Creando combates UFC",
        detail: selectedOfficialEvent.name,
      });

      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            confirm: true,
            event: selectedOfficialEvent,
          }),
        }
      );

      const payload = (await response.json()) as UfcBulkActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron crear los combates."
        );
      }

      await reloadReferenceEntities();
      await resolveSelectedUfcEvent(selectedOfficialEvent);

      setUfcAutomationStatus({
        type: payload.summary.failed > 0 ? "error" : "success",
        message: `${payload.summary.created} combates creados, ${payload.summary.skipped} ya existentes y ${payload.summary.failed} fallidos.`,
      });

      notifyEntityBatchProcessed({
        source: "UFC",
        entity: "fight",
        created: payload.summary.created,
        skipped: payload.summary.skipped,
        failed: payload.summary.failed,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      if (payload.summary.failed > 0) {
        failProcess(
          processId,
          `${payload.summary.failed} combates fallidos`,
        );
      } else {
        completeProcess(processId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando combates.";

      setUfcAutomationStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "crear los combates",
        message,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingUfcFights(false);
    }
  }, [
    reloadReferenceEntities,
    resolveSelectedUfcEvent,
    selectedOfficialEvent,
  ]);

  const requestUfcEventResolution = useCallback(
    async (
      targetEvent: UfcOfficialEventItem
    ): Promise<UfcEventResolutionSuccess> => {
      const response = await fetch(
        `${API_BASE_URL}/api/sources/ufc/events/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            event: targetEvent,
          }),
        }
      );

      const payload = (await response.json()) as UfcEventResolution;

      if (!response.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo resolver la cartelera contra Sanity."
        );
      }

      if (!payload.ok) {
        throw new Error(
          payload.error ||
            "No se pudo resolver la cartelera contra Sanity."
        );
      }

      return payload;
    },
    []
  );

  const updateUfcBatchPreparationItem = useCallback(
    (
      eventId: string,
      changes: Partial<UfcBatchPreparationItem>
    ): void => {
      setUfcBatchPreparation((current) =>
        current.map((item) =>
          item.eventId === eventId ? { ...item, ...changes } : item
        )
      );
    },
    []
  );

  const prepareAllEligibleUfcEvents =
    useCallback(async (): Promise<void> => {
      if (!ufcBatchAnalysis?.ok) {
        setUfcBatchStatus({
          type: "error",
          message:
            "Analiza primero los próximos eventos UFC antes de preparar el lote.",
        });
        return;
      }

      const eligibleAnalysisItems = ufcBatchAnalysis.items.filter(
        (item) => item.status === "listo_para_preparar"
      );

      const eligibleEvents = eligibleAnalysisItems
        .map((analysisItem) => {
          const sourceEvent = officialEventItems.find(
            (event) => event.id === analysisItem.eventId
          );

          return sourceEvent
            ? {
                analysis: analysisItem,
                event: sourceEvent,
              }
            : null;
        })
        .filter(
          (
            item
          ): item is {
            analysis: UfcBatchEventAnalysis;
            event: UfcOfficialEventItem;
          } => item !== null
        );

      const confirmed = window.confirm(
        `Se prepararán ${eligibleEvents.length} eventos UFC aptos. Se crearán únicamente luchadores y combates pendientes. ¿Continuar?`
      );

      if (!confirmed) {
        setUfcBatchStatus({
          type: "idle",
          message: "",
        });
        return;
      }

      if (eligibleEvents.length === 0) {
        const message =
          "No hay eventos aptos para preparar. Los completos, pendientes de crear o con categorías sin resolver se excluyen automáticamente.";

        setUfcBatchStatus({
          type: "error",
          message,
        });

        notifyReviewRecommended({
          source: "UFC",
          message,
          location: {
            label: "Laboratorio → UFC → Eventos",
            url: window.location.href,
          },
        });

        return;
      }

      const initialProgress: UfcBatchPreparationItem[] =
        eligibleEvents.map(({ event }) => ({
          eventId: event.id,
          eventName: event.name,
          status: "pendiente",
          message: "En espera.",
        }));

      setUfcBatchPreparation(initialProgress);
      setIsPreparingUfcBatch(true);

      const processId = "ufc-events-batch-preparation";

      startProcess({
        id: processId,
        label: "Preparando eventos UFC",
        detail: `${eligibleEvents.length} eventos pendientes`,
        current: 0,
        total: eligibleEvents.length,
      });

      let completed = 0;
      let failed = 0;
      const createdFighters = 0;
      let createdFights = 0;

      try {
        for (let index = 0; index < eligibleEvents.length; index += 1) {
          const { event } = eligibleEvents[index];

          updateUfcBatchPreparationItem(event.id, {
            status: "procesando",
            message: `Evento ${index + 1} de ${eligibleEvents.length}: analizando estado actual...`,
          });

          updateProcess(processId, {
            current: index,
            total: eligibleEvents.length,
            detail: `Procesando ${index + 1} de ${eligibleEvents.length}: ${event.name}`,
          });

          try {
            let resolution = await requestUfcEventResolution(event);

            if (!resolution.event.found) {
              throw new Error(
                "El evento dejó de estar disponible en Sanity."
              );
            }

            if (resolution.counts.unresolvedCategories > 0) {
              throw new Error(
                `Hay ${resolution.counts.unresolvedCategories} categorías sin resolver.`
              );
            }

            if (resolution.counts.missingFighters > 0) {
              updateUfcBatchPreparationItem(event.id, {
                message: `Creando ${resolution.counts.missingFighters} luchadores faltantes...`,
              });

              const fightersResponse = await fetch(
                `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify(fighterResolutionRequestBody(event, resolution)),
                }
              );

              const fightersPayload =
                (await fightersResponse.json()) as FighterResolutionIntakeResponse;

              if (!fightersResponse.ok || !fightersPayload.ok) {
                throw new Error(
                  fightersPayload.error
                    ? fightersPayload.error
                    : "No se pudieron crear los luchadores faltantes."
                );
              }

              const registered = registerPlannedFighterResolutions(fightersPayload);
              updateUfcBatchPreparationItem(event.id, {status: "completado", message: `${registered} identidades pendientes en el Centro de revisión.`});
              completed += 1;
              continue;
            }

            if (resolution.counts.missingFighters > 0) {
              throw new Error(
                `Todavía quedan ${resolution.counts.missingFighters} luchadores sin resolver.`
              );
            }

            if (resolution.counts.pendingFights > 0) {
              updateUfcBatchPreparationItem(event.id, {
                message: `Creando ${resolution.counts.pendingFights} combates pendientes...`,
              });

              const fightsResponse = await fetch(
                `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                  },
                  body: JSON.stringify({
                    confirm: true,
                    event,
                  }),
                }
              );

              const fightsPayload =
                (await fightsResponse.json()) as UfcBulkActionResponse;

              if (!fightsResponse.ok || !fightsPayload.ok) {
                throw new Error(
                  !fightsPayload.ok && fightsPayload.error
                    ? fightsPayload.error
                    : "No se pudieron crear los combates."
                );
              }

              if (fightsPayload.summary.failed > 0) {
                throw new Error(
                  `${fightsPayload.summary.failed} combates fallaron durante la creación.`
                );
              }

              createdFights += fightsPayload.summary.created;
              resolution = await requestUfcEventResolution(event);
            }

            if (
              resolution.counts.missingFighters > 0 ||
              resolution.counts.pendingFights > 0
            ) {
              throw new Error(
                `El evento conserva ${resolution.counts.missingFighters} luchadores y ${resolution.counts.pendingFights} combates pendientes.`
              );
            }

            completed += 1;
            updateUfcBatchPreparationItem(event.id, {
              status: "completado",
              message: `${resolution.counts.existingFighters} luchadores y ${resolution.counts.existingFights} combates relacionados.`,
            });
          } catch (error) {
            failed += 1;

            updateUfcBatchPreparationItem(event.id, {
              status: "fallido",
              message:
                error instanceof Error
                  ? error.message
                  : "Error desconocido preparando este evento.",
            });
          }

          updateProcess(processId, {
            current: index + 1,
            total: eligibleEvents.length,
            detail: `${completed} completados · ${failed} fallidos · ${createdFighters} luchadores · ${createdFights} combates`,
          });
        }

        await reloadReferenceEntities();
        await analyzeUpcomingUfcEvents();

        setUfcBatchStatus({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? `Preparación masiva completada: ${completed} eventos, ${createdFighters} luchadores y ${createdFights} combates creados.`
              : `Preparación masiva terminada: ${completed} eventos completados y ${failed} fallidos. Se crearon ${createdFighters} luchadores y ${createdFights} combates.`,
        });

        notifyEntityBatchProcessed({
          source: "UFC",
          entity: "event",
          created: completed,
          skipped: 0,
          failed,
          location: {
            label:
              failed > 0
                ? "Laboratorio → UFC → Eventos"
                : "Sanity Studio → Eventos",
            url:
              failed > 0
                ? window.location.href
                : `${API_BASE_URL}/studio`,
          },
        });

        if (failed === 0) {
          completeProcess(processId);
        } else {
          failProcess(
            processId,
            `${completed} eventos completados · ${failed} fallidos`,
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido durante la preparación masiva.";

        setUfcBatchStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "UFC",
          action: "preparar los eventos",
          message,
          location: {
            label: "Laboratorio → UFC → Eventos",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
      } finally {
        setIsPreparingUfcBatch(false);
      }
    }, [
      analyzeUpcomingUfcEvents,
      officialEventItems,
      reloadReferenceEntities,
      requestUfcEventResolution,
      ufcBatchAnalysis,
      updateUfcBatchPreparationItem,
    ]);

  const prepareFullUfcCard = useCallback(async (): Promise<void> => {
    if (!selectedOfficialEvent) {
      setUfcAutomationStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    const processId = "ufc-full-card-preparation";

    try {
      setIsPreparingFullUfcCard(true);

      startProcess({
        id: processId,
        label: "Preparando cartelera completa UFC",
        detail: selectedOfficialEvent.name,
        current: 1,
        total: 4,
      });

      setUfcAutomationStatus({
        type: "success",
        message: "Paso 1 de 4: analizando la cartelera oficial...",
      });

      let resolution = await requestUfcEventResolution(
        selectedOfficialEvent
      );

      setUfcEventResolution(resolution);

      if (!resolution.event.found) {
        const message =
          "El evento todavía no existe en Sanity. Transfórmalo, genera el output y guárdalo como borrador. Después vuelve a pulsar “Preparar cartelera completa”.";

        setUfcAutomationStatus({
          type: "error",
          message,
        });

        notifyReviewRecommended({
          source: "UFC",
          message: `${selectedOfficialEvent.name}: ${message}`,
          location: {
            label: "Laboratorio → UFC → Eventos → Formulario",
            url: window.location.href,
          },
        });

        failProcess(processId, "Evento pendiente de crear en Sanity");
        return;
      }

      if (resolution.counts.unresolvedCategories > 0) {
        const message = `El flujo se ha detenido: hay ${resolution.counts.unresolvedCategories} categorías de peso sin resolver. Revísalas antes de crear luchadores o combates.`;

        setUfcAutomationStatus({
          type: "error",
          message,
        });

        notifyReviewRecommended({
          source: "UFC",
          message: `${selectedOfficialEvent.name}: ${message}`,
          location: {
            label: "Laboratorio → UFC → Eventos",
            url: window.location.href,
          },
        });

        failProcess(processId, message);
        return;
      }

      if (resolution.counts.missingFighters > 0) {
        updateProcess(processId, {
          current: 2,
          total: 4,
          detail: "Creando luchadores faltantes",
        });

        setUfcAutomationStatus({
          type: "success",
          message: `Paso 2 de 4: creando ${resolution.counts.missingFighters} luchadores faltantes...`,
        });

        const fightersResponse = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/create-fighters`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(fighterResolutionRequestBody(selectedOfficialEvent, resolution)),
          }
        );

        const fightersPayload =
          (await fightersResponse.json()) as FighterResolutionIntakeResponse;

        if (!fightersResponse.ok || !fightersPayload.ok) {
          throw new Error(
            fightersPayload.error
              ? fightersPayload.error
              : "No se pudieron crear los luchadores faltantes."
          );
        }
        const registered = registerPlannedFighterResolutions(fightersPayload);
        setUfcAutomationStatus({type: "success", message: `${registered} solicitudes planificadas. La automatización se detuvo hasta resolver identidad en /revision.`});
        completeProcess(processId);
        return;

        setUfcEventResolution(resolution);
      }

      if (resolution.counts.missingFighters > 0) {
        setUfcAutomationStatus({
          type: "error",
          message: `El flujo se ha detenido: todavía quedan ${resolution.counts.missingFighters} luchadores sin resolver.`,
        });
        return;
      }

      if (resolution.counts.pendingFights > 0) {
        updateProcess(processId, {
          current: 4,
          total: 4,
          detail: "Creando combates pendientes",
        });

        setUfcAutomationStatus({
          type: "success",
          message: `Paso 4 de 4: creando ${resolution.counts.pendingFights} combates pendientes...`,
        });

        const fightsResponse = await fetch(
          `${API_BASE_URL}/api/sources/ufc/events/create-fights`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              confirm: true,
              event: selectedOfficialEvent,
            }),
          }
        );

        const fightsPayload =
          (await fightsResponse.json()) as UfcBulkActionResponse;

        if (!fightsResponse.ok || !fightsPayload.ok) {
          throw new Error(
            !fightsPayload.ok && fightsPayload.error
              ? fightsPayload.error
              : "No se pudieron crear los combates."
          );
        }

        if (fightsPayload.summary.failed > 0) {
          throw new Error(
            `Se crearon ${fightsPayload.summary.created} combates, pero ${fightsPayload.summary.failed} fallaron. Revisa el resultado antes de continuar.`
          );
        }

        await reloadReferenceEntities();

        resolution = await requestUfcEventResolution(
          selectedOfficialEvent
        );

        setUfcEventResolution(resolution);
      }

      setUfcAutomationStatus({
        type: "success",
        message:
          resolution.counts.pendingFights === 0 &&
          resolution.counts.missingFighters === 0
            ? `Cartelera completa preparada: ${resolution.counts.existingFighters} luchadores relacionados, ${resolution.counts.existingFights} combates existentes y 0 pendientes.`
            : `Proceso completado con ${resolution.counts.pendingFights} combates y ${resolution.counts.missingFighters} luchadores todavía pendientes.`,
      });

      notifyEventResolved({
        source: "UFC",
        eventName: selectedOfficialEvent.name,
        existingFights: resolution.counts.existingFights,
        pendingFights: resolution.counts.pendingFights,
        missingFighters: resolution.counts.missingFighters,
        unresolvedCategories: resolution.counts.unresolvedCategories,
        eventFound: resolution.event.found,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      if (
        resolution.counts.pendingFights === 0 &&
        resolution.counts.missingFighters === 0 &&
        resolution.counts.unresolvedCategories === 0
      ) {
        completeProcess(processId);
      } else {
        failProcess(
          processId,
          `${resolution.counts.pendingFights} combates y ${resolution.counts.missingFighters} luchadores pendientes`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido preparando la cartelera completa.";

      setUfcAutomationStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "UFC",
        action: "preparar la cartelera completa",
        message,
        location: {
          label: "Laboratorio → UFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsPreparingFullUfcCard(false);
    }
  }, [
    reloadReferenceEntities,
    requestUfcEventResolution,
    selectedOfficialEvent,
  ]);

  const reloadOfficialBkfcEvents = useCallback(async (): Promise<void> => {
    const processId = "bkfc-events-load";

    try {
      setIsLoadingBkfcEvents(true);

      startProcess({
        id: processId,
        label: "Cargando eventos BKFC",
        detail: "Consultando la fuente oficial",
      });

      setBkfcSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/bkfc/events?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as BkfcOfficialEventsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar los eventos oficiales de BKFC."
        );
      }

      setBkfcEventItems(payload.items);
      setBkfcEventsFetchedAt(payload.fetchedAt);
      setBkfcEventResolution(null);
      setSelectedBkfcEventId((currentId) =>
        payload.items.some((item) => item.id === currentId)
          ? currentId
          : ""
      );

      setBkfcSourceStatus({
        type: "success",
        message: `${payload.count} eventos oficiales de BKFC cargados.`,
      });

      notifyEventsLoaded({
        source: "BKFC",
        count: payload.count,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando los eventos oficiales de BKFC.";

      setBkfcEventItems([]);
      setSelectedBkfcEventId("");
      setBkfcEventsFetchedAt("");
      setBkfcEventResolution(null);
      setBkfcSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "cargar los eventos",
        message,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsLoadingBkfcEvents(false);
    }
  }, []);

  const requestBkfcEventResolution = useCallback(
    async (
      targetEvent: BkfcOfficialEventItem
    ): Promise<BkfcEventResolutionSuccess> => {
      const response = await fetch(
        `${API_BASE_URL}/api/sources/bkfc/events/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ event: targetEvent }),
        }
      );

      const payload = (await response.json()) as BkfcEventResolution;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo resolver la cartelera BKFC contra Sanity."
        );
      }

      return payload;
    },
    []
  );

  const resolveSelectedBkfcEvent = useCallback(
    async (
      eventOverride?: BkfcOfficialEventItem
    ): Promise<BkfcEventResolutionSuccess | null> => {
      const targetEvent = eventOverride ?? selectedBkfcEvent;

      if (!targetEvent) {
        setBkfcSourceStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de BKFC.",
        });
        return null;
      }

      const processId = "bkfc-event-resolution";

      try {
        setIsResolvingBkfcEvent(true);

        startProcess({
          id: processId,
          label: "Resolviendo cartelera BKFC",
          detail: targetEvent.name,
        });

        setBkfcSourceStatus({
          type: "idle",
          message: "",
        });

        const resolution = await requestBkfcEventResolution(targetEvent);

        setBkfcEventResolution(resolution);
        setBkfcSourceStatus({
          type: "success",
          message: resolution.event.found
            ? `${resolution.counts.readyFights} combates listos, ${resolution.counts.existingFights} existentes y ${resolution.counts.pendingFights} pendientes.`
            : "Cartelera analizada. El evento todavía no existe en Sanity.",
        });

        notifyEventResolved({
          source: "BKFC",
          eventName: targetEvent.name,
          existingFights: resolution.counts.existingFights,
          pendingFights: resolution.counts.pendingFights,
          missingFighters: resolution.counts.missingFighters,
          unresolvedCategories: resolution.counts.unresolvedCategories,
          eventFound: resolution.event.found,
          location: {
            label: "Laboratorio → BKFC → Eventos",
            url: window.location.href,
          },
        });

        completeProcess(processId);

        return resolution;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido resolviendo la cartelera BKFC.";

        setBkfcEventResolution(null);
        setBkfcSourceStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "BKFC",
          action: "resolver la cartelera",
          message,
          location: {
            label: "Laboratorio → BKFC → Eventos",
            url: window.location.href,
          },
        });

        failProcess(processId, message);

        return null;
      } finally {
        setIsResolvingBkfcEvent(false);
      }
    },
    [requestBkfcEventResolution, selectedBkfcEvent]
  );

  const runBkfcBulkAction = useCallback(
    async (
      path:
        | "create-event"
        | "create-categories"
        | "create-fighters"
        | "create-fights",
      targetEvent?: BkfcOfficialEventItem,
      fighterResolution?: FighterProducerResolutionContext
    ): Promise<UfcBulkActionResponse | FighterResolutionIntakeResponse | Record<string, unknown>> => {
      const body = path === "create-fighters" && targetEvent && fighterResolution ? fighterResolutionRequestBody(targetEvent, fighterResolution) : {
        confirm: true,
        event: targetEvent,
      };

      const response = await fetch(
        `${API_BASE_URL}/api/sources/bkfc/events/${path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const payload = (await response.json()) as
        | UfcBulkActionResponse
        | FighterResolutionIntakeResponse
        | Record<string, unknown>;

      if (!response.ok || !("ok" in payload) || payload.ok !== true) {
        const error =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `No se pudo completar la acción BKFC: ${path}.`;
        throw new Error(error);
      }

      return payload;
    },
    []
  );

  const createSelectedBkfcEvent = useCallback(async (): Promise<void> => {
    if (!selectedBkfcEvent) {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de BKFC.",
      });
      return;
    }

    const processId = "bkfc-create-event";

    try {
      setIsCreatingBkfcEvent(true);

      startProcess({
        id: processId,
        label: "Creando evento BKFC",
        detail: selectedBkfcEvent.name,
      });

      setBkfcSourceStatus({
        type: "success",
        message: "Transformando y guardando el evento BKFC como borrador...",
      });

      await runBkfcBulkAction(
        "create-event",
        selectedBkfcEvent
      );

      await reloadReferenceEntities();

      const resolution =
        await requestBkfcEventResolution(selectedBkfcEvent);

      setBkfcEventResolution(resolution);

      const createdCorrectly = resolution.event.found;

      setBkfcSourceStatus({
        type: createdCorrectly ? "success" : "error",
        message: createdCorrectly
          ? "Evento BKFC creado y reconocido correctamente en Sanity."
          : "El evento se creó, pero todavía no aparece en la resolución.",
      });

      if (createdCorrectly) {
        notifyEventCreated({
          source: "BKFC",
          eventName: selectedBkfcEvent.name,
          location: {
            label: "Sanity Studio → Eventos",
            url: `${API_BASE_URL}/studio`,
          },
        });

        completeProcess(processId);
      } else {
        notifyReviewRecommended({
          source: "BKFC",
          message: `${selectedBkfcEvent.name} se guardó, pero todavía no aparece al resolver la cartelera.`,
          location: {
            label: "Laboratorio → BKFC → Eventos",
            url: window.location.href,
          },
        });

        failProcess(
          processId,
          "Evento creado, pero pendiente de resolver",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando el evento BKFC.";

      setBkfcSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "crear el evento",
        message,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingBkfcEvent(false);
    }
  }, [
    reloadReferenceEntities,
    requestBkfcEventResolution,
    runBkfcBulkAction,
    selectedBkfcEvent,
  ]);

  const createMissingBkfcFighters = useCallback(async (): Promise<void> => {
    if (!selectedBkfcEvent) {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de BKFC.",
      });
      return;
    }

    const processId = "bkfc-create-fighters";

    try {
      setIsCreatingBkfcFighters(true);

      startProcess({
        id: processId,
        label: "Creando luchadores BKFC",
        detail: selectedBkfcEvent.name,
      });

      const resolution = await requestBkfcEventResolution(selectedBkfcEvent);
      const payload = (await runBkfcBulkAction(
        "create-fighters",
        selectedBkfcEvent,
        resolution
      )) as FighterResolutionIntakeResponse;

      if (!payload.summary) {
        throw new Error(
          "La respuesta de creación de luchadores BKFC no incluye resumen.",
        );
      }

      const registered = registerPlannedFighterResolutions(payload);
      setBkfcSourceStatus({
        type: "success",
        message: `${registered} solicitudes planificadas. Resolver identidad del luchador en el Centro de revisión.`,
      });
      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando luchadores BKFC.";

      setBkfcSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "crear los luchadores",
        message,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingBkfcFighters(false);
    }
  }, [
    requestBkfcEventResolution,
    runBkfcBulkAction,
    selectedBkfcEvent,
  ]);

  const createBkfcFights = useCallback(async (): Promise<void> => {
    if (!selectedBkfcEvent) {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de BKFC.",
      });
      return;
    }

    const processId = "bkfc-create-fights";

    try {
      setIsCreatingBkfcFights(true);

      startProcess({
        id: processId,
        label: "Creando combates BKFC",
        detail: selectedBkfcEvent.name,
      });

      const payload = (await runBkfcBulkAction(
        "create-fights",
        selectedBkfcEvent
      )) as UfcBulkActionResponse;

      if (!payload.summary) {
        throw new Error(
          "La respuesta de creación de combates BKFC no incluye resumen.",
        );
      }

      const summary = payload.summary;

      await reloadReferenceEntities();

      const resolution =
        await requestBkfcEventResolution(selectedBkfcEvent);

      setBkfcEventResolution(resolution);
      setBkfcSourceStatus({
        type:
          summary.failed > 0
            ? "error"
            : "success",
        message: `${summary.created} combates creados, ${summary.skipped} omitidos y ${summary.failed} fallidos.`,
      });

      notifyEntityBatchProcessed({
        source: "BKFC",
        entity: "fight",
        created: summary.created,
        skipped: summary.skipped,
        failed: summary.failed,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      if (summary.failed > 0) {
        failProcess(
          processId,
          `${summary.failed} combates fallidos`,
        );
      } else {
        completeProcess(processId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando combates BKFC.";

      setBkfcSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "crear los combates",
        message,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingBkfcFights(false);
    }
  }, [
    reloadReferenceEntities,
    requestBkfcEventResolution,
    runBkfcBulkAction,
    selectedBkfcEvent,
  ]);

  const prepareFullBkfcCard = useCallback(async (): Promise<void> => {
    if (!selectedBkfcEvent) {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de BKFC.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Se preparará la cartelera de “${selectedBkfcEvent.name}”: evento, luchadores y combates con categorías ya resueltas. Las categorías pendientes se omitirán. ¿Continuar?`
    );

    if (!confirmed) return;

    const processId = "bkfc-full-card-preparation";

    try {
      setIsPreparingFullBkfcCard(true);

      startProcess({
        id: processId,
        label: "Preparando cartelera completa BKFC",
        detail: selectedBkfcEvent.name,
        current: 1,
        total: 4,
      });

      setBkfcSourceStatus({
        type: "success",
        message: "Paso 1 de 4: analizando la cartelera BKFC...",
      });

      let resolution =
        await requestBkfcEventResolution(selectedBkfcEvent);

      setBkfcEventResolution(resolution);

      if (!resolution.event.found) {
        updateProcess(processId, {
          current: 2,
          total: 4,
          detail: "Creando el evento",
        });

        setBkfcSourceStatus({
          type: "success",
          message: "Paso 2 de 4: creando el evento BKFC...",
        });

        await runBkfcBulkAction(
          "create-event",
          selectedBkfcEvent
        );

        await reloadReferenceEntities();

        resolution =
          await requestBkfcEventResolution(selectedBkfcEvent);

        setBkfcEventResolution(resolution);
      }

      if (resolution.counts.missingFighters > 0) {
        updateProcess(processId, {
          current: 3,
          total: 4,
          detail: `Creando ${resolution.counts.missingFighters} luchadores`,
        });

        setBkfcSourceStatus({
          type: "success",
          message: `Paso 3 de 4: creando ${resolution.counts.missingFighters} luchadores faltantes...`,
        });

        const intake = await runBkfcBulkAction(
          "create-fighters",
          selectedBkfcEvent,
          resolution
        ) as FighterResolutionIntakeResponse;
        const registered = registerPlannedFighterResolutions(intake);
        setBkfcSourceStatus({type: "success", message: `${registered} solicitudes planificadas. Flujo detenido hasta resolver identidad en /revision.`});
        completeProcess(processId);
        return;
      }

      if (resolution.counts.pendingFights > 0) {
        updateProcess(processId, {
          current: 4,
          total: 4,
          detail: `Creando ${resolution.counts.pendingFights} combates`,
        });

        setBkfcSourceStatus({
          type: "success",
          message: `Paso 4 de 4: creando ${resolution.counts.pendingFights} combates con categorías resueltas...`,
        });

        await runBkfcBulkAction(
          "create-fights",
          selectedBkfcEvent
        );

        await reloadReferenceEntities();

        resolution =
          await requestBkfcEventResolution(selectedBkfcEvent);

        setBkfcEventResolution(resolution);
      }

      const isComplete =
        resolution.event.found &&
        resolution.counts.missingFighters === 0 &&
        resolution.counts.pendingFights === 0;

      setBkfcSourceStatus({
        type: isComplete ? "success" : "error",
        message: `Cartelera BKFC preparada: ${resolution.counts.existingFighters} luchadores, ${resolution.counts.existingFights} combates existentes y ${resolution.counts.pendingFights} combates pendientes. Se han omitido ${resolution.counts.unresolvedCategories} categorías sin resolver.`,
      });

      notifyEventResolved({
        source: "BKFC",
        eventName: selectedBkfcEvent.name,
        existingFights: resolution.counts.existingFights,
        pendingFights: resolution.counts.pendingFights,
        missingFighters: resolution.counts.missingFighters,
        unresolvedCategories: resolution.counts.unresolvedCategories,
        eventFound: resolution.event.found,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      if (isComplete) {
        completeProcess(processId);
      } else {
        failProcess(
          processId,
          `${resolution.counts.pendingFights} combates, ${resolution.counts.missingFighters} luchadores y ${resolution.counts.unresolvedCategories} categorías pendientes`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido preparando la cartelera BKFC.";

      setBkfcSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "BKFC",
        action: "preparar la cartelera completa",
        message,
        location: {
          label: "Laboratorio → BKFC → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsPreparingFullBkfcCard(false);
    }
  }, [
    reloadReferenceEntities,
    requestBkfcEventResolution,
    runBkfcBulkAction,
    selectedBkfcEvent,
  ]);

  const applySelectedBkfcEventToForm = useCallback((): void => {
    if (!selectedBkfcEvent) {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de BKFC.",
      });
      return;
    }

    if (contentType !== "evento") {
      setBkfcSourceStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Evento.",
      });
      return;
    }

    const disciplineOption = findReferenceByLabel(
      referenceData.disciplina,
      "Bare Knuckle"
    );
    const organizationOption = findReferenceByLabel(
      referenceData.organizacion,
      "BKFC"
    );
    const eventDate = toDateTimeLocalValue(selectedBkfcEvent.startDate);

    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        nombre: selectedBkfcEvent.name,
        ciudad: selectedBkfcEvent.city || "",
        pais: selectedBkfcEvent.country || "",
        recinto: selectedBkfcEvent.venue || "",
        cartelPrincipal: selectedBkfcEvent.mainEvent || "",
        dondeVer: selectedBkfcEvent.watchText || "",
        descripcionCorta: selectedBkfcEvent.description || "",
        descripcion: selectedBkfcEvent.description || "",
        estado: selectedBkfcEvent.status,
      };

      if (eventDate) {
        nextForm.fecha = eventDate;
      }

      if (selectedBkfcEvent.imageUrl) {
        nextForm.imagen = selectedBkfcEvent.imageUrl;
      }

      if (disciplineOption) {
        nextForm.disciplina = toReferenceValue(disciplineOption.value);
      }

      if (organizationOption) {
        nextForm.organizacion = toReferenceValue(organizationOption.value);
      }

      return clearInvalidDependentReferences(
        nextForm,
        auxiliary,
        referenceData
      );
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      tipoEvento: "Evento oficial BKFC",
      importanciaEditorial:
        selectedBkfcEvent.description ||
        "Evento oficial de BKFC pendiente de revisión editorial.",
      combateEstelarTexto: selectedBkfcEvent.mainEvent || "",
      contextoCartelera: selectedBkfcEvent.description || "",
      clavesNarrativas: createEventEditorialInstructions(
        selectedBkfcEvent as unknown as UfcOfficialEventItem
      ).replace(/UFC/g, "BKFC"),
      publicoObjetivo: "Aficionados a los deportes de combate",
      tono: "informativo, directo y editorial",
    }));

    setBkfcSourceStatus({
      type: "success",
      message:
        disciplineOption && organizationOption
          ? "Evento BKFC cargado en el formulario con sus referencias."
          : "Evento BKFC cargado. Revisa las referencias Bare Knuckle y BKFC.",
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedBkfcEvent,
  ]);


  const reloadOfficialFekmEvents = useCallback(async (): Promise<void> => {
    try {
      setIsLoadingFekmEvents(true);
      setFekmEventStatus({ type: "idle", message: "" });
      const response = await fetch(`${API_BASE_URL}/api/sources/fekm/events?refresh=${Date.now()}`, { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as FekmOfficialEventsApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(!payload.ok && payload.error ? payload.error : "No se pudieron cargar los eventos FEKM.");
      }
      setFekmEventItems(payload.items);
      setFekmEventsFetchedAt(payload.fetchedAt);
      setFekmEventResolution(null);
      setFekmEventOrchestration(null);
      setSelectedFekmEventId((current) => payload.items.some((item) => item.id === current) ? current : "");
      setFekmEventStatus({ type: "success", message: `${payload.count} eventos FEKM cargados.` });
    } catch (error) {
      setFekmEventItems([]);
      setSelectedFekmEventId("");
      setFekmEventsFetchedAt("");
      setFekmEventResolution(null);
      setFekmEventOrchestration(null);
      setFekmEventStatus({ type: "error", message: error instanceof Error ? error.message : "Error cargando eventos FEKM." });
    } finally {
      setIsLoadingFekmEvents(false);
    }
  }, []);

  const resolveSelectedFekmEvent = useCallback(async (): Promise<FekmEventResolution | null> => {
    if (!selectedFekmEvent) {
      setFekmEventStatus({ type: "error", message: "Selecciona primero un evento FEKM." });
      return null;
    }
    try {
      setIsResolvingFekmEvent(true);
      const response = await fetch(`${API_BASE_URL}/api/sources/fekm/events/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ event: selectedFekmEvent })
      });
      const payload = (await response.json()) as FekmEventResolution;
      if (!response.ok || !payload.ok) throw new Error(!payload.ok && payload.error ? payload.error : "No se pudo resolver el evento FEKM.");
      setFekmEventResolution(payload);
      setFekmEventStatus({ type: "success", message: payload.resolution.existing ? "El evento ya existe en Sanity." : payload.resolution.readyToCreate ? "Evento listo para crear." : "Evento analizado; revisa los bloqueos." });
      return payload;
    } catch (error) {
      setFekmEventResolution(null);
      setFekmEventStatus({ type: "error", message: error instanceof Error ? error.message : "Error resolviendo evento FEKM." });
      return null;
    } finally { setIsResolvingFekmEvent(false); }
  }, [selectedFekmEvent]);

  const createFekmOrganization = useCallback(async (): Promise<void> => {
    try {
      setIsCreatingFekmOrganization(true);
      const response = await fetch(`${API_BASE_URL}/api/sources/fekm/events/create-organization`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || "No se pudo crear FEKM.");
      await reloadReferenceEntities();
      setFekmEventStatus({ type: "success", message: payload.message || "FEKM creada como borrador." });
      if (selectedFekmEvent) await resolveSelectedFekmEvent();
    } catch (error) {
      setFekmEventStatus({ type: "error", message: error instanceof Error ? error.message : "Error creando FEKM." });
    } finally { setIsCreatingFekmOrganization(false); }
  }, [reloadReferenceEntities, resolveSelectedFekmEvent, selectedFekmEvent]);

  const createSelectedFekmEvent = useCallback(async (): Promise<void> => {
    if (!selectedFekmEvent) { setFekmEventStatus({ type: "error", message: "Selecciona primero un evento FEKM." }); return; }
    try {
      setIsCreatingFekmEvent(true);
      const response = await fetch(`${API_BASE_URL}/api/sources/fekm/events/create-event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, event: selectedFekmEvent }) });
      const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || payload.ok !== true) throw new Error(payload.error || "No se pudo crear el evento FEKM.");
      await reloadReferenceEntities();
      await resolveSelectedFekmEvent();
      setFekmEventStatus({ type: "success", message: payload.message || "Evento FEKM guardado como borrador." });
    } catch (error) {
      setFekmEventStatus({ type: "error", message: error instanceof Error ? error.message : "Error creando evento FEKM." });
    } finally { setIsCreatingFekmEvent(false); }
  }, [reloadReferenceEntities, resolveSelectedFekmEvent, selectedFekmEvent]);


  const orchestrateSelectedFekmEvent = useCallback(
    async (confirm: boolean): Promise<void> => {
      if (!selectedFekmEvent) {
        setFekmEventStatus({ type: "error", message: "Selecciona primero un evento FEKM." });
        return;
      }

      const confirmed =
        !confirm ||
        window.confirm(
          "Se crearán o completarán el evento FEKM, sus categorías y todos los participantes aptos. Los casos inseguros quedarán bloqueados para revisión. ¿Continuar?"
        );
      if (!confirmed) return;

      try {
        if (confirm) setIsPreparingFullFekmEvent(true);
        else setIsAnalyzingFullFekmEvent(true);
        setFekmEventStatus({ type: "idle", message: "" });

        const response = await fetch(
          `${API_BASE_URL}/api/sources/fekm/events/orchestrate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: selectedFekmEvent, confirm }),
          }
        );
        const payload = (await response.json()) as FekmEventOrchestration;
        if (!response.ok || !payload.ok) {
          throw new Error(!payload.ok && payload.error ? payload.error : "No se pudo preparar el evento FEKM completo.");
        }

        setFekmEventOrchestration(payload);
        if (confirm) {
          if (payload.participantsResult?.ok) registerPlannedFighterResolutions(payload.participantsResult);
          await reloadReferenceEntities();
          await resolveSelectedFekmEvent();
        }

        const summary = payload.summary;
        setFekmEventStatus({
          type: "success",
          message: confirm
            ? `Preparación FEKM: ${summary?.categoriesCreated ?? 0} categorías creadas y ${summary?.participantsPlanned ?? 0} identidades planificadas para resolver en /revision.`
            : `Documento asociado y lote analizados: ${summary?.extractedParticipants ?? 0} participantes detectados, ${summary?.participantsReadyBefore ?? 0} aptos inicialmente.`,
        });
      } catch (error) {
        setFekmEventStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Error preparando el evento FEKM completo.",
        });
      } finally {
        setIsAnalyzingFullFekmEvent(false);
        setIsPreparingFullFekmEvent(false);
      }
    },
    [reloadReferenceEntities, resolveSelectedFekmEvent, selectedFekmEvent]
  );

  const applySelectedFekmEventToForm = useCallback((): void => {
    if (!selectedFekmEvent) { setFekmEventStatus({ type: "error", message: "Selecciona primero un evento FEKM." }); return; }
    if (contentType !== "evento") { setFekmEventStatus({ type: "error", message: "Selecciona el tipo de contenido Evento." }); return; }
    const disciplineOption = findReferenceByLabel(referenceData.disciplina, selectedFekmEvent.disciplineLabel || "") || findReferenceByLabel(referenceData.disciplina, selectedFekmEvent.discipline === "muay_thai" ? "Muay Thai" : "Kick boxing");
    const organizationOption = findReferenceByLabel(referenceData.organizacion, "FEKM") || findReferenceByLabel(referenceData.organizacion, "Federación Española de Kickboxing y Muaythai");
    resetDerivedUiState();
    setForm((current) => {
      const next: ContentFormState = { ...current, nombre: selectedFekmEvent.name, fecha: toDateTimeLocalValue(selectedFekmEvent.startDate), horaLocal: selectedFekmEvent.timeText?.split("-")[0]?.trim() || "", ciudad: selectedFekmEvent.city || "", pais: selectedFekmEvent.country || (selectedFekmEvent.scope === "nacional" ? "España" : ""), recinto: selectedFekmEvent.venue || "", descripcionCorta: selectedFekmEvent.description || `Evento oficial FEKM de ${selectedFekmEvent.disciplineLabel || "deportes de combate"}.`, descripcion: selectedFekmEvent.description || `Evento oficial organizado por la Federación Española de Kickboxing y Muaythai. Fuente: ${selectedFekmEvent.canonicalUrl}`, notas: `Fuente oficial FEKM: ${selectedFekmEvent.canonicalUrl}`, estado: selectedFekmEvent.status };
      if (disciplineOption) next.disciplina = toReferenceValue(disciplineOption.value);
      if (organizationOption) next.organizacion = toReferenceValue(organizationOption.value);
      return clearInvalidDependentReferences(next, auxiliary, referenceData);
    });
    setFekmEventStatus({ type: "success", message: organizationOption ? "Evento FEKM cargado en el formulario." : "Evento cargado. Crea o selecciona FEKM como organización." });
  }, [auxiliary, contentType, referenceData, resetDerivedUiState, selectedFekmEvent]);

  const reloadOfficialOneEvents = useCallback(async (): Promise<void> => {
    const processId = "one-events-load";

    try {
      setIsLoadingOneEvents(true);

      startProcess({
        id: processId,
        label: "Cargando eventos ONE Championship",
        detail: "Consultando la fuente oficial",
      });

      setOneEventSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(
        `${API_BASE_URL}/api/sources/one/events?refresh=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json()) as OneOfficialEventsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudieron cargar los eventos oficiales de ONE Championship."
        );
      }

      setOneEventItems(payload.items);
      setOneEventsFetchedAt(payload.fetchedAt);
      setOneEventResolution(null);

      setSelectedOneEventId((currentId) =>
        payload.items.some((item) => item.id === currentId)
          ? currentId
          : ""
      );

      setOneEventSourceStatus({
        type: "success",
        message: `${payload.count} eventos oficiales de ONE Championship cargados.`,
      });

      notifyEventsLoaded({
        source: "ONE Championship",
        count: payload.count,
      });

      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido cargando los eventos oficiales de ONE Championship.";

      setOneEventItems([]);
      setSelectedOneEventId("");
      setOneEventsFetchedAt("");
      setOneEventResolution(null);
      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "cargar los eventos",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsLoadingOneEvents(false);
    }
  }, []);

  const requestOneEventResolution = useCallback(
    async (
      targetEvent: OneOfficialEventItem
    ): Promise<OneEventResolutionSuccess> => {
      const response = await fetch(
        `${API_BASE_URL}/api/sources/one/events/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ event: targetEvent }),
        }
      );

      const payload = (await response.json()) as OneEventResolution;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo resolver la cartelera ONE contra Sanity."
        );
      }

      return payload;
    },
    []
  );

  const resolveSelectedOneEvent = useCallback(
    async (
      eventOverride?: OneOfficialEventItem
    ): Promise<OneEventResolutionSuccess | null> => {
      const targetEvent = eventOverride ?? selectedOneEvent;

      if (!targetEvent) {
        setOneEventSourceStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de ONE Championship.",
        });
        return null;
      }

      const processId = "one-event-resolution";

      try {
        setIsResolvingOneEvent(true);

        startProcess({
          id: processId,
          label: "Resolviendo cartelera ONE Championship",
          detail: targetEvent.name,
        });

        setOneEventSourceStatus({
          type: "idle",
          message: "",
        });

        const resolution =
          await requestOneEventResolution(targetEvent);

        setOneEventResolution(resolution);

        setOneEventSourceStatus({
          type: "success",
          message: resolution.event.found
            ? `${resolution.counts.readyFights} combates listos, ${resolution.counts.existingFights} existentes y ${resolution.counts.pendingFights} pendientes.`
            : "Cartelera analizada. El evento todavía no existe en Sanity.",
        });

        notifyEventResolved({
          source: "ONE Championship",
          eventName: targetEvent.name,
          existingFights: resolution.counts.existingFights,
          pendingFights: resolution.counts.pendingFights,
          missingFighters: resolution.counts.missingFighters,
          unresolvedCategories: resolution.counts.unresolvedCategories,
          eventFound: resolution.event.found,
          location: {
            label: "Laboratorio → ONE Championship → Eventos",
            url: window.location.href,
          },
        });

        completeProcess(processId);

        return resolution;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido resolviendo la cartelera ONE Championship.";

        setOneEventResolution(null);
        setOneEventSourceStatus({
          type: "error",
          message,
        });

        notifyError({
          source: "ONE Championship",
          action: "resolver la cartelera",
          message,
          location: {
            label: "Laboratorio → ONE Championship → Eventos",
            url: window.location.href,
          },
        });

        failProcess(processId, message);

        return null;
      } finally {
        setIsResolvingOneEvent(false);
      }
    },
    [requestOneEventResolution, selectedOneEvent]
  );

  const runOneEventBulkAction = useCallback(
    async (
      path:
        | "create-event"
        | "create-categories"
        | "create-fighters"
        | "create-fights",
      targetEvent?: OneOfficialEventItem,
      fighterResolution?: FighterProducerResolutionContext
    ): Promise<UfcBulkActionResponse | FighterResolutionIntakeResponse | Record<string, unknown>> => {
      const body = path === "create-fighters" && targetEvent && fighterResolution ? fighterResolutionRequestBody(targetEvent, fighterResolution) : {
        confirm: true,
        event: targetEvent,
      };

      const response = await fetch(
        `${API_BASE_URL}/api/sources/one/events/${path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const payload = (await response.json()) as
        | UfcBulkActionResponse
        | FighterResolutionIntakeResponse
        | Record<string, unknown>;

      if (!response.ok || !("ok" in payload) || payload.ok !== true) {
        const error =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `No se pudo completar la acción ONE: ${path}.`;
        throw new Error(error);
      }

      return payload;
    },
    []
  );

  const createSelectedOneEvent = useCallback(async (): Promise<void> => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE Championship.",
      });
      return;
    }

    const processId = "one-create-event";

    try {
      setIsCreatingOneEvent(true);

      startProcess({
        id: processId,
        label: "Creando evento ONE Championship",
        detail: selectedOneEvent.name,
      });

      setOneEventSourceStatus({
        type: "success",
        message:
          "Transformando y guardando el evento ONE Championship como borrador...",
      });

      await runOneEventBulkAction(
        "create-event",
        selectedOneEvent
      );

      await reloadReferenceEntities();

      const resolution =
        await requestOneEventResolution(selectedOneEvent);

      setOneEventResolution(resolution);

      if (resolution.event.found) {
        setOneEventSourceStatus({
          type: "success",
          message:
            "Evento ONE Championship creado y reconocido correctamente en Sanity.",
        });

        notifyEventCreated({
          source: "ONE Championship",
          eventName: selectedOneEvent.name,
          location: {
            label: "Sanity Studio → Eventos",
            url: `${API_BASE_URL}/studio`,
          },
        });

        completeProcess(processId);
      } else {
        const message =
          "El evento se creó, pero todavía no aparece en la resolución.";

        setOneEventSourceStatus({
          type: "error",
          message,
        });

        notifyReviewRecommended({
          source: "ONE Championship",
          message: `${selectedOneEvent.name}: ${message}`,
          location: {
            label: "Laboratorio → ONE Championship → Eventos",
            url: window.location.href,
          },
        });

        failProcess(
          processId,
          "Evento creado, pero pendiente de resolver",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando el evento ONE Championship.";

      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "crear el evento",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingOneEvent(false);
    }
  }, [
    reloadReferenceEntities,
    requestOneEventResolution,
    runOneEventBulkAction,
    selectedOneEvent,
  ]);

  const createMissingOneCategories = useCallback(async (): Promise<void> => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE Championship.",
      });
      return;
    }

    const processId = "one-create-categories";

    try {
      setIsCreatingOneCategories(true);

      startProcess({
        id: processId,
        label: "Creando categorías ONE Championship",
        detail: selectedOneEvent.name,
      });

      const payload = (await runOneEventBulkAction(
        "create-categories",
        selectedOneEvent
      )) as UfcBulkActionResponse;

      if (!payload.summary) {
        throw new Error(
          "La respuesta de creación de categorías ONE no incluye resumen."
        );
      }

      const summary = payload.summary;

      await reloadReferenceEntities();

      const resolution =
        await requestOneEventResolution(selectedOneEvent);

      setOneEventResolution(resolution);

      setOneEventSourceStatus({
        type: summary.failed > 0 ? "error" : "success",
        message: `${summary.created} categorías creadas, ${summary.skipped} omitidas y ${summary.failed} fallidas.`,
      });

      notifyEntityBatchProcessed({
        source: "ONE Championship",
        entity: "category",
        created: summary.created,
        skipped: summary.skipped,
        failed: summary.failed,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      if (summary.failed > 0) {
        failProcess(
          processId,
          `${summary.failed} categorías fallidas`,
        );
      } else {
        completeProcess(processId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando categorías ONE Championship.";

      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "crear las categorías",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingOneCategories(false);
    }
  }, [
    reloadReferenceEntities,
    requestOneEventResolution,
    runOneEventBulkAction,
    selectedOneEvent,
  ]);

  const createMissingOneFighters = useCallback(async (): Promise<void> => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE Championship.",
      });
      return;
    }

    const processId = "one-create-fighters";

    try {
      setIsCreatingOneFighters(true);

      startProcess({
        id: processId,
        label: "Creando luchadores ONE Championship",
        detail: selectedOneEvent.name,
      });

      const resolution = await requestOneEventResolution(selectedOneEvent);
      const payload = (await runOneEventBulkAction(
        "create-fighters",
        selectedOneEvent,
        resolution
      )) as FighterResolutionIntakeResponse;

      if (!payload.summary) {
        throw new Error(
          "La respuesta de creación de luchadores ONE no incluye resumen."
        );
      }

      const registered = registerPlannedFighterResolutions(payload);
      setOneEventSourceStatus({
        type: "success",
        message: `${registered} solicitudes planificadas. Resolver identidad del luchador en el Centro de revisión.`,
      });
      completeProcess(processId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando luchadores ONE Championship.";

      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "crear los luchadores",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingOneFighters(false);
    }
  }, [
    requestOneEventResolution,
    runOneEventBulkAction,
    selectedOneEvent,
  ]);

  const createOneFights = useCallback(async (): Promise<void> => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE Championship.",
      });
      return;
    }

    const processId = "one-create-fights";

    try {
      setIsCreatingOneFights(true);

      startProcess({
        id: processId,
        label: "Creando combates ONE Championship",
        detail: selectedOneEvent.name,
      });

      const payload = (await runOneEventBulkAction(
        "create-fights",
        selectedOneEvent
      )) as UfcBulkActionResponse;

      if (!payload.summary) {
        throw new Error(
          "La respuesta de creación de combates ONE no incluye resumen."
        );
      }

      const summary = payload.summary;

      await reloadReferenceEntities();

      const resolution =
        await requestOneEventResolution(selectedOneEvent);

      setOneEventResolution(resolution);

      setOneEventSourceStatus({
        type: summary.failed > 0 ? "error" : "success",
        message: `${summary.created} combates creados, ${summary.skipped} omitidos y ${summary.failed} fallidos.`,
      });

      notifyEntityBatchProcessed({
        source: "ONE Championship",
        entity: "fight",
        created: summary.created,
        skipped: summary.skipped,
        failed: summary.failed,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      if (summary.failed > 0) {
        failProcess(
          processId,
          `${summary.failed} combates fallidos`,
        );
      } else {
        completeProcess(processId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido creando combates ONE Championship.";

      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "crear los combates",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsCreatingOneFights(false);
    }
  }, [
    reloadReferenceEntities,
    requestOneEventResolution,
    runOneEventBulkAction,
    selectedOneEvent,
  ]);

  const prepareFullOneCard = useCallback(async (): Promise<void> => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE Championship.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Se preparará la cartelera de “${selectedOneEvent.name}”: evento, categorías, luchadores y combates seguros. Las categorías que sigan sin mapeo quedarán pendientes. ¿Continuar?`
    );

    if (!confirmed) return;

    const processId = "one-full-card-preparation";

    try {
      setIsPreparingFullOneCard(true);

      startProcess({
        id: processId,
        label: "Preparando cartelera completa ONE Championship",
        detail: selectedOneEvent.name,
        current: 1,
        total: 5,
      });

      setOneEventSourceStatus({
        type: "success",
        message: "Paso 1 de 5: analizando la cartelera ONE Championship...",
      });

      let resolution =
        await requestOneEventResolution(selectedOneEvent);

      setOneEventResolution(resolution);

      if (!resolution.event.found) {
        updateProcess(processId, {
          current: 2,
          total: 5,
          detail: "Creando el evento",
        });

        setOneEventSourceStatus({
          type: "success",
          message: "Paso 2 de 5: creando el evento ONE Championship...",
        });

        await runOneEventBulkAction(
          "create-event",
          selectedOneEvent
        );

        await reloadReferenceEntities();

        resolution =
          await requestOneEventResolution(selectedOneEvent);

        setOneEventResolution(resolution);
      }

      if (resolution.counts.unresolvedCategories > 0) {
        updateProcess(processId, {
          current: 3,
          total: 5,
          detail: `Creando ${resolution.counts.unresolvedCategories} categorías`,
        });

        setOneEventSourceStatus({
          type: "success",
          message: `Paso 3 de 5: creando ${resolution.counts.unresolvedCategories} categorías de peso faltantes...`,
        });

        await runOneEventBulkAction(
          "create-categories",
          selectedOneEvent
        );

        await reloadReferenceEntities();

        resolution =
          await requestOneEventResolution(selectedOneEvent);

        setOneEventResolution(resolution);
      }

      if (resolution.counts.missingFighters > 0) {
        updateProcess(processId, {
          current: 4,
          total: 5,
          detail: `Creando ${resolution.counts.missingFighters} luchadores`,
        });

        setOneEventSourceStatus({
          type: "success",
          message: `Paso 4 de 5: creando ${resolution.counts.missingFighters} luchadores faltantes...`,
        });

        const intake = await runOneEventBulkAction(
          "create-fighters",
          selectedOneEvent,
          resolution
        ) as FighterResolutionIntakeResponse;
        const registered = registerPlannedFighterResolutions(intake);
        setOneEventSourceStatus({type: "success", message: `${registered} solicitudes planificadas. Flujo detenido hasta resolver identidad en /revision.`});
        completeProcess(processId);
        return;
      }

      if (resolution.counts.pendingFights > 0) {
        updateProcess(processId, {
          current: 5,
          total: 5,
          detail: `Creando ${resolution.counts.pendingFights} combates`,
        });

        setOneEventSourceStatus({
          type: "success",
          message: `Paso 5 de 5: creando ${resolution.counts.pendingFights} combates con categorías resueltas...`,
        });

        await runOneEventBulkAction(
          "create-fights",
          selectedOneEvent
        );

        await reloadReferenceEntities();

        resolution =
          await requestOneEventResolution(selectedOneEvent);

        setOneEventResolution(resolution);
      }

      const isComplete =
        resolution.event.found &&
        resolution.counts.missingFighters === 0 &&
        resolution.counts.pendingFights === 0 &&
        resolution.counts.unresolvedCategories === 0;

      setOneEventSourceStatus({
        type: isComplete ? "success" : "error",
        message: `Cartelera ONE Championship preparada: ${resolution.counts.existingFighters} luchadores, ${resolution.counts.existingFights} combates existentes, ${resolution.counts.pendingFights} combates pendientes y ${resolution.counts.unresolvedCategories} categorías sin resolver.`,
      });

      notifyEventResolved({
        source: "ONE Championship",
        eventName: selectedOneEvent.name,
        existingFights: resolution.counts.existingFights,
        pendingFights: resolution.counts.pendingFights,
        missingFighters: resolution.counts.missingFighters,
        unresolvedCategories: resolution.counts.unresolvedCategories,
        eventFound: resolution.event.found,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      if (isComplete) {
        completeProcess(processId);
      } else {
        failProcess(
          processId,
          `${resolution.counts.pendingFights} combates, ${resolution.counts.missingFighters} luchadores y ${resolution.counts.unresolvedCategories} categorías pendientes`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido preparando la cartelera ONE Championship.";

      setOneEventSourceStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "ONE Championship",
        action: "preparar la cartelera completa",
        message,
        location: {
          label: "Laboratorio → ONE Championship → Eventos",
          url: window.location.href,
        },
      });

      failProcess(processId, message);
    } finally {
      setIsPreparingFullOneCard(false);
    }
  }, [
    reloadReferenceEntities,
    requestOneEventResolution,
    runOneEventBulkAction,
    selectedOneEvent,
  ]);

  const applySelectedOneEventToForm = useCallback((): void => {
    if (!selectedOneEvent) {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de ONE.",
      });
      return;
    }

    if (contentType !== "evento") {
      setOneEventSourceStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Evento.",
      });
      return;
    }

    const disciplineOption =
      findReferenceByLabel(
        referenceData.disciplina,
        selectedOneEvent.primaryDisciplineLabel || ""
      ) ||
      findReferenceByLabel(referenceData.disciplina, "MMA") ||
      findReferenceByLabel(referenceData.disciplina, "Muay Thai") ||
      findReferenceByLabel(referenceData.disciplina, "Kickboxing");
    const organizationOption =
      findReferenceByLabel(referenceData.organizacion, "ONE Championship") ||
      findReferenceByLabel(referenceData.organizacion, "ONE");
    const eventDate = toDateTimeLocalValue(selectedOneEvent.startDate);

    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        nombre: selectedOneEvent.name,
        ciudad: selectedOneEvent.city || "",
        pais: selectedOneEvent.country || "",
        recinto: selectedOneEvent.venue || "",
        cartelPrincipal: selectedOneEvent.mainEvent || "",
        dondeVer: selectedOneEvent.watchText || "",
        descripcionCorta: selectedOneEvent.description || "",
        descripcion: selectedOneEvent.description || "",
        estado: selectedOneEvent.status,
      };

      if (eventDate) {
        nextForm.fecha = eventDate;
      }

      if (selectedOneEvent.imageUrl) {
        nextForm.imagen = selectedOneEvent.imageUrl;
      }

      if (disciplineOption) {
        nextForm.disciplina = toReferenceValue(disciplineOption.value);
      }

      if (organizationOption) {
        nextForm.organizacion = toReferenceValue(organizationOption.value);
      }

      return clearInvalidDependentReferences(
        nextForm,
        auxiliary,
        referenceData
      );
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      tipoEvento: "Evento oficial ONE",
      importanciaEditorial:
        selectedOneEvent.description ||
        "Evento oficial de ONE pendiente de revisión editorial.",
      combateEstelarTexto: selectedOneEvent.mainEvent || "",
      contextoCartelera: selectedOneEvent.description || "",
      clavesNarrativas: createEventEditorialInstructions(
        selectedOneEvent as unknown as UfcOfficialEventItem
      ).replace(/UFC/g, "ONE"),
      publicoObjetivo: "Aficionados a los deportes de combate",
      tono: "informativo, directo y editorial",
    }));

    setOneEventSourceStatus({
      type: "success",
      message:
        disciplineOption && organizationOption
          ? "Evento ONE cargado en el formulario con sus referencias."
          : "Evento ONE cargado. Revisa la disciplina detectada y la organización ONE Championship.",
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOneEvent,
  ]);



  const applyOfficialEventToForm = useCallback((): void => {
    if (!selectedOfficialEvent) {
      setOfficialEventSourceStatus({
        type: "error",
        message: "Selecciona primero un evento oficial de UFC.",
      });
      return;
    }

    if (contentType !== "evento") {
      setOfficialEventSourceStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Evento antes de pasar la fuente al formulario.",
      });
      return;
    }

    const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
    const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
    const eventDate = toDateTimeLocalValue(selectedOfficialEvent.startDate);

    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        nombre: selectedOfficialEvent.name,
        ciudad: selectedOfficialEvent.city || "",
        pais: selectedOfficialEvent.country || "",
        recinto: selectedOfficialEvent.venue || "",
        cartelPrincipal: selectedOfficialEvent.mainEvent || "",
        dondeVer: selectedOfficialEvent.watchText || "",
        descripcionCorta: selectedOfficialEvent.description || "",
        descripcion: selectedOfficialEvent.description || "",
        estado: selectedOfficialEvent.status,
      };

      if (eventDate) {
        nextForm.fecha = eventDate;
      }

      if (selectedOfficialEvent.imageUrl) {
        nextForm.imagen = selectedOfficialEvent.imageUrl;
      }

      if (mmaOption) {
        nextForm.disciplina = toReferenceValue(mmaOption.value);
      }

      if (ufcOption) {
        nextForm.organizacion = toReferenceValue(ufcOption.value);
      }

      return clearInvalidDependentReferences(
        nextForm,
        auxiliary,
        referenceData
      );
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      tipoEvento: selectedOfficialEvent.name.startsWith("UFC ")
        ? "Evento oficial UFC"
        : "Evento de deportes de combate",
      importanciaEditorial:
        selectedOfficialEvent.description ||
        "Evento oficial de UFC pendiente de revisión editorial.",
      combateEstelarTexto: selectedOfficialEvent.mainEvent || "",
      contextoCartelera: selectedOfficialEvent.description || "",
      clavesNarrativas: createEventEditorialInstructions(selectedOfficialEvent),
      publicoObjetivo: "Aficionados a los deportes de combate",
      tono: "informativo, directo y editorial",
    }));

    const missingRelations: string[] = [];

    if (!mmaOption) {
      missingRelations.push("MMA");
    }

    if (!ufcOption) {
      missingRelations.push("UFC");
    }

    setOfficialEventSourceStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Evento oficial cargado en el formulario con fecha, imagen, MMA y UFC."
          : `Evento cargado. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialEvent,
  ]);

  const transformOfficialEventToSpanish =
    useCallback(async (): Promise<void> => {
      if (!selectedOfficialEvent) {
        setOfficialEventSourceStatus({
          type: "error",
          message: "Selecciona primero un evento oficial de UFC.",
        });
        return;
      }

      if (contentType !== "evento") {
        setOfficialEventSourceStatus({
          type: "error",
          message:
            "Selecciona el tipo de contenido Evento antes de transformar la fuente.",
        });
        return;
      }

      try {
        setIsTransformingOfficialEvent(true);
        setOfficialEventSourceStatus({
          type: "idle",
          message: "",
        });

        const response = await fetch(`${API_BASE_URL}/api/transformar-evento`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(selectedOfficialEvent),
        });

        const payload = (await response.json()) as TransformEventApiResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            !payload.ok && payload.error
              ? payload.error
              : "No se pudo transformar el evento al español."
          );
        }

        const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
        const ufcOption = findReferenceByLabel(
          referenceData.organizacion,
          "UFC"
        );
        const eventDate = toDateTimeLocalValue(selectedOfficialEvent.startDate);

        resetDerivedUiState();

        setForm((currentForm) => {
          const nextForm: ContentFormState = {
            ...currentForm,
            nombre: payload.data.nombre,
            horaLocal: payload.data.horaLocal,
            ciudad: payload.data.ciudad,
            pais: payload.data.pais,
            recinto: payload.data.recinto,
            cartelPrincipal: payload.data.cartelPrincipal,
            dondeVer: payload.data.dondeVer,
            descripcionCorta: payload.data.descripcionCorta,
            descripcion: payload.data.descripcion,
            notas: payload.data.notas,
            estado: selectedOfficialEvent.status,
          };

          if (eventDate) {
            nextForm.fecha = eventDate;
          }

          if (selectedOfficialEvent.imageUrl) {
            nextForm.imagen = selectedOfficialEvent.imageUrl;
          }

          if (mmaOption) {
            nextForm.disciplina = toReferenceValue(mmaOption.value);
          }

          if (ufcOption) {
            nextForm.organizacion = toReferenceValue(ufcOption.value);
          }

          return clearInvalidDependentReferences(
            nextForm,
            auxiliary,
            referenceData
          );
        });

        setAuxiliary((currentAuxiliary) => ({
          ...currentAuxiliary,
          tipoEvento: "Evento oficial UFC",
          importanciaEditorial: payload.data.descripcionCorta,
          combateEstelarTexto: payload.data.cartelPrincipal,
          contextoCartelera: payload.data.descripcion,
          clavesNarrativas: createEventEditorialInstructions(
            selectedOfficialEvent
          ),
          publicoObjetivo: "Aficionados a los deportes de combate",
          tono: "informativo, directo y editorial",
        }));

        const missingRelations: string[] = [];

        if (!mmaOption) {
          missingRelations.push("MMA");
        }

        if (!ufcOption) {
          missingRelations.push("UFC");
        }

        setOfficialEventSourceStatus({
          type: "success",
          message:
            missingRelations.length === 0
              ? "Evento transformado al español y cargado en el formulario con fecha, imagen, MMA y UFC."
              : `Evento transformado. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
                  ", "
                )}.`,
        });
      } catch (error) {
        setOfficialEventSourceStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Error desconocido transformando el evento al español.",
        });
      } finally {
        setIsTransformingOfficialEvent(false);
      }
    }, [
      auxiliary,
      contentType,
      referenceData,
      resetDerivedUiState,
      selectedOfficialEvent,
    ]);

  const transformOfficialNewsToSpanish = useCallback(async (): Promise<void> => {
    if (!selectedOfficialNews) {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de UFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOfficialSourceStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Noticia antes de transformar la fuente.",
      });
      return;
    }

    try {
      setIsTransformingOfficialNews(true);
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-noticia`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          title: selectedOfficialNews.title,
          summary: selectedOfficialNews.summary,
          bodyText: selectedOfficialNews.bodyText,
          sourceUrl:
            selectedOfficialNews.canonicalUrl || selectedOfficialNews.sourceUrl,
        }),
      });

      const payload = (await response.json()) as TransformNewsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la noticia al español."
        );
      }

      const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
      const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
      const publicationDate = toDateTimeLocalValue(
        selectedOfficialNews.publishedAt
      );
      const relationResolution = resolveSuggestedNewsRelations({
        suggestions: payload.data.relacionesSugeridas,
        referenceData,
      });

      setNewsRelationsResolution(relationResolution);
      resetDerivedUiState();

      setForm((currentForm) => {
        const nextForm: ContentFormState = {
          ...currentForm,
          titulo: payload.data.titulo,
          extracto: payload.data.extracto,
          contenido: payload.data.contenido,
          fuente: "ufc",
          fuenteUrl:
            selectedOfficialNews.canonicalUrl ||
            selectedOfficialNews.sourceUrl,
          fuenteId: selectedOfficialNews.id,
          destacada: false,
        };

        if (publicationDate) {
          nextForm.fechaPublicacion = publicationDate;
        }

        if (selectedOfficialNews.imageUrl) {
          nextForm.imagenPrincipal = selectedOfficialNews.imageUrl;
        }

        if (relationResolution.resolved.disciplina) {
          nextForm.disciplina = toReferenceValue(
            relationResolution.resolved.disciplina.value
          );
        } else if (mmaOption) {
          nextForm.disciplina = toReferenceValue(mmaOption.value);
        }

        if (relationResolution.resolved.organizacion) {
          nextForm.organizacionRelacionada = toReferenceValue(
            relationResolution.resolved.organizacion.value
          );
        } else if (ufcOption) {
          nextForm.organizacionRelacionada = toReferenceValue(ufcOption.value);
        }

        if (relationResolution.resolved.evento) {
          nextForm.eventoRelacionado = toReferenceValue(
            relationResolution.resolved.evento.value
          );
        } else {
          nextForm.eventoRelacionado = undefined;
        }

        nextForm.luchadoresRelacionados =
          relationResolution.resolved.luchadores.map((fighter) =>
            toReferenceValue(fighter.value)
          );

        return clearInvalidDependentReferences(
          nextForm,
          auxiliary,
          referenceData
        );
      });

      setAuxiliary((currentAuxiliary) => ({
        ...currentAuxiliary,
        anguloEditorial:
          "Noticia reescrita en español desde una fuente oficial de UFC con enfoque propio de Full Fight News.",
        hechoPrincipal: payload.data.extracto,
        contextoPrevio:
          selectedOfficialNews.bodyText?.trim() ||
          selectedOfficialNews.summary?.trim() ||
          selectedOfficialNews.title,
        tono: "informativo, directo y periodístico",
        seoObjetivo: payload.data.titulo,
        instruccionesRedaccion: createEditorialInstructions(
          selectedOfficialNews
        ),
      }));

      const unresolvedCount =
        relationResolution.unresolved.luchadores.length +
        (relationResolution.unresolved.evento ? 1 : 0) +
        (relationResolution.unresolved.organizacion ? 1 : 0) +
        (relationResolution.unresolved.disciplina ? 1 : 0);

      const resolvedRelationCount =
        relationResolution.resolved.luchadores.length +
        (relationResolution.resolved.evento ? 1 : 0) +
        (relationResolution.resolved.organizacion ? 1 : 0) +
        (relationResolution.resolved.disciplina ? 1 : 0);

      setOfficialSourceStatus({
        type: "success",
        message:
          unresolvedCount === 0
            ? `Noticia transformada y relacionada automáticamente: ${resolvedRelationCount} referencias reales resueltas y trazabilidad UFC añadida.`
            : `Noticia transformada: ${resolvedRelationCount} referencias resueltas, ${unresolvedCount} sugerencias pendientes y trazabilidad UFC añadida.`,
      });
    } catch (error) {
      setOfficialSourceStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la noticia al español.",
      });
    } finally {
      setIsTransformingOfficialNews(false);
    }
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialNews,
  ]);

  const applyOfficialNewsToForm = useCallback((): void => {
    if (!selectedOfficialNews) {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona primero una noticia oficial de UFC.",
      });
      return;
    }

    if (contentType !== "noticia") {
      setOfficialSourceStatus({
        type: "error",
        message: "Selecciona el tipo de contenido Noticia antes de pasar la fuente al formulario.",
      });
      return;
    }

    const mmaOption = findReferenceByLabel(referenceData.disciplina, "MMA");
    const ufcOption = findReferenceByLabel(referenceData.organizacion, "UFC");
    const officialSummary =
      selectedOfficialNews.summary?.trim() ||
      createSourceExtract(selectedOfficialNews) ||
      selectedOfficialNews.title;
    const officialBody =
      selectedOfficialNews.bodyText?.trim() ||
      selectedOfficialNews.summary?.trim() ||
      selectedOfficialNews.title;
    const publicationDate = toDateTimeLocalValue(selectedOfficialNews.publishedAt);

    setNewsRelationsResolution(null);
    resetDerivedUiState();

    setForm((currentForm) => {
      const nextForm: ContentFormState = {
        ...currentForm,
        titulo: selectedOfficialNews.title,
        extracto: createSourceExtract(selectedOfficialNews),
        contenido: officialBody,
        fuente: "ufc",
        fuenteUrl:
          selectedOfficialNews.canonicalUrl ||
          selectedOfficialNews.sourceUrl,
        fuenteId: selectedOfficialNews.id,
        destacada: false,
      };

      if (publicationDate) {
        nextForm.fechaPublicacion = publicationDate;
      }

      if (selectedOfficialNews.imageUrl) {
        nextForm.imagenPrincipal = selectedOfficialNews.imageUrl;
      }

      if (mmaOption) {
        nextForm.disciplina = toReferenceValue(mmaOption.value);
      }

      if (ufcOption) {
        nextForm.organizacionRelacionada = toReferenceValue(ufcOption.value);
      }

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });

    setAuxiliary((currentAuxiliary) => ({
      ...currentAuxiliary,
      anguloEditorial:
        "Reescritura informativa en español a partir de una fuente oficial de UFC, con enfoque propio de Full Fight News.",
      hechoPrincipal: officialSummary,
      contextoPrevio: officialBody,
      tono: "informativo, directo y periodístico",
      seoObjetivo: selectedOfficialNews.title,
      instruccionesRedaccion: createEditorialInstructions(selectedOfficialNews),
    }));

    const missingRelations: string[] = [];

    if (!mmaOption) {
      missingRelations.push("MMA");
    }

    if (!ufcOption) {
      missingRelations.push("UFC");
    }

    setOfficialSourceStatus({
      type: "success",
      message:
        missingRelations.length === 0
          ? "Noticia oficial cargada y mapeada: contenido, relaciones y trazabilidad UFC listas para generar el output."
          : `Noticia cargada. Revisa manualmente estas referencias no encontradas en Sanity: ${missingRelations.join(
              ", "
            )}.`,
    });
  }, [
    auxiliary,
    contentType,
    referenceData,
    resetDerivedUiState,
    selectedOfficialNews,
  ]);


  const transformOrganizationWithAI = useCallback(async (): Promise<void> => {
    if (contentType !== "organizacion") {
      setOrganizationAutomationStatus({
        type: "error",
        message:
          "Selecciona el tipo de contenido Organización antes de automatizar esta ficha.",
      });
      return;
    }

    const nombre = getStringValue(form.nombre);

    if (!nombre) {
      setOrganizationAutomationStatus({
        type: "error",
        message: "Introduce primero el nombre de la organización.",
      });
      return;
    }

    const existingOrganization = findReferenceBySuggestedLabel(
      referenceData.organizacion,
      nombre
    );

    if (existingOrganization) {
      setOrganizationAutomationStatus({
        type: "error",
        message: `Ya existe una organización en Sanity con coincidencia fuerte: ${existingOrganization.label}. Revisa antes de crear duplicados.`,
      });
      return;
    }

    const disciplinaRefs = getReferenceArrayValues(form.disciplinas);
    const disciplinas = disciplinaRefs
      .map((ref) => referenceData.disciplina.find((item) => item.value === ref)?.label)
      .filter((item): item is string => Boolean(item));

    try {
      setIsTransformingOrganization(true);
      setOrganizationAutomationStatus({
        type: "idle",
        message: "",
      });

      const response = await fetch(`${API_BASE_URL}/api/transformar-organizacion`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          nombre,
          descripcionCorta: getStringValue(form.descripcionCorta),
          descripcion: getStringValue(form.descripcion),
          paisOrigen: getStringValue(form.paisOrigen),
          sede: getStringValue(form.sede),
          anioFundacion: form.anioFundacion,
          identidad: getStringValue(form.identidad),
          datosCuriosos: getStringValue(form.datosCuriosos),
          sitioWeb: getStringValue(form.sitioWeb),
          disciplinas,
          enfoqueEditorial: getStringValue(auxiliary.enfoqueEditorial),
          rasgosDiferenciales: getStringValue(auxiliary.rasgosDiferenciales),
          contextoHistorico: getStringValue(auxiliary.contextoHistorico),
          tono: getStringValue(auxiliary.tono),
        }),
      });

      const payload = (await response.json()) as TransformOrganizationApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && payload.error
            ? payload.error
            : "No se pudo transformar la organización."
        );
      }

      resetDerivedUiState();

      setForm((currentForm) => ({
        ...currentForm,
        descripcionCorta: payload.data.descripcionCorta,
        descripcion: payload.data.descripcion,
        paisOrigen: payload.data.paisOrigen || getStringValue(currentForm.paisOrigen),
        sede: payload.data.sede || getStringValue(currentForm.sede),
        anioFundacion:
          typeof payload.data.anioFundacion === "number"
            ? payload.data.anioFundacion
            : currentForm.anioFundacion,
        identidad: payload.data.identidad,
        datosCuriosos: payload.data.datosCuriosos.join("\n"),
        activa: true,
      }));

      setOrganizationAutomationStatus({
        type: "success",
        message:
          "Organización transformada y preparada como ficha editorial. Revisa el logo/banner y genera el output antes de guardar.",
      });
    } catch (error) {
      setOrganizationAutomationStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error desconocido transformando la organización.",
      });
    } finally {
      setIsTransformingOrganization(false);
    }
  }, [
    auxiliary,
    contentType,
    form,
    referenceData,
    resetDerivedUiState,
  ]);

  useEffect(() => {
    const nextState = getInitialFormState(contentType);
    setForm(nextState.form);
    setAuxiliary(nextState.auxiliary);
    setResult(null);
    setSaveDraftStatus({
      type: "idle",
      message: "",
    });

    if (contentType !== "organizacion") {
      setOrganizationAutomationStatus({
        type: "idle",
        message: "",
      });
    }

    if (contentType !== "noticia") {
      setSelectedOfficialNewsId("");
      setOfficialSourceStatus({
        type: "idle",
        message: "",
      });
      setSelectedBkfcNewsId("");
      setBkfcNewsStatus({
        type: "idle",
        message: "",
      });
      setBkfcNewsRelationsResolution(null);
    }

    if (contentType !== "evento") {
      setSelectedOfficialEventId("");
      setOfficialEventSourceStatus({
        type: "idle",
        message: "",
      });
      setUfcEventResolution(null);
      setUfcAutomationStatus({
        type: "idle",
        message: "",
      });
    }
  }, [contentType]);

  useEffect(() => {
    void reloadReferenceEntities();
  }, [reloadReferenceEntities]);

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void reloadReferenceEntities();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reloadReferenceEntities]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reloadReferenceEntities();
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [reloadReferenceEntities]);

  const visibleSchemaFields = useMemo(
    () => definition.schemaFields.filter((field) => !shouldHideField(field, form)),
    [definition.schemaFields, form]
  );

  function updateFormField(
    field: SchemaFieldDefinition,
    rawValue: string | boolean
  ): void {
    const { name, kind } = field;

    let nextValue: FormValue;

    switch (kind) {
      case "boolean":
        nextValue = typeof rawValue === "boolean" ? rawValue : false;
        break;
      case "number":
        nextValue =
          typeof rawValue === "string" && rawValue.trim() !== ""
            ? Number(rawValue)
            : undefined;
        break;
      case "slug":
        nextValue = {
          current: typeof rawValue === "string" ? rawValue : "",
        };
        break;
      case "reference":
        nextValue =
          typeof rawValue === "string" && rawValue.trim()
            ? toReferenceValue(rawValue.trim())
            : undefined;
        break;
      case "referenceArray":
        nextValue =
          typeof rawValue === "string"
            ? parseReferenceArrayInput(rawValue).map(toReferenceValue)
            : [];
        break;
      case "portableText":
        nextValue = typeof rawValue === "string" ? rawValue : "";
        break;
      case "image":
        nextValue = typeof rawValue === "string" ? rawValue.trim() : "";
        break;
      case "datetime":
      case "string":
      case "text":
      default:
        nextValue = typeof rawValue === "string" ? rawValue : "";
        break;
    }

    resetDerivedUiState();

    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: nextValue,
      };

      return FIELDS_THAT_TRIGGER_CLEANUP.has(name)
        ? clearInvalidDependentReferences(nextForm, auxiliary, referenceData)
        : nextForm;
    });
  }

  function updateReferenceArrayField(
    field: SchemaFieldDefinition,
    refValue: string,
    checked: boolean
  ): void {
    resetDerivedUiState();

    setForm((prev) => {
      const currentValues = getReferenceArrayValues(prev[field.name]);

      const nextValues = checked
        ? Array.from(new Set([...currentValues, refValue]))
        : currentValues.filter((value) => value !== refValue);

      const nextForm = {
        ...prev,
        [field.name]: nextValues.map(toReferenceValue),
      };

      return clearInvalidDependentReferences(nextForm, auxiliary, referenceData);
    });
  }

  function updateAuxiliaryField(
    name: string,
    kind: "string" | "text" | "boolean" | "reference",
    rawValue: string | boolean
  ): void {
    resetDerivedUiState();

    setAuxiliary((prev) => {
      const nextValue =
        kind === "boolean"
          ? Boolean(rawValue)
          : kind === "reference"
          ? typeof rawValue === "string" && rawValue.trim()
            ? toReferenceValue(rawValue.trim())
            : undefined
          : String(rawValue);

      const nextAuxiliary = {
        ...prev,
        [name]: nextValue,
      };

      if (FIELDS_THAT_TRIGGER_CLEANUP.has(name)) {
        setForm((currentForm) =>
          clearInvalidDependentReferences(currentForm, nextAuxiliary, referenceData)
        );
      }

      return nextAuxiliary;
    });
  }

  function handleBuild(): void {
    const buildResult = buildContentOutput({
      contentType,
      form,
      auxiliary,
    });

    setResult({
      ok: buildResult.ok,
      output: buildResult.output as Record<string, unknown> | null,
      issues: buildResult.issues,
    });

    setSaveDraftStatus({
      type: "idle",
      message: "",
    });
  }

  async function handleSaveDraft(): Promise<void> {
    const contentLabel = definition.label;
    const laboratoryLocation = {
      label: `Laboratorio → ${contentLabel}`,
      url: window.location.href,
    };

    if (!result) {
      const message = "Primero genera el output antes de guardar.";

      setSaveDraftStatus({
        type: "error",
        message,
      });

      notifyReviewRecommended({
        source: "Laboratorio",
        message: `${contentLabel}: ${message}`,
        location: laboratoryLocation,
      });

      return;
    }

    if (!result.ok || !result.output) {
      const message =
        "El output está bloqueado o vacío. Revisa los campos señalados.";

      setSaveDraftStatus({
        type: "error",
        message,
      });

      notifyReviewRecommended({
        source: "Laboratorio",
        message: `${contentLabel}: ${message}`,
        location: laboratoryLocation,
      });

      return;
    }

    try {
      setIsSavingDraft(true);
      setSaveDraftStatus({
        type: "idle",
        message: "",
      });

      const response = await saveDraft({
        contentType,
        document: result.output,
      });

      const successMessage =
        response.message ||
        `${contentLabel} guardado correctamente como borrador.`;

      setSaveDraftStatus({
        type: "success",
        message:
          successMessage +
          (response.documentId ? ` (${response.documentId})` : ""),
      });

      if (contentType === "evento") {
        const eventName =
          typeof result.output.nombre === "string" &&
          result.output.nombre.trim()
            ? result.output.nombre.trim()
            : contentLabel;

        notifyEventCreated({
          source: "Sanity",
          eventName,
          location: {
            label: "Sanity Studio → Eventos",
            url: `${API_BASE_URL}/studio`,
          },
        });
      } else {
        notifyDraftCreated({
          source: "Sanity",
          count: 1,
          location: {
            label: `Sanity Studio → ${contentLabel}`,
            url: `${API_BASE_URL}/studio`,
          },
        });
      }

      await reloadReferenceEntities();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error desconocido al guardar el borrador.";

      setSaveDraftStatus({
        type: "error",
        message,
      });

      notifyError({
        source: "Laboratorio",
        action: `guardar ${contentLabel.toLowerCase()}`,
        message,
        location: laboratoryLocation,
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  function renderReferenceSelect(
    field: SchemaFieldDefinition,
    referenceTarget: ReferenceTarget,
    value: FormValue
  ): ReactElement {
    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    const currentValue = getReferenceValue(value);
    const disabled = isLoadingReferences || referenceOptions.length === 0;

    return (
      <>
        <select
          value={currentValue}
          onChange={(event) => updateFormField(field, event.target.value)}
          style={styles.input}
          disabled={disabled}
        >
          <option value="">
            {isLoadingReferences
              ? "Cargando referencias..."
              : getReferencePlaceholder(referenceTarget)}
          </option>
          {referenceOptions.map((option) => (
            <option key={`${field.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!isLoadingReferences && referenceOptions.length === 0 ? (
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        ) : null}
      </>
    );
  }

  function renderAuxiliaryReferenceSelect(input: {
    name: string;
    label: string;
    referenceTo?: ReferenceTarget;
  }): ReactElement {
    const referenceTarget = input.referenceTo;

    if (!referenceTarget) {
      return (
        <input
          type="text"
          value={getReferenceValue(auxiliary[input.name])}
          onChange={(event) =>
            updateAuxiliaryField(input.name, "reference", event.target.value)
          }
          style={styles.input}
          placeholder="ID de referencia de Sanity"
        />
      );
    }

    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    const currentValue = getReferenceValue(auxiliary[input.name]);
    const disabled = isLoadingReferences || referenceOptions.length === 0;

    return (
      <>
        <select
          value={currentValue}
          onChange={(event) =>
            updateAuxiliaryField(input.name, "reference", event.target.value)
          }
          style={styles.input}
          disabled={disabled}
        >
          <option value="">
            {isLoadingReferences
              ? "Cargando referencias..."
              : getReferencePlaceholder(referenceTarget)}
          </option>
          {referenceOptions.map((option) => (
            <option key={`${input.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!isLoadingReferences && referenceOptions.length === 0 ? (
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        ) : null}
      </>
    );
  }

  function renderReferenceArray(
    field: SchemaFieldDefinition,
    referenceTarget: ReferenceTarget,
    value: FormValue
  ): ReactElement {
    const referenceOptions = getFilteredReferenceEntityOptionsFromApiData({
      target: referenceTarget,
      filters: filterContext,
      referenceData,
    });

    if (isLoadingReferences) {
      return (
        <div style={styles.referenceArrayGroup}>
          <p style={styles.inlineEmptyState}>Cargando referencias...</p>
        </div>
      );
    }

    if (referenceOptions.length === 0) {
      return (
        <div style={styles.referenceArrayGroup}>
          <p style={styles.inlineEmptyState}>
            {getReferenceEmptyStateMessage(referenceTarget, filterContext)}
          </p>
        </div>
      );
    }

    const selectedValues = getReferenceArrayValues(value);

    return (
      <div style={styles.referenceArrayGroup}>
        {referenceOptions.map((option) => {
          const checked = selectedValues.includes(option.value);

          return (
            <label
              key={`${field.name}-${option.value}`}
              style={styles.referenceCheckboxRow}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  updateReferenceArrayField(
                    field,
                    option.value,
                    event.target.checked
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  function renderField(field: SchemaFieldDefinition): ReactElement {
    const value = form[field.name];
    const referenceTarget = field.referenceTo;

    switch (field.kind) {
      case "boolean":
        return (
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={getBooleanValue(value)}
              onChange={(event) => updateFormField(field, event.target.checked)}
            />
            <span>{field.label}</span>
          </label>
        );

      case "number":
        return (
          <input
            type="number"
            value={getNumberValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );

      case "slug":
        return (
          <input
            type="text"
            value={
              value && typeof value === "object" && "current" in value
                ? ((value as { current?: unknown }).current as string) ?? ""
                : ""
            }
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="slug-manual-opcional"
          />
        );

      case "reference":
        if (referenceTarget) {
          return renderReferenceSelect(field, referenceTarget, value);
        }

        return (
          <input
            type="text"
            value={getReferenceValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="ID de referencia de Sanity"
          />
        );

      case "referenceArray":
        if (referenceTarget) {
          return renderReferenceArray(field, referenceTarget, value);
        }

        return (
          <textarea
            value={getReferenceArrayValues(value).join("\n")}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
            placeholder="Un _ref por línea"
          />
        );

      case "portableText":
        return (
          <textarea
            value={getPortableTextEditorValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
            placeholder="Escribe el contenido principal..."
          />
        );

      case "text":
        return (
          <textarea
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            rows={getTextAreaRows(field.kind, field.rows)}
            style={styles.textarea}
          />
        );

      case "image":
        return (
          <input
            type="text"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
            placeholder="Valor temporal o referencia de imagen"
          />
        );

      case "datetime":
        return (
          <input
            type="datetime-local"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );

      case "string":
      default:
        if (field.options && field.options.length > 0) {
          return (
            <select
              value={getStringValue(value)}
              onChange={(event) => updateFormField(field, event.target.value)}
              style={styles.input}
            >
              <option value="">Selecciona una opción</option>
              {field.options.map((option) => (
                <option key={`${field.name}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }

        return (
          <input
            type="text"
            value={getStringValue(value)}
            onChange={(event) => updateFormField(field, event.target.value)}
            style={styles.input}
          />
        );
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>FFN3 · Laboratorio IA</p>
            <h1 style={styles.title}>Panel editorial de borradores</h1>
            <p style={styles.description}>
              Genera una salida alineada con los schemas reales de Sanity antes de
              pensar en guardado.
            </p>
          </div>

          <div style={styles.headerActions}>
            <label style={styles.label}>
              Tipo de contenido
              <select
                value={contentType}
                onChange={(event) =>
                  setContentType(event.target.value as ContentTypeId)
                }
                style={styles.input}
              >
                {contentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={styles.actionButtons}>
              <button type="button" onClick={handleBuild} style={styles.button}>
                Generar output
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleSaveDraft();
                }}
                style={canSaveDraft ? styles.secondaryButton : styles.buttonDisabled}
                disabled={!canSaveDraft}
              >
                {isSavingDraft ? "Guardando..." : "Guardar borrador"}
              </button>
            </div>

            {isLoadingReferences ? (
              <div style={styles.feedbackNeutral}>
                Actualizando referencias desde Sanity...
              </div>
            ) : null}

            {referenceLoadError ? (
              <div style={styles.feedbackError}>{referenceLoadError}</div>
            ) : null}

            {saveDraftStatus.type !== "idle" ? (
              <div
                style={
                  saveDraftStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {saveDraftStatus.message}
              </div>
            ) : null}
          </div>
        </header>

        <section style={styles.metaCard}>
          <strong>{definition.label}</strong>
          <p style={styles.metaText}>{definition.description}</p>
        </section>

        {contentType === "organizacion" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Automatización de entidad</p>
                <h2 style={styles.sectionTitle}>Ficha de organización</h2>
                <p style={styles.metaText}>
                  Escribe el nombre, elige disciplina y añade los datos seguros que tengas.
                  La IA completa la ficha editorial sin crear duplicados si detecta una organización existente.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void transformOrganizationWithAI();
                }}
                style={
                  isTransformingOrganization
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isTransformingOrganization}
              >
                {isTransformingOrganization
                  ? "Preparando organización..."
                  : "Preparar ficha con IA"}
              </button>
            </div>

            {organizationAutomationStatus.type !== "idle" ? (
              <div
                style={
                  organizationAutomationStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {organizationAutomationStatus.message}
              </div>
            ) : null}

            <p style={styles.metaText}>
              Criterio: no inventar logo ni banner. Si ya existe una coincidencia fuerte en Sanity,
              el panel bloqueará la automatización para evitar duplicados.
            </p>
          </section>
        ) : null}

        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuente oficial conectada</p>
                <h2 style={styles.sectionTitle}>Bandeja de noticias UFC</h2>
                <p style={styles.metaText}>
                  Selecciona una noticia oficial, pásala al formulario y edítala
                  antes de generar el borrador de Full Fight News.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialUfcNews();
                }}
                style={
                  isLoadingOfficialNews
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingOfficialNews}
              >
                {isLoadingOfficialNews
                  ? "Actualizando UFC..."
                  : officialNewsItems.length > 0
                  ? "Actualizar noticias UFC"
                  : "Cargar noticias UFC"}
              </button>
            </div>

            {officialSourceStatus.type !== "idle" ? (
              <div
                style={
                  officialSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {officialSourceStatus.message}
              </div>
            ) : null}

            {officialNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta:{" "}
                {new Date(officialNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {officialNewsItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>
                      Noticias oficiales UFC
                    </h3>
                    <p style={styles.metaText}>
                      Comprueba cuáles ya existen, cuáles son nuevas y aptas,
                      y cuáles necesitan revisión antes de transformar.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeOfficialUfcNews();
                      }}
                      style={
                        isAnalyzingUfcNewsBatch ||
                        isPreparingUfcNewsBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={
                        isAnalyzingUfcNewsBatch ||
                        isPreparingUfcNewsBatch
                      }
                    >
                      {isAnalyzingUfcNewsBatch
                        ? "Analizando noticias..."
                        : "Analizar noticias UFC"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleUfcNews();
                      }}
                      style={
                        isPreparingUfcNewsBatch ||
                        !ufcNewsBatchAnalysis?.ok ||
                        ufcNewsBatchAnalysis.summary.ready === 0
                          ? styles.buttonDisabled
                          : styles.primaryButton
                      }
                      disabled={
                        isPreparingUfcNewsBatch ||
                        isAnalyzingUfcNewsBatch ||
                        !ufcNewsBatchAnalysis?.ok ||
                        ufcNewsBatchAnalysis.summary.ready === 0
                      }
                    >
                      {isPreparingUfcNewsBatch
                        ? "Preparando noticias nuevas..."
                        : `Preparar ${ufcNewsBatchAnalysis?.ok ? ufcNewsBatchAnalysis.summary.ready : 0} nuevas aptas`}
                    </button>
                  </div>
                </div>

                {ufcNewsBatchStatus.type !== "idle" ? (
                  <div
                    aria-live="polite"
                    style={
                      ufcNewsBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {ufcNewsBatchStatus.message}
                  </div>
                ) : null}

                {ufcNewsBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {ufcNewsBatchPreparation.map((item) => (
                      <div
                        key={item.sourceId}
                        style={styles.batchProgressItem}
                      >
                        <div style={styles.batchProgressText}>
                          <strong>{item.title}</strong>
                          <span style={styles.batchItemMeta}>
                            {item.message}
                          </span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {ufcNewsBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Ya existen
                        </span>
                        <strong>
                          {ufcNewsBatchAnalysis.summary.existing}
                        </strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Nuevas aptas
                        </span>
                        <strong>
                          {ufcNewsBatchAnalysis.summary.ready}
                        </strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Sin contenido
                        </span>
                        <strong>
                          {ufcNewsBatchAnalysis.summary.withoutContent}
                        </strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Requieren revisión
                        </span>
                        <strong>
                          {ufcNewsBatchAnalysis.summary.requiresReview}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {(showAllUfcNewsBatchItems
                        ? ufcNewsBatchAnalysis.items
                        : ufcNewsBatchAnalysis.items.slice(0, 6)
                      ).map((item) => {
                        const sourceItem = officialNewsItems.find(
                          (newsItem) => newsItem.id === item.sourceId
                        );

                        return (
                          <div key={item.sourceId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.title}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.status === "existente"
                                  ? "Ya existe en Sanity"
                                  : item.status === "nueva_apta"
                                  ? "Nueva y apta para transformar"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido suficiente"
                                  : "Requiere revisión"}
                                {item.matchStrategy
                                  ? ` · coincidencia por ${item.matchStrategy}`
                                  : ""}
                              </span>

                              {item.reasons.length > 0 ? (
                                <span style={styles.batchError}>
                                  {item.reasons.join(" · ")}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "existente"
                                    ? styles.batchStatusOk
                                    : item.status === "nueva_apta"
                                    ? styles.batchStatusPending
                                    : styles.batchStatusError
                                }
                              >
                                {item.status === "existente"
                                  ? "Existente"
                                  : item.status === "nueva_apta"
                                  ? "Nueva apta"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido"
                                  : "Revisar"}
                              </span>

                              {sourceItem ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOfficialNewsId(sourceItem.id);
                                    setNewsRelationsResolution(null);
                                    setOfficialSourceStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingUfcNewsBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingUfcNewsBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {ufcNewsBatchAnalysis.items.length > 6 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllUfcNewsBatchItems((current) => !current)
                        }
                        style={styles.tertiaryButton}
                      >
                        {showAllUfcNewsBatchItems
                          ? "Mostrar menos noticias"
                          : `Ver las ${ufcNewsBatchAnalysis.items.length} noticias analizadas`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {officialNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {officialNewsItems.map((item) => {
                    const isSelected = item.id === selectedOfficialNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOfficialNewsId(item.id);
                          setNewsRelationsResolution(null);
                          setOfficialSourceStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.summary ? (
                          <span style={styles.sourceItemSummary}>
                            {item.summary}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOfficialNews ? (
                    <>
                      {selectedOfficialNews.imageUrl ? (
                        <img
                          src={selectedOfficialNews.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Noticia seleccionada</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOfficialNews.title}
                        </h3>

                        {selectedOfficialNews.summary ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedOfficialNews.summary}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyOfficialNewsToForm}
                            style={styles.button}
                            disabled={isTransformingOfficialNews}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformOfficialNewsToSpanish();
                            }}
                            style={
                              isTransformingOfficialNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingOfficialNews}
                          >
                            {isTransformingOfficialNews
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedOfficialNews.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        {newsRelationsResolution ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>
                                  Relaciones editoriales sugeridas
                                </p>
                                <strong>
                                  Coincidencias reales encontradas en Sanity
                                </strong>
                              </div>

                              <span
                                style={
                                  newsRelationsResolution.unresolved.luchadores
                                    .length > 0 ||
                                  newsRelationsResolution.unresolved.evento ||
                                  newsRelationsResolution.unresolved
                                    .organizacion ||
                                  newsRelationsResolution.unresolved.disciplina
                                    ? styles.batchStatusPending
                                    : styles.batchStatusOk
                                }
                              >
                                {newsRelationsResolution.unresolved.luchadores
                                  .length > 0 ||
                                newsRelationsResolution.unresolved.evento ||
                                newsRelationsResolution.unresolved
                                  .organizacion ||
                                newsRelationsResolution.unresolved.disciplina
                                  ? "Revisión parcial"
                                  : "Todo resuelto"}
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Disciplina
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.disciplina
                                    ?.label ||
                                    newsRelationsResolution.unresolved
                                      .disciplina ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Organización
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.organizacion
                                    ?.label ||
                                    newsRelationsResolution.unresolved
                                      .organizacion ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Evento
                                </span>
                                <strong>
                                  {newsRelationsResolution.resolved.evento
                                    ?.label ||
                                    newsRelationsResolution.unresolved.evento ||
                                    "Sin evento claro"}
                                </strong>
                              </div>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.automationStatLabel}>
                                Luchadores resueltos
                              </span>
                              <span style={styles.newsRelationTags}>
                                {newsRelationsResolution.resolved.luchadores
                                  .length > 0
                                  ? newsRelationsResolution.resolved.luchadores
                                      .map((fighter) => fighter.label)
                                      .join(" · ")
                                  : "Ninguno"}
                              </span>
                            </div>

                            {newsRelationsResolution.unresolved.luchadores
                              .length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                Sin coincidencia exacta en Sanity:{" "}
                                {newsRelationsResolution.unresolved.luchadores.join(
                                  " · "
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedOfficialNews.bodyText
                            ? `${selectedOfficialNews.bodyText.slice(0, 900)}${
                                selectedOfficialNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia de la bandeja para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar noticias UFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}



        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Segundo conector oficial</p>
                <h2 style={styles.sectionTitle}>Bandeja de noticias BKFC</h2>
                <p style={styles.metaText}>
                  Selecciona una noticia oficial de BKFC, pásala al formulario,
                  transfórmala al español y guárdala como borrador con
                  trazabilidad real.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialBkfcNews();
                }}
                style={
                  isLoadingBkfcNews
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingBkfcNews || isPreparingBkfcNewsBatch}
              >
                {isLoadingBkfcNews
                  ? "Actualizando BKFC..."
                  : bkfcNewsItems.length > 0
                  ? "Actualizar noticias BKFC"
                  : "Cargar noticias BKFC"}
              </button>
            </div>

            {bkfcNewsStatus.type !== "idle" ? (
              <div
                style={
                  bkfcNewsStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {bkfcNewsStatus.message}
              </div>
            ) : null}

            {bkfcNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta: {" "}
                {new Date(bkfcNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {bkfcNewsItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>Noticias oficiales BKFC</h3>
                    <p style={styles.metaText}>
                      Comprueba duplicados, noticias aptas y contenido que
                      requiere revisión antes de transformar.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeOfficialBkfcNews();
                      }}
                      style={
                        isAnalyzingBkfcNewsBatch || isPreparingBkfcNewsBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={
                        isAnalyzingBkfcNewsBatch || isPreparingBkfcNewsBatch
                      }
                    >
                      {isAnalyzingBkfcNewsBatch
                        ? "Analizando noticias..."
                        : "Analizar noticias BKFC"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleBkfcNews();
                      }}
                      style={
                        isPreparingBkfcNewsBatch ||
                        !bkfcNewsBatchAnalysis?.ok ||
                        bkfcNewsBatchAnalysis.summary.ready === 0
                          ? styles.buttonDisabled
                          : styles.button
                      }
                      disabled={
                        isPreparingBkfcNewsBatch ||
                        isAnalyzingBkfcNewsBatch ||
                        !bkfcNewsBatchAnalysis?.ok ||
                        bkfcNewsBatchAnalysis.summary.ready === 0
                      }
                    >
                      {isPreparingBkfcNewsBatch
                        ? "Preparando noticias nuevas..."
                        : `Preparar ${bkfcNewsBatchAnalysis?.ok ? bkfcNewsBatchAnalysis.summary.ready : 0} nuevas aptas`}
                    </button>
                  </div>
                </div>

                {bkfcNewsBatchStatus.type !== "idle" ? (
                  <div
                    aria-live="polite"
                    style={
                      bkfcNewsBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {bkfcNewsBatchStatus.message}
                  </div>
                ) : null}

                {bkfcNewsBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {bkfcNewsBatchPreparation.map((item) => (
                      <div key={item.sourceId} style={styles.batchProgressItem}>
                        <div style={styles.batchProgressText}>
                          <strong>{item.title}</strong>
                          <span style={styles.batchItemMeta}>{item.message}</span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {bkfcNewsBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Ya existen</span>
                        <strong>{bkfcNewsBatchAnalysis.summary.existing}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Nuevas aptas</span>
                        <strong>{bkfcNewsBatchAnalysis.summary.ready}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Sin contenido</span>
                        <strong>{bkfcNewsBatchAnalysis.summary.withoutContent}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Requieren revisión</span>
                        <strong>{bkfcNewsBatchAnalysis.summary.requiresReview}</strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {(showAllBkfcNewsBatchItems
                        ? bkfcNewsBatchAnalysis.items
                        : bkfcNewsBatchAnalysis.items.slice(0, 6)
                      ).map((item) => {
                        const sourceItem = bkfcNewsItems.find(
                          (newsItem) => newsItem.id === item.sourceId
                        );

                        return (
                          <div key={item.sourceId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.title}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.status === "existente"
                                  ? "Ya existe en Sanity"
                                  : item.status === "nueva_apta"
                                  ? "Nueva y apta para transformar"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido suficiente"
                                  : "Requiere revisión"}
                                {item.matchStrategy
                                  ? ` · coincidencia por ${item.matchStrategy}`
                                  : ""}
                              </span>

                              {item.reasons.length > 0 ? (
                                <span style={styles.batchError}>
                                  {item.reasons.join(" · ")}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "existente"
                                    ? styles.batchStatusOk
                                    : item.status === "nueva_apta"
                                    ? styles.batchStatusPending
                                    : styles.batchStatusError
                                }
                              >
                                {item.status === "existente"
                                  ? "Existente"
                                  : item.status === "nueva_apta"
                                  ? "Nueva apta"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido"
                                  : "Revisar"}
                              </span>

                              {sourceItem ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBkfcNewsId(sourceItem.id);
                                    setBkfcNewsRelationsResolution(null);
                                    setBkfcNewsStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingBkfcNewsBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingBkfcNewsBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {bkfcNewsBatchAnalysis.items.length > 6 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllBkfcNewsBatchItems((current) => !current)
                        }
                        style={styles.tertiaryButton}
                      >
                        {showAllBkfcNewsBatchItems
                          ? "Mostrar menos noticias"
                          : `Ver las ${bkfcNewsBatchAnalysis.items.length} noticias BKFC analizadas`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {bkfcNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {bkfcNewsItems.map((item) => {
                    const isSelected = item.id === selectedBkfcNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedBkfcNewsId(item.id);
                          setBkfcNewsRelationsResolution(null);
                          setBkfcNewsStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.summary ? (
                          <span style={styles.sourceItemSummary}>
                            {item.summary}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedBkfcNews ? (
                    <>
                      {selectedBkfcNews.imageUrl ? (
                        <img
                          src={selectedBkfcNews.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Noticia BKFC seleccionada</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedBkfcNews.title}
                        </h3>

                        {selectedBkfcNews.summary ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedBkfcNews.summary}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyBkfcNewsToForm}
                            style={styles.button}
                            disabled={isTransformingBkfcNews}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformBkfcNewsToSpanish();
                            }}
                            style={
                              isTransformingBkfcNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingBkfcNews}
                          >
                            {isTransformingBkfcNews
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedBkfcNews.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        {bkfcNewsRelationsResolution ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>
                                  Relaciones editoriales sugeridas
                                </p>
                                <strong>
                                  Coincidencias reales encontradas en Sanity
                                </strong>
                              </div>

                              <span
                                style={
                                  bkfcNewsRelationsResolution.unresolved.luchadores
                                    .length > 0 ||
                                  bkfcNewsRelationsResolution.unresolved.evento ||
                                  bkfcNewsRelationsResolution.unresolved
                                    .organizacion ||
                                  bkfcNewsRelationsResolution.unresolved.disciplina
                                    ? styles.batchStatusPending
                                    : styles.batchStatusOk
                                }
                              >
                                {bkfcNewsRelationsResolution.unresolved.luchadores
                                  .length > 0 ||
                                bkfcNewsRelationsResolution.unresolved.evento ||
                                bkfcNewsRelationsResolution.unresolved
                                  .organizacion ||
                                bkfcNewsRelationsResolution.unresolved.disciplina
                                  ? "Revisión parcial"
                                  : "Todo resuelto"}
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Disciplina
                                </span>
                                <strong>
                                  {bkfcNewsRelationsResolution.resolved.disciplina
                                    ?.label ||
                                    bkfcNewsRelationsResolution.unresolved
                                      .disciplina ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Organización
                                </span>
                                <strong>
                                  {bkfcNewsRelationsResolution.resolved.organizacion
                                    ?.label ||
                                    bkfcNewsRelationsResolution.unresolved
                                      .organizacion ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Evento
                                </span>
                                <strong>
                                  {bkfcNewsRelationsResolution.resolved.evento
                                    ?.label ||
                                    bkfcNewsRelationsResolution.unresolved.evento ||
                                    "Sin evento claro"}
                                </strong>
                              </div>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.automationStatLabel}>
                                Luchadores resueltos
                              </span>
                              <span style={styles.newsRelationTags}>
                                {bkfcNewsRelationsResolution.resolved.luchadores
                                  .length > 0
                                  ? bkfcNewsRelationsResolution.resolved.luchadores
                                      .map((fighter) => fighter.label)
                                      .join(" · ")
                                  : "Ninguno"}
                              </span>
                            </div>

                            {bkfcNewsRelationsResolution.unresolved.luchadores
                              .length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                Sin coincidencia exacta en Sanity: {" "}
                                {bkfcNewsRelationsResolution.unresolved.luchadores.join(
                                  " · "
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedBkfcNews.bodyText
                            ? `${selectedBkfcNews.bodyText.slice(0, 900)}${
                                selectedBkfcNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia BKFC no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia BKFC de la bandeja para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar noticias BKFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}



        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Tercer conector oficial</p>
                <h2 style={styles.sectionTitle}>Bandeja de noticias ONE Championship</h2>
                <p style={styles.metaText}>
                  Selecciona una noticia oficial de ONE Championship, pásala al formulario,
                  transfórmala al español y guárdala como borrador con
                  trazabilidad real.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialOneNews();
                }}
                style={
                  isLoadingOneNews
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingOneNews || isPreparingOneNewsBatch}
              >
                {isLoadingOneNews
                  ? "Actualizando ONE..."
                  : oneNewsItems.length > 0
                  ? "Actualizar noticias ONE"
                  : "Cargar noticias ONE"}
              </button>
            </div>

            {oneNewsStatus.type !== "idle" ? (
              <div
                style={
                  oneNewsStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {oneNewsStatus.message}
              </div>
            ) : null}

            {oneNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta: {" "}
                {new Date(oneNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {oneNewsItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>Noticias oficiales ONE Championship</h3>
                    <p style={styles.metaText}>
                      Comprueba duplicados, noticias aptas y contenido que
                      requiere revisión antes de transformar.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeOfficialOneNews();
                      }}
                      style={
                        isAnalyzingOneNewsBatch || isPreparingOneNewsBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={
                        isAnalyzingOneNewsBatch || isPreparingOneNewsBatch
                      }
                    >
                      {isAnalyzingOneNewsBatch
                        ? "Analizando noticias..."
                        : "Analizar noticias ONE"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleOneNews();
                      }}
                      style={
                        isPreparingOneNewsBatch ||
                        !oneNewsBatchAnalysis?.ok ||
                        oneNewsBatchAnalysis.summary.ready === 0
                          ? styles.buttonDisabled
                          : styles.button
                      }
                      disabled={
                        isPreparingOneNewsBatch ||
                        isAnalyzingOneNewsBatch ||
                        !oneNewsBatchAnalysis?.ok ||
                        oneNewsBatchAnalysis.summary.ready === 0
                      }
                    >
                      {isPreparingOneNewsBatch
                        ? "Preparando noticias nuevas..."
                        : `Preparar ${oneNewsBatchAnalysis?.ok ? oneNewsBatchAnalysis.summary.ready : 0} nuevas aptas`}
                    </button>
                  </div>
                </div>

                {oneNewsBatchStatus.type !== "idle" ? (
                  <div
                    aria-live="polite"
                    style={
                      oneNewsBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {oneNewsBatchStatus.message}
                  </div>
                ) : null}

                {oneNewsBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {oneNewsBatchPreparation.map((item) => (
                      <div key={item.sourceId} style={styles.batchProgressItem}>
                        <div style={styles.batchProgressText}>
                          <strong>{item.title}</strong>
                          <span style={styles.batchItemMeta}>{item.message}</span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {oneNewsBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Ya existen</span>
                        <strong>{oneNewsBatchAnalysis.summary.existing}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Nuevas aptas</span>
                        <strong>{oneNewsBatchAnalysis.summary.ready}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Sin contenido</span>
                        <strong>{oneNewsBatchAnalysis.summary.withoutContent}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Requieren revisión</span>
                        <strong>{oneNewsBatchAnalysis.summary.requiresReview}</strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {(showAllOneNewsBatchItems
                        ? oneNewsBatchAnalysis.items
                        : oneNewsBatchAnalysis.items.slice(0, 6)
                      ).map((item) => {
                        const sourceItem = oneNewsItems.find(
                          (newsItem) => newsItem.id === item.sourceId
                        );

                        return (
                          <div key={item.sourceId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.title}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.status === "existente"
                                  ? "Ya existe en Sanity"
                                  : item.status === "nueva_apta"
                                  ? "Nueva y apta para transformar"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido suficiente"
                                  : "Requiere revisión"}
                                {item.matchStrategy
                                  ? ` · coincidencia por ${item.matchStrategy}`
                                  : ""}
                              </span>

                              {item.reasons.length > 0 ? (
                                <span style={styles.batchError}>
                                  {item.reasons.join(" · ")}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "existente"
                                    ? styles.batchStatusOk
                                    : item.status === "nueva_apta"
                                    ? styles.batchStatusPending
                                    : styles.batchStatusError
                                }
                              >
                                {item.status === "existente"
                                  ? "Existente"
                                  : item.status === "nueva_apta"
                                  ? "Nueva apta"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido"
                                  : "Revisar"}
                              </span>

                              {sourceItem ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOneNewsId(sourceItem.id);
                                    setOneNewsRelationsResolution(null);
                                    setOneNewsStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingOneNewsBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingOneNewsBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {oneNewsBatchAnalysis.items.length > 6 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllOneNewsBatchItems((current) => !current)
                        }
                        style={styles.tertiaryButton}
                      >
                        {showAllOneNewsBatchItems
                          ? "Mostrar menos noticias"
                          : `Ver las ${oneNewsBatchAnalysis.items.length} noticias ONE Championship analizadas`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {oneNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {oneNewsItems.map((item) => {
                    const isSelected = item.id === selectedOneNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOneNewsId(item.id);
                          setOneNewsRelationsResolution(null);
                          setOneNewsStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.summary ? (
                          <span style={styles.sourceItemSummary}>
                            {item.summary}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOneNews ? (
                    <>
                      {selectedOneNews.imageUrl ? (
                        <img
                          src={selectedOneNews.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Noticia ONE seleccionada</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOneNews.title}
                        </h3>

                        {selectedOneNews.summary ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedOneNews.summary}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyOneNewsToForm}
                            style={styles.button}
                            disabled={isTransformingOneNews}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformOneNewsToSpanish();
                            }}
                            style={
                              isTransformingOneNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingOneNews}
                          >
                            {isTransformingOneNews
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedOneNews.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        {oneNewsRelationsResolution ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>
                                  Relaciones editoriales sugeridas
                                </p>
                                <strong>
                                  Coincidencias reales encontradas en Sanity
                                </strong>
                              </div>

                              <span
                                style={
                                  oneNewsRelationsResolution.unresolved.luchadores
                                    .length > 0 ||
                                  oneNewsRelationsResolution.unresolved.evento ||
                                  oneNewsRelationsResolution.unresolved
                                    .organizacion ||
                                  oneNewsRelationsResolution.unresolved.disciplina
                                    ? styles.batchStatusPending
                                    : styles.batchStatusOk
                                }
                              >
                                {oneNewsRelationsResolution.unresolved.luchadores
                                  .length > 0 ||
                                oneNewsRelationsResolution.unresolved.evento ||
                                oneNewsRelationsResolution.unresolved
                                  .organizacion ||
                                oneNewsRelationsResolution.unresolved.disciplina
                                  ? "Revisión parcial"
                                  : "Todo resuelto"}
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Disciplina
                                </span>
                                <strong>
                                  {oneNewsRelationsResolution.resolved.disciplina
                                    ?.label ||
                                    oneNewsRelationsResolution.unresolved
                                      .disciplina ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Organización
                                </span>
                                <strong>
                                  {oneNewsRelationsResolution.resolved.organizacion
                                    ?.label ||
                                    oneNewsRelationsResolution.unresolved
                                      .organizacion ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Evento
                                </span>
                                <strong>
                                  {oneNewsRelationsResolution.resolved.evento
                                    ?.label ||
                                    oneNewsRelationsResolution.unresolved.evento ||
                                    "Sin evento claro"}
                                </strong>
                              </div>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.automationStatLabel}>
                                Luchadores resueltos
                              </span>
                              <span style={styles.newsRelationTags}>
                                {oneNewsRelationsResolution.resolved.luchadores
                                  .length > 0
                                  ? oneNewsRelationsResolution.resolved.luchadores
                                      .map((fighter) => fighter.label)
                                      .join(" · ")
                                  : "Ninguno"}
                              </span>
                            </div>

                            {oneNewsRelationsResolution.unresolved.luchadores
                              .length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                Sin coincidencia exacta en Sanity: {" "}
                                {oneNewsRelationsResolution.unresolved.luchadores.join(
                                  " · "
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedOneNews.bodyText
                            ? `${selectedOneNews.bodyText.slice(0, 900)}${
                                selectedOneNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia ONE Championship no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia ONE Championship de la bandeja para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar noticias ONE” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Cuarto conector oficial</p>
                <h2 style={styles.sectionTitle}>Bandeja de noticias FEKM</h2>
                <p style={styles.metaText}>
                  Selecciona una noticia oficial de FEKM, pásala al formulario,
                  transfórmala al español y guárdala como borrador con
                  trazabilidad real.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialFekmNews();
                }}
                style={
                  isLoadingFekmNews
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingFekmNews || isPreparingFekmNewsBatch}
              >
                {isLoadingFekmNews
                  ? "Actualizando FEKM..."
                  : fekmNewsItems.length > 0
                  ? "Actualizar noticias FEKM"
                  : "Cargar noticias FEKM"}
              </button>
            </div>

            {fekmNewsStatus.type !== "idle" ? (
              <div
                style={
                  fekmNewsStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {fekmNewsStatus.message}
              </div>
            ) : null}

            {fekmNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta: {" "}
                {new Date(fekmNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {fekmNewsItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>Noticias oficiales FEKM</h3>
                    <p style={styles.metaText}>
                      Comprueba duplicados, noticias aptas y contenido que
                      requiere revisión antes de transformar.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeOfficialFekmNews();
                      }}
                      style={
                        isAnalyzingFekmNewsBatch || isPreparingFekmNewsBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={
                        isAnalyzingFekmNewsBatch || isPreparingFekmNewsBatch
                      }
                    >
                      {isAnalyzingFekmNewsBatch
                        ? "Analizando noticias..."
                        : "Analizar noticias FEKM"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleFekmNews();
                      }}
                      style={
                        isPreparingFekmNewsBatch ||
                        !fekmNewsBatchAnalysis?.ok ||
                        fekmNewsBatchAnalysis.summary.ready === 0
                          ? styles.buttonDisabled
                          : styles.button
                      }
                      disabled={
                        isPreparingFekmNewsBatch ||
                        isAnalyzingFekmNewsBatch ||
                        !fekmNewsBatchAnalysis?.ok ||
                        fekmNewsBatchAnalysis.summary.ready === 0
                      }
                    >
                      {isPreparingFekmNewsBatch
                        ? "Preparando noticias nuevas..."
                        : `Preparar ${fekmNewsBatchAnalysis?.ok ? fekmNewsBatchAnalysis.summary.ready : 0} nuevas aptas`}
                    </button>
                  </div>
                </div>

                {fekmNewsBatchStatus.type !== "idle" ? (
                  <div
                    aria-live="polite"
                    style={
                      fekmNewsBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {fekmNewsBatchStatus.message}
                  </div>
                ) : null}

                {fekmNewsBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {fekmNewsBatchPreparation.map((item) => (
                      <div key={item.sourceId} style={styles.batchProgressItem}>
                        <div style={styles.batchProgressText}>
                          <strong>{item.title}</strong>
                          <span style={styles.batchItemMeta}>{item.message}</span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {fekmNewsBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Ya existen</span>
                        <strong>{fekmNewsBatchAnalysis.summary.existing}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Nuevas aptas</span>
                        <strong>{fekmNewsBatchAnalysis.summary.ready}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Sin contenido</span>
                        <strong>{fekmNewsBatchAnalysis.summary.withoutContent}</strong>
                      </div>

                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>Requieren revisión</span>
                        <strong>{fekmNewsBatchAnalysis.summary.requiresReview}</strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {(showAllFekmNewsBatchItems
                        ? fekmNewsBatchAnalysis.items
                        : fekmNewsBatchAnalysis.items.slice(0, 6)
                      ).map((item) => {
                        const sourceItem = fekmNewsItems.find(
                          (newsItem) => newsItem.id === item.sourceId
                        );

                        return (
                          <div key={item.sourceId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.title}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.status === "existente"
                                  ? "Ya existe en Sanity"
                                  : item.status === "nueva_apta"
                                  ? "Nueva y apta para transformar"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido suficiente"
                                  : "Requiere revisión"}
                                {item.matchStrategy
                                  ? ` · coincidencia por ${item.matchStrategy}`
                                  : ""}
                              </span>

                              {item.reasons.length > 0 ? (
                                <span style={styles.batchError}>
                                  {item.reasons.join(" · ")}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "existente"
                                    ? styles.batchStatusOk
                                    : item.status === "nueva_apta"
                                    ? styles.batchStatusPending
                                    : styles.batchStatusError
                                }
                              >
                                {item.status === "existente"
                                  ? "Existente"
                                  : item.status === "nueva_apta"
                                  ? "Nueva apta"
                                  : item.status === "sin_contenido"
                                  ? "Sin contenido"
                                  : "Revisar"}
                              </span>

                              {sourceItem ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFekmNewsId(sourceItem.id);
                                    setFekmNewsRelationsResolution(null);
                                    setFekmNewsStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingFekmNewsBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingFekmNewsBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {fekmNewsBatchAnalysis.items.length > 6 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllFekmNewsBatchItems((current) => !current)
                        }
                        style={styles.tertiaryButton}
                      >
                        {showAllFekmNewsBatchItems
                          ? "Mostrar menos noticias"
                          : `Ver las ${fekmNewsBatchAnalysis.items.length} noticias FEKM analizadas`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {fekmNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {fekmNewsItems.map((item) => {
                    const isSelected = item.id === selectedFekmNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedFekmNewsId(item.id);
                          setFekmNewsRelationsResolution(null);
                          setFekmNewsStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.summary ? (
                          <span style={styles.sourceItemSummary}>
                            {item.summary}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedFekmNews ? (
                    <>
                      {selectedFekmNews.imageUrl ? (
                        <img
                          src={selectedFekmNews.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Noticia FEKM seleccionada</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedFekmNews.title}
                        </h3>

                        {selectedFekmNews.summary ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedFekmNews.summary}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyFekmNewsToForm}
                            style={styles.button}
                            disabled={isTransformingFekmNews}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformFekmNewsToSpanish();
                            }}
                            style={
                              isTransformingFekmNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingFekmNews}
                          >
                            {isTransformingFekmNews
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedFekmNews.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        {fekmNewsRelationsResolution ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>
                                  Relaciones editoriales sugeridas
                                </p>
                                <strong>
                                  Coincidencias reales encontradas en Sanity
                                </strong>
                              </div>

                              <span
                                style={
                                  fekmNewsRelationsResolution.unresolved.luchadores
                                    .length > 0 ||
                                  fekmNewsRelationsResolution.unresolved.evento ||
                                  fekmNewsRelationsResolution.unresolved
                                    .organizacion ||
                                  fekmNewsRelationsResolution.unresolved.disciplina
                                    ? styles.batchStatusPending
                                    : styles.batchStatusOk
                                }
                              >
                                {fekmNewsRelationsResolution.unresolved.luchadores
                                  .length > 0 ||
                                fekmNewsRelationsResolution.unresolved.evento ||
                                fekmNewsRelationsResolution.unresolved
                                  .organizacion ||
                                fekmNewsRelationsResolution.unresolved.disciplina
                                  ? "Revisión parcial"
                                  : "Todo resuelto"}
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Disciplina
                                </span>
                                <strong>
                                  {fekmNewsRelationsResolution.resolved.disciplina
                                    ?.label ||
                                    fekmNewsRelationsResolution.unresolved
                                      .disciplina ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Organización
                                </span>
                                <strong>
                                  {fekmNewsRelationsResolution.resolved.organizacion
                                    ?.label ||
                                    fekmNewsRelationsResolution.unresolved
                                      .organizacion ||
                                    "Sin sugerencia"}
                                </strong>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.automationStatLabel}>
                                  Evento
                                </span>
                                <strong>
                                  {fekmNewsRelationsResolution.resolved.evento
                                    ?.label ||
                                    fekmNewsRelationsResolution.unresolved.evento ||
                                    "Sin evento claro"}
                                </strong>
                              </div>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.automationStatLabel}>
                                Luchadores resueltos
                              </span>
                              <span style={styles.newsRelationTags}>
                                {fekmNewsRelationsResolution.resolved.luchadores
                                  .length > 0
                                  ? fekmNewsRelationsResolution.resolved.luchadores
                                      .map((fighter) => fighter.label)
                                      .join(" · ")
                                  : "Ninguno"}
                              </span>
                            </div>

                            {fekmNewsRelationsResolution.unresolved.luchadores
                              .length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                Sin coincidencia exacta en Sanity: {" "}
                                {fekmNewsRelationsResolution.unresolved.luchadores.join(
                                  " · "
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedFekmNews.bodyText
                            ? `${selectedFekmNews.bodyText.slice(0, 900)}${
                                selectedFekmNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia FEKM no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia FEKM de la bandeja para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar noticias FEKM” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "noticia" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuentes externas conectadas</p>
                <h2 style={styles.sectionTitle}>Bandeja de fuentes externas</h2>
                <p style={styles.metaText}>
                  Carga noticias externas de deportes de combate, revisa el contenido
                  y pásalo al formulario como borrador editorial de Full Fight News.
                </p>
              </div>

              <div style={styles.sourceHeaderActions}>
                <label style={styles.sourceSelectLabel}>
                  Fuente externa
                  <select
                    value={selectedExternalSourceId}
                    onChange={(event) => {
                      const nextSourceId = event.target.value as ExternalSourceId;
                      setSelectedExternalSourceId(nextSourceId);
                      setExternalNewsItems([]);
                      setSelectedExternalNewsId("");
                      setExternalNewsFetchedAt("");
                      setExternalNewsAnalysisSummary(null);
                      setExternalNewsBatchAnalysis(null);
                      setExternalNewsBatchDraftResults([]);
                      setExternalNewsBatchStatus({
                        type: "idle",
                        message: "",
                      });
                      setShowAllExternalNewsBatchItems(false);
                      setExternalNewsStatus({
                        type: "idle",
                        message: "",
                      });
                    }}
                    style={styles.sourceSelect}
                    disabled={isLoadingExternalNews || isCreatingExternalNewsDraft}
                  >
                    {ENABLED_EXTERNAL_NEWS_SOURCES.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    void reloadExternalNews(selectedExternalSourceId);
                  }}
                  style={
                    isLoadingExternalNews || isCreatingExternalNewsDraft
                      ? styles.buttonDisabled
                      : styles.secondaryButton
                  }
                  disabled={isLoadingExternalNews || isCreatingExternalNewsDraft}
                >
                  {isLoadingExternalNews
                    ? `Actualizando ${selectedExternalNewsSource?.name ?? "fuente"}...`
                    : externalNewsItems.length > 0
                    ? `Actualizar ${selectedExternalNewsSource?.name ?? "fuente"}`
                    : `Cargar ${selectedExternalNewsSource?.name ?? "fuente"}`}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void prepareExternalNewsBatch();
                  }}
                  style={
                    isPreparingExternalNewsBatch ||
                    isCreatingExternalNewsDraft ||
                    isLoadingExternalNews ||
                    externalNewsItems.length === 0
                      ? styles.buttonDisabled
                      : styles.secondaryButton
                  }
                  disabled={
                    isPreparingExternalNewsBatch ||
                    isCreatingExternalNewsDraft ||
                    isLoadingExternalNews ||
                    externalNewsItems.length === 0
                  }
                >
                  {isPreparingExternalNewsBatch
                    ? "Preparando fuente..."
                    : "Preparar noticias de esta fuente"}
                </button>
              </div>
            </div>

            {externalNewsStatus.type !== "idle" ? (
              <div
                style={
                  externalNewsStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {externalNewsStatus.message}
              </div>
            ) : null}

            {externalNewsReview ? (
              <section className="external-review-result" aria-label="Resultado del Centro de revisión">
                <strong>{externalNewsReview.status === "not_needed" ? "Sin incidencias" : externalNewsReview.status === "ready_for_future_resume" ? "Listo para futura reanudación" : externalNewsReview.status === "error" ? "Error controlado del Centro de revisión" : externalNewsReview.status === "needs_more_evidence" ? "Pendiente de más evidencia" : "Caso de revisión creado"}</strong>
                <span>Incidencias: {externalNewsReview.issueCount} · resueltas: {externalNewsReview.resolvedIssueCount} · pendientes: {externalNewsReview.pendingIssueCount} · bloqueantes: {externalNewsReview.blockingPendingCount}</span>
                <span>Resoluciones autónomas aplicadas: {externalNewsReview.autonomousAppliedCount}</span>
                {externalNewsReview.caseId ? <button type="button" className="review-button review-button-secondary" onClick={() => navigateLaboratory("/revision", `?case=${encodeURIComponent(externalNewsReview.caseId ?? "")}`)}>{externalNewsReview.status === "ready_for_future_resume" ? "Preparar reanudación" : "Abrir caso en el Centro de revisión"}</button> : null}
              </section>
            ) : null}

            {externalNewsBatchStatus.type !== "idle" ? (
              <div
                style={
                  externalNewsBatchStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {externalNewsBatchStatus.message}
              </div>
            ) : null}

            {externalNewsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta: {" "}
                {new Date(externalNewsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {externalNewsBatchAnalysis ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Preparación masiva controlada</p>
                    <h3 style={styles.batchTitle}>
                      {externalNewsBatchAnalysis.sourceName} · {externalNewsBatchAnalysis.summary.total} noticias revisadas
                    </h3>
                    <p style={styles.metaText}>
                      Clasificación editorial previa. No crea borradores: solo separa lo apto, lo revisable y lo que conviene descartar antes de seguir.
                    </p>
                  </div>

                  <span style={styles.batchStatusOk}>
                    {new Date(externalNewsBatchAnalysis.resolvedAt).toLocaleString("es-ES")}
                  </span>
                </div>

                <div style={styles.batchSummaryGrid}>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Aptas</span>
                    <strong>{externalNewsBatchAnalysis.summary.aptas}</strong>
                  </div>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Revisión</span>
                    <strong>{externalNewsBatchAnalysis.summary.revision}</strong>
                  </div>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Insuficientes</span>
                    <strong>{externalNewsBatchAnalysis.summary.insuficientes}</strong>
                  </div>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Duplicadas</span>
                    <strong>{externalNewsBatchAnalysis.summary.duplicadas}</strong>
                  </div>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Descartadas</span>
                    <strong>{externalNewsBatchAnalysis.summary.descartadas}</strong>
                  </div>
                  <div style={styles.newsRelationGroup}>
                    <span style={styles.automationStatLabel}>Errores</span>
                    <strong>{externalNewsBatchAnalysis.summary.errores}</strong>
                  </div>
                </div>

                <div style={styles.sourcePreviewActions}>
                  <button
                    type="button"
                    onClick={() => {
                      void createExternalNewsDraftsFromBatch();
                    }}
                    style={
                      isCreatingExternalNewsBatchDrafts ||
                      isPreparingExternalNewsBatch ||
                      externalNewsBatchAnalysis.summary.aptas === 0
                        ? styles.buttonDisabled
                        : styles.secondaryButton
                    }
                    disabled={
                      isCreatingExternalNewsBatchDrafts ||
                      isPreparingExternalNewsBatch ||
                      externalNewsBatchAnalysis.summary.aptas === 0
                    }
                  >
                    {isCreatingExternalNewsBatchDrafts
                      ? "Creando borradores aptos..."
                      : `Crear borradores aptos (${externalNewsBatchAnalysis.summary.aptas})`}
                  </button>
                </div>

                <div style={styles.batchList}>
                  {(showAllExternalNewsBatchItems
                    ? externalNewsBatchAnalysis.items
                    : externalNewsBatchAnalysis.items.slice(0, 6)
                  ).map((item) => {
                    const statusStyle =
                      item.status === "apta"
                        ? styles.batchStatusOk
                        : item.status === "error" || item.status === "descartar"
                        ? styles.batchStatusError
                        : styles.batchStatusPending;

                    return (
                      <div key={item.id} style={styles.batchItem}>
                        <div style={styles.batchItemMain}>
                          <strong>{item.title}</strong>
                          <span style={styles.batchItemMeta}>
                            {item.reason} · relevancia {item.relevancia} · confianza {item.confidence}/100
                          </span>
                          <span style={styles.batchItemMeta}>
                            {item.disciplineLabel || "Sin disciplina"} · {item.organizationLabel || "Sin organización"}
                            {item.fighterHints.length > 0
                              ? ` · ${item.fighterHints.join(" · ")}`
                              : ""}
                          </span>
                          {item.warnings.length > 0 ? (
                            <span style={styles.batchItemMeta}>
                              Avisos: {item.warnings.join(" | ")}
                            </span>
                          ) : null}
                        </div>

                        <div style={styles.batchItemActions}>
                          <span style={statusStyle}>{item.status.toUpperCase()}</span>
                          <button
                            type="button"
                            style={styles.tertiaryButton}
                            onClick={() => {
                              setSelectedExternalNewsId(item.id);
                              setExternalNewsAnalysisSummary(null);
                              setExternalNewsStatus({
                                type: "idle",
                                message: "",
                              });
                            }}
                          >
                            Revisar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {externalNewsBatchAnalysis.items.length > 6 ? (
                  <button
                    type="button"
                    style={styles.tertiaryButton}
                    onClick={() => {
                      setShowAllExternalNewsBatchItems((current) => !current);
                    }}
                  >
                    {showAllExternalNewsBatchItems
                      ? "Ver menos"
                      : `Ver todas (${externalNewsBatchAnalysis.items.length})`}
                  </button>
                ) : null}

                {externalNewsBatchDraftResults.length > 0 ? (
                  <div style={styles.newsRelationsCard}>
                    <div style={styles.newsRelationsHeader}>
                      <div>
                        <p style={styles.sourceEyebrow}>
                          Resultado de creación en lote
                        </p>
                        <strong>
                          {externalNewsBatchDraftResults.filter((item) => item.status === "creado").length} creados · {externalNewsBatchDraftResults.filter((item) => item.status === "omitido").length} omitidos · {externalNewsBatchDraftResults.filter((item) => item.status === "error").length} errores
                        </strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {externalNewsBatchDraftResults.map((item) => {
                        const statusStyle =
                          item.status === "creado"
                            ? styles.batchStatusOk
                            : item.status === "error"
                            ? styles.batchStatusError
                            : styles.batchStatusPending;

                        return (
                          <div key={`${item.id}-${item.status}`} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.title}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.message}
                                {item.documentId ? ` · ${item.documentId}` : ""}
                              </span>
                            </div>
                            <span style={statusStyle}>{item.status.toUpperCase()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {externalNewsItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {externalNewsItems.map((item) => {
                    const isSelected = item.id === selectedExternalNewsId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedExternalNewsId(item.id);
                          setExternalNewsAnalysisSummary(null);
                          setExternalNewsStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.title}</span>

                        {item.excerpt ? (
                          <span style={styles.sourceItemSummary}>
                            {item.excerpt}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.sourceName || selectedExternalNewsSource?.name}
                          {" · "}
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.bodyText
                            ? "Contenido completo"
                            : "Sin cuerpo completo"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedExternalNews ? (
                    <>
                      {selectedExternalNews.image?.url ? (
                        <img
                          src={selectedExternalNews.image.url}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>
                          Noticia externa seleccionada
                        </p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedExternalNews.title}
                        </h3>

                        {selectedExternalNews.excerpt ? (
                          <p style={styles.sourcePreviewSummary}>
                            {selectedExternalNews.excerpt}
                          </p>
                        ) : null}

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={() => {
                              void applyExternalNewsToForm();
                            }}
                            style={
                              isAnalyzingExternalNews || isCreatingExternalNewsDraft
                                ? styles.buttonDisabled
                                : styles.button
                            }
                            disabled={isAnalyzingExternalNews || isCreatingExternalNewsDraft}
                          >
                            {isAnalyzingExternalNews
                              ? "Analizando fuente externa..."
                              : "Analizar y pasar al formulario"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void createExternalNewsDraftFromSelected();
                            }}
                            style={
                              isCreatingExternalNewsDraft || isAnalyzingExternalNews
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isCreatingExternalNewsDraft || isAnalyzingExternalNews}
                          >
                            {isCreatingExternalNewsDraft
                              ? "Creando borrador externo..."
                              : "Crear borrador de esta noticia"}
                          </button>

                          <a
                            href={
                              selectedExternalNews.canonicalUrl ||
                              selectedExternalNews.sourceUrl
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente externa
                          </a>
                        </div>

                        <div style={styles.newsRelationsCard}>
                          <div style={styles.newsRelationsHeader}>
                            <div>
                              <p style={styles.sourceEyebrow}>
                                Detección inicial orientativa
                              </p>
                              <strong>
                                {inferExternalNewsDisciplineLabel(selectedExternalNews) ||
                                  "Disciplina pendiente de revisión"}
                              </strong>
                            </div>

                            <span style={styles.batchStatusPending}>
                              Pendiente de análisis IA
                            </span>
                          </div>

                          <div style={styles.newsRelationsGrid}>
                            <div style={styles.newsRelationGroup}>
                              <span style={styles.sourceEyebrow}>Organización</span>
                              <span style={styles.newsRelationTags}>
                                {inferExternalNewsOrganizationLabel(selectedExternalNews) ||
                                  "Pendiente de revisión"}
                              </span>
                            </div>

                            <div style={styles.newsRelationGroup}>
                              <span style={styles.sourceEyebrow}>Luchadores</span>
                              <span style={styles.newsRelationTags}>
                                {(() => {
                                  const disciplineLabel =
                                    inferExternalNewsDisciplineLabel(selectedExternalNews);
                                  const organizationLabel =
                                    inferExternalNewsOrganizationLabel(selectedExternalNews);
                                  const disciplineOption = disciplineLabel
                                    ? findReferenceByLabel(
                                        referenceData.disciplina,
                                        disciplineLabel
                                      )
                                    : undefined;
                                  const organizationOption = organizationLabel
                                    ? findReferenceByLabel(
                                        referenceData.organizacion,
                                        organizationLabel
                                      )
                                    : undefined;
                                  const fighters = getExternalNewsMatchedFighters({
                                    item: selectedExternalNews,
                                    fighters: referenceData.luchador,
                                    disciplineRef: disciplineOption?.value,
                                    organizationRef: organizationOption?.value,
                                  });

                                  return fighters.length > 0
                                    ? fighters.map((fighter) => fighter.label).join(" · ")
                                    : "Sin coincidencia exacta en Sanity";
                                })()}
                              </span>
                            </div>
                          </div>

                          <p style={styles.metaText}>
                            Esta tarjeta solo muestra una detección rápida antes del análisis
                            editorial. Las relaciones definitivas se aplican al pulsar
                            “Analizar y pasar al formulario”.
                          </p>
                        </div>

                        {selectedExternalNewsQualityNotes.length > 0 ? (
                          <div style={styles.newsRelationWarning}>
                            <strong>Control de calidad previo</strong>
                            <ul style={styles.compactList}>
                              {selectedExternalNewsQualityNotes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {externalNewsAnalysisSummary ? (
                          <div style={styles.newsRelationsCard}>
                            <div style={styles.newsRelationsHeader}>
                              <div>
                                <p style={styles.sourceEyebrow}>Último análisis aplicado</p>
                                <strong>{externalNewsAnalysisSummary.sourceName}</strong>
                              </div>

                              <span
                                style={
                                  externalNewsAnalysisSummary.debeCrearNoticia &&
                                  externalNewsAnalysisSummary.relevancia !== "descartar"
                                    ? styles.batchStatusOk
                                    : styles.batchStatusPending
                                }
                              >
                                {externalNewsAnalysisSummary.relevancia.toUpperCase()} · confianza {externalNewsAnalysisSummary.confianzaRelaciones}/100
                              </span>
                            </div>

                            <div style={styles.newsRelationsGrid}>
                              <div style={styles.newsRelationGroup}>
                                <span style={styles.sourceEyebrow}>Disciplina</span>
                                <span style={styles.newsRelationTags}>
                                  {externalNewsAnalysisSummary.disciplina}
                                </span>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.sourceEyebrow}>Organización</span>
                                <span style={styles.newsRelationTags}>
                                  {externalNewsAnalysisSummary.organizacion}
                                </span>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.sourceEyebrow}>Luchadores</span>
                                <span style={styles.newsRelationTags}>
                                  {externalNewsAnalysisSummary.luchadores.length > 0
                                    ? externalNewsAnalysisSummary.luchadores.join(" · ")
                                    : "Sin luchadores resueltos"}
                                </span>
                              </div>

                              <div style={styles.newsRelationGroup}>
                                <span style={styles.sourceEyebrow}>Evento / combate</span>
                                <span style={styles.newsRelationTags}>
                                  {externalNewsAnalysisSummary.evento}
                                  {externalNewsAnalysisSummary.combate !== "Sin combate resuelto"
                                    ? ` · ${externalNewsAnalysisSummary.combate}`
                                    : ""}
                                </span>
                              </div>
                            </div>

                            {externalNewsAnalysisSummary.motivoRelevancia ? (
                              <p style={styles.metaText}>
                                {externalNewsAnalysisSummary.motivoRelevancia}
                              </p>
                            ) : null}

                            {externalNewsAnalysisSummary.necesitaRevisionManual ? (
                              <div style={styles.newsRelationWarning}>
                                <strong>Revisión manual recomendada</strong>
                                <p style={styles.metaText}>
                                  {externalNewsAnalysisSummary.razonRevisionManual ||
                                    "El análisis recomienda revisar relaciones o contexto antes de guardar."}
                                </p>
                              </div>
                            ) : null}

                            {externalNewsAnalysisSummary.warnings.length > 0 ? (
                              <div style={styles.newsRelationWarning}>
                                <strong>Avisos del análisis</strong>
                                <ul style={styles.compactList}>
                                  {externalNewsAnalysisSummary.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <p style={styles.sourceBodyPreview}>
                          {selectedExternalNews.bodyText
                            ? `${selectedExternalNews.bodyText.slice(0, 900)}${
                                selectedExternalNews.bodyText.length > 900
                                  ? "..."
                                  : ""
                              }`
                            : "Esta noticia externa no contiene un cuerpo completo fiable. Se usará el resumen disponible y podrás completar el contenido manualmente."}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona una noticia externa de {selectedExternalNewsSource?.name ?? "la fuente activa"} para revisar sus datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar {selectedExternalNewsSource?.name ?? "fuente"}” para consultar noticias externas de deportes de combate.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "evento" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuente oficial conectada</p>
                <h2 style={styles.sectionTitle}>Bandeja de eventos UFC</h2>
                <p style={styles.metaText}>
                  Selecciona un evento oficial, revisa sus datos y transfórmalo
                  al español antes de generar el borrador.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialUfcEvents();
                }}
                style={
                  isLoadingOfficialEvents
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isLoadingOfficialEvents}
              >
                {isLoadingOfficialEvents
                  ? "Actualizando eventos..."
                  : officialEventItems.length > 0
                  ? "Actualizar eventos UFC"
                  : "Cargar eventos UFC"}
              </button>
            </div>

            {officialEventSourceStatus.type !== "idle" ? (
              <div
                style={
                  officialEventSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {officialEventSourceStatus.message}
              </div>
            ) : null}

            {officialEventsFetchedAt ? (
              <p style={styles.sourceTimestamp}>
                Última consulta:{" "}
                {new Date(officialEventsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {officialEventItems.length > 0 ? (
              <div style={styles.batchCard}>
                <div style={styles.batchHeader}>
                  <div>
                    <p style={styles.sourceEyebrow}>Análisis masivo</p>
                    <h3 style={styles.batchTitle}>
                      Próximos eventos UFC
                    </h3>
                    <p style={styles.metaText}>
                      Revisa de una sola vez qué eventos están completos,
                      cuáles pueden prepararse y cuáles requieren crear primero
                      su ficha en Sanity.
                    </p>
                  </div>

                  <div style={styles.batchHeaderActions}>
                    <button
                      type="button"
                      onClick={() => {
                        void analyzeUpcomingUfcEvents();
                      }}
                      style={
                        isAnalyzingUfcBatch || isPreparingUfcBatch
                          ? styles.buttonDisabled
                          : styles.secondaryButton
                      }
                      disabled={isAnalyzingUfcBatch || isPreparingUfcBatch}
                    >
                      {isAnalyzingUfcBatch
                        ? "Analizando próximos eventos..."
                        : "Analizar próximos eventos"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void prepareAllEligibleUfcEvents();
                      }}
                      style={
                        isPreparingUfcBatch ||
                        !ufcBatchAnalysis?.ok ||
                        ufcBatchAnalysis.summary.readyToPrepare === 0
                          ? styles.buttonDisabled
                          : styles.primaryButton
                      }
                      disabled={
                        isPreparingUfcBatch ||
                        isAnalyzingUfcBatch ||
                        !ufcBatchAnalysis?.ok ||
                        ufcBatchAnalysis.summary.readyToPrepare === 0
                      }
                    >
                      {isPreparingUfcBatch
                        ? "Preparando eventos aptos..."
                        : `Preparar ${ufcBatchAnalysis?.ok ? ufcBatchAnalysis.summary.readyToPrepare : 0} eventos aptos`}
                    </button>
                  </div>
                </div>

                {ufcBatchStatus.type !== "idle" ? (
                  <div
                    aria-live="polite"
                    style={
                      ufcBatchStatus.type === "success"
                        ? styles.feedbackSuccess
                        : styles.feedbackError
                    }
                  >
                    {ufcBatchStatus.message}
                  </div>
                ) : null}

                {ufcBatchPreparation.length > 0 ? (
                  <div style={styles.batchProgressList}>
                    {ufcBatchPreparation.map((item) => (
                      <div
                        key={item.eventId}
                        style={styles.batchProgressItem}
                      >
                        <div style={styles.batchProgressText}>
                          <strong>{item.eventName}</strong>
                          <span style={styles.batchItemMeta}>
                            {item.message}
                          </span>
                        </div>

                        <span
                          style={
                            item.status === "completado"
                              ? styles.batchStatusOk
                              : item.status === "fallido"
                              ? styles.batchStatusError
                              : styles.batchStatusPending
                          }
                        >
                          {item.status === "pendiente"
                            ? "Pendiente"
                            : item.status === "procesando"
                            ? "Procesando"
                            : item.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {ufcBatchAnalysis?.ok ? (
                  <>
                    <div style={styles.batchSummaryGrid}>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Completos
                        </span>
                        <strong>{ufcBatchAnalysis.summary.completed}</strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Listos para preparar
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.readyToPrepare}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Evento pendiente
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.eventPending}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Requieren revisión
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.requiresReview}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Luchadores faltantes
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.totalMissingFighters}
                        </strong>
                      </div>
                      <div style={styles.automationStat}>
                        <span style={styles.automationStatLabel}>
                          Combates pendientes
                        </span>
                        <strong>
                          {ufcBatchAnalysis.summary.totalPendingFights}
                        </strong>
                      </div>
                    </div>

                    <div style={styles.batchList}>
                      {(showAllUfcEventBatchItems
                        ? ufcBatchAnalysis.items
                        : ufcBatchAnalysis.items.slice(0, 6)
                      ).map((item) => {
                        const sourceEvent = officialEventItems.find(
                          (event) => event.id === item.eventId
                        );

                        return (
                          <div key={item.eventId} style={styles.batchItem}>
                            <div style={styles.batchItemMain}>
                              <strong>{item.eventName}</strong>
                              <span style={styles.batchItemMeta}>
                                {item.eventFound
                                  ? "Evento encontrado"
                                  : "Evento pendiente"}
                                {" · "}
                                {item.existingFighters} luchadores existentes
                                {" · "}
                                {item.missingFighters} faltantes
                                {" · "}
                                {item.existingFights} combates existentes
                                {" · "}
                                {item.pendingFights} pendientes
                                {" · "}
                                {item.unresolvedCategories} categorías sin resolver
                              </span>
                              {item.error ? (
                                <span style={styles.batchError}>
                                  {item.error}
                                </span>
                              ) : null}
                            </div>

                            <div style={styles.batchItemActions}>
                              <span
                                style={
                                  item.status === "completo"
                                    ? styles.batchStatusOk
                                    : item.status === "requiere_revision"
                                    ? styles.batchStatusError
                                    : styles.batchStatusPending
                                }
                              >
                                {item.status === "completo"
                                  ? "Completo"
                                  : item.status === "evento_pendiente"
                                  ? "Crear evento"
                                  : item.status === "listo_para_preparar"
                                  ? "Listo para preparar"
                                  : "Revisar"}
                              </span>

                              {sourceEvent ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOfficialEventId(sourceEvent.id);
                                    setUfcEventResolution(null);
                                    setUfcAutomationStatus({
                                      type: "idle",
                                      message: "",
                                    });
                                  }}
                                  style={
                                    isPreparingUfcBatch
                                      ? styles.buttonDisabled
                                      : styles.secondaryButton
                                  }
                                  disabled={isPreparingUfcBatch}
                                >
                                  Seleccionar
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {ufcBatchAnalysis.items.length > 6 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllUfcEventBatchItems((current) => !current)
                        }
                        style={styles.tertiaryButton}
                      >
                        {showAllUfcEventBatchItems
                          ? "Mostrar menos eventos"
                          : `Ver los ${ufcBatchAnalysis.items.length} eventos analizados`}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {officialEventItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {officialEventItems.map((item) => {
                    const isSelected = item.id === selectedOfficialEventId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOfficialEventId(item.id);
                          setOfficialEventSourceStatus({
                            type: "idle",
                            message: "",
                          });
                          setUfcEventResolution(null);
                          setUfcAutomationStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.name}</span>

                        {item.mainEvent ? (
                          <span style={styles.sourceItemSummary}>
                            {item.mainEvent}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.startDate
                            ? new Date(item.startDate).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.status}
                          {item.locationText ? ` · ${item.locationText}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOfficialEvent ? (
                    <>
                      {selectedOfficialEvent.imageUrl ? (
                        <img
                          src={selectedOfficialEvent.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Evento seleccionado</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOfficialEvent.name}
                        </h3>

                        <p style={styles.sourcePreviewSummary}>
                          {[
                            selectedOfficialEvent.mainEvent,
                            selectedOfficialEvent.locationText,
                            selectedOfficialEvent.watchText,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applyOfficialEventToForm}
                            style={styles.button}
                            disabled={isTransformingOfficialEvent}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void transformOfficialEventToSpanish();
                            }}
                            style={
                              isTransformingOfficialEvent
                                ? styles.buttonDisabled
                                : styles.secondaryButton
                            }
                            disabled={isTransformingOfficialEvent}
                          >
                            {isTransformingOfficialEvent
                              ? "Transformando..."
                              : "Transformar a español"}
                          </button>

                          <a
                            href={selectedOfficialEvent.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        <p style={styles.sourceBodyPreview}>
                          {selectedOfficialEvent.description ||
                            "La fuente oficial no incluye una descripción editorial completa. Podrás completarla manualmente."}
                        </p>

                        <div style={styles.automationCard}>
                          <div style={styles.automationHeader}>
                            <div>
                              <p style={styles.sourceEyebrow}>
                                Automatización de cartelera
                              </p>
                              <h4 style={styles.automationTitle}>
                                Resolver y crear relaciones en Sanity
                              </h4>
                            </div>

                            <div style={styles.automationTopActions}>
                              <button
                                type="button"
                                onClick={() => {
                                  void resolveSelectedUfcEvent();
                                }}
                                style={
                                  isResolvingUfcEvent ||
                                  isPreparingFullUfcCard
                                    ? styles.buttonDisabled
                                    : styles.secondaryButton
                                }
                                disabled={
                                  isResolvingUfcEvent ||
                                  isPreparingFullUfcCard
                                }
                              >
                                {isResolvingUfcEvent
                                  ? "Resolviendo..."
                                  : "Analizar cartelera"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void prepareFullUfcCard();
                                }}
                                style={
                                  isPreparingFullUfcCard
                                    ? styles.buttonDisabled
                                    : styles.button
                                }
                                disabled={
                                  isPreparingFullUfcCard ||
                                  isResolvingUfcEvent ||
                                  isCreatingUfcFighters ||
                                  isCreatingUfcFights
                                }
                              >
                                {isPreparingFullUfcCard
                                  ? "Preparando cartelera..."
                                  : "Preparar cartelera completa"}
                              </button>
                            </div>
                          </div>

                          {ufcAutomationStatus.type !== "idle" ? (
                            <div
                              style={
                                ufcAutomationStatus.type === "success"
                                  ? styles.feedbackSuccess
                                  : styles.feedbackError
                              }
                            >
                              {ufcAutomationStatus.message}
                            </div>
                          ) : null}

                          {ufcEventResolution?.ok ? (
                            <>
                              <div style={styles.automationStats}>
                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Evento
                                  </span>
                                  <strong>
                                    {ufcEventResolution.event.found
                                      ? "Encontrado"
                                      : "No encontrado"}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.fights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Resueltos
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.readyFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Ya existentes
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.existingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Pendientes de crear
                                  </span>
                                  <strong>
                                    {ufcEventResolution.counts.pendingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores existentes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .existingFighters
                                    }
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores faltantes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .missingFighters
                                    }
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Categorías pendientes
                                  </span>
                                  <strong>
                                    {
                                      ufcEventResolution.counts
                                        .unresolvedCategories
                                    }
                                  </strong>
                                </div>
                              </div>

                              {ufcEventResolution.missingFighters.length > 0 ? (
                                <div style={styles.automationWarning}>
                                  <strong>Luchadores pendientes:</strong>{" "}
                                  {ufcEventResolution.missingFighters
                                    .map((fighter) => fighter.sourceName)
                                    .join(", ")}
                                </div>
                              ) : null}

                              {ufcEventResolution.unresolvedCategories.length >
                              0 ? (
                                <div style={styles.automationWarning}>
                                  <strong>Categorías sin resolver:</strong>{" "}
                                  {ufcEventResolution.unresolvedCategories
                                    .map((category) => category.sourceLabel)
                                    .join(", ")}
                                </div>
                              ) : null}

                              <div style={styles.automationActions}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void createMissingUfcFighters();
                                  }}
                                  style={
                                    canCreateMissingUfcFighters
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={!canCreateMissingUfcFighters}
                                >
                                  {isCreatingUfcFighters
                                    ? "Creando luchadores..."
                                    : `Crear luchadores faltantes (${ufcEventResolution.counts.missingFighters})`}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void createUfcFights();
                                  }}
                                  style={
                                    canCreateUfcFights
                                      ? styles.button
                                      : styles.buttonDisabled
                                  }
                                  disabled={!canCreateUfcFights}
                                >
                                  {isCreatingUfcFights
                                    ? "Creando combates..."
                                    : `Crear combates (${ufcEventResolution.counts.pendingFights})`}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p style={styles.inlineEmptyState}>
                              Analiza la cartelera para comprobar evento,
                              luchadores, categorías y combates disponibles.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona un evento para revisar sus datos oficiales.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar eventos UFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "evento" ? (
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Segundo conector oficial</p>
                <h2 style={styles.sectionTitle}>Bandeja de eventos BKFC</h2>
                <p style={styles.metaText}>
                  Carga eventos oficiales, crea el evento desde el laboratorio y
                  prepara luchadores y combates con categorías ya resueltas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialBkfcEvents();
                }}
                style={
                  isLoadingBkfcEvents
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isBkfcBusy}
              >
                {isLoadingBkfcEvents
                  ? "Actualizando eventos..."
                  : bkfcEventItems.length > 0
                  ? "Actualizar eventos BKFC"
                  : "Cargar eventos BKFC"}
              </button>
            </div>

            {bkfcEventsFetchedAt ? (
              <p style={styles.metaText}>
                Última lectura:{" "}
                {new Date(bkfcEventsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {bkfcSourceStatus.type !== "idle" ? (
              <div
                style={
                  bkfcSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {bkfcSourceStatus.message}
              </div>
            ) : null}

            {bkfcEventItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {bkfcEventItems.map((item) => {
                    const isSelected = item.id === selectedBkfcEventId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedBkfcEventId(item.id);
                          setBkfcEventResolution(null);
                          setBkfcSourceStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.name}</span>

                        {item.mainEvent ? (
                          <span style={styles.sourceItemSummary}>
                            {item.mainEvent}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.startDate
                            ? new Date(item.startDate).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.status}
                          {" · "}
                          {item.fightCard?.length ?? 0} combates
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedBkfcEvent ? (
                    <>
                      {selectedBkfcEvent.imageUrl ? (
                        <img
                          src={selectedBkfcEvent.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Evento BKFC seleccionado</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedBkfcEvent.name}
                        </h3>

                        <p style={styles.sourcePreviewSummary}>
                          {[
                            selectedBkfcEvent.mainEvent,
                            selectedBkfcEvent.locationText,
                            selectedBkfcEvent.watchText,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applySelectedBkfcEventToForm}
                            style={styles.secondaryButton}
                            disabled={isBkfcBusy}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void createSelectedBkfcEvent();
                            }}
                            style={
                              isCreatingBkfcEvent
                                ? styles.buttonDisabled
                                : styles.button
                            }
                            disabled={
                              isBkfcBusy ||
                              Boolean(bkfcEventResolution?.ok &&
                                bkfcEventResolution.event.found)
                            }
                          >
                            {isCreatingBkfcEvent
                              ? "Creando evento..."
                              : bkfcEventResolution?.ok &&
                                bkfcEventResolution.event.found
                              ? "Evento ya creado"
                              : "Crear evento en Sanity"}
                          </button>

                          <a
                            href={selectedBkfcEvent.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        <div style={styles.automationCard}>
                          <div style={styles.automationHeader}>
                            <div>
                              <p style={styles.sourceEyebrow}>
                                Automatización BKFC
                              </p>
                              <h4 style={styles.automationTitle}>
                                Preparar cartelera completa
                              </h4>
                            </div>

                            <div style={styles.automationTopActions}>
                              <button
                                type="button"
                                onClick={() => {
                                  void resolveSelectedBkfcEvent();
                                }}
                                style={
                                  isResolvingBkfcEvent
                                    ? styles.buttonDisabled
                                    : styles.secondaryButton
                                }
                                disabled={isBkfcBusy}
                              >
                                {isResolvingBkfcEvent
                                  ? "Analizando..."
                                  : "Analizar cartelera"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void prepareFullBkfcCard();
                                }}
                                style={
                                  isPreparingFullBkfcCard
                                    ? styles.buttonDisabled
                                    : styles.button
                                }
                                disabled={isBkfcBusy}
                              >
                                {isPreparingFullBkfcCard
                                  ? "Preparando..."
                                  : "Preparar cartelera completa"}
                              </button>
                            </div>
                          </div>

                          {bkfcEventResolution?.ok ? (
                            <>
                              <div style={styles.automationStats}>
                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Evento
                                  </span>
                                  <strong>
                                    {bkfcEventResolution.event.found
                                      ? "Encontrado"
                                      : "Pendiente"}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores
                                  </span>
                                  <strong>
                                    {bkfcEventResolution.counts.existingFighters}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Faltantes
                                  </span>
                                  <strong>
                                    {bkfcEventResolution.counts.missingFighters}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates listos
                                  </span>
                                  <strong>
                                    {bkfcEventResolution.counts.readyFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates existentes
                                  </span>
                                  <strong>
                                    {bkfcEventResolution.counts.existingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Categorías pendientes
                                  </span>
                                  <strong>
                                    {
                                      bkfcEventResolution.counts
                                        .unresolvedCategories
                                    }
                                  </strong>
                                </div>
                              </div>

                              {bkfcEventResolution.counts.unresolvedCategories >
                              0 ? (
                                <div style={styles.automationWarning}>
                                  La fuente mantiene{" "}
                                  {
                                    bkfcEventResolution.counts
                                      .unresolvedCategories
                                  }{" "}
                                  categoría sin resolver. Solo se crearán
                                  relaciones seguras.
                                </div>
                              ) : null}

                              <div style={styles.automationActions}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void createSelectedBkfcEvent();
                                  }}
                                  style={
                                    !bkfcEventResolution.event.found &&
                                    !isBkfcBusy
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    bkfcEventResolution.event.found ||
                                    isBkfcBusy
                                  }
                                >
                                  Crear evento
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void createMissingBkfcFighters();
                                  }}
                                  style={
                                    bkfcEventResolution.counts
                                      .missingFighters > 0 && !isBkfcBusy
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    bkfcEventResolution.counts
                                      .missingFighters === 0 || isBkfcBusy
                                  }
                                >
                                  {isCreatingBkfcFighters
                                    ? "Creando luchadores..."
                                    : `Crear luchadores (${bkfcEventResolution.counts.missingFighters})`}
                                </button>


                                <button
                                  type="button"
                                  onClick={() => {
                                    void createBkfcFights();
                                  }}
                                  style={
                                    bkfcEventResolution.event.found &&
                                    bkfcEventResolution.counts.pendingFights >
                                      0 &&
                                    !isBkfcBusy
                                      ? styles.button
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    !bkfcEventResolution.event.found ||
                                    bkfcEventResolution.counts.pendingFights ===
                                      0 ||
                                    isBkfcBusy
                                  }
                                >
                                  {isCreatingBkfcFights
                                    ? "Creando combates..."
                                    : `Crear combates (${bkfcEventResolution.counts.pendingFights})`}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p style={styles.inlineEmptyState}>
                              Analiza la cartelera para comprobar el evento,
                              luchadores, categorías y combates disponibles.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona un evento BKFC para revisar y preparar sus
                      datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar eventos BKFC” para consultar la fuente oficial.
              </p>
            )}
          </section>
        ) : null}

        {contentType === "evento" ? (
          <>
          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Fuente oficial FEKM</p>
                <h2 style={styles.sectionTitle}>Eventos y calendario FEKM</h2>
                <p style={styles.metaText}>Carga el calendario oficial, resuelve disciplinas y crea la organización FEKM y sus eventos como borradores controlados.</p>
              </div>
              <button type="button" onClick={() => { void reloadOfficialFekmEvents(); }} style={isLoadingFekmEvents ? styles.buttonDisabled : styles.secondaryButton} disabled={isFekmEventBusy}>
                {isLoadingFekmEvents ? "Actualizando..." : fekmEventItems.length ? "Actualizar eventos FEKM" : "Cargar eventos FEKM"}
              </button>
            </div>
            {fekmEventsFetchedAt ? <p style={styles.metaText}>Última lectura: {new Date(fekmEventsFetchedAt).toLocaleString("es-ES")}</p> : null}
            {fekmEventStatus.type !== "idle" ? <div style={fekmEventStatus.type === "success" ? styles.feedbackSuccess : styles.feedbackError}>{fekmEventStatus.message}</div> : null}
            {fekmEventItems.length > 0 ? <div style={styles.sourceLayout}>
              <div style={styles.sourceList}>
                {fekmEventItems.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedFekmEventId(item.id); setFekmEventResolution(null); setFekmEventOrchestration(null); setFekmEventStatus({ type: "idle", message: "" }); }} style={item.id === selectedFekmEventId ? styles.sourceItemSelected : styles.sourceItem}>
                  <span style={styles.sourceItemTitle}>{item.name}</span>
                  <span style={styles.sourceItemMeta}>{item.startDate ? new Date(item.startDate).toLocaleString("es-ES") : "Sin fecha"} · {item.disciplineLabel || item.discipline || "Disciplina por revisar"} · {item.status}</span>
                </button>)}
              </div>
              <div style={styles.sourcePreview}>
                {selectedFekmEvent ? <div style={styles.sourcePreviewContent}>
                  <p style={styles.sourceEyebrow}>Evento FEKM seleccionado</p>
                  <h3 style={styles.sourcePreviewTitle}>{selectedFekmEvent.name}</h3>
                  <p style={styles.sourcePreviewSummary}>{[selectedFekmEvent.locationText, selectedFekmEvent.category, selectedFekmEvent.scope].filter(Boolean).join(" · ")}</p>
                  <div style={styles.sourcePreviewActions}>
                    <button type="button" onClick={applySelectedFekmEventToForm} style={styles.secondaryButton} disabled={isFekmEventBusy}>Pasar al formulario</button>
                    <button type="button" onClick={() => { void resolveSelectedFekmEvent(); }} style={isResolvingFekmEvent ? styles.buttonDisabled : styles.secondaryButton} disabled={isFekmEventBusy}>{isResolvingFekmEvent ? "Analizando..." : "Analizar evento"}</button>
                    <button type="button" onClick={() => { void orchestrateSelectedFekmEvent(false); }} style={isAnalyzingFullFekmEvent ? styles.buttonDisabled : styles.secondaryButton} disabled={isFekmEventBusy}>{isAnalyzingFullFekmEvent ? "Analizando documento..." : "Analizar evento completo"}</button>
                    <button type="button" onClick={() => { void orchestrateSelectedFekmEvent(true); }} style={isPreparingFullFekmEvent ? styles.buttonDisabled : styles.button} disabled={isFekmEventBusy || !fekmEventOrchestration?.ok || !fekmEventOrchestration.readyToExecute}>{isPreparingFullFekmEvent ? "Preparando evento completo..." : "Preparar evento completo"}</button>
                    {!fekmEventResolution?.ok || !fekmEventResolution.resolution.organization ? <button type="button" onClick={() => { void createFekmOrganization(); }} style={isCreatingFekmOrganization ? styles.buttonDisabled : styles.secondaryButton} disabled={isFekmEventBusy}>{isCreatingFekmOrganization ? "Creando FEKM..." : "Crear organización FEKM"}</button> : null}
                    <button type="button" onClick={() => { void createSelectedFekmEvent(); }} style={isCreatingFekmEvent ? styles.buttonDisabled : styles.button} disabled={isFekmEventBusy || Boolean(fekmEventResolution?.ok && fekmEventResolution.resolution.existing)}>{isCreatingFekmEvent ? "Creando evento..." : fekmEventResolution?.ok && fekmEventResolution.resolution.existing ? "Evento ya creado" : "Crear evento en Sanity"}</button>
                    <a href={selectedFekmEvent.canonicalUrl} target="_blank" rel="noreferrer" style={styles.sourceLink}>Abrir fuente oficial</a>
                  </div>
                  {fekmEventResolution?.ok ? <div style={styles.automationCard}>
                    <p style={styles.metaText}>Disciplina: {fekmEventResolution.resolution.discipline?.nombre || "No resuelta"} · Organización: {fekmEventResolution.resolution.organization?.nombre || "No creada"} · {fekmEventResolution.resolution.existing ? "Duplicado detectado" : fekmEventResolution.resolution.readyToCreate ? "Listo para crear" : "Revisión necesaria"}</p>
                    {fekmEventResolution.resolution.warnings.length ? <p style={styles.metaText}>Avisos: {fekmEventResolution.resolution.warnings.join(" · ")}</p> : null}
                  </div> : null}
                  {fekmEventOrchestration?.ok ? <div style={styles.automationCard}>
                    <p style={styles.sourceEyebrow}>Preparación integral FEKM</p>
                    <p style={styles.metaText}>Documento: {fekmEventOrchestration.document?.title || fekmEventOrchestration.match?.document.title || "No resuelto"} · Confianza: {fekmEventOrchestration.match?.confidence || "baja"} · {fekmEventOrchestration.readyToExecute ? "Emparejamiento automático seguro" : "Revisión manual necesaria"}</p>
                    {fekmEventOrchestration.summary ? <p style={styles.metaText}>Participantes: {fekmEventOrchestration.summary.extractedParticipants} detectados · {fekmEventOrchestration.summary.highConfidence} de confianza alta · {fekmEventOrchestration.summary.reviewRequired} para revisión · {fekmEventOrchestration.summary.participantsExistingAfter || fekmEventOrchestration.summary.participantsExistingBefore} existentes · {fekmEventOrchestration.summary.participantsReadyAfter || fekmEventOrchestration.summary.participantsReadyBefore} aptos · {fekmEventOrchestration.summary.unresolvedCategoriesAfter || fekmEventOrchestration.summary.unresolvedCategoriesBefore} categorías sin resolver.</p> : null}
                    {fekmEventOrchestration.mode === "execute" && fekmEventOrchestration.summary ? <p style={styles.metaText}>Resultado: {fekmEventOrchestration.summary.categoriesCreated} categorías creadas · {fekmEventOrchestration.summary.participantsCreated} participantes creados · {fekmEventOrchestration.summary.participantsUpdated} actualizados · {fekmEventOrchestration.summary.participantsSkipped} omitidos · {fekmEventOrchestration.summary.participantsFailed} fallidos.</p> : null}
                    {fekmEventOrchestration.warnings.length ? <p style={styles.metaText}>Avisos: {fekmEventOrchestration.warnings.join(" · ")}</p> : null}
                    {fekmEventOrchestration.document?.pdfUrl ? <a href={fekmEventOrchestration.document.pdfUrl} target="_blank" rel="noreferrer" style={styles.sourceLink}>Abrir documento asociado</a> : null}
                  </div> : null}
                </div> : <p style={styles.metaText}>Selecciona un evento FEKM para revisar sus datos.</p>}
              </div>
            </div> : null}
          </section>

          <section style={styles.sourceCard}>
            <div style={styles.sourceHeader}>
              <div>
                <p style={styles.sourceEyebrow}>Tercer conector oficial</p>
                <h2 style={styles.sectionTitle}>Bandeja de eventos ONE Championship</h2>
                <p style={styles.metaText}>
                  Carga eventos oficiales de ONE, crea eventos coherentes y prepara luchadores y combates respetando la disciplina de cada pelea.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void reloadOfficialOneEvents();
                }}
                style={
                  isLoadingOneEvents
                    ? styles.buttonDisabled
                    : styles.secondaryButton
                }
                disabled={isOneEventBusy}
              >
                {isLoadingOneEvents
                  ? "Actualizando eventos..."
                  : oneEventItems.length > 0
                  ? "Actualizar eventos ONE"
                  : "Cargar eventos ONE"}
              </button>
            </div>

            {oneEventsFetchedAt ? (
              <p style={styles.metaText}>
                Última lectura:{" "}
                {new Date(oneEventsFetchedAt).toLocaleString("es-ES")}
              </p>
            ) : null}

            {oneEventSourceStatus.type !== "idle" ? (
              <div
                style={
                  oneEventSourceStatus.type === "success"
                    ? styles.feedbackSuccess
                    : styles.feedbackError
                }
              >
                {oneEventSourceStatus.message}
              </div>
            ) : null}

            {oneEventItems.length > 0 ? (
              <div style={styles.sourceLayout}>
                <div style={styles.sourceList}>
                  {oneEventItems.map((item) => {
                    const isSelected = item.id === selectedOneEventId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedOneEventId(item.id);
                          setOneEventResolution(null);
                          setOneEventSourceStatus({
                            type: "idle",
                            message: "",
                          });
                        }}
                        style={
                          isSelected
                            ? styles.sourceItemSelected
                            : styles.sourceItem
                        }
                      >
                        <span style={styles.sourceItemTitle}>{item.name}</span>

                        {item.mainEvent ? (
                          <span style={styles.sourceItemSummary}>
                            {item.mainEvent}
                          </span>
                        ) : null}

                        <span style={styles.sourceItemMeta}>
                          {item.startDate
                            ? new Date(item.startDate).toLocaleString("es-ES")
                            : "Fecha no disponible"}
                          {" · "}
                          {item.status}
                          {" · "}
                          {item.fightCard?.length ?? 0} combates
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={styles.sourcePreview}>
                  {selectedOneEvent ? (
                    <>
                      {selectedOneEvent.imageUrl ? (
                        <img
                          src={selectedOneEvent.imageUrl}
                          alt=""
                          style={styles.sourceImage}
                        />
                      ) : null}

                      <div style={styles.sourcePreviewContent}>
                        <p style={styles.sourceEyebrow}>Evento ONE seleccionado</p>
                        <h3 style={styles.sourcePreviewTitle}>
                          {selectedOneEvent.name}
                        </h3>

                        <p style={styles.sourcePreviewSummary}>
                          {[
                            selectedOneEvent.mainEvent,
                            selectedOneEvent.locationText,
                            selectedOneEvent.watchText,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>

                        <div style={styles.sourcePreviewActions}>
                          <button
                            type="button"
                            onClick={applySelectedOneEventToForm}
                            style={styles.secondaryButton}
                            disabled={isOneEventBusy}
                          >
                            Pasar al formulario
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void createSelectedOneEvent();
                            }}
                            style={
                              isCreatingOneEvent
                                ? styles.buttonDisabled
                                : styles.button
                            }
                            disabled={
                              isOneEventBusy ||
                              Boolean(oneEventResolution?.ok &&
                                oneEventResolution.event.found)
                            }
                          >
                            {isCreatingOneEvent
                              ? "Creando evento..."
                              : oneEventResolution?.ok &&
                                oneEventResolution.event.found
                              ? "Evento ya creado"
                              : "Crear evento en Sanity"}
                          </button>

                          <a
                            href={selectedOneEvent.canonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.sourceLink}
                          >
                            Abrir fuente oficial
                          </a>
                        </div>

                        <div style={styles.automationCard}>
                          <div style={styles.automationHeader}>
                            <div>
                              <p style={styles.sourceEyebrow}>
                                Automatización ONE
                              </p>
                              <h4 style={styles.automationTitle}>
                                Preparar cartelera completa
                              </h4>
                            </div>

                            <div style={styles.automationTopActions}>
                              <button
                                type="button"
                                onClick={() => {
                                  void resolveSelectedOneEvent();
                                }}
                                style={
                                  isResolvingOneEvent
                                    ? styles.buttonDisabled
                                    : styles.secondaryButton
                                }
                                disabled={isOneEventBusy}
                              >
                                {isResolvingOneEvent
                                  ? "Analizando..."
                                  : "Analizar cartelera"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  void prepareFullOneCard();
                                }}
                                style={
                                  isPreparingFullOneCard
                                    ? styles.buttonDisabled
                                    : styles.button
                                }
                                disabled={isOneEventBusy}
                              >
                                {isPreparingFullOneCard
                                  ? "Preparando..."
                                  : "Preparar cartelera completa"}
                              </button>
                            </div>
                          </div>

                          {oneEventResolution?.ok ? (
                            <>
                              <div style={styles.automationStats}>
                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Evento
                                  </span>
                                  <strong>
                                    {oneEventResolution.event.found
                                      ? "Encontrado"
                                      : "Pendiente"}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Luchadores
                                  </span>
                                  <strong>
                                    {oneEventResolution.counts.existingFighters}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Faltantes
                                  </span>
                                  <strong>
                                    {oneEventResolution.counts.missingFighters}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates listos
                                  </span>
                                  <strong>
                                    {oneEventResolution.counts.readyFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Combates existentes
                                  </span>
                                  <strong>
                                    {oneEventResolution.counts.existingFights}
                                  </strong>
                                </div>

                                <div style={styles.automationStat}>
                                  <span style={styles.automationStatLabel}>
                                    Categorías pendientes
                                  </span>
                                  <strong>
                                    {
                                      oneEventResolution.counts
                                        .unresolvedCategories
                                    }
                                  </strong>
                                </div>
                              </div>

                              {oneEventResolution.counts.unresolvedCategories >
                              0 ? (
                                <div style={styles.automationWarning}>
                                  La fuente mantiene{" "}
                                  {
                                    oneEventResolution.counts
                                      .unresolvedCategories
                                  }{" "}
                                  categoría sin resolver. Solo se crearán
                                  relaciones seguras.
                                </div>
                              ) : null}

                              <div style={styles.automationActions}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void createSelectedOneEvent();
                                  }}
                                  style={
                                    !oneEventResolution.event.found &&
                                    !isOneEventBusy
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    oneEventResolution.event.found ||
                                    isOneEventBusy
                                  }
                                >
                                  Crear evento
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void createMissingOneCategories();
                                  }}
                                  style={
                                    oneEventResolution.counts
                                      .unresolvedCategories > 0 && !isOneEventBusy
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    oneEventResolution.counts
                                      .unresolvedCategories === 0 || isOneEventBusy
                                  }
                                >
                                  {isCreatingOneCategories
                                    ? "Creando categorías..."
                                    : `Crear categorías (${oneEventResolution.counts.unresolvedCategories})`}
                                </button>


                                <button
                                  type="button"
                                  onClick={() => {
                                    void createMissingOneFighters();
                                  }}
                                  style={
                                    oneEventResolution.counts
                                      .missingFighters > 0 && !isOneEventBusy
                                      ? styles.secondaryButton
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    oneEventResolution.counts
                                      .missingFighters === 0 || isOneEventBusy
                                  }
                                >
                                  {isCreatingOneFighters
                                    ? "Creando luchadores..."
                                    : `Crear luchadores (${oneEventResolution.counts.missingFighters})`}
                                </button>


                                <button
                                  type="button"
                                  onClick={() => {
                                    void createOneFights();
                                  }}
                                  style={
                                    oneEventResolution.event.found &&
                                    oneEventResolution.counts.pendingFights >
                                      0 &&
                                    !isOneEventBusy
                                      ? styles.button
                                      : styles.buttonDisabled
                                  }
                                  disabled={
                                    !oneEventResolution.event.found ||
                                    oneEventResolution.counts.pendingFights ===
                                      0 ||
                                    isOneEventBusy
                                  }
                                >
                                  {isCreatingOneFights
                                    ? "Creando combates..."
                                    : `Crear combates (${oneEventResolution.counts.pendingFights})`}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p style={styles.inlineEmptyState}>
                              Analiza la cartelera para comprobar el evento,
                              luchadores, categorías y combates disponibles.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p style={styles.emptyText}>
                      Selecciona un evento ONE para revisar y preparar sus
                      datos.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p style={styles.emptyText}>
                Pulsa “Cargar eventos ONE” para consultar la fuente oficial.
              </p>
            )}
          </section>
          </>
        ) : null}

        <div style={styles.grid}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Campos reales de schema</h2>

            <div style={styles.formGrid}>
              {visibleSchemaFields.map((field) => (
                <div key={field.name} style={styles.fieldBlock}>
                  <label style={styles.label}>
                    <span>
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    {renderField(field)}
                  </label>

                  {field.description ? (
                    <p style={styles.helpText}>{field.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Inputs auxiliares</h2>

            <div style={styles.formGrid}>
              {definition.auxiliaryInputs.map((input) => (
                <div key={input.name} style={styles.fieldBlock}>
                  {input.kind === "boolean" ? (
                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={getBooleanValue(auxiliary[input.name])}
                        onChange={(event) =>
                          updateAuxiliaryField(
                            input.name,
                            input.kind,
                            event.target.checked
                          )
                        }
                      />
                      <span>{input.label}</span>
                    </label>
                  ) : input.kind === "reference" ? (
                    <label style={styles.label}>
                      <span>{input.label}</span>
                      {renderAuxiliaryReferenceSelect(input)}
                    </label>
                  ) : (
                    <label style={styles.label}>
                      <span>{input.label}</span>
                      {input.kind === "text" ? (
                        <textarea
                          value={getStringValue(auxiliary[input.name])}
                          onChange={(event) =>
                            updateAuxiliaryField(
                              input.name,
                              input.kind,
                              event.target.value
                            )
                          }
                          rows={typeof input.rows === "number" ? input.rows : 4}
                          style={styles.textarea}
                        />
                      ) : (
                        <input
                          type="text"
                          value={getStringValue(auxiliary[input.name])}
                          onChange={(event) =>
                            updateAuxiliaryField(
                              input.name,
                              input.kind,
                              event.target.value
                            )
                          }
                          style={styles.input}
                        />
                      )}
                    </label>
                  )}

                  {input.description ? (
                    <p style={styles.helpText}>{input.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section style={styles.card}>
          <div style={styles.resultHeader}>
            <h2 style={styles.sectionTitle}>Resultado</h2>
            {result ? (
              <div style={styles.badges}>
                <span style={styles.badgeNeutral}>
                  {getIssueCount(result.issues, "error")} errores
                </span>
                <span style={styles.badgeNeutral}>
                  {getIssueCount(result.issues, "warning")} avisos
                </span>
                <span style={result.ok ? styles.badgeOk : styles.badgeError}>
                  {result.ok ? "Output válido" : "Output bloqueado"}
                </span>
              </div>
            ) : null}
          </div>

          {!result ? (
            <p style={styles.emptyText}>
              Aún no has generado ningún output. Rellena el formulario y pulsa
              “Generar output”.
            </p>
          ) : (
            <div style={styles.resultGrid}>
              <div style={styles.resultPanel}>
                <h3 style={styles.subTitle}>Issues</h3>
                {result.issues.length === 0 ? (
                  <p style={styles.emptyText}>Sin errores ni avisos.</p>
                ) : (
                  <ul style={styles.issueList}>
                    {result.issues.map((issue, index) => (
                      <li
                        key={`${issue.field}-${issue.message}-${index}`}
                        style={styles.issueItem}
                      >
                        <strong>
                          [{issue.severity.toUpperCase()}] {issue.field}
                        </strong>{" "}
                        — {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={styles.resultPanel}>
                <h3 style={styles.subTitle}>Preview JSON</h3>
                <pre style={styles.pre}>{prettyJson(result.output)}</pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#f5f7fa",
    padding: "32px 20px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  container: {
    maxWidth: 1320,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    opacity: 0.7,
  },
  title: {
    margin: "6px 0 10px",
    fontSize: 34,
    lineHeight: 1.1,
  },
  description: {
    margin: 0,
    maxWidth: 720,
    opacity: 0.82,
    lineHeight: 1.5,
  },
  stickyNav: {
    position: "sticky",
    top: 0,
    zIndex: 900,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 54,
    padding: "7px 10px 7px 14px",
    margin: "-32px 0 0",
    border: "1px solid rgba(255,255,255,0.08)",
    borderTop: 0,
    borderRadius: "0 0 16px 16px",
    background: "rgba(11,15,20,0.95)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.2)",
  },
  stickyBrand: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },
  stickyBrandMark: {
    display: "grid",
    placeItems: "center",
    minWidth: 38,
    height: 26,
    padding: "0 8px",
    borderRadius: 8,
    background: "#f5f7fa",
    color: "#0b0f14",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.05em",
  },
  stickyBrandText: {
    overflow: "hidden",
    color: "#d8dee5",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  headerActions: {
    minWidth: 280,
    display: "grid",
    gap: 12,
  },
  actionButtons: {
    display: "grid",
    gap: 10,
  },
  metaCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 16,
  },
  metaText: {
    margin: "8px 0 0",
    opacity: 0.8,
    lineHeight: 1.5,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 20,
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
    display: "grid",
    gap: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
  },
  subTitle: {
    margin: 0,
    fontSize: 16,
  },
  formGrid: {
    display: "grid",
    gap: 14,
  },
  fieldBlock: {
    display: "grid",
    gap: 8,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  helpText: {
    margin: 0,
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.4,
  },
  inlineEmptyState: {
    margin: 0,
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 1.4,
  },
  input: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.2)",
    color: "#f5f7fa",
    padding: "12px 14px",
    outline: "none",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.2)",
    color: "#f5f7fa",
    padding: "12px 14px",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  referenceArrayGroup: {
    display: "grid",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
  },
  referenceCheckboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 500,
  },
  button: {
    border: 0,
    borderRadius: 14,
    padding: "12px 16px",
    background: "#f5f7fa",
    color: "#0b0f14",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "#f5f7fa",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(245,247,250,0.45)",
    fontWeight: 700,
    cursor: "not-allowed",
    opacity: 0.7,
  },
  feedbackNeutral: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#dbe4ee",
    fontSize: 13,
    lineHeight: 1.4,
  },
  feedbackSuccess: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(16,185,129,0.16)",
    border: "1px solid rgba(16,185,129,0.3)",
    color: "#b7f7d8",
    fontSize: 13,
    lineHeight: 1.4,
  },
  feedbackError: {
    borderRadius: 14,
    padding: "12px 14px",
    background: "rgba(239,68,68,0.16)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 1.4,
  },
  sourceCard: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 20,
    display: "grid",
    gap: 16,
  },
  sourceHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  sourceHeaderActions: {
    display: "flex",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  sourceSelectLabel: {
    display: "grid",
    gap: 6,
    minWidth: 180,
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.9,
  },
  sourceSelect: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#f5f7fa",
    padding: "11px 14px",
    outline: "none",
    fontSize: 14,
    fontWeight: 700,
  },
  sourceEyebrow: {
    margin: "0 0 6px",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  sourceTimestamp: {
    margin: 0,
    fontSize: 12,
    opacity: 0.65,
  },
  sourceLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 0.85fr) minmax(340px, 1.15fr)",
    gap: 16,
    alignItems: "start",
  },
  sourceList: {
    display: "grid",
    gap: 10,
    maxHeight: 620,
    overflowY: "auto",
    paddingRight: 4,
  },
  sourceItem: {
    width: "100%",
    display: "grid",
    gap: 7,
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.16)",
    color: "#f5f7fa",
    padding: 14,
    cursor: "pointer",
  },
  sourceItemSelected: {
    width: "100%",
    display: "grid",
    gap: 7,
    textAlign: "left",
    borderRadius: 14,
    border: "1px solid rgba(245,247,250,0.55)",
    background: "rgba(255,255,255,0.1)",
    color: "#f5f7fa",
    padding: 14,
    cursor: "pointer",
  },
  sourceItemTitle: {
    fontSize: 14,
    fontWeight: 750,
    lineHeight: 1.35,
  },
  sourceItemSummary: {
    fontSize: 12,
    opacity: 0.76,
    lineHeight: 1.45,
  },
  sourceItemMeta: {
    fontSize: 11,
    opacity: 0.58,
    lineHeight: 1.4,
  },
  sourcePreview: {
    minHeight: 260,
    display: "grid",
    gap: 14,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.18)",
  },
  sourceImage: {
    display: "block",
    width: "100%",
    maxHeight: 290,
    objectFit: "cover",
  },
  sourcePreviewContent: {
    display: "grid",
    gap: 12,
    padding: 18,
  },
  sourcePreviewTitle: {
    margin: 0,
    fontSize: 22,
    lineHeight: 1.25,
  },
  sourcePreviewSummary: {
    margin: 0,
    opacity: 0.8,
    lineHeight: 1.5,
  },
  sourcePreviewActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  sourceLink: {
    color: "#f5f7fa",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  newsRelationsCard: {
    display: "grid",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  newsRelationsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  newsRelationsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  newsRelationGroup: {
    display: "grid",
    gap: 5,
    padding: 10,
    borderRadius: 12,
    background: "rgba(0,0,0,0.18)",
  },
  newsRelationTags: {
    fontSize: 13,
    lineHeight: 1.5,
    opacity: 0.88,
  },
  newsRelationWarning: {
    padding: 10,
    borderRadius: 12,
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.28)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  compactList: {
    margin: "8px 0 0",
    paddingLeft: 18,
    display: "grid",
    gap: 4,
  },
  sourceBodyPreview: {
    margin: 0,
    paddingTop: 4,
    whiteSpace: "pre-wrap",
    fontSize: 13,
    lineHeight: 1.6,
    opacity: 0.78,
  },
  tertiaryButton: {
    justifySelf: "start",
    border: "none",
    background: "transparent",
    padding: "4px 0",
    color: "inherit",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "underline",
    textUnderlineOffset: 4,
    cursor: "pointer",
    opacity: 0.82,
  },
  batchCard: {
    display: "grid",
    gap: 14,
    marginBottom: 18,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  batchHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
  },
  batchTitle: {
    margin: "4px 0 6px",
    fontSize: 18,
  },
  batchHeaderActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  batchProgressList: {
    display: "grid",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.18)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  batchProgressItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.025)",
    flexWrap: "wrap",
  },
  batchProgressText: {
    display: "grid",
    gap: 4,
    minWidth: 0,
    flex: "1 1 420px",
  },
  batchSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  batchList: {
    display: "grid",
    gap: 10,
  },
  batchItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.07)",
    flexWrap: "wrap",
  },
  batchItemMain: {
    display: "grid",
    gap: 5,
    minWidth: 0,
    flex: "1 1 520px",
  },
  batchItemMeta: {
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 1.5,
  },
  batchItemActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  batchStatusOk: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.14)",
    border: "1px solid rgba(34,197,94,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchStatusPending: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(245,158,11,0.14)",
    border: "1px solid rgba(245,158,11,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchStatusError: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(239,68,68,0.14)",
    border: "1px solid rgba(239,68,68,0.3)",
    fontSize: 12,
    fontWeight: 700,
  },
  batchError: {
    fontSize: 12,
    color: "#fca5a5",
    lineHeight: 1.4,
  },
  automationCard: {
    display: "grid",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  automationHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  automationTitle: {
    margin: "4px 0 0",
    fontSize: 17,
    lineHeight: 1.25,
  },
  automationTopActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  automationStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
  },
  automationStat: {
    display: "grid",
    gap: 4,
    minHeight: 72,
    padding: 12,
    borderRadius: 14,
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  automationStatLabel: {
    fontSize: 12,
    opacity: 0.68,
    lineHeight: 1.3,
  },
  automationWarning: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.28)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  automationActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  badgeNeutral: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(255,255,255,0.08)",
  },
  badgeOk: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(16,185,129,0.18)",
    color: "#b7f7d8",
  },
  badgeError: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "rgba(239,68,68,0.18)",
    color: "#fecaca",
  },
  emptyText: {
    margin: 0,
    opacity: 0.75,
    lineHeight: 1.5,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "0.8fr 1.2fr",
    gap: 16,
  },
  resultPanel: {
    display: "grid",
    gap: 12,
  },
  issueList: {
    margin: 0,
    paddingLeft: 18,
    display: "grid",
    gap: 8,
  },
  issueItem: {
    lineHeight: 1.45,
  },
  pre: {
    margin: 0,
    padding: 16,
    borderRadius: 16,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.08)",
    overflowX: "auto",
    fontSize: 12,
    lineHeight: 1.5,
  },
};
