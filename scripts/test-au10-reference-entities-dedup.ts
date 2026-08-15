import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const panel = readFileSync(
  "_laboratorio/laboratorio-ia/src/components/PanelIA.tsx",
  "utf8",
);
const apiProxy = readFileSync(
  "scripts/test-au10-laboratory-api-proxy.ts",
  "utf8",
);
const errorStates = readFileSync(
  "scripts/test-au10-editorial-error-states.ts",
  "utf8",
);

let assertions = 0;
function check(value: unknown, message: string): void {
  assert.ok(value, message);
  assertions += 1;
}

function main(): void {
  check(
    panel.includes("const referenceRequestRef = useRef<Promise<void> | null>(null);"),
    "la petición activa debe vivir sólo en el ciclo local de PanelIA",
  );
  check(
    panel.includes("if (referenceRequestRef.current) {\n      return referenceRequestRef.current;\n    }"),
    "cargas iniciales concurrentes deben reutilizar la misma promesa",
  );
  check(
    panel.includes("referenceRequestRef.current = request;"),
    "la única carga debe registrarse antes de devolverla",
  );
  check(
    panel.includes("referenceRequestRef.current = null;"),
    "el refresh manual debe quedar habilitado al finalizar",
  );
  check(
    panel.includes("const auxiliaryForReferenceLoad = useRef(auxiliary);"),
    "la dependencia auxiliar debe actualizarse sin recrear el loader",
  );
  check(
    panel.includes("}, []);\n\n\n  const reloadExternalNews"),
    "el loader de referencias debe ser estable entre renders",
  );
  check(
    (panel.match(/\/api\/reference-entities/g) ?? []).length === 1,
    "debe existir un único punto de transporte para referencias",
  );
  check(
    (panel.match(/void reloadReferenceEntities\(\);/g) ?? []).length === 4,
    "montaje, visibilidad, intervalo y reintento reutilizan el mismo loader",
  );
  check(
    panel.includes("onRetry={() => { void reloadReferenceEntities(); }}"),
    "Reintentar debe conservar el refresh explícito",
  );
  check(!panel.includes("localStorage") && !panel.includes("createContext"), "no se añade store, cache global ni provider");
  check(apiProxy.includes("reference-entities"), "la regresión B6.7 permanece cubierta");
  check(errorStates.includes("reloadReferenceEntities"), "la regresión B6.5 permanece cubierta");

  console.log(
    `AU10 B6.10 reference entities dedup: OK (${assertions} assertions; one local loader, coalesced initial request, manual refresh and no external writes)`,
  );
}

main();
