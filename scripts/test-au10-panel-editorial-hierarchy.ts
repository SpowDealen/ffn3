import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

let assertions = 0;
const equal = <T>(actual: T, expected: T): void => { assert.equal(actual, expected); assertions += 1; };
const check = (value: unknown, message?: string): void => { assert.ok(value, message); assertions += 1; };
const count = (value: string, expression: RegExp): number => [...value.matchAll(expression)].length;

function main(): void {
  const panel = readFileSync("_laboratorio/laboratorio-ia/src/components/PanelIA.tsx", "utf8");
  const shell = readFileSync("_laboratorio/laboratorio-ia/src/app/LaboratoryShell.tsx", "utf8");
  const styles = readFileSync("_laboratorio/laboratorio-ia/src/styles.css", "utf8");

  equal(count(panel, /<h1\b/g), 0);
  equal(count(shell, /<h1\b/g), 1);
  equal(count(panel, /FFN3 · Laboratorio IA/g), 0);
  equal(count(shell, /FFN3 · Laboratorio IA/g), 1);
  equal(count(panel, /panel-editorial-controls/g), 1);
  check(panel.includes('aria-label="Preparación editorial"'));
  check(panel.includes("Preparación de contenido"));
  check(panel.includes("definition.description"));
  check(panel.includes("Generar output"));
  check(panel.includes("Guardar borrador"));
  check(panel.includes("Campos reales de schema"));
  check(panel.includes("Inputs auxiliares"));
  check(panel.includes("EditorialLoadFeedback"));
  check(panel.includes("Reintentar"));
  check(panel.includes("role={isError ? \"alert\" : \"status\"}"));
  check(!panel.includes("Panel editorial de borradores"));
  check(!panel.includes("styles.metaCard}>") );
  check(styles.includes(".panel-editorial-root"));
  check(styles.includes(".panel-editorial-controls"));
  check(styles.includes("@media (max-width: 560px)"));
  check(styles.includes("grid-template-columns: minmax(0, 1fr)"));
  check(shell.includes('href="#laboratory-main"'));
  check(shell.includes('ref={headingRef}'));
  check(panel.includes("registerExternalNewsGlobalResolutionRuntime"));
  console.log(`AU10 B6.6 panel editorial hierarchy: OK (${assertions} assertions; one screen heading, no repeated product label, compact controls, B6.5 alert/retry and preserved operational integration)`);
}

main();
