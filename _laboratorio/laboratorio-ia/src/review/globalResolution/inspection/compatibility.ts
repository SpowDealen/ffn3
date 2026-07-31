import type {
  GlobalResolutionEffectInspector,
  GlobalResolutionInspectionRequest,
  GlobalResolutionInspectorCompatibility,
} from "./types";

export type GlobalResolutionInspectorSelection =
  | {ok: true; inspector: GlobalResolutionEffectInspector; compatibility: Extract<GlobalResolutionInspectorCompatibility, {supported: true}>}
  | {ok: false; code: "inspector_not_found" | "inspector_ambiguous" | "unsupported"; reason: string};

export function selectCompatibleInspector(
  inspectors: readonly GlobalResolutionEffectInspector[],
  request: GlobalResolutionInspectionRequest,
): GlobalResolutionInspectorSelection {
  if (request.inspectorId) {
    const explicit = inspectors.find((inspector) => inspector.id === request.inspectorId);
    if (!explicit) return {ok: false, code: "inspector_not_found", reason: "explicit_inspector_not_registered"};
    const compatibility = explicit.supports(request);
    return compatibility.supported
      ? {ok: true, inspector: explicit, compatibility}
      : {ok: false, code: "unsupported", reason: compatibility.reason};
  }
  const supported = inspectors.flatMap((inspector) => {
    const compatibility = inspector.supports(request);
    return compatibility.supported ? [{inspector, compatibility}] : [];
  }).sort((left, right) => right.compatibility.specificity - left.compatibility.specificity || left.inspector.id.localeCompare(right.inspector.id));
  if (!supported.length) return {ok: false, code: "unsupported", reason: "no_compatible_inspector"};
  const highest = supported[0].compatibility.specificity;
  const finalists = supported.filter((candidate) => candidate.compatibility.specificity === highest);
  if (finalists.length !== 1) return {ok: false, code: "inspector_ambiguous", reason: `specificity_tie:${highest}`};
  return {ok: true, ...finalists[0]};
}
