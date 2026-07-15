import type {ReviewCandidate, ReviewIssue, ReviewValueKind} from "../../types";
import {normalizeConfidence, normalizeText} from "../../autonomous";
import {createExternalNewsIssueId, createExternalNewsReviewKey} from "./externalNewsReviewKey";
import type {ExternalNewsIssueDetection, ExternalNewsRelationCandidate, ExternalNewsReviewInput, ExternalResolvedReference} from "./types";

const RELATION_MINIMUM = 0.85;
const close = (candidates: ReviewCandidate[]): boolean => candidates.length > 1 && normalizeConfidence(candidates[0].confidence) - normalizeConfidence(candidates[1].confidence) < 0.15;
const mentioned = (value?: string): boolean => Boolean(value?.trim());
const same = (left?: string, right?: string): boolean => Boolean(left && right && normalizeText(left, true) === normalizeText(right, true));

function relationCandidates(input: ExternalNewsReviewInput, relation: ExternalNewsRelationCandidate["relation"], mention?: string): ReviewCandidate[] {
  return (input.candidates ?? []).filter((item) => item.relation === relation && (!mention || !item.mention || same(item.mention, mention))).sort((a, b) => normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence));
}

function relationIssue(params: {input: ExternalNewsReviewInput; relation: string; label: string; valueKind: ReviewValueKind; mention: string; resolved: ExternalResolvedReference; candidates: ReviewCandidate[]; required: boolean}): ReviewIssue | undefined {
  const {input, relation, label, valueKind, mention, resolved, candidates, required} = params;
  const confidence = normalizeConfidence(input.analysis.confianzaRelaciones);
  const resolvedInCandidates = !resolved || candidates.length === 0 || candidates.some((item) => item.sanityId === resolved.id || item.id === resolved.id);
  const ambiguous = close(candidates);
  const mismatch = Boolean(resolved && mention && !same(resolved.label, mention) && !candidates.some((item) => (item.sanityId === resolved.id || item.id === resolved.id) && same(item.label, mention)));
  if (!mentioned(mention) && !resolved && candidates.length === 0) return undefined;
  if (resolved && confidence >= RELATION_MINIMUM && resolvedInCandidates && !ambiguous && !mismatch) return undefined;
  return {id: createExternalNewsIssueId(createExternalNewsReviewKey(input), relation, mention || label), kind: resolved ? "ambiguous_reference" : "missing_reference", valueKind, fieldPath: relation, label, message: resolved ? `${label} requiere validar una resolución contradictoria o de confianza insuficiente.` : `${label} mencionada sin referencia inequívoca.`, required, blocking: required, currentValue: resolved?.id, expected: {mentionedLabel: mention, minimumConfidence: RELATION_MINIMUM}, candidates, evidence: [`Mención analizada: ${mention || "—"}`, `Referencia resuelta: ${resolved ? `${resolved.label} (${resolved.id})` : "ninguna"}`, `Confianza global: ${confidence.toFixed(2)}`]};
}

function validHttpUrl(value?: string): boolean { try { if (!value) return false; return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }

export function detectExternalNewsIssues(input: ExternalNewsReviewInput): ExternalNewsIssueDetection {
  const issues: ReviewIssue[] = [];
  const discipline = relationIssue({input, relation: "discipline", label: "Disciplina", valueKind: "discipline", mention: input.analysis.disciplinaPrincipal ?? "", resolved: input.resolved.disciplina, candidates: relationCandidates(input, "discipline"), required: true});
  if (discipline) issues.push(discipline);
  const organizationMention = input.analysis.organizacionPrincipal ?? "";
  const organization = relationIssue({input, relation: "organization", label: "Organización", valueKind: "organization", mention: organizationMention, resolved: input.resolved.organizacion, candidates: relationCandidates(input, "organization"), required: mentioned(organizationMention)});
  if (organization) issues.push(organization);
  const eventMention = input.analysis.eventoPrincipal ?? "";
  const event = relationIssue({input, relation: "event", label: "Evento", valueKind: "event", mention: eventMention, resolved: input.resolved.evento, candidates: relationCandidates(input, "event"), required: false});
  if (event) issues.push(event);

  const resolvedFighters = [...input.resolved.luchadoresPrincipales, ...input.resolved.luchadoresSecundarios];
  for (const name of [...(input.analysis.luchadoresPrincipales ?? []), ...(input.analysis.luchadoresSecundarios ?? [])]) {
    const resolved = resolvedFighters.find((item) => same(item.label, name)) ?? null;
    const fighter = relationIssue({input, relation: "fighter", label: `Luchador: ${name}`, valueKind: "fighter", mention: name, resolved, candidates: relationCandidates(input, "fighter", name), required: (input.analysis.luchadoresPrincipales ?? []).some((item) => same(item, name))});
    if (fighter) issues.push({...fighter, kind: resolved ? fighter.kind : "missing_entity", expected: {...fighter.expected, entityType: "fighter", draft: {name}}});
  }

  const duplicates = [...(input.duplicateCandidates ?? []), ...relationCandidates(input, "duplicate")];
  if (duplicates.length) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "duplicate"), kind: "duplicate_candidate", valueKind: "sanityReference", label: "Posible duplicado", message: "La noticia coincide con uno o más documentos existentes.", required: true, blocking: true, candidates: duplicates, expected: {canonicalUrl: input.item.canonicalUrl}, evidence: [`URL canónica: ${input.item.canonicalUrl}`]});

  const canonical = input.item.canonicalUrl || input.item.sourceUrl;
  if (!validHttpUrl(canonical)) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "canonical-url"), kind: "invalid_url", valueKind: "url", fieldPath: "fuenteUrl", label: "URL canónica", message: "La URL canónica no es HTTP/HTTPS válida.", required: true, blocking: true, currentValue: canonical, evidence: [`URL recibida: ${canonical || "vacía"}`]});
  if (!input.item.title.trim()) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "title"), kind: "required_field", valueKind: "text", fieldPath: "titulo", label: "Título", message: "El título es obligatorio.", required: true, blocking: true, currentValue: input.item.title});
  if (!(input.item.bodyText?.trim() || input.item.excerpt?.trim())) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "body"), kind: "insufficient_content", valueKind: "text", fieldPath: "contenido", label: "Contenido", message: "No existe cuerpo ni resumen editorial suficiente.", required: true, blocking: true});
  if (input.item.publishedAt && !Number.isFinite(Date.parse(input.item.publishedAt))) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "date"), kind: "invalid_value", valueKind: "date", fieldPath: "fechaPublicacion", label: "Fecha", message: "La fecha de publicación no es válida.", required: true, blocking: true, currentValue: input.item.publishedAt});
  if (!input.item.image?.url || !validHttpUrl(input.item.image.url)) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "image"), kind: input.item.image?.url ? "invalid_url" : "missing_image", valueKind: "image", fieldPath: "imagenPrincipal", label: "Imagen principal", message: "La imagen está ausente o utiliza una URL no segura.", required: true, blocking: true, currentValue: input.item.image?.url, candidates: input.imageCandidates, evidence: [`Imagen recibida: ${input.item.image?.url ?? "ninguna"}`]});
  else if ((input.imageCandidates?.length ?? 0) > 1) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "image-candidates"), kind: "contradictory_data", valueKind: "image", fieldPath: "imagenPrincipal", label: "Imágenes candidatas", message: "Existen varias imágenes candidatas sin una decisión inequívoca.", required: true, blocking: true, currentValue: input.item.image.url, candidates: input.imageCandidates, evidence: [`Candidatas: ${input.imageCandidates?.length ?? 0}`]});
  const conflictWarnings = (input.warnings ?? []).filter((warning) => /(contradic|incompat|conflict|no coincide|no verific)/i.test(warning));
  if (input.analysis.necesitaRevisionManual || conflictWarnings.length) issues.push({id: createExternalNewsIssueId(createExternalNewsReviewKey(input), "editorial-conflict"), kind: "contradictory_data", valueKind: "text", label: "Conflicto editorial", message: "El análisis solicita revisión o contiene relaciones incompatibles.", required: Boolean(input.analysis.necesitaRevisionManual), blocking: Boolean(input.analysis.necesitaRevisionManual), currentValue: input.analysis.razonRevisionManual || conflictWarnings.join(" | "), evidence: [input.analysis.razonRevisionManual ?? "", ...conflictWarnings].filter(Boolean)});
  return {issues, hasBlockingIssues: issues.some((item) => item.blocking), hasRequiredIssues: issues.some((item) => item.required), warnings: [...(input.warnings ?? [])]};
}
