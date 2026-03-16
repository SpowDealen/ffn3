import Link from "next/link";

const enlaces = [
  { href: "/", label: "Inicio" },
  { href: "/noticias", label: "Noticias" },
  { href: "/luchadores", label: "Luchadores" },
  { href: "/eventos", label: "Eventos" },
  { href: "/resultados", label: "Resultados" },
  { href: "/disciplinas", label: "Disciplinas" },
  { href: "/categorias-peso", label: "Pesos" },
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
  padding: "18px 28px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "24px",
  flexWrap: "wrap" as const,
};

const brandStyle = {
  color: "white",
  textDecoration: "none",
  display: "flex",
  flexDirection: "column" as const,
  gap: "4px",
  minWidth: "fit-content",
};

const brandTopStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
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
  fontSize: "28px",
  fontWeight: 900,
  letterSpacing: "-1px",
  lineHeight: 1,
  color: "white",
};

const brandSubtitleStyle = {
  fontSize: "11px",
  color: "#8d8d8d",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  paddingLeft: "24px",
};

const linksWrapStyle = {
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

export default function Navbar() {
  return (
    <header style={headerStyle}>
      <nav style={navStyle}>
        <Link href="/" style={brandStyle}>
          <div style={brandTopStyle}>
            <span style={brandMarkStyle} />
            <span style={brandTitleStyle}>FULL FIGHT NEWS</span>
          </div>

          <span style={brandSubtitleStyle}>
            Actualidad de deportes de combate
          </span>
        </Link>

        <div style={linksWrapStyle}>
          {enlaces.map((enlace) => (
            <Link key={enlace.href} href={enlace.href} style={linkStyle}>
              {enlace.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}