import { asAdapter } from "./asAdapter";
import { marcaAdapter } from "./marcaAdapter";
import type {
  ExternalNewsAdapter,
  ExternalSourceId,
} from "../types";

export const externalNewsAdapters: Record<
  ExternalSourceId,
  ExternalNewsAdapter
> = {
  marca: marcaAdapter,
  "as": asAdapter,
};

export function getExternalNewsAdapter(
  source: ExternalSourceId,
): ExternalNewsAdapter {
  return externalNewsAdapters[source];
}

export { asAdapter, marcaAdapter };
