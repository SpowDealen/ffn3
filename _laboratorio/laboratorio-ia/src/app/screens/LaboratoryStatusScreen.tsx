import type {ReactElement} from "react";
import GlobalStatusSummary from "../../status/GlobalStatusSummary";
import {LABORATORY_ROUTES} from "../laboratoryRoutes";

export default function LaboratoryStatusScreen({onNavigate}: {onNavigate: (path: string) => void}): ReactElement {
  return <><GlobalStatusSummary onNavigate={onNavigate} /><section className="laboratory-quick-links" aria-labelledby="quick-links-title"><h2 id="quick-links-title">Accesos rápidos</h2><div>{LABORATORY_ROUTES.filter((route) => route.id !== "status").map((route) => <a key={route.id} href={route.path} onClick={(event) => {event.preventDefault(); onNavigate(route.path);}}><strong>{route.title}</strong><span>{route.description}</span></a>)}</div></section></>;
}
