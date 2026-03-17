import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { combatePorIdQuery } from "../../../sanity/lib/queries";

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type EventoEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  fecha?: string;
  ciudad?: string;
  pais?: string;
};

type CategoriaPesoEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  limitePeso?: number;
  unidad?: string;
};

type Combate = {
  _id: string;
  _createdAt?: string;
  metodo?: string;
  detalles?: string;
  asaltosProgramados?: number;
  asaltoFinal?: number;
  tiempoFinal?: string;
  tituloEnJuego?: boolean;
  cartelera?: string;
  orden?: number;
  estado?: string;
  evento?: EventoEntity | string;
  luchadorRojo?: SluggedEntity | string;
  luchadorAzul?: SluggedEntity | string;
  ganador?: SluggedEntity | string;
  categoriaPeso?: CategoriaPesoEntity | string;
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getEntityName(value?: SluggedEntity | string | null): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function getEntitySlug(value?: SluggedEntity | string | null): string | undefined {
  if (!value || typeof value === "string") return undefined;
  return value.slug || undefined;
}

function getEventName(value?: EventoEntity | string | null): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function getEventSlug(value?: EventoEntity | string | null): string | undefined {
  if (!value || typeof value === "string") return undefined;
  return value.slug || undefined;
}

function getCategoryName(value?: CategoriaPesoEntity | string | null): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-ES");
}

export default async function ResultadoDetallePage({ params }: PageProps) {
  const { id } = await params;

  const combate: Combate | null = await client.fetch(combatePorIdQuery, { id });

  if (!combate) {
    notFound();
  }

  const luchadorRojoNombre = getEntityName(combate.luchadorRojo);
  const luchadorRojoSlug = getEntitySlug(combate.luchadorRojo);

  const luchadorAzulNombre = getEntityName(combate.luchadorAzul);
  const luchadorAzulSlug = getEntitySlug(combate.luchadorAzul);

  const ganadorNombre = getEntityName(combate.ganador);
  const eventoNombre = getEventName(combate.evento);
  const eventoSlug = getEventSlug(combate.evento);
  const categoriaPesoNombre = getCategoryName(combate.categoriaPeso);

  return (
    <main className="resultado-detalle-shell">
      <style>{`
        .resultado-detalle-shell {
          min-height: 100vh;
          color: white;
          padding: 56px 28px 80px;
          box-sizing: border-box;
        }

        .resultado-detalle-container {
          max-width: 920px;
          margin: 0 auto;
        }

        .resultado-detalle-eyebrow {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0 0 12px 0;
        }

        .resultado-detalle-title {
          font-size: clamp(2.2rem, 6vw, 3.5rem);
          line-height: 1.04;
          margin: 0 0 16px 0;
          letter-spacing: -1.8px;
          max-width: 880px;
          word-break: break-word;
        }

        .resultado-detalle-title-link {
          color: #f5c542;
          text-decoration: none;
        }

        .resultado-detalle-ganador {
          color: #f5c542;
          font-size: clamp(1.1rem, 2.6vw, 1.5rem);
          line-height: 1.45;
          margin: 0 0 18px 0;
          word-break: break-word;
        }

        .resultado-detalle-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 34px;
          padding-bottom: 22px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .resultado-detalle-meta-pill {
          display: inline-flex;
          align-items: center;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          color: #888;
          font-size: 13px;
          line-height: 1.4;
        }

        .resultado-detalle-subtle-link {
          color: #b9b9b9;
          text-decoration: none;
        }

        .resultado-detalle-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          box-sizing: border-box;
        }

        .resultado-detalle-data {
          display: grid;
          gap: 10px;
          color: #bbb;
          font-size: 16px;
          line-height: 1.7;
          min-width: 0;
        }

        .resultado-detalle-data p {
          margin: 0;
          word-break: break-word;
        }

        @media (max-width: 900px) {
          .resultado-detalle-shell {
            padding: 36px 18px 56px;
          }

          .resultado-detalle-meta {
            margin-bottom: 28px;
          }

          .resultado-detalle-card {
            padding: 22px;
          }
        }

        @media (max-width: 640px) {
          .resultado-detalle-shell {
            padding: 24px 14px 40px;
          }

          .resultado-detalle-meta {
            gap: 10px;
            margin-bottom: 22px;
            padding-bottom: 18px;
          }

          .resultado-detalle-meta-pill {
            padding: 9px 12px;
            font-size: 12px;
          }

          .resultado-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .resultado-detalle-data {
            gap: 8px;
            font-size: 14px;
          }
        }
      `}</style>

      <section className="resultado-detalle-container">
        <p className="resultado-detalle-eyebrow">Resultado</p>

        <h1 className="resultado-detalle-title">
          {luchadorRojoSlug ? (
            <Link
              href={`/luchadores/${luchadorRojoSlug}`}
              className="resultado-detalle-title-link"
            >
              {luchadorRojoNombre}
            </Link>
          ) : (
            luchadorRojoNombre || "Luchador rojo"
          )}{" "}
          vs{" "}
          {luchadorAzulSlug ? (
            <Link
              href={`/luchadores/${luchadorAzulSlug}`}
              className="resultado-detalle-title-link"
            >
              {luchadorAzulNombre}
            </Link>
          ) : (
            luchadorAzulNombre || "Luchador azul"
          )}
        </h1>

        {ganadorNombre && (
          <p className="resultado-detalle-ganador">Ganador: {ganadorNombre}</p>
        )}

        <div className="resultado-detalle-meta">
          {eventoNombre && eventoSlug ? (
            <span className="resultado-detalle-meta-pill">
              Evento:{" "}
              <Link
                href={`/eventos/${eventoSlug}`}
                className="resultado-detalle-subtle-link"
              >
                {eventoNombre}
              </Link>
            </span>
          ) : (
            eventoNombre && (
              <span className="resultado-detalle-meta-pill">Evento: {eventoNombre}</span>
            )
          )}

          {categoriaPesoNombre && (
            <span className="resultado-detalle-meta-pill">
              Categoría: {categoriaPesoNombre}
            </span>
          )}

          {combate.estado && (
            <span className="resultado-detalle-meta-pill">Estado: {combate.estado}</span>
          )}

          {combate.cartelera && (
            <span className="resultado-detalle-meta-pill">
              Cartelera: {combate.cartelera}
            </span>
          )}
        </div>

        <section className="resultado-detalle-card">
          <div className="resultado-detalle-data">
            {combate.metodo && <p>Método: {combate.metodo}</p>}
            {typeof combate.asaltoFinal === "number" && (
              <p>Asalto final: {combate.asaltoFinal}</p>
            )}
            {combate.tiempoFinal && <p>Tiempo final: {combate.tiempoFinal}</p>}
            {typeof combate.asaltosProgramados === "number" && (
              <p>Asaltos programados: {combate.asaltosProgramados}</p>
            )}
            {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
            {combate.detalles && <p>Detalles: {combate.detalles}</p>}
            {combate._createdAt && (
              <p>Registrado: {formatDate(combate._createdAt)}</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}