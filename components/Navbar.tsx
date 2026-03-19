"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NavItem = {
  label: string;
  href?: string;
  children?: {
    label: string;
    href: string;
  }[];
};

const navItems: NavItem[] = [
  { label: "Inicio", href: "/" },
  {
    label: "Noticias",
    href: "/noticias",
    children: [
      { label: "Noticias", href: "/noticias" },
      { label: "Resultados", href: "/resultados" },
    ],
  },
  { label: "Disciplinas", href: "/disciplinas" },
  { label: "Organizaciones", href: "/organizaciones" },
  { label: "Eventos", href: "/eventos" },
];

function isItemActive(pathname: string, item: NavItem) {
  if (item.children?.some((child) => pathname.startsWith(child.href))) return true;
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname.startsWith(item.href);
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileNoticiasOpen, setMobileNoticiasOpen] = useState(false);
  const [desktopNoticiasOpen, setDesktopNoticiasOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setMobileNoticiasOpen(false);
    setDesktopNoticiasOpen(false);
  }, [pathname]);

  const activeMap = useMemo(() => {
    return navItems.reduce<Record<string, boolean>>((acc, item) => {
      acc[item.label] = isItemActive(pathname, item);
      return acc;
    }, {});
  }, [pathname]);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        background: "rgba(10, 10, 15, 0.88)",
        borderBottom: "1px solid var(--ffn-border, rgba(255,255,255,0.08))",
      }}
    >
      <div
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          padding: "0 20px",
        }}
      >
        <div
          className="ffn-navbar-row"
          style={{
            minHeight: "76px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
          }}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="ffn-navbar-brand"
            style={{
              color: "var(--ffn-text, #f5f7fb)",
              textDecoration: "none",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: "0.95rem",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Full Fight News
          </Link>

          <nav
            aria-label="Navegación principal"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
            }}
          >
            <div
              className="ffn-navbar-desktop"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {navItems.map((item) => {
                const active = activeMap[item.label];

                if (item.children?.length) {
                  return (
                    <div
                      key={item.label}
                      style={{
                        position: "relative",
                        paddingBottom: "14px",
                        marginBottom: "-14px",
                      }}
                      onMouseEnter={() => setDesktopNoticiasOpen(true)}
                      onMouseLeave={() => setDesktopNoticiasOpen(false)}
                    >
                      <Link
                        href={item.href || "#"}
                        aria-expanded={desktopNoticiasOpen}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "12px 14px",
                          borderRadius: "999px",
                          textDecoration: "none",
                          color: active
                            ? "var(--ffn-text, #f5f7fb)"
                            : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
                          background: active
                            ? "rgba(255,255,255,0.08)"
                            : "transparent",
                          border: active
                            ? "1px solid rgba(255,255,255,0.14)"
                            : "1px solid transparent",
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          transition: "all 0.2s ease",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                        <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>▾</span>
                      </Link>

                      {desktopNoticiasOpen && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            minWidth: "220px",
                            padding: "10px",
                            borderRadius: "18px",
                            background: "rgba(18, 18, 26, 0.98)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                          }}
                        >
                          {item.children.map((child) => {
                            const childActive =
                              pathname === child.href || pathname.startsWith(`${child.href}/`);

                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                style={{
                                  display: "block",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  textDecoration: "none",
                                  color: childActive
                                    ? "var(--ffn-text, #f5f7fb)"
                                    : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
                                  background: childActive
                                    ? "rgba(255,255,255,0.08)"
                                    : "transparent",
                                  fontWeight: 600,
                                }}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href || "#"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: "999px",
                      textDecoration: "none",
                      color: active
                        ? "var(--ffn-text, #f5f7fb)"
                        : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
                      background: active ? "rgba(255,255,255,0.08)" : "transparent",
                      border: active
                        ? "1px solid rgba(255,255,255,0.14)"
                        : "1px solid transparent",
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      transition: "all 0.2s ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((prev) => !prev)}
              className="ffn-navbar-mobile-button"
              style={{
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                width: "46px",
                height: "46px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "var(--ffn-text, #f5f7fb)",
                fontSize: "1.2rem",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </nav>
        </div>

        {mobileOpen && (
          <div
            className="ffn-navbar-mobile-panel"
            style={{
              display: "none",
              padding: "0 0 18px",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "10px",
                padding: "12px",
                borderRadius: "24px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                style={mobileLinkStyle(pathname === "/")}
              >
                Inicio
              </Link>

              <button
                type="button"
                aria-expanded={mobileNoticiasOpen}
                onClick={() => setMobileNoticiasOpen((prev) => !prev)}
                style={{
                  ...mobileButtonStyle(
                    pathname.startsWith("/noticias") || pathname.startsWith("/resultados")
                  ),
                }}
              >
                <span>Noticias</span>
                <span>{mobileNoticiasOpen ? "−" : "+"}</span>
              </button>

              {mobileNoticiasOpen && (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    paddingLeft: "10px",
                  }}
                >
                  <Link
                    href="/noticias"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileNoticiasOpen(false);
                    }}
                    style={mobileSubLinkStyle(pathname.startsWith("/noticias"))}
                  >
                    Noticias
                  </Link>
                  <Link
                    href="/resultados"
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileNoticiasOpen(false);
                    }}
                    style={mobileSubLinkStyle(pathname.startsWith("/resultados"))}
                  >
                    Resultados
                  </Link>
                </div>
              )}

              <Link
                href="/disciplinas"
                onClick={() => setMobileOpen(false)}
                style={mobileLinkStyle(pathname.startsWith("/disciplinas"))}
              >
                Disciplinas
              </Link>

              <Link
                href="/organizaciones"
                onClick={() => setMobileOpen(false)}
                style={mobileLinkStyle(pathname.startsWith("/organizaciones"))}
              >
                Organizaciones
              </Link>

              <Link
                href="/eventos"
                onClick={() => setMobileOpen(false)}
                style={mobileLinkStyle(pathname.startsWith("/eventos"))}
              >
                Eventos
              </Link>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          .ffn-navbar-desktop {
            display: none !important;
          }

          .ffn-navbar-mobile-button {
            display: inline-flex !important;
          }

          .ffn-navbar-mobile-panel {
            display: block !important;
          }
        }

        @media (max-width: 640px) {
          .ffn-navbar-row {
            min-height: 70px !important;
            gap: 14px !important;
          }

          .ffn-navbar-brand {
            font-size: 0.8rem !important;
            letter-spacing: 0.07em !important;
            max-width: calc(100vw - 110px);
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        @media (max-width: 420px) {
          .ffn-navbar-brand {
            font-size: 0.74rem !important;
            max-width: calc(100vw - 96px);
          }

          .ffn-navbar-mobile-button {
            width: 42px !important;
            height: 42px !important;
            border-radius: 12px !important;
          }
        }
      `}</style>
    </header>
  );
}

function mobileLinkStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderRadius: "16px",
    textDecoration: "none",
    color: active
      ? "var(--ffn-text, #f5f7fb)"
      : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontWeight: 600,
  } as const;
}

function mobileButtonStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "14px 16px",
    borderRadius: "16px",
    color: active
      ? "var(--ffn-text, #f5f7fb)"
      : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontWeight: 600,
    cursor: "pointer",
  } as const;
}

function mobileSubLinkStyle(active: boolean) {
  return {
    display: "block",
    padding: "12px 14px",
    borderRadius: "14px",
    textDecoration: "none",
    color: active
      ? "var(--ffn-text, #f5f7fb)"
      : "var(--ffn-text-soft, rgba(245,247,251,0.72))",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    fontWeight: 600,
    fontSize: "0.95rem",
  } as const;
}