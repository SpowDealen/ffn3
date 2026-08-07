# AU8 B4 — Autonomous Resolution Strategy

## Autoridad y alcance

`buildAutonomousResolutionStrategy` responde cómo resolver de extremo a extremo
una decisión ya evaluada. No reevalúa suficiencia B2, no concede autonomía B3,
no ejecuta operaciones, no lanza AU7 y no escribe en Sanity.

La cadena autoritativa completa queda expresada por
`evaluateAutonomousEditorialResolutionStrategy`:

```text
Decision B1 → Evidence Sufficiency B2 → Autonomy B3 → Strategy B4
```

Cada salida declara `executionAllowed: false`, `launchesTransactions: false` y
`writes: false`.

## Auditoría AU2–AU8

- AU2 aporta `ResolutionGraph`, el validador y el orden topológico determinista.
  B4 proyecta pasos seguros a `EntityOperation` sin payload y usa ese grafo; no
  crea otro planner.
- AU3 aporta el binding opcional del checkpoint. B4 comprueba caso, versión y
  fingerprint, pero no recupera ni modifica el checkpoint.
- AU4 aporta inspección y reconciliación. Una reconciliación pendiente genera
  `wait_reconciliation → stop`.
- AU5 aporta el resultado de identidad. Ambigüedad exige investigación; todo
  `create_entity` tiene `search_candidates → compare_entities` como ancestros.
- AU6 aporta operaciones, dependencias, decisiones y Creation Guard. B4 sólo
  consume la proyección autoritativa y nunca reconstruye payloads.
- AU7 aporta plan/vista transaccional y riesgo. B4 puede emitir
  `prepare_transaction`, pero no invoca el Transaction Engine.
- B1, B2 y B3 aportan respectivamente decisión, suficiencia y permiso. Sus
  fingerprints deben coincidir o la estrategia se cierra fail-closed.

## Modelo de estrategia

Los pasos soportados son:

- `investigate`, `inspect_sanity`, `inspect_source`, `search_candidates` y
  `compare_entities`;
- `reuse_entity`, `create_entity` y `repair_reference`;
- `validate` y `prepare_transaction`;
- `wait_authorization`, `wait_reconciliation`, `request_human` y `stop`.

Cada paso contiene objetivo, dependencias, reason codes, IDs de evidencia
segura, precondiciones, riesgo agregado, nivel de autonomía, capability y un
fingerprint estable. No contiene payload de entidad, secretos, tokens ni
resultados completos.

## Reglas estructurales

1. Las contradicciones producen únicamente `request_human → stop`.
2. Evidencia partial/insufficient/stale/unavailable produce una estrategia de
   investigación y termina en `stop` para regenerar tras cambiar la evidencia.
3. `reuse_entity` conserva prioridad sobre create porque B4 respeta la decisión
   AU6 y todo create añade una comprobación final de candidatos.
4. `create_entity` nunca queda topológicamente antes de `compare_entities`.
5. Todas las operaciones resolutivas preceden a una validación final de
   referencias.
6. `prepare_transaction` depende directamente de dicha validación.
7. La autorización se representa después de preparar y siempre termina en
   `stop`; no se almacena ni se presume concedida.
8. Reconciliación, revisión humana, contexto stale o fingerprints incompatibles
   impiden cualquier continuación operacional.

## Proyección AU2, determinismo e idempotencia

Los pasos se proyectan a tipos existentes de `EntityOperation` únicamente para
validar dependencias, riesgos, condiciones e idempotencia. Las intenciones de
espera o control se proyectan como metadata segura, no como efectos.

`buildResolutionGraph` genera el grafo y
`topologicalSortResolutionGraph` define `orderedStepIds` y `layers`. IDs y
fingerprints se calculan a partir de semántica canónica; timestamps y orden de
entrada no alteran el resultado. Un cambio de dependencia, decisión, riesgo,
evidencia o binding sí lo altera.

## Seguridad y límites

B4 es cálculo puro. No importa stores, adapters de escritura, executors,
clientes Sanity, red, `fetch`, `localStorage` ni APIs externas. La evidencia se
reduce a IDs/fingerprints seguros antes de entrar en el grafo AU2.

La estrategia no afirma que los pasos se hayan completado: describe el orden
que una capa posterior deberá verificar. `prepare_transaction` significa
preparar, nunca crear o arrancar una transacción. Las autorizaciones vivas,
recovery, ejecución y compensación siguen bajo AU3/AU7.

## Siguiente bloque recomendado

AU8 B5 debería integrar esta estrategia en una vista de inteligencia del Centro
de Revisión: recuperación segura, staleness, regeneración explícita y trazado de
decisión/policy/strategy, manteniendo la ejecución completamente separada.
