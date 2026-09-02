export function buildReviewContextSearch(search: URLSearchParams | string, caseId?: string | null): string {
  const next = new URLSearchParams(search);
  const requestedCaseId = caseId?.trim();
  if (requestedCaseId) next.set("case", requestedCaseId);
  else next.delete("case");
  const value = next.toString();
  return value ? `?${value}` : "";
}

export function buildReviewContextHref(search: URLSearchParams | string, caseId: string): string {
  return `/revision${buildReviewContextSearch(search, caseId)}`;
}
