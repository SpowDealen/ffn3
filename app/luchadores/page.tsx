import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {luchadoresQuery} from "../../sanity/lib/queries";

type Luchador = {
  _id: string;
  nombre: string;
  slug: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  disciplina?: string;
  organizacion?: string;
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

export default async function LuchadoresPage() {
  const luchadores: Luchador[] = await client.fetch(luchadoresQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section style={containerStyle}>
        <section style={{...heroCardStyle, marginBottom: "34px"}}>
          <p style={sectionLabelStyle}>Roster editorial</p>

          <h1 style={titleStyle}>Luchadores</h1>

          <p style={introStyle}>
            Explora perfiles de luchadores con una estructura clara para seguir
            nacionalidad, disciplina, organización, categoría y estado competitivo.
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
                Perfiles conectados con eventos, combates, noticias y categorías.
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
                {luchadores.length} luchadores visibles en el roster.
              </p>
            </div>
          </div>
        </section>

        {luchadores.length === 0 ? (
          <p style={{color: "#888"}}>Todavía no hay luchadores publicados.</p>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {luchadores.map((luchador, index) => (
              <Link
                key={luchador._id}
                href={`/luchadores/${luchador.slug}`}
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
                      fontSize: "28px",
                      margin: "0 0 8px 0",
                      letterSpacing: "-0.6px",
                      lineHeight: 1.15,
                    }}
                  >
                    {luchador.nombre}
                  </h2>

                  {luchador.apodo && (
                    <p style={{color: "#f5c542", margin: "0 0 14px 0"}}>
                      “{luchador.apodo}”
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
                    {luchador.nacionalidad && (
                      <p style={{margin: 0}}>Nacionalidad: {luchador.nacionalidad}</p>
                    )}
                    {luchador.disciplina && (
                      <p style={{margin: 0}}>Disciplina: {luchador.disciplina}</p>
                    )}
                    {luchador.organizacion && (
                      <p style={{margin: 0}}>Organización: {luchador.organizacion}</p>
                    )}
                    {luchador.categoriaPeso && (
                      <p style={{margin: 0}}>Categoría: {luchador.categoriaPeso}</p>
                    )}
                    {luchador.record && (
                      <p style={{margin: 0}}>Récord: {luchador.record}</p>
                    )}
                    <p style={{margin: 0}}>
                      Estado: {luchador.activo ? "Activo" : "Inactivo"}
                    </p>
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
                    Ver perfil →
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