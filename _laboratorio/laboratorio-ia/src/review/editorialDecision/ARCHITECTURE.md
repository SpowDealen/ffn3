# AU8 B1 — Autonomous Editorial Decision Engine

## Autoridad y alcance

`decideAutonomousEditorialAction` es la autoridad pura y versionada que
responde qué debería hacerse ahora y por qué. Recibe snapshots seguros de
AU4–AU7 y devuelve una sola decisión tipada. No persiste, no ejecuta, no
autoriza y no accede a Sanity.

El módulo anterior `review/autonomous` sigue siendo legado de resolución por
confianza. No es autoridad AU8: incluye rutas de aplicación de resoluciones y
su modelo permite que la confianza participe en la selección. No se importa
desde este motor.

## Auditoría de reutilización AU2–AU7

- AU2: el grafo y su orden llegan ya materializados dentro del plan
  transversal de AU6. AU8 no reconstruye dependencias.
- AU3: checkpoint, lifecycle y recovery llegan consolidados en la vista
  operacional AU7. AU8 no recupera ni muta checkpoints.
- AU4: `GlobalResolutionInspectionEvidence` es la única fuente de estado
  observado, contradicciones y referencias rotas.
- AU5: `EntityResolutionResult` aporta identidad, candidatos ambiguos,
  conflicto, reuse y ausencia de coincidencia.
- AU6: `TransversalResolutionPlan` aporta la decisión resolutiva ordenada y el
  `creationGuardFingerprint`. Sólo esta autoridad puede habilitar una
  recomendación `create_entity`.
- AU7: `TransactionOperationalView` aporta readiness, riesgo, incidencias,
  autorización, reconciliación y compensación sin exponer payloads.

No existe acceso directo a planners internos, stores, adapters, executors,
clientes externos o Sanity.

## Contrato

Entrada: contexto mínimo del caso y snapshots opcionales AU4–AU7.

Salida: versión, decisión, fundamentos, evidencia segura, confianza, riesgo,
precondiciones, bloqueos, explicación de operador y fingerprints de entrada y
decisión. `executionAllowed` y `writes` son siempre `false`.

Decisiones soportadas:

- `investigate`
- `reuse_existing`
- `create_entity`
- `repair_reference`
- `validate`
- `resume`
- `wait_for_evidence`
- `request_authorization`
- `request_reconciliation`
- `request_compensation`
- `block`
- `escalate_to_human`

## Precedencia fail-closed

La evaluación es determinista y usa esta precedencia:

1. contexto de caso inválido o plan AU6 de otro caso/versión → `block`;
2. contradicción de identidad, payload o destinos resueltos → `block`;
3. bloqueo autoritativo AU6 → `block`;
4. incidencia crítica, intervención manual o step de riesgo alto/destructivo
   → `escalate_to_human`;
5. efecto incierto → `request_reconciliation`;
6. compensación pendiente → `request_compensation`;
7. autorización pendiente → `request_authorization`;
8. ambigüedad o múltiples candidatos → `investigate`;
9. evidencia ausente, insuficiente o no disponible → `wait_for_evidence`;
10. decisión preparada AU6;
11. step preparado AU7, identidad inequívoca AU5 o referencia rota AU4;
12. si ninguna regla anterior decide → `validate`.

La confianza se calcula después de seleccionar la decisión. Por tanto nunca
sustituye evidencia ni desbloquea una rama. Sin evidencia es exactamente cero;
la cobertura de una, dos o tres fuentes impone límites crecientes.

## Seguridad de creación

`create_entity` sólo se emite cuando la decisión AU6 está `ready`, contiene
evidencia y contiene `creationGuardFingerprint`. Un `create_new` de AU5 o un
step de creación AU7 aislado producen espera o bloqueo. La recomendación no
ejecuta la creación.

## Determinismo e idempotencia

Los arrays de entrada se ordenan por fingerprints estables. El fingerprint de
entrada usa únicamente versión, caso y fingerprints fuente; no usa timestamps
de evaluación. La decisión se fingerprinta sobre la salida semántica sin datos
variables. La misma evidencia, incluso en otro orden, produce la misma decisión
y los mismos fingerprints.

## Evidence Sufficiency Gate (AU8 B2)

Antes de materializar la salida, el motor obtiene una evaluación versionada de
`evidenceSufficiency`. Las decisiones finales de reuse, create, reparación,
validación y resume sólo se mantienen con `canDecideNow: true`. La salida incluye
la clasificación y el fingerprint de dicha evaluación.

La política completa de cobertura, autoridad, independencia, actualidad e
investigación está documentada en `evidenceSufficiency/ARCHITECTURE.md`.

## Autonomy & Risk Gate (AU8 B3)

Tras la decisión B1 y su suficiencia B2, `evaluateAutonomyRiskPolicy`
clasifica el permiso como safe, supervised, authorization required, human
required o blocked. Reutiliza AU7 y manifests declarativos; nunca eleva
autonomía por confidence ni ejecuta el permiso resultante.

## Límites e integración con B4

- El motor decide una acción siguiente, no una estrategia de largo plazo.
- No conserva historial propio; consume el estado recuperado por AU3/AU7.
- No muestra UI ni solicita acciones externas.
- Las explicaciones son seguras y deliberadamente no incluyen IDs de candidato,
  payloads o detalles de error.

AU8 B4 ya convierte decisión, suficiencia y autonomía en una estrategia
topológica completa reutilizando el grafo AU2. La priorización multicaso, la
integración visual y el checkpoint de inteligencia siguen pendientes para B5 y
deben conservar esta función como única autoridad sin autoejecución.
