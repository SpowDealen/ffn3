import type {SanityExternalNewsReadExecutor, SanityInspectionReadRequest, SanityInspectionReadResult} from "./types";
import {parseSanityInspectionReadRequest} from "./types";
import {apiUrl} from "../../../../lib/apiUrl";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function defaultInspectionEndpoint(): string { return apiUrl("/api/review/global-resolution/inspect"); }

export function createSanityInspectionHttpReader(input: {
  endpoint?: string;
  fetcher?: FetchLike;
} = {}): SanityExternalNewsReadExecutor {
  const endpoint = input.endpoint ?? defaultInspectionEndpoint();
  const fetcher = input.fetcher ?? fetch;
  return Object.freeze({
    async read(request: SanityInspectionReadRequest, options: {signal?: AbortSignal}): Promise<SanityInspectionReadResult> {
      const parsed = parseSanityInspectionReadRequest(request);
      if (!parsed) throw new Error("sanity_inspection_request_invalid");
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(parsed),
        signal: options.signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 408 || response.status === 504 ? "sanity_inspection_timeout" : "sanity_inspection_unavailable");
      const body = await response.json() as {ok?: unknown; result?: unknown};
      if (body.ok !== true || !body.result || typeof body.result !== "object") throw new Error("sanity_inspection_response_invalid");
      return body.result as SanityInspectionReadResult;
    },
  });
}
