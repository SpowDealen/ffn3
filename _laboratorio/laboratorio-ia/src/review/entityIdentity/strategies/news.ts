import {normalizeCanonicalUrl, normalizeIdentityDate, normalizeIdentityText, tokenSimilarity} from "../normalize";
import type {EntityIdentityStrategy, NewsIdentity, NewsIdentityInput} from "../types";
import {baseConflict, commonIdentity, comparison, evidence, externalIdentityKeys, finalizeIdentity, genericNoMatch, identityKey, normalizedContext, safeRaw, sameNormalized} from "./shared";

function build(input: NewsIdentityInput): NewsIdentity {
  const canonicalUrl = normalizeCanonicalUrl(input.canonicalUrl);
  const publishedDate = normalizeIdentityDate(input.publishedDate);
  const entities = [...(input.primaryEntities ?? [])].map((value) => normalizeIdentityText(value).normalizedValue).filter(Boolean).sort();
  const common = commonIdentity(input);
  const context = normalizedContext({canonicalUrl, sourceId: input.sourceId, publisher: input.publisher, publishedDate, primaryEntities: entities, relatedEvent: input.relatedEvent, contentFingerprint: input.contentFingerprint});
  const keys = [
    ...externalIdentityKeys(common.externalIdentifiers),
    ...(canonicalUrl ? [identityKey("news-canonical-url", "definitive", ["canonicalUrl"], canonicalUrl)] : []),
    ...(input.sourceId && input.publisher ? [identityKey("news-source-id", "definitive", ["publisher", "sourceId"], `${normalizeIdentityText(input.publisher).normalizedValue}:${input.sourceId}`)] : []),
    ...(input.contentFingerprint ? [identityKey("news-content-fingerprint", "very_strong", ["contentFingerprint"], input.contentFingerprint)] : []),
  ];
  return finalizeIdentity<NewsIdentity>({
    ...common,
    entityType: "news",
    rawInput: safeRaw({primaryLabel: input.primaryLabel, canonicalUrl, sourceId: input.sourceId, publisher: input.publisher, publishedDate, relatedEvent: input.relatedEvent, contentFingerprint: input.contentFingerprint}),
    normalizedFields: {primaryLabel: normalizeIdentityText(input.primaryLabel, {removeEditorialSuffix: true})},
    identityKeys: keys, context, attributes: context as NewsIdentity["attributes"],
  });
}

function compare(input: NewsIdentity, candidate: NewsIdentity) {
  const base = baseConflict(input, candidate);
  if (base) return base;
  if (input.attributes.canonicalUrl && input.attributes.canonicalUrl === candidate.attributes.canonicalUrl) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "canonical_url_match", "definitive", "Coincide la URL canónica sin tracking.")]});
  if (input.attributes.sourceId && candidate.attributes.sourceId && input.attributes.publisher && candidate.attributes.publisher && input.attributes.sourceId === candidate.attributes.sourceId && sameNormalized(input.attributes.publisher, candidate.attributes.publisher)) return comparison({decision: "exact_match", score: 1, input, candidate, matchedKeys: [evidence("key_match", "news_source_id_match", "definitive", "Coinciden fuente e ID del artículo.")]});
  if (input.attributes.contentFingerprint && input.attributes.contentFingerprint === candidate.attributes.contentFingerprint) return comparison({decision: "strong_match", score: .98, input, candidate, matchedKeys: [evidence("key_match", "news_content_fingerprint_match", "very_strong", "Coincide el fingerprint de contenido.")]});
  const similarity = tokenSimilarity(input.normalizedPrimaryLabel, candidate.normalizedPrimaryLabel);
  const samePublisher = Boolean(input.attributes.publisher && candidate.attributes.publisher && sameNormalized(input.attributes.publisher, candidate.attributes.publisher));
  const sameDate = Boolean(input.attributes.publishedDate && input.attributes.publishedDate === candidate.attributes.publishedDate);
  if (similarity >= .9 && samePublisher && sameDate) return comparison({decision: "probable_match", score: .82, input, candidate, supporting: [evidence("field_match", "news_title_publisher_date_similar", "contextual", "Titular, fuente y fecha son compatibles; no bastan para fusionar.")]});
  if (similarity >= .75) return comparison({decision: "probable_match", score: .65, input, candidate, supporting: [evidence("field_match", "news_title_similar", "weak", "Los titulares son similares, pero pueden ser artículos distintos.")]});
  return genericNoMatch(input, candidate, similarity);
}

export const newsIdentityStrategy: EntityIdentityStrategy<"news"> = Object.freeze({
  entityType: "news", version: "1.0.0", build, compare,
  canCreate(identity: NewsIdentity) {
    const allowed = Boolean(identity.attributes.canonicalUrl || identity.attributes.sourceId && identity.attributes.publisher || identity.attributes.contentFingerprint && identity.attributes.publishedDate);
    return {allowed, reasonCodes: allowed ? ["news_identity_sufficient"] : ["news_canonical_identity_required"]};
  },
});
