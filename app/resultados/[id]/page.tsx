import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { combatePorIdQuery } from "../../../sanity/lib/queries";

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  apodo?: string;
  imagen?: unknown;
};

type EventoEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  fecha?: string;
  horaLocal?: string;
  ciudad?: string;
  pais?: string;
  recinto?: string;
  cartelPrincipal?: string;
  descripcionCorta?: string;
  descripcion?: string;
  dondeVer?: string;
  estado?: string;
};

type CategoriaPesoEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
  limitePeso?: number;
  unidad?: string;
};

type OrganizacionEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

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
  resumen?: string;
  desarrollo?: string;
  momentoClave?: string;
  consecuencia?: string;
  evento?: EventoEntity | string;
  organizacion?: OrganizacionEntity | string;
  disciplina?: string;
  disciplinaSlug?: string;
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

function getEntityName(
  value?: SluggedEntity | OrganizacionEntity | string | null
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.nombre || "";
}

function getEntitySlug(
  value?: SluggedEntity | OrganizacionEntity | string | null
): string | undefined {
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

function getCategorySlug(
  value?: CategoriaPesoEntity | string | null
): string | undefined {
  if (!value || typeof value === "string") return undefined;
  return value.slug || undefined;
}

function formatDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatEstado(value?: string): string {
  if (!value) return "";
  if (value === "programado") return "Programado";
  if (value === "finalizado") return "Finalizado";
  if (value === "cancelado") return "Cancelado";
  if (value === "proximo") return "Próximo";
  if (value === "celebrado") return "Celebrado";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCartelera(value?: string): string {
  if (!value) return "";
  if (value === "principal") return "Cartelera principal";
  if (value === "preliminar") return "Cartelera preliminar";
  return value;
}

function formatPeso(categoria?: CategoriaPesoEntity | string): string {
  if (!categoria || typeof categoria === "string") return "";
  if (typeof categoria.limitePeso === "number" && categoria.unidad) {
    return `${categoria.limitePeso} ${categoria.unidad}`;
  }
  return "";
}

export default async function ResultadoDetallePage({ params }: PageProps) {
  const { id } = await params;

  const combate: Combate | null = await client.fetch(combatePorIdQuery, { id });

  if (!combate) {
    notFound();
  }

  const luchadorRojoNombre = getEntityName(combate.luchadorRojo) || "Luchador rojo";
  const luchadorRojoSlug = getEntitySlug(combate.luchadorRojo);

  const luchadorAzulNombre = getEntityName(combate.luchadorAzul) || "Luchador azul";
  const luchadorAzulSlug = getEntitySlug(combate.luchadorAzul);

  const ganadorNombre = getEntityName(combate.ganador);
  const ganadorSlug = getEntitySlug(combate.ganador);

  const eventoNombre = getEventName(combate.evento);
  const eventoSlug = getEventSlug(combate.evento);

  const categoriaPesoNombre = getCategoryName(combate.categoriaPeso);
  const categoriaPesoSlug = getCategorySlug(combate.categoriaPeso);
  const categoriaPesoDetalle = formatPeso(combate.categoriaPeso);

  const organizacionNombre = getEntityName(combate.organizacion);
  const organizacionSlug = getEntitySlug(combate.organizacion);

  const eventoData =
    combate.evento && typeof combate.evento !== "string" ? combate.evento : undefined;

  return (
    <main className="resultado-detalle-shell">
      <style>{`
        .resultado-detalle-shell {
          min-height: 100vh;
          color: var(--ffn-text, white);
          padding: 56px 28px 80px;
          box-sizing: border-box;
        }

        .resultado-detalle-container {
          max-width: 1080px;
          margin: 0 auto;
        }

        .resultado-detalle-eyebrow {
          color: var(--ffn-text-muted, #8f8f8f);
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
          max-width: 980px;
          word-break: break-word;
        }

        .resultado-detalle-title-link {
          color: var(--ffn-accent, #f5c542);
          text-decoration: none;
        }

        .resultado-detalle-summary {
          color: var(--ffn-accent, #f5c542);
          font-size: clamp(1.06rem, 2.5vw, 1.34rem);
          line-height: 1.55;
          margin: 0 0 18px 0;
          max-width: 960px;
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
          color: #c8c8c8;
          font-size: 13px;
          line-height: 1.4;
        }

        .resultado-detalle-pill-link {
          color: inherit;
          text-decoration: none;
        }

        .resultado-detalle-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.95fr);
          gap: 22px;
          align-items: start;
          margin-bottom: 42px;
        }

        .resultado-detalle-card {
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          box-sizing: border-box;
          min-width: 0;
        }

        .resultado-detalle-card-title {
          margin: 0 0 14px 0;
          font-size: 1.08rem;
          line-height: 1.2;
          letter-spacing: -0.3px;
        }

        .resultado-detalle-card-text {
          margin: 0;
          color: var(--ffn-text-soft, #b9b9b9);
          line-height: 1.82;
          font-size: 15px;
          white-space: pre-line;
          word-break: break-word;
        }

        .resultado-detalle-data {
          display: grid;
          gap: 10px;
          color: #c3c3c3;
          font-size: 15px;
          line-height: 1.7;
          min-width: 0;
        }

        .resultado-detalle-data p {
          margin: 0;
          word-break: break-word;
        }

        .resultado-detalle-data strong {
          color: white;
          font-weight: 600;
        }

        .resultado-detalle-sections {
          display: grid;
          gap: 22px;
        }

        .resultado-detalle-section {
          margin-bottom: 0;
        }

        .resultado-detalle-section-title {
          font-size: clamp(1.45rem, 3vw, 1.9rem);
          line-height: 1.14;
          letter-spacing: -0.6px;
          margin: 0 0 14px 0;
        }

        .resultado-detalle-section-text {
          margin: 0;
          color: var(--ffn-text-soft, #b9b9b9);
          font-size: 15px;
          line-height: 1.85;
          white-space: pre-line;
        }

        .resultado-detalle-links {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }

        .resultado-detalle-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: white;
          text-decoration: none;
          font-size: 14px;
          line-height: 1;
          transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
        }

        .resultado-detalle-action:hover {
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.16);
          background: rgba(255,255,255,0.06);
        }

        @media (max-width: 980px) {
          .resultado-detalle-layout {
            grid-template-columns: minmax(0, 1fr);
          }
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

          .resultado-detalle-data,
          .resultado-detalle-card-text,
          .resultado-detalle-section-text {
            font-size: 14px;
          }

          .resultado-detalle-links {
            gap: 10px;
          }

          .resultado-detalle-action {
            width: 100%;
          }
        }
      `}</style>

      <section className="resultado-detalle-container">
        <p className="resultado-detalle-eyebrow">Resultado del combate</p>

        <h1 className="resultado-detalle-title">
          {luchadorRojoSlug ? (
            <Link
              href={`/luchadores/${luchadorRojoSlug}`}
              className="resultado-detalle-title-link"
            >
              {luchadorRojoNombre}
            </Link>
          ) : (
            luchadorRojoNombre
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
            luchadorAzulNombre
          )}
        </h1>

        <p className="resultado-detalle-summary">
          {combate.resumen ||
            (ganadorNombre
              ? `${ganadorNombre} se impuso en este combate.`
              : "Todavía no hay un resumen editorial desarrollado para este combate.")}
        </p>

        <div className="resultado-detalle-meta">
          {eventoNombre && (
            <span className="resultado-detalle-meta-pill">
              Evento:{" "}
              {eventoSlug ? (
                <Link href={`/eventos/${eventoSlug}`} className="resultado-detalle-pill-link">
                  {eventoNombre}
                </Link>
              ) : (
                eventoNombre
              )}
            </span>
          )}

          {categoriaPesoNombre && (
            <span className="resultado-detalle-meta-pill">
              Categoría:{" "}
              {categoriaPesoSlug ? (
                <Link
                  href={`/categorias-peso/${categoriaPesoSlug}`}
                  className="resultado-detalle-pill-link"
                >
                  {categoriaPesoNombre}
                </Link>
              ) : (
                categoriaPesoNombre
              )}
            </span>
          )}

          {combate.estado && (
            <span className="resultado-detalle-meta-pill">
              Estado: {formatEstado(combate.estado)}
            </span>
          )}

          {combate.cartelera && (
            <span className="resultado-detalle-meta-pill">
              {formatCartelera(combate.cartelera)}
            </span>
          )}

          {ganadorNombre && (
            <span className="resultado-detalle-meta-pill">
              Ganador:{" "}
              {ganadorSlug ? (
                <Link
                  href={`/luchadores/${ganadorSlug}`}
                  className="resultado-detalle-pill-link"
                >
                  {ganadorNombre}
                </Link>
              ) : (
                ganadorNombre
              )}
            </span>
          )}

          {combate.tituloEnJuego && (
            <span className="resultado-detalle-meta-pill">Título en juego</span>
          )}
        </div>

        <section className="resultado-detalle-layout">
          <article className="resultado-detalle-card">
            <h2 className="resultado-detalle-card-title">Ficha del resultado</h2>

            <div className="resultado-detalle-data">
              {combate.metodo && (
                <p>
                  <strong>Método:</strong> {combate.metodo}
                </p>
              )}

              {typeof combate.asalto === "number" && (
                <p>
                  <strong>Asalto final:</strong> {combate.asalto}
                </p>
              )}

              {combate.tiempo && (
                <p>
                  <strong>Tiempo final:</strong> {combate.tiempo}
                </p>
              )}

              {categoriaPesoNombre && (
                <p>
                  <strong>Categoría:</strong>{" "}
                  {categoriaPesoSlug ? (
                    <Link
                      href={`/categorias-peso/${categoriaPesoSlug}`}
                      className="resultado-detalle-pill-link"
                    >
                      {categoriaPesoNombre}
                    </Link>
                  ) : (
                    categoriaPesoNombre
                  )}
                  {categoriaPesoDetalle ? ` (${categoriaPesoDetalle})` : ""}
                </p>
              )}

              {eventoData?.fecha && (
                <p>
                  <strong>Fecha del evento:</strong> {formatDate(eventoData.fecha)}
                </p>
              )}

              {eventoData?.horaLocal && (
                <p>
                  <strong>Hora:</strong> {eventoData.horaLocal}
                </p>
              )}

              {(eventoData?.ciudad || eventoData?.pais) && (
                <p>
                  <strong>Lugar:</strong>{" "}
                  {[eventoData?.ciudad, eventoData?.pais].filter(Boolean).join(", ")}
                </p>
              )}

              {eventoData?.recinto && (
                <p>
                  <strong>Recinto:</strong> {eventoData.recinto}
                </p>
              )}

              {organizacionNombre && (
                <p>
                  <strong>Organización:</strong>{" "}
                  {organizacionSlug ? (
                    <Link
                      href={`/organizaciones/${organizacionSlug}`}
                      className="resultado-detalle-pill-link"
                    >
                      {organizacionNombre}
                    </Link>
                  ) : (
                    organizacionNombre
                  )}
                </p>
              )}

              {combate.disciplina && (
                <p>
                  <strong>Disciplina:</strong>{" "}
                  {combate.disciplinaSlug ? (
                    <Link
                      href={`/disciplinas/${combate.disciplinaSlug}`}
                      className="resultado-detalle-pill-link"
                    >
                      {combate.disciplina}
                    </Link>
                  ) : (
                    combate.disciplina
                  )}
                </p>
              )}

              {eventoData?.dondeVer && (
                <p>
                  <strong>Dónde se pudo ver:</strong> {eventoData.dondeVer}
                </p>
              )}

              {combate._createdAt && (
                <p>
                  <strong>Registrado:</strong> {formatDate(combate._createdAt)}
                </p>
              )}
            </div>

            <div className="resultado-detalle-links">
              {eventoSlug && (
                <Link href={`/eventos/${eventoSlug}`} className="resultado-detalle-action">
                  Ver evento
                </Link>
              )}

              {luchadorRojoSlug && (
                <Link
                  href={`/luchadores/${luchadorRojoSlug}`}
                  className="resultado-detalle-action"
                >
                  Ver {luchadorRojoNombre}
                </Link>
              )}

              {luchadorAzulSlug && (
                <Link
                  href={`/luchadores/${luchadorAzulSlug}`}
                  className="resultado-detalle-action"
                >
                  Ver {luchadorAzulNombre}
                </Link>
              )}

              {ganadorSlug && (
                <Link
                  href={`/luchadores/${ganadorSlug}`}
                  className="resultado-detalle-action"
                >
                  Ver ganador
                </Link>
              )}
            </div>
          </article>

          <article className="resultado-detalle-card">
            <h2 className="resultado-detalle-card-title">Contexto del evento</h2>

            <p className="resultado-detalle-card-text">
              {eventoData?.descripcionCorta ||
                eventoData?.descripcion ||
                "Este combate pertenece a un evento que todavía no tiene contexto editorial desarrollado."}
            </p>
          </article>
        </section>

        <section className="resultado-detalle-sections">
          <article className="resultado-detalle-card resultado-detalle-section">
            <h2 className="resultado-detalle-section-title">Cómo se desarrolló el combate</h2>
            <p className="resultado-detalle-section-text">
              {combate.desarrollo ||
                "Todavía no hay una descripción detallada del desarrollo del combate."}
            </p>
          </article>

          {combate.momentoClave && (
            <article className="resultado-detalle-card resultado-detalle-section">
              <h2 className="resultado-detalle-section-title">Momento clave</h2>
              <p className="resultado-detalle-section-text">{combate.momentoClave}</p>
            </article>
          )}

          {combate.consecuencia && (
            <article className="resultado-detalle-card resultado-detalle-section">
              <h2 className="resultado-detalle-section-title">
                Qué significa este resultado
              </h2>
              <p className="resultado-detalle-section-text">{combate.consecuencia}</p>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}