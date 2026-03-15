import TarjetaInicio from "../components/TarjetaInicio";

export default function Home() {
  return (
    <main
      style={{
        backgroundColor: "#0b0b0b",
        color: "white",
        minHeight: "100vh",
      }}
    >
      <section
        style={{
          padding: "60px 40px",
          borderBottom: "1px solid #222",
        }}
      >
        <p
          style={{
            color: "#999",
            textTransform: "uppercase",
            fontSize: "12px",
            letterSpacing: "2px",
          }}
        >
          Plataforma de deportes de combate
        </p>

        <h1
          style={{
            fontSize: "48px",
            maxWidth: "900px",
            margin: "10px 0",
            lineHeight: 1.2,
          }}
        >
          Las últimas noticias, eventos y resultados de UFC, MMA, boxeo y
          deportes de combate.
        </h1>

        <p style={{ color: "#bbb", maxWidth: "760px", lineHeight: 1.6 }}>
          Full Fight News está siendo construida para reunir noticias de última
          hora, próximos eventos, perfiles de luchadores, resultados y contenido
          organizado por disciplinas en un solo lugar.
        </p>
      </section>

      <section
        style={{
          padding: "40px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "20px",
        }}
      >
        <TarjetaInicio
          href="/noticias"
          titulo="Noticias"
          descripcion="Actualidad diaria, titulares y novedades del mundo de la lucha."
        />

        <TarjetaInicio
          href="/eventos"
          titulo="Eventos"
          descripcion="Sigue las próximas carteleras de UFC, MMA, boxeo y más."
        />

        <TarjetaInicio
          href="/resultados"
          titulo="Resultados"
          descripcion="Consulta ganadores, métodos de victoria y estadísticas."
        />

        <TarjetaInicio
          href="/disciplinas"
          titulo="Disciplinas"
          descripcion="Explora el contenido por MMA, boxeo, Muay Thai, kickboxing y más."
        />
      </section>
    </main>
  );
}