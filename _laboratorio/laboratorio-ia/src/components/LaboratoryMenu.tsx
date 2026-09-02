import {useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import {LABORATORY_ROUTES, type LaboratoryRouteId} from "../app/laboratoryRoutes";
import {getNotifications, subscribeToNotifications} from "../notifications/store";
import type {LabNotification} from "../notifications/types";
import {getActiveProcess, subscribeToProcess} from "../processes/store";
import {useReviewCases} from "../review/hooks/useReviewCases";

export default function LaboratoryMenu({activeRoute, onNavigate}: {activeRoute: LaboratoryRouteId; onNavigate: (path: string) => void}): ReactElement {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LabNotification[]>([]);
  const [processActive, setProcessActive] = useState(false);
  const reviewCases = useReviewCases();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const updateNotifications = (): void => setNotifications(getNotifications());
    const updateProcess = (): void => setProcessActive(getActiveProcess()?.status === "running");
    updateNotifications(); updateProcess();
    const unsubscribeNotifications = subscribeToNotifications(updateNotifications);
    const unsubscribeProcess = subscribeToProcess(updateProcess);
    return () => { unsubscribeNotifications(); unsubscribeProcess(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent): void => { if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false); };
    const handleKey = (event: KeyboardEvent): void => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("mousedown", handlePointer); document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handlePointer); document.removeEventListener("keydown", handleKey); };
  }, [open]);
  const activeReviewCount = reviewCases.filter((reviewCase) => !["resumed", "dismissed"].includes(reviewCase.status)).length;
  const pendingNotifications = notifications.filter((notification) => notification.deliveryStatus === "pending").length;
  const telegramStatus = useMemo(() => {
    const latest = notifications.filter((item) => item.deliveryStatus === "sent" || item.deliveryStatus === "failed").sort((left, right) => Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt))[0];
    return latest ? latest.deliveryStatus === "failed" ? "Fallo en historial" : "Historial sin fallos" : "Sin datos";
  }, [notifications]);
  const indicators: Record<LaboratoryRouteId, string> = {status: processActive ? "Proceso activo" : `${pendingNotifications} pendientes`, editorial: "Puesto de trabajo", revision: `${activeReviewCount} activos`, activity: `${pendingNotifications} pendientes`, telegram: telegramStatus};
  return <div className="laboratory-menu" ref={wrapperRef}>
    <button ref={buttonRef} className="laboratory-menu-trigger" type="button" aria-label="Abrir navegación del laboratorio" aria-expanded={open} aria-controls="laboratory-menu-panel" onClick={() => setOpen((current) => !current)}><span aria-hidden="true">☰</span></button>
    {open ? <nav className="laboratory-menu-panel" id="laboratory-menu-panel" aria-label="Pantallas del laboratorio">{LABORATORY_ROUTES.map((route, index) => <a className={`laboratory-menu-item${activeRoute === route.id ? " laboratory-menu-item-active" : ""}`} href={route.path} aria-current={activeRoute === route.id ? "page" : undefined} key={route.id} onClick={(event) => {event.preventDefault(); onNavigate(route.path); setOpen(false); buttonRef.current?.focus();}}><span className="laboratory-menu-number">{index + 1}</span><span className="laboratory-menu-copy"><strong>{route.navLabel}</strong><small>{route.description}</small><em>{indicators[route.id]}</em></span></a>)}</nav> : null}
  </div>;
}
