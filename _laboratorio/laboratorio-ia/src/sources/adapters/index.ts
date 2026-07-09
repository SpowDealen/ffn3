import { asAdapter } from "./asAdapter";
import { marcaAdapter } from "./marcaAdapter";
import { eurosportAdapter } from "./eurosportAdapter";
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
  eurosport: eurosportAdapter,
};

export function getExternalNewsAdapter(
  source: ExternalSourceId,
): ExternalNewsAdapter {
  return externalNewsAdapters[source];
}

export { asAdapter, eurosportAdapter, marcaAdapter };
