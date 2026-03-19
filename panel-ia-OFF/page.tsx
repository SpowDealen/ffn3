"use client";

import { useMemo, useState } from "react";

type TipoContenido =
  | "noticia"
  | "evento"
  | "luchador"
  | "combate"
  | "categoria-peso"
  | "disciplina";

type FormState = {
  tipo: TipoContenido;
  titulo: string;
  subtitulo: string;
  disciplina: string;
  organizacion: string;
  eventoRelacionado: string;
  luchadores: string;
  contexto: string;
  enfoqueEditorial: string;
  notasExtra: string;
};

const tipoOptions: { value: TipoContenido; label: string; descripcion: string }[] = [
  {
    value: "noticia",
    label: "Noticia",
    descripcion: "Borrador editorial para actualidad, anuncio, resultado o análisis.",
  },
  {
    value: "evento",
    label: "Evento",
    descripcion: "Ficha editorial de evento con contexto, cartel y puntos clave.",
  },
  {
    value: "luchador",
    label: "Luchador",
    descripcion: "Perfil editorial con biografía breve, situación actual y contexto competitivo.",
  },
  {
    value: "combate",
    label: "Combate",
    descripcion: "Borrador para previa, resultado o crónica corta de una pelea concreta.",
  },
  {
    value: "categoria-peso",
    label: "Categoría de peso",
    descripcion: "Texto explicativo y editorial para una división concreta.",
  },
  {
    value: "disciplina",
    label: "Disciplina",
    descripcion: "Ficha editorial general para MMA, boxeo, kickboxing u otra disciplina.",
  },
];

const initialForm: FormState = {
  tipo: "noticia",
  titulo: "",
  subtitulo: "",
  disciplina: "MMA",
  organizacion: "UFC",
  eventoRelacionado: "",
  luchadores: "",
  contexto: "",
  enfoqueEditorial: "",
  notasExtra: "",
};

function getTipoLabel(tipo: TipoContenido) {
  return tipoOptions.find((item) => item.value === tipo)?.label ?? tipo;
}

function getPreviewTitle(form: FormState) {
  return form.titulo.trim() || `Borrador de ${getTipoLabel(form.tipo)}`;
}

function getPreviewIntro(form: FormState) {
  const parts = [
    form.disciplina.trim(),
    form.organizacion.trim(),
    form.eventoRelacionado.trim(),
  ].filter(Boolean);

  if (!parts.length) return "Contexto editorial todavía por completar.";

  return parts.join(" · ");
}

function buildPreviewBody(form: FormState) {
  const bloques: string[] = [];

  if (form.subtitulo.trim()) {
    bloques.push(form.subtitulo.trim());
  }

  if (form.contexto.trim()) {
    bloques.push(form.contexto.trim());
  }

  if (form.enfoqueEditorial.trim()) {
    bloques.push(`Enfoque editorial: ${form.enfoqueEditorial.trim()}`);
  }

  if (form.luchadores.trim()) {
    bloques.push(`Protagonistas o nombres clave: ${form.luchadores.trim()}`);
  }

  if (form.notasExtra.trim()) {
    bloques.push(`Notas adicionales: ${form.notasExtra.trim()}`);
  }

  if (!bloques.length) {
    bloques.push(
      "Este espacio mostrará aquí la vista previa del borrador editorial generado. En el siguiente paso conectaremos esta pantalla con la lógica de generación para que deje de ser una maqueta bonita y empiece a currar de verdad."
    );
  }

  return bloques;
}

export default function PanelIAPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [simulatedGenerated, setSimulatedGenerated] = useState(false);

  const selectedTipo = useMemo(
    () => tipoOptions.find((item) => item.value === form.tipo),
    [form.tipo]
  );

  const previewBlocks = useMemo(() => buildPreviewBody(form), [form]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleReset() {
    setForm(initialForm);
    setSimulatedGenerated(false);
  }

  function handleGeneratePreview() {
    setSimulatedGenerated(true);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ffn-bg)",
        color: "var(--ffn-text)",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <section
          style={{
            border: "1px solid var(--ffn-border)",
            background: "var(--ffn-surface)",
            borderRadius: "24px",
            padding: "28px",
            display: "grid",
            gap: "14px",
            boxShadow: "var(--ffn-shadow-soft)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span className="ffn-pill">Panel IA editorial</span>
            <span className="ffn-pill-muted">Fase 1</span>
            <span className="ffn-pill-muted">Base del generador interno</span>
          </div>

          <div style={{ display: "grid", gap: "10px", maxWidth: "980px" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2rem, 4vw, 3.2rem)",
                lineHeight: 1.05,
              }}
            >
              Centro interno para generar borradores editoriales
            </h1>

            <p
              style={{
                margin: 0,
                color: "var(--ffn-text-soft)",
                lineHeight: 1.7,
                fontSize: "1.02rem",
              }}
            >
              Esta primera versión deja montada la base visual y operativa del panel. El objetivo
              es empezar por noticias y después extender el mismo sistema a eventos, luchadores,
              combates, categorías de peso y disciplinas.
            </p>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.02fr) minmax(0, 0.98fr)",
            gap: "24px",
            alignItems: "start",
          }}
          className="ffn-panel-ia-grid"
        >
          <div
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "24px",
              display: "grid",
              gap: "22px",
              boxShadow: "var(--ffn-shadow-soft)",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span className="ffn-section-kicker">Entrada editorial</span>
              <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Formulario base</h2>
              <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.65 }}>
                Rellenas contexto, enfoque y protagonistas. En el siguiente bloque conectaremos la
                generación real para convertir esto en una máquina de borradores útil de verdad.
              </p>
            </div>

            <div style={{ display: "grid", gap: "18px" }}>
              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Tipo de contenido</label>
                <select
                  value={form.tipo}
                  onChange={(e) => updateField("tipo", e.target.value as TipoContenido)}
                  className="ffn-select"
                >
                  {tipoOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <p style={helperTextStyle}>{selectedTipo?.descripcion}</p>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Título o idea principal</label>
                <input
                  className="ffn-input"
                  type="text"
                  value={form.titulo}
                  onChange={(e) => updateField("titulo", e.target.value)}
                  placeholder="Ej: Topuria consolida su figura como referente absoluto en UFC"
                />
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Subtítulo o resumen corto</label>
                <input
                  className="ffn-input"
                  type="text"
                  value={form.subtitulo}
                  onChange={(e) => updateField("subtitulo", e.target.value)}
                  placeholder="Una línea editorial breve para orientar el borrador"
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "14px",
                }}
                className="ffn-panel-ia-two-cols"
              >
                <div style={{ display: "grid", gap: "10px" }}>
                  <label style={labelStyle}>Disciplina</label>
                  <input
                    className="ffn-input"
                    type="text"
                    value={form.disciplina}
                    onChange={(e) => updateField("disciplina", e.target.value)}
                    placeholder="MMA"
                  />
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  <label style={labelStyle}>Organización</label>
                  <input
                    className="ffn-input"
                    type="text"
                    value={form.organizacion}
                    onChange={(e) => updateField("organizacion", e.target.value)}
                    placeholder="UFC"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Evento relacionado</label>
                <input
                  className="ffn-input"
                  type="text"
                  value={form.eventoRelacionado}
                  onChange={(e) => updateField("eventoRelacionado", e.target.value)}
                  placeholder="Ej: UFC 308"
                />
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Luchadores o protagonistas</label>
                <input
                  className="ffn-input"
                  type="text"
                  value={form.luchadores}
                  onChange={(e) => updateField("luchadores", e.target.value)}
                  placeholder="Ej: Ilia Topuria, Max Holloway"
                />
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Contexto</label>
                <textarea
                  value={form.contexto}
                  onChange={(e) => updateField("contexto", e.target.value)}
                  placeholder="Explica el contexto de la pieza, el momento deportivo, la situación del evento o por qué esto importa editorialmente."
                />
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Enfoque editorial</label>
                <textarea
                  value={form.enfoqueEditorial}
                  onChange={(e) => updateField("enfoqueEditorial", e.target.value)}
                  placeholder="Ej: tono analítico, enfoque de impacto, previa editorial seria, lectura de contexto, clave histórica..."
                />
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label style={labelStyle}>Notas extra</label>
                <textarea
                  value={form.notasExtra}
                  onChange={(e) => updateField("notasExtra", e.target.value)}
                  placeholder="Detalles internos, referencias, ángulos o recordatorios para la generación futura."
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <button type="button" className="ffn-button-primary" onClick={handleGeneratePreview}>
                Generar preview base
              </button>

              <button type="button" className="ffn-button-secondary" onClick={handleReset}>
                Limpiar formulario
              </button>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--ffn-border)",
              background: "var(--ffn-surface)",
              borderRadius: "24px",
              padding: "24px",
              display: "grid",
              gap: "22px",
              boxShadow: "var(--ffn-shadow-soft)",
              position: "sticky",
              top: "108px",
            }}
            className="ffn-panel-ia-preview"
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <span className="ffn-section-kicker">Vista previa</span>
              <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Borrador inicial</h2>
              <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.65 }}>
                Aquí verás la salida editorial del panel antes de guardar o revisar.
              </p>
            </div>

            <article
              style={{
                border: "1px solid var(--ffn-border)",
                background: "rgba(255,255,255,0.025)",
                borderRadius: "20px",
                padding: "22px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <span className="ffn-pill">{getTipoLabel(form.tipo)}</span>
                <span className="ffn-pill-muted">
                  {simulatedGenerated ? "Preview generada" : "Preview base"}
                </span>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "clamp(1.4rem, 2vw, 2rem)",
                    lineHeight: 1.12,
                  }}
                >
                  {getPreviewTitle(form)}
                </h3>

                <p
                  style={{
                    margin: 0,
                    color: "var(--ffn-text-soft)",
                    lineHeight: 1.65,
                    fontSize: "0.98rem",
                  }}
                >
                  {getPreviewIntro(form)}
                </p>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {previewBlocks.map((block, index) => (
                  <p
                    key={`${block}-${index}`}
                    style={{
                      margin: 0,
                      lineHeight: 1.75,
                      color: index === 0 ? "var(--ffn-text)" : "var(--ffn-text-soft)",
                    }}
                  >
                    {block}
                  </p>
                ))}
              </div>
            </article>

            <div
              style={{
                display: "grid",
                gap: "12px",
                border: "1px dashed var(--ffn-border)",
                borderRadius: "18px",
                padding: "18px",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Siguiente paso técnico</h3>
              <p style={{ margin: 0, color: "var(--ffn-text-soft)", lineHeight: 1.7 }}>
                Después de validar esta pantalla, conectaremos el botón de generación con lógica
                real para producir borradores y, a continuación, añadiremos el guardado en Sanity
                como borrador editorial.
              </p>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1080px) {
          .ffn-panel-ia-grid {
            grid-template-columns: 1fr !important;
          }

          .ffn-panel-ia-preview {
            position: static !important;
            top: auto !important;
          }
        }

        @media (max-width: 720px) {
          .ffn-panel-ia-two-cols {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          main {
            padding: 28px 14px !important;
          }
        }
      `}</style>
    </main>
  );
}

const labelStyle = {
  fontSize: "0.92rem",
  fontWeight: 700,
  color: "var(--ffn-text)",
} as const;

const helperTextStyle = {
  margin: 0,
  color: "var(--ffn-text-soft)",
  fontSize: "0.92rem",
  lineHeight: 1.6,
} as const;