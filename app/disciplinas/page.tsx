import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {disciplinasQuery} from "../../sanity/lib/queries";

type Disciplina = {
  _id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  activa?: boolean;
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
  textDecoration: "none",
  display: "block",
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

export default async function DisciplinasPage() {
  const disciplinas: Disciplina[] = await client.fetch(disciplinasQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section style={containerStyle}>
        <section style={{...heroCardStyle, marginBottom: "34px"}}>
          <p style={sectionLabelStyle}>Base editorial</p>

          <h1 style={titleStyle}>Disciplinas</h1>

          <p style={introStyle}>
            Explora las principales disciplinas de los deportes de combate desde una
            estructura clara, navegable y preparada para conectar noticias, luchadores,
            eventos y resultados.
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
                Función
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                Organizar el universo editorial de la web por bloques competitivos claros.
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
                Registradas
              </p>
              <p style={{margin: 0, color: "#d7d7d7", lineHeight: 1.6}}>
                {disciplinas.length} disciplinas visibles en la plataforma.
              </p>
            </div>
          </div>
        </section>

        {disciplinas.length === 0 ? (
          <p style={{color: "#888"}}>Todavía no hay disciplinas publicadas.</p>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {disciplinas.map((disciplina, index) => (
              <Link
                key={disciplina._id}
                href={`/disciplinas/${disciplina.slug}`}
                style={{
                  ...cardStyle,
                  background:
                    index === 0
                      ? "linear-gradient(135deg, rgba(18,18,18,0.98) 0%, rgba(24,24,32,0.96) 100%)"
                      : cardStyle.background,
                }}
              >
                <article>
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
                      fontSize: "28px",
                      marginBottom: "12px",
                      letterSpacing: "-0.7px",
                      color: "white",
                      lineHeight: 1.15,
                    }}
                  >
                    {disciplina.nombre}
                  </h2>

                  {disciplina.descripcion && (
                    <p
                      style={{
                        color: "#ccc",
                        marginBottom: "16px",
                        lineHeight: 1.8,
                        fontSize: "17px",
                      }}
                    >
                      {disciplina.descripcion}
                    </p>
                  )}

                  <p style={{color: disciplina.activa ? "#4ade80" : "#f87171"}}>
                    {disciplina.activa ? "Activa" : "Inactiva"}
                  </p>

                  <p
                    style={{
                      marginTop: "18px",
                      color: "#fff",
                      fontSize: "14px",
                      fontWeight: 700,
                      opacity: 0.92,
                    }}
                  >
                    Ver disciplina →
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