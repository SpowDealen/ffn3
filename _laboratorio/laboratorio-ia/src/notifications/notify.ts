import {createNotification} from "./store";
import {
  analysisCompletedTitle,
  draftCreatedMessage,
  draftCreatedTitle,
  errorTitle,
  reviewRecommendedTitle,
} from "./templates";
import type {NotificationChannels, NotificationLocation} from "./types";

type BaseOptions = {
  source?: string;
  location?: NotificationLocation;
};

const READ_ONLY_CHANNELS: NotificationChannels = Object.freeze({
  activityCenter: true,
  telegram: false,
});

type AnalysisOptions = BaseOptions & {
  count: number;
  apt?: number;
  review?: number;
  insufficient?: number;
  duplicates?: number;
};

type DraftOptions = BaseOptions & {
  count: number;
  createdAfterReview?: boolean;
};

type DraftBatchOptions = BaseOptions & {
  created: number;
  skipped: number;
  errors: number;
  attempted: number;
};

type ErrorOptions = BaseOptions & {
  action: string;
  message: string;
};

export function notifySourceLoaded({
  source,
  count,
  location,
}: BaseOptions & {count: number}): void {
  createNotification({
    level: "success",
    kind: "source",
    title:
      count === 1
        ? "1 noticia cargada"
        : `${count} noticias cargadas`,
    message: `La fuente ${source ?? "seleccionada"} está disponible para analizar.`,
    source,
    count,
    location,
    channels: READ_ONLY_CHANNELS,
  });
}

export function notifyAnalysisCompleted({
  source,
  count,
  apt = 0,
  review = 0,
  insufficient = 0,
  duplicates = 0,
  location,
}: AnalysisOptions): void {
  const pendingCount = review + insufficient;
  const needsReview = pendingCount > 0;

  createNotification({
    level: needsReview ? "review" : "success",
    kind: "analysis",
    title: needsReview
      ? "IA terminó el análisis con revisiones"
      : analysisCompletedTitle(count),
    message: [
      `${count} analizadas`,
      `${apt} aptas`,
      `${review} para revisión`,
      insufficient > 0 ? `${insufficient} insuficientes` : "",
      `${duplicates} duplicadas`,
    ]
      .filter(Boolean)
      .join(" · "),
    source,
    count,
    location: needsReview ? location : undefined,
  });
}

export function notifyDraftCreated({
  source,
  count,
  createdAfterReview = false,
  location,
}: DraftOptions): void {
  createNotification({
    level: "success",
    kind: "draft",
    title: createdAfterReview
      ? "Borrador creado tras aprobación"
      : draftCreatedTitle(count),
    message: createdAfterReview
      ? "El editor autorizó su creación pese a la recomendación de revisión de la IA."
      : draftCreatedMessage(count),
    source,
    count,
    location,
  });
}

export function notifyDraftBatchProcessed({
  source,
  created,
  skipped,
  errors,
  attempted,
  location,
}: DraftBatchOptions): void {
  if (errors > 0) {
    createNotification({
      level: "error",
      kind: "draft",
      title: "Creación de borradores incompleta",
      message: `${created} creados · ${skipped} omitidos · ${errors} con error.`,
      source,
      count: attempted,
      location,
    });
    return;
  }

  if (skipped > 0) {
    createNotification({
      level: "review",
      kind: "draft",
      title: "Borradores procesados con revisiones",
      message: `${created} creados en Sanity · ${skipped} omitidos y pendientes de comprobación.`,
      source,
      count: attempted,
      location,
    });
    return;
  }

  notifyDraftCreated({
    source,
    count: created,
    location,
  });
}

export function notifyReviewRecommended({
  source,
  message,
  location,
}: BaseOptions & {message: string}): void {
  createNotification({
    level: "review",
    kind: "analysis",
    title: reviewRecommendedTitle(),
    message,
    source,
    count: 1,
    location,
  });
}

export function notifyError({
  source,
  action,
  message,
  location,
}: ErrorOptions): void {
  createNotification({
    level: "error",
    kind: "system",
    title: errorTitle(action),
    message,
    source,
    location,
  });
}

/** A read failure remains visible locally but never escalates to Telegram. */
export function notifyReadError({
  source,
  action,
  message,
  location,
}: ErrorOptions): void {
  createNotification({
    level: "error",
    kind: "system",
    title: errorTitle(action),
    message,
    source,
    location,
    channels: READ_ONLY_CHANNELS,
  });
}

type EventAnalysisOptions = BaseOptions & {
  count: number;
  completed: number;
  ready: number;
  pending: number;
  review: number;
};

type EntityBatchOptions = BaseOptions & {
  entity: "fighter" | "fight" | "event" | "category";
  created: number;
  skipped: number;
  failed: number;
};

export function notifyEventsLoaded({
  source,
  count,
}: BaseOptions & {count: number}): void {
  createNotification({
    level: "success",
    kind: "event",
    title:
      count === 1
        ? "1 evento cargado"
        : `${count} eventos cargados`,
    message: `${source ?? "La fuente"} está disponible para analizar.`,
    source,
    count,
    channels: READ_ONLY_CHANNELS,
  });
}

export function notifyEventAnalysisCompleted({
  source,
  count,
  completed,
  ready,
  pending,
  review,
  location,
}: EventAnalysisOptions): void {
  const needsReview = pending > 0 || review > 0;

  createNotification({
    level: needsReview ? "review" : "success",
    kind: "event",
    title: needsReview
      ? "Carteleras analizadas con revisiones"
      : "Carteleras analizadas",
    message: `${count} eventos · ${completed} completos · ${ready} listos · ${pending} pendientes · ${review} para revisión.`,
    source,
    count,
    location: needsReview ? location : undefined,
  });
}

export function notifyEventResolved({
  source,
  eventName,
  existingFights,
  pendingFights,
  missingFighters,
  unresolvedCategories,
  eventFound,
  location,
}: BaseOptions & {
  eventName: string;
  existingFights: number;
  pendingFights: number;
  missingFighters: number;
  unresolvedCategories: number;
  eventFound: boolean;
}): void {
  const needsReview =
    !eventFound ||
    pendingFights > 0 ||
    missingFighters > 0 ||
    unresolvedCategories > 0;

  createNotification({
    level: needsReview ? "review" : "success",
    kind: "event",
    title: needsReview
      ? "Cartelera necesita revisión"
      : "Cartelera completa",
    message: `${eventName} · ${existingFights} combates existentes · ${pendingFights} pendientes · ${missingFighters} luchadores pendientes · ${unresolvedCategories} categorías sin resolver.`,
    source,
    count: 1,
    location: needsReview ? location : undefined,
  });
}

export function notifyEntityBatchProcessed({
  source,
  entity,
  created,
  skipped,
  failed,
  location,
}: EntityBatchOptions): void {
  const labels = {
    fighter: ["luchador", "luchadores"],
    fight: ["combate", "combates"],
    event: ["evento", "eventos"],
    category: ["categoría", "categorías"],
  } as const;

  const [singular, plural] = labels[entity];
  const noun = created === 1 ? singular : plural;

  createNotification({
    level:
      failed > 0
        ? "error"
        : skipped > 0
          ? "review"
          : "success",
    kind:
      entity === "fighter"
        ? "fighter"
        : entity === "fight"
          ? "fight"
          : "event",
    title:
      failed > 0
        ? `Creación de ${plural} incompleta`
        : `${created} ${noun} creados`,
    message: `${created} creados · ${skipped} omitidos · ${failed} fallidos.`,
    source,
    count: created + skipped + failed,
    location:
      failed > 0 || skipped > 0
        ? location
        : location,
  });
}

export function notifyEventCreated({
  source,
  eventName,
  location,
}: BaseOptions & {eventName: string}): void {
  createNotification({
    level: "success",
    kind: "event",
    title: "Evento creado",
    message: `${eventName} está disponible para supervisión en Sanity.`,
    source,
    count: 1,
    location,
  });
}
