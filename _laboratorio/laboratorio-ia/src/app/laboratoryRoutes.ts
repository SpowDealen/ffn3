export type LaboratoryRouteId = "status" | "editorial" | "revision" | "activity" | "telegram";
export type LaboratoryRoute = { id: LaboratoryRouteId; path: string; title: string; description: string };

export const LABORATORY_ROUTES: LaboratoryRoute[] = [
  {id: "status", path: "/", title: "Estado del laboratorio", description: "Salud, métricas y accesos rápidos"},
  {id: "editorial", path: "/editorial", title: "Panel editorial", description: "Producción y preparación de contenidos"},
  {id: "revision", path: "/revision", title: "Centro de revisión", description: "Casos editoriales y resoluciones"},
  {id: "activity", path: "/actividad", title: "Actividad y procesos", description: "Trazabilidad, notificaciones y errores"},
  {id: "telegram", path: "/telegram", title: "Estado de Telegram", description: "Salud, diagnóstico y entregas"},
];

const normalizeBase = (base: string): string => base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
export function resolveLaboratoryRoute(pathname: string, base = "/"): LaboratoryRoute {
  const normalizedBase = normalizeBase(base);
  const routePath = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length) || "/" : "/";
  return LABORATORY_ROUTES.find((route) => route.path === routePath.replace(/\/+$/, "") || route.path === routePath) ?? LABORATORY_ROUTES[0]!;
}
export function buildLaboratoryUrl(path: string, base = "/", search = ""): string {
  const normalizedBase = normalizeBase(base);
  const normalizedPath = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}`;
  return `${normalizedBase}${normalizedPath}${search}` || "/";
}
export const routeById = (id: LaboratoryRouteId): LaboratoryRoute => LABORATORY_ROUTES.find((route) => route.id === id) ?? LABORATORY_ROUTES[0]!;
