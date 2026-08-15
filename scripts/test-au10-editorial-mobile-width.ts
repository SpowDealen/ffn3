import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const styles = readFileSync(
  "_laboratorio/laboratorio-ia/src/styles.css",
  "utf8",
);
const panel = readFileSync(
  "_laboratorio/laboratorio-ia/src/components/PanelIA.tsx",
  "utf8",
);

let assertions = 0;
function check(value: unknown, message: string): void {
  assert.ok(value, message);
  assertions += 1;
}

function main(): void {
  // B6.6 removed the PanelIA side padding; negative side margins here were
  // therefore expanding the workspace beyond the shell at 390px.
  check(
    styles.includes(
      ".laboratory-editorial-workspace { min-width: 0; max-width: 100%; margin: -24px 0 -32px; box-sizing: border-box; }",
    ),
    "el workspace editorial debe mantenerse dentro de su columna desktop/tablet",
  );
  check(
    styles.includes(
      ".laboratory-editorial-workspace { margin: -18px 0 -24px; }",
    ),
    "el workspace móvil no debe recuperar márgenes horizontales negativos",
  );
  check(
    !styles.includes("margin: -24px -20px -32px"),
    "no debe quedar la compensación horizontal obsoleta",
  );
  check(
    !styles.includes("margin: -18px -12px -24px"),
    "no debe quedar la compensación móvil obsoleta",
  );
  check(
    styles.includes(".panel-editorial-root :is(button, input, textarea, select) { box-sizing: border-box; max-width: 100%; }"),
    "los controles editoriales deben respetar el ancho disponible",
  );
  check(
    styles.includes(".panel-editorial-controls > div:last-child { width: 100%; min-width: 0 !important; }"),
    "los controles de preparación deben apilarse a 390px",
  );
  check(
    styles.includes(".panel-editorial-form-grid,\n  .panel-editorial-source-layout { grid-template-columns: minmax(0, 1fr) !important; }"),
    "los grids rígidos deben convertirse en una columna en móvil",
  );
  check(
    panel.includes('className="panel-editorial-form-grid"'),
    "el formulario principal debe recibir el contrato móvil",
  );
  check(
    (panel.match(/className="panel-editorial-source-layout"/g) ?? []).length === 9,
    "los nueve layouts de fuente deben recibir el contrato móvil",
  );
  check(
    panel.includes('aria-label="Preparación editorial"'),
    "la cabecera B6.6 debe preservarse",
  );
  check(
    panel.includes("EditorialLoadFeedback"),
    "las alertas recuperables B6.5 deben preservarse",
  );
  check(
    !panel.includes("window.innerWidth") && !panel.includes("document.documentElement.scrollWidth"),
    "la corrección no introduce lógica de dominio ni medición runtime paralela",
  );

  console.log(
    `AU10 B6.8 editorial mobile width: OK (${assertions} assertions; contained workspace, mobile stacking, safe controls and no domain writes)`,
  );
}

main();
