import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {
  categoriaPesoPorSlugQuery,
  combatesPorCategoriaQuery,
  luchadoresPorCategoriaQuery,
} from "../../../sanity/lib/queries";

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
};

type Combate = {
  _id: string;
  metodo?: string;
  asalto?: number;
  tiempo?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  evento?: string;
  luchadorRojo?: string;
  luchadorAzul?: string;
  ganador?: string;
};

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};

export default async function CategoriaPesoDetallePage({params}: PageProps) {
  const {slug} = await params;

  const categoria: CategoriaPeso | null = await client.fetch(categoriaPesoPorSlugQuery, {slug});
  const luchadores: Luchador[] = await client.fetch(luchadoresPorCategoriaQuery, {slug});
  const combates: Combate[] = await client.fetch(combatesPorCategoriaQuery, {slug});

  if (!categoria) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "white",
        padding: "48px 28px 70px",
      }}
    >
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            fontSize: "52px",
            lineHeight: 1.08,
            margin: "0 0 16px 0",
            letterSpacing: "-1.5px",
          }}
        >
          {categoria.nombre}
        </h1>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "14px",
            color: "#888",
            marginBottom: "24px",
          }}
        >
          {categoria.disciplina && <span>Disciplina: {categoria.disciplina}</span>}
          {typeof categoria.limitePeso === "number" && (
            <span>
              Límite: {categoria.limitePeso} {categoria.unidad}
            </span>
          )}
          <span style={{ color: categoria.activa ? "#4ade80" : "#f87171" }}>
            {categoria.activa ? "Activa" : "Inactiva"}
          </span>
        </div>

        {categoria.descripcion && (
          <p
            style={{
              color: "#b9b9b9",
              fontSize: "19px",
              lineHeight: 1.85,
              marginBottom: "38px",
            }}
          >
            {categoria.descripcion}
          </p>
        )}

        <section style={{marginBottom: "50px"}}>
          <h2 style={{fontSize: "34px", marginBottom: "22px", letterSpacing: "-0.8px"}}>
            Luchadores
          </h2>

          {luchadores.length === 0 ? (
            <p style={{color: "#888"}}>Todavía no hay luchadores en esta categoría.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px",
              }}
            >
              {luchadores.map((luchador) => (
                <article key={luchador._id} style={cardStyle}>
                  <h3 style={{fontSize: "26px", marginBottom: "8px", letterSpacing: "-0.6px"}}>
                    {luchador.nombre}
                  </h3>

                  {luchador.apodo && (
                    <p style={{color: "#f5c542", marginBottom: "10px"}}>
                      “{luchador.apodo}”
                    </p>
                  )}

                  <div style={{display: "grid", gap: "8px", color: "#bbb", fontSize: "15px"}}>
                    {luchador.nacionalidad && <p>Nacionalidad: {luchador.nacionalidad}</p>}
                    {luchador.organizacion && <p>Organización: {luchador.organizacion}</p>}
                    {luchador.record && <p>Récord: {luchador.record}</p>}
                    <p>Estado: {luchador.activo ? "Activo" : "Inactivo"}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 style={{fontSize: "34px", marginBottom: "22px", letterSpacing: "-0.8px"}}>
            Combates
          </h2>

          {combates.length === 0 ? (
            <p style={{color: "#888"}}>Todavía no hay combates en esta categoría.</p>
          ) : (
            <div style={{display: "grid", gap: "18px"}}>
              {combates.map((combate) => (
                <article key={combate._id} style={cardStyle}>
                  <h3 style={{fontSize: "26px", marginBottom: "10px", letterSpacing: "-0.6px"}}>
                    {combate.luchadorRojo} vs {combate.luchadorAzul}
                  </h3>

                  {combate.ganador && (
                    <p style={{color: "#f5c542", marginBottom: "10px", fontSize: "17px"}}>
                      Ganador: {combate.ganador}
                    </p>
                  )}

                  <div style={{display: "grid", gap: "8px", color: "#bbb", fontSize: "15px"}}>
                    {combate.evento && <p>Evento: {combate.evento}</p>}
                    {combate.estado && <p>Estado: {combate.estado}</p>}
                    {combate.metodo && <p>Método: {combate.metodo}</p>}
                    {typeof combate.asalto === "number" && <p>Asalto: {combate.asalto}</p>}
                    {combate.tiempo && <p>Tiempo: {combate.tiempo}</p>}
                    {combate.cartelera && <p>Cartelera: {combate.cartelera}</p>}
                    {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}