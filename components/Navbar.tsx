"use client";

import {useState} from "react";
import Link from "next/link";

const enlaces = [
  {href: "/", label: "Inicio"},
  {href: "/noticias", label: "Noticias"},
  {href: "/luchadores", label: "Luchadores"},
  {href: "/eventos", label: "Eventos"},
  {href: "/resultados", label: "Resultados"},
  {href: "/organizaciones", label: "Organizaciones"},
  {href: "/disciplinas", label: "Disciplinas"},
  {href: "/categorias-peso", label: "Pesos"},
];

const headerStyle = {
  position: "sticky" as const,
  top: 0,
  zIndex: 1000,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  background: "rgba(6, 6, 6, 0.9)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const navStyle = {
  maxWidth: "1440px",
  margin: "0 auto",
  padding: "16px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "16px",
};

const brandStyle = {
  color: "white",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column" as const,
  gap: "4px",
  minWidth: 0,
  flex: "1 1 auto",
};

const brandTopStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  minWidth: 0,
};

const brandMarkStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #ffffff 0%, #9f9f9f 100%)",
  boxShadow: "0 0 22px rgba(255,255,255,0.22)",
  flexShrink: 0,
};

const brandTitleStyle = {
  fontSize: "clamp(20px, 3vw, 28px)",
  fontWeight: 900,
  letterSpacing: "-1px",
  lineHeight: 1,
  color: "white",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const brandSubtitleStyle = {
  fontSize: "11px",
  color: "#8d8d8d",
  letterSpacing: "1.8px",
  textTransform: "uppercase" as const,
  paddingLeft: "24px",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const desktopLinksWrapStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: "10px",
};

const linkStyle = {
  color: "#d7d7d7",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 700,
  padding: "10px 14px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  transition: "all 0.2s ease",
  letterSpacing: "0.1px",
  display: "inline-flex",
  alignItems: "center",
};

const mobileButtonStyle = {
  appearance: "none" as const,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  borderRadius: "999px",
  padding: "10px 14px",
  fontSize: "13px",
  fontWeight: 800,
  cursor: "pointer",
  minWidth: "fit-content",
  flexShrink: 0,
};

const mobilePanelStyle = {
  maxWidth: "1440px",
  margin: "0 auto",
  padding: "0 20px 16px",
};

const mobileLinksGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "10px",
};

const mobileLinkStyle = {
  color: "#f2f2f2",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 700,
  padding: "12px 14px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
};

export default function Navbar() {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <header style={headerStyle}>
      <nav style={navStyle}>
        <Link
          href="/"
          style={brandStyle}
          onClick={() => setMenuAbierto(false)}
        >
          <div style={brandTopStyle}>
            <span style={brandMarkStyle} />
            <span style={brandTitleStyle}>FULL FIGHT NEWS</span>
          </div>

          <span style={brandSubtitleStyle}>
            Actualidad de deportes de combate
          </span>
        </Link>

        <div
          className="navbar-desktop-links"
          style={desktopLinksWrapStyle}
        >
          {enlaces.map((enlace) => (
            <Link
              key={enlace.href}
              href={enlace.href}
              style={linkStyle}
            >
              {enlace.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          style={mobileButtonStyle}
          className="navbar-mobile-button"
          onClick={() => setMenuAbierto((prev) => !prev)}
          aria-expanded={menuAbierto}
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
        >
          {menuAbierto ? "Cerrar" : "Menú"}
        </button>
      </nav>

      {menuAbierto && (
        <div style={mobilePanelStyle} className="navbar-mobile-panel">
          <div style={mobileLinksGridStyle}>
            {enlaces.map((enlace) => (
              <Link
                key={enlace.href}
                href={enlace.href}
                style={mobileLinkStyle}
                onClick={() => setMenuAbierto(false)}
              >
                {enlace.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}