import {useCallback, useEffect, useMemo, useState} from "react";
import {buildLaboratoryUrl, resolveLaboratoryRoute, type LaboratoryRoute} from "./laboratoryRoutes";

const NAVIGATION_EVENT = "ffn3:laboratory-navigation";
const base = import.meta.env?.BASE_URL || "/";

export function removeLaboratoryQueryParam(search: URLSearchParams | string, key: string): string {
  const next = new URLSearchParams(search);
  next.delete(key);
  const value = next.toString();
  return value ? `?${value}` : "";
}

export function navigateLaboratory(path: string, search = ""): void {
  const url = buildLaboratoryUrl(path, base, search);
  window.history.pushState({}, "", url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function useLaboratoryRouter(): {route: LaboratoryRoute; search: URLSearchParams; navigate: (path: string, search?: string) => void} {
  const read = useCallback(() => resolveLaboratoryRoute(window.location.pathname, base), []);
  const [route, setRoute] = useState<LaboratoryRoute>(read);
  const [searchValue, setSearchValue] = useState(window.location.search);
  useEffect(() => {
    const update = (): void => { setRoute(read()); setSearchValue(window.location.search); };
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATION_EVENT, update);
    const resolved = read();
    const expected = buildLaboratoryUrl(resolved.path, base, window.location.search);
    if (window.location.pathname + window.location.search !== expected) window.history.replaceState({}, "", expected);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener(NAVIGATION_EVENT, update); };
  }, [read]);
  const search = useMemo(() => new URLSearchParams(searchValue), [searchValue]);
  return {route, search, navigate: navigateLaboratory};
}
