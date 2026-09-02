import type {ReviewCase, ReviewJsonObject} from "../../types";
import {OFFICIAL_REVIEW_RESUME_PRODUCERS, type ReviewOriginResumeContext, type ReviewProducerSupport} from "./types";

function object(value: unknown): value is ReviewJsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readReviewOriginResumeContext(reviewCase: ReviewCase): ReviewOriginResumeContext | undefined {
  const intake = reviewCase.context.unifiedReviewIntake;
  if (!object(intake) || !object(intake.resume)) return undefined;
  const resume = intake.resume;
  const producer = typeof resume.producer === "string" ? resume.producer : "";
  const originId = typeof resume.originId === "string" ? resume.originId.trim() : "";
  const operation = typeof resume.operation === "string" ? resume.operation.trim() : "";
  const fingerprint = typeof resume.fingerprint === "string" ? resume.fingerprint.trim() : "";
  if (!(OFFICIAL_REVIEW_RESUME_PRODUCERS as readonly string[]).includes(producer) || !originId || !operation || !fingerprint) return undefined;
  if (reviewCase.context.producer !== producer) return undefined;
  return Object.freeze({schemaVersion: 1, producer: producer as ReviewOriginResumeContext["producer"], originId, operation, fingerprint});
}

export const RX5_REVIEW_PRODUCER_SUPPORT: readonly ReviewProducerSupport[] = Object.freeze([
  Object.freeze({producer: "external_news", status: "supported", authority: "AU2/AU3 external-news resume executor", reason: "Preview, autorización, persistencia idempotente y observación ya certificadas."}),
  ...OFFICIAL_REVIEW_RESUME_PRODUCERS.map((producer) => Object.freeze({producer, status: "supported" as const, authority: "Panel IA · callback oficial del productor", reason: "El runtime registra el analizador o resolver oficial, exige resultado observable y conserva AU7/AU8 para cualquier efecto gobernado."})),
]);

export function getReviewProducerSupport(producer: string): ReviewProducerSupport {
  return RX5_REVIEW_PRODUCER_SUPPORT.find((entry) => entry.producer === producer) ?? Object.freeze({producer, status: "not_supported_yet", authority: "Ninguna", reason: "El productor no pertenece al contrato RX5."});
}
