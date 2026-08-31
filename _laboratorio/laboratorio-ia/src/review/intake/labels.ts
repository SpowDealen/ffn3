import {REVIEW_ISSUE_KIND_LABELS, REVIEW_MODULE_LABELS} from "../formatters";
import type {ReviewCase, ReviewJsonObject} from "../types";
import type {ReviewCaseHumanLabels} from "./types";

const ENTITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  news: "Noticia",
  external_news: "Noticia",
  event: "Evento",
  fighter: "Luchador",
  fighter_resolution: "Luchador",
  participant: "Participante",
  organization: "Organización",
  discipline: "Disciplina",
  weight_category: "Categoría de peso",
  fight: "Combate",
  relation: "Relación",
  reference: "Referencia",
});

function intakeContext(reviewCase: ReviewCase): ReviewJsonObject | undefined {
  const value = reviewCase.context.unifiedReviewIntake;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ReviewJsonObject
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function deriveReviewCaseHumanLabels(reviewCase: ReviewCase): ReviewCaseHumanLabels {
  const intake = intakeContext(reviewCase);
  const firstIssue = reviewCase.issues[0];
  return {
    sourceLabel: text(intake?.sourceLabel) ?? reviewCase.source ?? REVIEW_MODULE_LABELS[reviewCase.module],
    entityLabel: text(intake?.entityLabel) ?? ENTITY_LABELS[reviewCase.subject.type] ?? reviewCase.subject.type,
    problemTitle: text(intake?.problemTitle) ?? (firstIssue ? REVIEW_ISSUE_KIND_LABELS[firstIssue.kind] : reviewCase.title),
    problemSummary: text(intake?.problemSummary) ?? firstIssue?.message ?? reviewCase.title,
  };
}
