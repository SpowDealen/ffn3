import Link from "next/link";

export default function Navbar() {
  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 40px",
        borderBottom: "1px solid #222",
        background: "#000",
        color: "#fff",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "20px" }}>
        FULL FIGHT NEWS
      </div>

      <div style={{ display: "flex", gap: "20px" }}>
        <Link href="/">Inicio</Link>
        <Link href="/noticias">Noticias</Link>
        <Link href="/luchadores">Luchadores</Link>
        <Link href="/eventos">Eventos</Link>
        <Link href="/resultados">Resultados</Link>
        <Link href="/disciplinas">Disciplinas</Link>
      </div>
    </nav>
  );
}