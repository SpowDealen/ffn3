import Link from "next/link";
import {notFound} from "next/navigation";
import {client} from "../../../sanity/lib/client";
import {combatePorIdQuery} from "../../../sanity/lib/queries";

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
  luchadorRojoSlug?: string;
  luchadorAzul?: string;
  luchadorAzulSlug?: string;
  ganador?: string;
  categoriaPeso?: string;
};

type PageProps = {
  params: Promise<{
    id: string;
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

const linkStyle = {
  color: "#f5c542",
  textDecoration: "none",
};

export default async function ResultadoDetallePage({params}: PageProps) {
  const {id} = await params;

  const combate: Combate | null = await client.fetch(combatePorIdQuery, {id});

  if (!combate) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "white",
        padding: "56px 28px 80px",
      }}
    >
      <section
        style={{
          maxWidth: "920px",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            color: "#8f8f8f",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginBottom: "12px",
          }}
        >
          Resultado
        </p>

        <h1
          style={{
            fontSize: "56px",
            lineHeight: 1.04,
            marginBottom: "16px",
            letterSpacing: "-1.8px",
            maxWidth: "880px",
          }}
        >
          {combate.luchadorRojoSlug ? (
            <Link href={`/luchadores/${combate.luchadorRojoSlug}`} style={linkStyle}>
              {combate.luchadorRojo}
            </Link>
          ) : (
            combate.luchadorRojo
          )}{" "}
          vs{" "}
          {combate.luchadorAzulSlug ? (
            <Link href={`/luchadores/${combate.luchadorAzulSlug}`} style={linkStyle}>
              {combate.luchadorAzul}
            </Link>
          ) : (
            combate.luchadorAzul
          )}
        </h1>

        {combate.ganador && (
          <p
            style={{
              color: "#f5c542",
              fontSize: "24px",
              marginBottom: "18px",
            }}
          >
            Ganador: {combate.ganador}
          </p>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "14px",
            color: "#888",
            marginBottom: "34px",
            paddingBottom: "22px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {combate.evento && combate.eventoSlug ? (
            <span>
              Evento:{" "}
              <Link
                href={`/eventos/${combate.eventoSlug}`}
                style={{color: "#b9b9b9", textDecoration: "none"}}
              >
                {combate.evento}
              </Link>
            </span>
          ) : (
            combate.evento && <span>Evento: {combate.evento}</span>
          )}
          {combate.categoriaPeso && <span>Categoría: {combate.categoriaPeso}</span>}
          {combate.estado && <span>Estado: {combate.estado}</span>}
          {combate.cartelera && <span>Cartelera: {combate.cartelera}</span>}
        </div>

        <section style={cardStyle}>
          <div
            style={{
              display: "grid",
              gap: "10px",
              color: "#bbb",
              fontSize: "16px",
            }}
          >
            {combate.metodo && <p>Método: {combate.metodo}</p>}
            {typeof combate.asalto === "number" && <p>Asalto: {combate.asalto}</p>}
            {combate.tiempo && <p>Tiempo: {combate.tiempo}</p>}
            {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
            {combate._createdAt && (
              <p>
                Registrado: {new Date(combate._createdAt).toLocaleDateString("es-ES")}
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}