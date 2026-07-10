import { asAdapter } from "./asAdapter";
import { marcaAdapter } from "./marcaAdapter";
import { eurosportAdapter } from "./eurosportAdapter";
import { espaboxAdapter } from "./espaboxAdapter";
import { mundoDeportivoAdapter } from "./mundodeportivoAdapter";
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
  espabox: espaboxAdapter,
  mundodeportivo: mundoDeportivoAdapter,
};

export function getExternalNewsAdapter(
  source: ExternalSourceId,
): ExternalNewsAdapter {
  return externalNewsAdapters[source];
}

export {
  asAdapter,
  espaboxAdapter,
  eurosportAdapter,
  marcaAdapter,
  mundoDeportivoAdapter,
};
