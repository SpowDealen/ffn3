import {useEffect, useRef, type ReactElement, type ReactNode} from "react";
import LaboratoryMenu from "../components/LaboratoryMenu";
import NotificationBell from "../notifications/NotificationBell";
import ProcessBar from "../processes/ProcessBar";
import type {LaboratoryRoute} from "./laboratoryRoutes";

export default function LaboratoryShell({route, onNavigate, children}: {route: LaboratoryRoute; onNavigate: (path: string) => void; children: ReactNode}): ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [route.id]);
  return <div className="laboratory-app-shell">
    <a className="laboratory-skip-link" href="#laboratory-main">Saltar al contenido</a>
    <header className="laboratory-navbar">
      <a className="laboratory-brand" href={import.meta.env.BASE_URL} onClick={(event) => {event.preventDefault(); onNavigate("/");}}><span>FFN3</span><strong>Laboratorio IA</strong></a>
      <div className="review-nav-actions"><LaboratoryMenu activeRoute={route.id} onNavigate={onNavigate} />{route.id !== "activity" ? <NotificationBell /> : null}</div>
    </header>
    <div className="laboratory-process"><ProcessBar /></div>
    <main id="laboratory-main" className={`laboratory-screen laboratory-screen-${route.id}`}>
      <header className="laboratory-screen-header"><p className="review-kicker">FFN3 · Laboratorio IA</p><h1 ref={headingRef} tabIndex={-1}>{route.title}</h1><p>{route.description}</p></header>
      {children}
    </main>
  </div>;
}
