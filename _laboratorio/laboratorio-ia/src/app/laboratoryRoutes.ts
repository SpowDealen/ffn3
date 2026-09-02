export type LaboratoryRouteId = "status" | "editorial" | "revision" | "activity" | "telegram";
export type LaboratoryRoute = { id: LaboratoryRouteId; path: string; navLabel: string; title: string; description: string };

export const LABORATORY_ROUTES: LaboratoryRoute[] = [
  {id: "status", path: "/", navLabel: "Inicio", title: "Estado del laboratorio", description: "Comprueba la salud general y qué necesita tu atención."},
  {id: "editorial", path: "/editorial", navLabel: "Editorial", title: "Trabajo editorial", description: "Revisa y prepara contenidos a partir de las fuentes conectadas."},
  {id: "revision", path: "/revision", navLabel: "Revisión", title: "Centro de revisión", description: "Resuelve los casos que el laboratorio no puede cerrar con suficiente seguridad."},
  {id: "activity", path: "/actividad", navLabel: "Actividad", title: "Historial de actividad", description: "Consulta procesos, avisos y resultados registrados por el laboratorio."},
  {id: "telegram", path: "/telegram", navLabel: "Telegram", title: "Salud de Telegram", description: "Comprueba el estado del canal y sus entregas recientes."},
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
