# AU8 B5 — Autonomous Supervised Execution Loop

## Autoridad y alcance

El loop B5 coordina autoridades ya existentes; no introduce un decision engine,
planner, transaction engine, executor ni store nuevo.

```text
observe
→ Evidence Sufficiency B2
→ Decision B1
→ Autonomy B3
→ Strategy B4
→ handoff AU7
→ observe
→ reevaluate
```

`runAutonomousSupervisedLoop` sólo se inicia por una llamada explícita
`start` o `continue`. Recuperar un checkpoint nunca reanuda el loop.

## Iteración supervisada

Cada iteración:

1. obtiene una observación segura mediante el adapter configurado;
2. ejecuta la fachada real B1 → B2 → B3 → B4;
3. aplica gates fail-closed;
4. regenera y compara el handoff transaccional AU7;
5. selecciona como máximo una invocación AU7;
6. vuelve a observar después de la invocación;
7. persiste una proyección compacta en el checkpoint AU3;
8. reevalúa desde la observación nueva.

Un efecto externo confirmado nunca permite continuar con la estrategia anterior.
La siguiente iteración recalcula decisión, suficiencia, autonomía y estrategia.

## Handoff AU7

El core sólo conoce `AutonomousLoopTransactionHandoffAdapter`. El bridge
`createReviewCenterAu7LoopHandoff` delega en el Centro Operativo AU7 para:

- preparar o reutilizar `UniversalTransactionPlan`;
- recuperar su checkpoint;
- ejecutar `single_step`, `safe_batch` o `supervised_run`.

El core B5 no importa ni invoca `executeTransactionStep`, batches de executor,
compensators o executors registrados. Tampoco aporta authorizations:

- `autonomous_safe` ejecuta un único step AU7 sin autorización;
- `autonomous_supervised` puede usar `safe_batch` sólo para steps sin efecto
  externo o `supervised_run` limitado a un step;
- `authorization_required`, `human_required` y `blocked` detienen el loop.

Reconciliación y compensación sólo producen pausa. Tras su resolución explícita
externa, `continue` vuelve a observar y recalcular B1–B4.

## Investigación

Los intents soportados son `inspect_sanity`, `inspect_source`,
`search_candidates`, `compare_entities`, `wait_for_evidence` y
`request_human`. Sólo un adapter registrado con `readOnly: true` y policy
`autonomous_safe` puede recibir un intent. El core no contiene red, búsquedas
arbitrarias, clientes Sanity ni acceso a APIs externas.

## Stops obligatorios

El loop se detiene ante evidencia insuficiente, contradictoria o stale;
authorization/human/reconciliation/compensation; riesgo high/destructive;
capability desconocida; strategy/transaction stale; conflicto de checkpoint;
postcondición inesperada; cancelación; no-progress o límite de iteraciones.

El límite produce `paused / iteration_budget_reached`, nunca `failed`.

## No-progress y completion

La firma de progreso vincula evidence, decisión, suficiencia, autonomía,
estrategia, transacción y blockers. Si coincide con la iteración anterior, B5
persiste `paused / no_progress` antes de cualquier nueva acción.

Completion exige simultáneamente:

- B2 sufficient;
- B1 resuelto;
- B3 compatible;
- estrategia vigente;
- AU7 `completed` o innecesario;
- cero steps obligatorios, auth, reconciliación, compensación y blockers.

La ausencia de ready steps por sí sola queda bloqueada, no completada.

## Persistencia y recovery

`AutonomousSupervisedLoopCheckpoint` se compone como `autonomousLoop` dentro del
checkpoint global AU3. Contiene sólo loop ID/fingerprint, iteración, phase,
fingerprints B1–B4/AU7, stop reason e historia compacta de 25 entradas.

No persiste payloads, evidence completa, tokens ni approvals. El fingerprint de
fuente AU7 excluye esta proyección mutable para que guardar progreso B5 no vuelva
stale la transacción. La aplicación Review Store usa el update optimista del
checkpoint existente; no existe un store paralelo.

Recovery valida estructura y fingerprints y devuelve siempre
`canAutoResume: false`. Una continuación requiere `intent: continue`.

## Concurrencia y seguridad

Un mapa efímero deduplica por `caseId + loopFingerprint`. Callers concurrentes
comparten la misma promesa y no pueden duplicar una invocación AU7. La
persistencia conserva además compare-and-swap sobre el fingerprint global.

B5 declara explícitamente: autonomía total desactivada, cero direct executor
calls, cero auto-authorization, cero auto-reconciliation, cero
auto-compensation, cero writes editoriales fuera de AU7 y cero auto-resume. La
única persistencia propia es metadata compacta mediante el checkpoint AU3.

## Cierre B6

AU8 B6 integra el loop en `AutonomousReviewCenter`: recovery sin auto-resume,
historial compacto de 25 entradas, staleness visible, regeneración explícita,
controles de pausa/continuación y handoffs a AU4/AU7. El core B5 conserva su
límite: ninguna regla de UI puede ejecutar fuera de AU7 ni convertir una pausa,
autorización o revisión humana en ejecución automática.
