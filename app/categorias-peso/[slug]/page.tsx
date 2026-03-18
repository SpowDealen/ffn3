import Link from "next/link";
import { notFound } from "next/navigation";
import { client } from "../../../sanity/lib/client";
import { categoriaPesoPorSlugQuery } from "../../../sanity/lib/queries";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type SluggedEntity = {
  _id?: string;
  nombre?: string;
  slug?: string;
};

type CategoriaPesoData = {
  _id?: string;
  nombre?: string;
  slug?: string;
  limitePeso?: number;
  unidad?: string;
  descripcion?: string;
  activa?: boolean;
  disciplina?: string | SluggedEntity | null;
  disciplinaSlug?: string;

  luchadores?: unknown[];
  luchadoresRelacionados?: unknown[];
  combates?: unknown[];
  combatesRelacionados?: unknown[];
};

type LuchadorNormalizado = {
  _id: string;
  nombre: string;
  slug?: string;
  apodo?: string;
  nacionalidad?: string;
  record?: string;
  activo?: boolean;
  disciplina?: string;
  organizacion?: string;
};

type CombateNormalizado = {
  _id: string;
  metodo?: string;
  asaltoFinal?: number;
  tiempoFinal?: string;
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
  ganadorSlug?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getString(value: unknown): string | undefined {
  return hasText(value) ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function getSlug(value: unknown): string | undefined {
  if (hasText(value)) return value.trim();

  if (isObject(value)) {
    const directSlug = getString(value.slug);
    if (directSlug) return directSlug;

    if (isObject(value.slug)) {
      return getString(value.slug.current);
    }
  }

  return undefined;
}

function getEntityName(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (isObject(value)) return getString(value.nombre) || "";
  return "";
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeLuchador(item: unknown): LuchadorNormalizado | null {
  if (!isObject(item)) return null;

  const _id = getString(item._id);
  const nombre = getString(item.nombre);

  if (!_id || !nombre) return null;

  return {
    _id,
    nombre,
    slug: getSlug(item.slug),
    apodo: getString(item.apodo),
    nacionalidad: getString(item.nacionalidad),
    record: getString(item.record),
    activo: getBoolean(item.activo),
    disciplina: getEntityName(item.disciplina),
    organizacion: getEntityName(item.organizacion),
  };
}

function normalizeCombate(item: unknown): CombateNormalizado | null {
  if (!isObject(item)) return null;

  const _id = getString(item._id);
  if (!_id) return null;

  const luchadorRojo = item.luchadorRojo;
  const luchadorAzul = item.luchadorAzul;
  const ganador = item.ganador;
  const evento = item.evento;

  const normalizado: CombateNormalizado = {
    _id,
    metodo: getString(item.metodo),
    asaltoFinal: getNumber(item.asaltoFinal ?? item.asalto),
    tiempoFinal: getString(item.tiempoFinal ?? item.tiempo),
    tituloEnJuego: getBoolean(item.tituloEnJuego),
    cartelera: getString(item.cartelera),
    orden: getNumber(item.orden),
    estado: getString(item.estado),
    evento: getEntityName(evento),
    eventoSlug: getString(item.eventoSlug) || getSlug(evento),
    luchadorRojo: getEntityName(luchadorRojo),
    luchadorRojoSlug: getString(item.luchadorRojoSlug) || getSlug(luchadorRojo),
    luchadorAzul: getEntityName(luchadorAzul),
    luchadorAzulSlug: getString(item.luchadorAzulSlug) || getSlug(luchadorAzul),
    ganador: getEntityName(ganador),
    ganadorSlug: getString(item.ganadorSlug) || getSlug(ganador),
  };

  const tieneAlgoUtil =
    hasText(normalizado.luchadorRojo) ||
    hasText(normalizado.luchadorAzul) ||
    hasText(normalizado.evento) ||
    hasText(normalizado.metodo);

  return tieneAlgoUtil ? normalizado : null;
}

export default async function CategoriaPesoDetallePage({ params }: PageProps) {
  const { slug } = await params;

  if (!hasText(slug)) {
    notFound();
  }

  const categoriaRaw = await client.fetch<CategoriaPesoData | null>(
    categoriaPesoPorSlugQuery,
    { slug: slug.trim() }
  );

  if (!categoriaRaw || !hasText(categoriaRaw.nombre)) {
    notFound();
  }

  const categoria = {
    _id: getString(categoriaRaw._id) || "",
    nombre: getString(categoriaRaw.nombre) || "Categoría sin nombre",
    slug: getString(categoriaRaw.slug) || slug.trim(),
    limitePeso: getNumber(categoriaRaw.limitePeso),
    unidad: getString(categoriaRaw.unidad),
    descripcion: getString(categoriaRaw.descripcion),
    activa: getBoolean(categoriaRaw.activa),
    disciplina: getEntityName(categoriaRaw.disciplina),
    disciplinaSlug: getString(categoriaRaw.disciplinaSlug) || getSlug(categoriaRaw.disciplina),
  };

  const luchadoresFuente =
    getArray(categoriaRaw.luchadores).length > 0
      ? getArray(categoriaRaw.luchadores)
      : getArray(categoriaRaw.luchadoresRelacionados);

  const combatesFuente =
    getArray(categoriaRaw.combates).length > 0
      ? getArray(categoriaRaw.combates)
      : getArray(categoriaRaw.combatesRelacionados);

  const luchadores = luchadoresFuente
    .map(normalizeLuchador)
    .filter((item): item is LuchadorNormalizado => item !== null);

  const combates = combatesFuente
    .map(normalizeCombate)
    .filter((item): item is CombateNormalizado => item !== null);

  const mostrarEstadoCategoria = typeof categoria.activa === "boolean";

  return (
    <main className="categoria-detalle-shell">
      <style>{`
        .categoria-detalle-shell {
          min-height: 100vh;
          color: white;
          padding: 48px 28px 70px;
          box-sizing: border-box;
        }

        .categoria-detalle-container {
          max-width: 1100px;
          margin: 0 auto;
        }

        .categoria-detalle-back {
          display: inline-block;
          margin-bottom: 22px;
          color: #9ca3af;
          text-decoration: none;
          font-size: 14px;
          line-height: 1.4;
        }

        .categoria-detalle-hero {
          background:
            linear-gradient(135deg, rgba(20,24,38,0.92) 0%, rgba(10,10,10,0.96) 55%, rgba(6,6,6,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.22);
          margin-bottom: 34px;
        }

        .categoria-detalle-eyebrow {
          color: #8f8f8f;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.8px;
          margin: 0 0 10px 0;
        }

        .categoria-detalle-title {
          font-size: clamp(2.2rem, 5.5vw, 3.25rem);
          line-height: 1.08;
          margin: 0 0 16px 0;
          letter-spacing: -1.5px;
          word-break: break-word;
        }

        .categoria-detalle-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 22px;
        }

        .categoria-detalle-meta-pill {
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

        .categoria-detalle-meta-pill a {
          color: inherit;
          text-decoration: none;
        }

        .categoria-detalle-meta-pill--activa {
          color: #4ade80;
        }

        .categoria-detalle-meta-pill--inactiva {
          color: #f87171;
        }

        .categoria-detalle-descripcion {
          color: #b9b9b9;
          font-size: clamp(1rem, 1.9vw, 1.18rem);
          line-height: 1.85;
          margin: 0;
          max-width: 920px;
        }

        .categoria-detalle-section {
          margin-bottom: 50px;
        }

        .categoria-detalle-section:last-child {
          margin-bottom: 0;
        }

        .categoria-detalle-section-title {
          font-size: clamp(1.7rem, 3.4vw, 2.125rem);
          margin: 0 0 22px 0;
          letter-spacing: -0.8px;
          line-height: 1.12;
        }

        .categoria-detalle-empty {
          color: #888;
          margin: 0;
          line-height: 1.7;
        }

        .categoria-detalle-grid-luchadores {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .categoria-detalle-grid-combates {
          display: grid;
          gap: 18px;
        }

        .categoria-detalle-link {
          text-decoration: none;
          color: inherit;
          min-width: 0;
        }

        .categoria-detalle-card {
          height: 100%;
          display: flex;
          flex-direction: column;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          box-sizing: border-box;
          min-width: 0;
        }

        .categoria-detalle-link:hover .categoria-detalle-card {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.14);
          box-shadow: 0 14px 34px rgba(0,0,0,0.26);
        }

        .categoria-detalle-card-title {
          font-size: clamp(1.3rem, 2.4vw, 1.625rem);
          margin: 0 0 8px 0;
          letter-spacing: -0.6px;
          line-height: 1.2;
          word-break: break-word;
        }

        .categoria-detalle-card-subtitle {
          color: #f5c542;
          margin: 0 0 10px 0;
          line-height: 1.5;
          word-break: break-word;
        }

        .categoria-detalle-card-highlight {
          color: #f5c542;
          margin: 0 0 10px 0;
          font-size: clamp(1rem, 1.8vw, 1.06rem);
          line-height: 1.5;
          word-break: break-word;
        }

        .categoria-detalle-card-data {
          display: grid;
          gap: 8px;
          color: #bbb;
          font-size: 15px;
          line-height: 1.65;
          min-width: 0;
        }

        .categoria-detalle-card-data p {
          margin: 0;
          word-break: break-word;
        }

        .categoria-detalle-card-inline-link {
          color: #b9b9b9;
          text-decoration: none;
        }

        .categoria-detalle-cta {
          margin: 18px 0 0 0;
          color: #f5c542;
          font-size: 14px;
          line-height: 1.4;
          margin-top: auto;
          padding-top: 18px;
        }

        @media (max-width: 1100px) {
          .categoria-detalle-grid-luchadores {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .categoria-detalle-shell {
            padding: 36px 18px 56px;
          }

          .categoria-detalle-hero {
            padding: 24px;
            border-radius: 20px;
            margin-bottom: 28px;
          }

          .categoria-detalle-card {
            padding: 22px;
          }
        }

        @media (max-width: 640px) {
          .categoria-detalle-shell {
            padding: 24px 14px 40px;
          }

          .categoria-detalle-back {
            margin-bottom: 18px;
          }

          .categoria-detalle-hero {
            padding: 18px;
            border-radius: 18px;
            margin-bottom: 22px;
          }

          .categoria-detalle-meta {
            gap: 10px;
            margin-bottom: 18px;
          }

          .categoria-detalle-meta-pill {
            padding: 9px 12px;
            font-size: 12px;
          }

          .categoria-detalle-section {
            margin-bottom: 34px;
          }

          .categoria-detalle-grid-luchadores {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }

          .categoria-detalle-grid-combates {
            gap: 16px;
          }

          .categoria-detalle-card {
            padding: 18px;
            border-radius: 16px;
          }

          .categoria-detalle-card-data {
            font-size: 14px;
          }
        }
      `}</style>

      <section className="categoria-detalle-container">
        <Link href="/categorias-peso" className="categoria-detalle-back">
          ← Volver a categorías de peso
        </Link>

        <section className="categoria-detalle-hero">
          <p className="categoria-detalle-eyebrow">Categoría de peso</p>

          <h1 className="categoria-detalle-title">{categoria.nombre}</h1>

          <div className="categoria-detalle-meta">
            {categoria.disciplina && (
              <span className="categoria-detalle-meta-pill">
                Disciplina:{" "}
                {categoria.disciplinaSlug ? (
                  <Link href={`/disciplinas/${categoria.disciplinaSlug}`}>
                    {categoria.disciplina}
                  </Link>
                ) : (
                  categoria.disciplina
                )}
              </span>
            )}

            {typeof categoria.limitePeso === "number" && (
              <span className="categoria-detalle-meta-pill">
                Límite: {categoria.limitePeso}
                {categoria.unidad ? ` ${categoria.unidad}` : ""}
              </span>
            )}

            {mostrarEstadoCategoria && (
              <span
                className={`categoria-detalle-meta-pill ${
                  categoria.activa
                    ? "categoria-detalle-meta-pill--activa"
                    : "categoria-detalle-meta-pill--inactiva"
                }`}
              >
                {categoria.activa ? "Activa" : "Inactiva"}
              </span>
            )}
          </div>

          {categoria.descripcion && (
            <p className="categoria-detalle-descripcion">{categoria.descripcion}</p>
          )}
        </section>

        <section className="categoria-detalle-section">
          <h2 className="categoria-detalle-section-title">Luchadores</h2>

          {luchadores.length === 0 ? (
            <p className="categoria-detalle-empty">
              Todavía no hay luchadores en esta categoría.
            </p>
          ) : (
            <div className="categoria-detalle-grid-luchadores">
              {luchadores.map((luchador) => {
                const tieneSlug = hasText(luchador.slug);

                const contenido = (
                  <article className="categoria-detalle-card">
                    <h3 className="categoria-detalle-card-title">{luchador.nombre}</h3>

                    {luchador.apodo && (
                      <p className="categoria-detalle-card-subtitle">“{luchador.apodo}”</p>
                    )}

                    <div className="categoria-detalle-card-data">
                      {luchador.nacionalidad && <p>Nacionalidad: {luchador.nacionalidad}</p>}
                      {luchador.organizacion && <p>Organización: {luchador.organizacion}</p>}
                      {luchador.record && <p>Récord: {luchador.record}</p>}
                      {typeof luchador.activo === "boolean" && (
                        <p>Estado: {luchador.activo ? "Activo" : "Inactivo"}</p>
                      )}
                    </div>

                    <p className="categoria-detalle-cta">
                      {tieneSlug ? "Ver perfil del luchador" : "Perfil no disponible"}
                    </p>
                  </article>
                );

                if (!tieneSlug) {
                  return <div key={luchador._id}>{contenido}</div>;
                }

                return (
                  <Link
                    key={luchador._id}
                    href={`/luchadores/${luchador.slug}`}
                    className="categoria-detalle-link"
                  >
                    {contenido}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="categoria-detalle-section">
          <h2 className="categoria-detalle-section-title">Combates</h2>

          {combates.length === 0 ? (
            <p className="categoria-detalle-empty">
              Todavía no hay combates en esta categoría.
            </p>
          ) : (
            <div className="categoria-detalle-grid-combates">
              {combates.map((combate) => {
                const luchadorRojoNombre = combate.luchadorRojo || "Luchador rojo";
                const luchadorAzulNombre = combate.luchadorAzul || "Luchador azul";
                const tieneResultado = hasText(combate._id);

                const contenido = (
                  <article className="categoria-detalle-card">
                    <h3 className="categoria-detalle-card-title">
                      {luchadorRojoNombre} vs {luchadorAzulNombre}
                    </h3>

                    {combate.ganador && (
                      <p className="categoria-detalle-card-highlight">
                        Ganador: {combate.ganador}
                      </p>
                    )}

                    <div className="categoria-detalle-card-data">
                      {combate.evento && combate.eventoSlug ? (
                        <p>
                          Evento:{" "}
                          <Link
                            href={`/eventos/${combate.eventoSlug}`}
                            className="categoria-detalle-card-inline-link"
                          >
                            {combate.evento}
                          </Link>
                        </p>
                      ) : combate.evento ? (
                        <p>Evento: {combate.evento}</p>
                      ) : null}

                      {combate.estado && <p>Estado: {combate.estado}</p>}
                      {combate.metodo && <p>Método: {combate.metodo}</p>}
                      {typeof combate.asaltoFinal === "number" && (
                        <p>Asalto final: {combate.asaltoFinal}</p>
                      )}
                      {combate.tiempoFinal && <p>Tiempo final: {combate.tiempoFinal}</p>}
                      {combate.cartelera && <p>Cartelera: {combate.cartelera}</p>}
                      {combate.tituloEnJuego && <p>Pelea con título en juego</p>}
                    </div>

                    <p className="categoria-detalle-cta">
                      {tieneResultado ? "Ver resultado" : "Resultado no disponible"}
                    </p>
                  </article>
                );

                if (!tieneResultado) {
                  return <div key={combate._id}>{contenido}</div>;
                }

                return (
                  <Link
                    key={combate._id}
                    href={`/resultados/${combate._id}`}
                    className="categoria-detalle-link"
                  >
                    {contenido}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}