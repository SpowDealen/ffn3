import {useEffect, useState, type ReactElement} from "react";
import ActivityCenter from "../../notifications/ActivityCenter";
import {getActiveProcess, subscribeToProcess} from "../../processes/store";
import {useReviewCases} from "../../review/hooks/useReviewCases";
import {LABORATORY_ROUTES} from "../laboratoryRoutes";

export default function LaboratoryStatusScreen({onNavigate}: {onNavigate: (path: string) => void}): ReactElement {
  const reviewCases = useReviewCases();
  const [processActive, setProcessActive] = useState(getActiveProcess()?.status === "running");
  useEffect(() => subscribeToProcess(() => setProcessActive(getActiveProcess()?.status === "running")), []);
  const activeReviews = reviewCases.filter((reviewCase) => !["resumed", "dismissed"].includes(reviewCase.status)).length;
  return <><section className="laboratory-summary-grid" aria-label="Métricas principales"><div><strong>{processActive ? "En curso" : "Sin procesos"}</strong><span>Proceso activo</span></div><div><strong>{activeReviews}</strong><span>Revisiones activas</span></div></section><ActivityCenter view="summary" /><section className="laboratory-quick-links" aria-labelledby="quick-links-title"><h2 id="quick-links-title">Accesos rápidos</h2><div>{LABORATORY_ROUTES.filter((route) => route.id !== "status").map((route) => <a key={route.id} href={route.path} onClick={(event) => {event.preventDefault(); onNavigate(route.path);}}><strong>{route.title}</strong><span>{route.description}</span></a>)}</div></section></>;
}
