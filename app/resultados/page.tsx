import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {combatesQuery} from "../../sanity/lib/queries";

type Combate = {
  _id: string;
  _createdAt?: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  evento?: string;
  eventoSlug?: string;
  luchadorRojo?: string;
  luchadorAzul?: string;
  ganador?: string;
  categoriaPeso?: string;
};

const containerStyle = {
  maxWidth: "1440px",
  margin: "0 auto",
  padding: "40px 28px 60px",
};

const heroCardStyle = {
  background:
    "linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "22px",
  padding: "34px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "26px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

const sectionLabelStyle = {
  color: "#8f8f8f",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.8px",
  marginBottom: "10px",
};

const titleStyle = {
  fontSize: "46px",
  margin: "0 0 12px 0",
  letterSpacing: "-1.2px",
  lineHeight: 1.05,
};

const introStyle = {
  color: "#a8a8a8",
  fontSize: "17px",
  lineHeight: 1.8,
  maxWidth: "860px",
  margin: 0,
};

export default async function ResultadosPage() {
  const combates: Combate[] = await client.fetch(combatesQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section style={containerStyle}>
        <section style={{...heroCardStyle, marginBottom: "34px"}}>
          <p style={sectionLabelStyle}>Resultados editoriales</p>

          <h1 style={titleStyle}>Resultados</h1>

          <p style={introStyle}>
            Sigue ganadores, métodos, estados y contexto de los combates con una
            presentación clara, sólida y pensada para escalar como archivo competitivo.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "22px",
              marginTop: "26px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#7f7f7f",
                  textTransform: "uppercase",
                  letterSpacing: "1.6px",
                  marginBottom: "8px",
                }}
              >
                Cobertura
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                Resultados, desenlaces y detalles clave de cada combate publicado.
              </p>
            </div>

            <div>
              <p
                style={{
                  fontSize: "12px",
                  color: "#7f7f7f",
                  textTransform: "uppercase",
                  letterSpacing: "1.6px",
                  marginBottom: "8px",
                }}
              >
                Registrados
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                {combates.length} combates visibles en resultados.
              </p>
            </div>
          </div>
        </section>

        {combates.length === 0 ? (
          <p style={{color: "#888"}}>Todavía no hay combates publicados.</p>
        ) : (
          <section
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            {combates.map((combate, index) => (
              <Link
                key={combate._id}
                href={`/resultados/${combate._id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <article
                  style={{
                    ...cardStyle,
                    background:
                      index === 0
                        ? "linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%)"
                        : cardStyle.background,
                  }}
                >
                  {index === 0 && (
                    <p
                      style={{
                        color: "#9ca3af",
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "1.6px",
                        marginBottom: "12px",
                      }}
                    >
                      Principal
                    </p>
                  )}

                  <h2
                    style={{
                      fontSize: "32px",
                      margin: "0 0 12px 0",
                      letterSpacing: "-0.8px",
                      lineHeight: 1.15,
                    }}
                  >
                    {combate.luchadorRojo} vs {combate.luchadorAzul}
                  </h2>

                  {combate.ganador && (
                    <p
                      style={{
                        color: "#f5c542",
                        margin: "0 0 14px 0",
                        fontSize: "18px",
                        lineHeight: 1.5,
                      }}
                    >
                      Ganador: {combate.ganador}
                    </p>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      color: "#bbb",
                      fontSize: "15px",
                      lineHeight: 1.6,
                    }}
                  >
                    {combate.evento && <p style={{margin: 0}}>Evento: {combate.evento}</p>}
                    {combate.categoriaPeso && (
                      <p style={{margin: 0}}>Categoría: {combate.categoriaPeso}</p>
                    )}
                    {combate.estado && <p style={{margin: 0}}>Estado: {combate.estado}</p>}
                    {combate.metodo && <p style={{margin: 0}}>Método: {combate.metodo}</p>}
                    {typeof combate.asalto === "number" && (
                      <p style={{margin: 0}}>Asalto: {combate.asalto}</p>
                    )}
                    {combate.tiempo && <p style={{margin: 0}}>Tiempo: {combate.tiempo}</p>}
                    {combate.cartelera && (
                      <p style={{margin: 0}}>Cartelera: {combate.cartelera}</p>
                    )}
                    {combate.tituloEnJuego && (
                      <p style={{margin: 0}}>Pelea con título en juego</p>
                    )}
                  </div>

                  <p
                    style={{
                      marginTop: "18px",
                      color: "#ffffff",
                      fontSize: "14px",
                      fontWeight: 700,
                      opacity: 0.92,
                    }}
                  >
                    Ver resultado →
                  </p>
                </article>
              </Link>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}