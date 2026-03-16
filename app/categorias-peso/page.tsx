import Link from "next/link";
import {client} from "../../sanity/lib/client";
import {categoriasPesoQuery} from "../../sanity/lib/queries";

type CategoriaPeso = {
  _id: string;
  nombre: string;
  slug: string;
  limitePeso?: number;
  unidad?: string;
  descripcion?: string;
  activa?: boolean;
  disciplina?: string;
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

export default async function CategoriasPesoPage() {
  const categorias: CategoriaPeso[] = await client.fetch(categoriasPesoQuery);

  return (
    <main style={{minHeight: "100vh", color: "white"}}>
      <section style={containerStyle}>
        <section style={{...heroCardStyle, marginBottom: "34px"}}>
          <p style={sectionLabelStyle}>Divisiones editoriales</p>

          <h1 style={titleStyle}>Categorías de peso</h1>

          <p style={introStyle}>
            Explora divisiones por disciplina con una estructura clara para entender
            límites, contexto competitivo y organización del sistema de pesos.
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
                Ordenar el mapa competitivo por divisiones y límites dentro de cada disciplina.
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
                {categorias.length} categorías visibles en la plataforma.
              </p>
            </div>
          </div>
        </section>

        {categorias.length === 0 ? (
          <p style={{color: "#888"}}>Todavía no hay categorías publicadas.</p>
        ) : (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {categorias.map((categoria, index) => (
              <Link
                key={categoria._id}
                href={`/categorias-peso/${categoria.slug}`}
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
                      marginBottom: "12px",
                      letterSpacing: "-0.7px",
                      lineHeight: 1.15,
                    }}
                  >
                    {categoria.nombre}
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      color: "#bbb",
                      fontSize: "15px",
                      lineHeight: 1.7,
                    }}
                  >
                    {categoria.disciplina && (
                      <p style={{margin: 0}}>Disciplina: {categoria.disciplina}</p>
                    )}

                    {typeof categoria.limitePeso === "number" && (
                      <p style={{margin: 0}}>
                        Límite: {categoria.limitePeso} {categoria.unidad}
                      </p>
                    )}

                    {categoria.descripcion && (
                      <p style={{margin: 0, color: "#c8c8c8"}}>
                        {categoria.descripcion}
                      </p>
                    )}

                    <p
                      style={{
                        margin: 0,
                        color: categoria.activa ? "#4ade80" : "#f87171",
                      }}
                    >
                      {categoria.activa ? "Activa" : "Inactiva"}
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
                    Ver categoría →
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