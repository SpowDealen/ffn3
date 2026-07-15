import {useEffect, useMemo, useRef, useState, type ReactElement} from "react";
import {getNotifications, subscribeToNotifications} from "../notifications/store";
import type {LabNotification} from "../notifications/types";
import {getActiveProcess, subscribeToProcess} from "../processes/store";
import {useReviewCases} from "../review/hooks/useReviewCases";

type SectionId = "laboratory-status" | "review-center" | "telegram-status";

export default function LaboratoryMenu(): ReactElement {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LabNotification[]>([]);
  const [processActive, setProcessActive] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("laboratory-status");
  const reviewCases = useReviewCases();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const updateNotifications = (): void => setNotifications(getNotifications());
    const updateProcess = (): void => setProcessActive(getActiveProcess()?.status === "running");
    updateNotifications();
    updateProcess();
    const unsubscribeNotifications = subscribeToNotifications(updateNotifications);
    const unsubscribeProcess = subscribeToProcess(updateProcess);
    return () => { unsubscribeNotifications(); unsubscribeProcess(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent): void => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id as SectionId);
      },
      {rootMargin: "-15% 0px -65%", threshold: [0.05, 0.25]},
    );
    for (const id of ["laboratory-status", "review-center", "telegram-status"] as SectionId[]) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const activeReviewCount = reviewCases.filter((reviewCase) => !["resumed", "dismissed"].includes(reviewCase.status)).length;
  const pendingNotifications = notifications.filter((notification) => notification.deliveryStatus === "pending").length;
  const telegramStatus = useMemo(() => {
    const concluded = notifications
      .filter((notification) => notification.deliveryStatus === "sent" || notification.deliveryStatus === "failed")
      .map((notification) => ({
        status: notification.deliveryStatus,
        timestamp: Date.parse(notification.deliveryStatus === "sent" ? notification.deliveredAt ?? notification.updatedAt ?? notification.createdAt : notification.updatedAt ?? notification.createdAt),
      }))
      .filter((item) => Number.isFinite(item.timestamp))
      .sort((left, right) => right.timestamp - left.timestamp)[0];
    if (!concluded) return "Sin datos";
    return concluded.status === "failed" ? "Con incidencias" : "Operativo";
  }, [notifications]);

  const items: Array<{id: SectionId; number: number; title: string; description: string; indicator: string}> = [
    {id: "laboratory-status", number: 1, title: "Estado del laboratorio", description: "Procesos, métricas y actividad general", indicator: processActive ? "Proceso activo" : pendingNotifications ? `${pendingNotifications} pendientes` : "Sin procesos activos"},
    {id: "review-center", number: 2, title: "Centro de revisión", description: "Casos editoriales pendientes", indicator: `${activeReviewCount} activos`},
    {id: "telegram-status", number: 3, title: "Estado de Telegram", description: "Salud, diagnóstico y entregas", indicator: telegramStatus},
  ];

  function navigateTo(id: SectionId): void {
    document.getElementById(id)?.scrollIntoView({behavior: "smooth", block: "start"});
    setActiveSection(id);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="laboratory-menu" ref={wrapperRef}>
      <button ref={buttonRef} className="laboratory-menu-trigger" type="button" aria-label="Abrir panel del laboratorio" aria-expanded={open} aria-controls="laboratory-menu-panel" onClick={() => setOpen((current) => !current)}>
        <span aria-hidden="true">☰</span>
      </button>
      {open ? (
        <div className="laboratory-menu-panel" id="laboratory-menu-panel" role="menu" aria-label="Secciones del laboratorio">
          {items.map((item) => (
            <button className={`laboratory-menu-item${activeSection === item.id ? " laboratory-menu-item-active" : ""}`} type="button" role="menuitem" key={item.id} onClick={() => navigateTo(item.id)}>
              <span className="laboratory-menu-number">{item.number}</span>
              <span className="laboratory-menu-copy"><strong>{item.title}</strong><small>{item.description}</small><em>{item.indicator}</em></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
