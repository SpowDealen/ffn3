# AU8 B2 — Evidence Sufficiency & Investigation Policy

## Autoridad y frontera

`evaluateEditorialEvidenceSufficiency` es una evaluación pura y versionada
dentro de la autoridad AU8. No es otro decisor: determina si la evidencia
permite que AU8 B1 emita una decisión final y recomienda qué investigar cuando
no la permite.

Consume únicamente snapshots seguros ya producidos por:

- AU4 Inspection;
- AU5 Identity;
- AU6 Transversal Resolution;
- AU7 Transaction Operational View;
- contratos tipados de AU8 B1.

No importa stores, executors, orchestrators, adapters ni clientes Sanity. No
ejecuta recomendaciones, no crea entidades y no inicia transacciones.

## Evaluación

La entrada exige `evaluatedAt`; así la actualidad se calcula sin leer el reloj
del sistema. La política por defecto acepta una antigüedad máxima de 30 minutos
y permite configurar ese umbral de forma explícita.

La salida clasifica como:

- `sufficient`: cobertura completa, autoridad e independencia adecuadas, sin
  contradicción ni staleness;
- `insufficient`: no existe el mínimo verificable o sólo hay señales débiles;
- `contradictory`: dos señales incompatibles impiden decidir;
- `stale`: una fuente temporal o el plan AU6 pertenece a un contexto obsoleto;
- `unavailable`: una fuente requerida o su actualidad no puede comprobarse;
- `partial`: existe evidencia útil, pero falta alguna dimensión o resolver
  ambigüedad, autoridad o independencia.

Cada evaluación incluye evidencia usada, ausencias, fuentes opacas, autoridad,
independencia, actualidad, contradicciones, cobertura, política de investigación
y explicación segura. Los fingerprints se calculan después de ordenar y
deduplicar los fingerprints fuente.

## Cobertura según intención

Las decisiones finales requieren:

| Intención | Dimensiones mínimas |
| --- | --- |
| `reuse_existing` | Inspection + Identity |
| `create_entity` | Inspection + Identity + Resolution |
| `repair_reference` | Inspection + Resolution |
| `validate` | Inspection + Resolution |
| `resume` | Resolution + Transactions |
| peticiones transaccionales | Transactions |

AU6 es autoridad derivada: cuenta para cobertura y autoridad, pero no infla el
número de fuentes factuales independientes. Los duplicados por fingerprint o
procedencia tampoco aumentan independencia.

## Autoridad, independencia y confianza

Las lecturas canónicas/oficiales son autoritativas; las fuentes externas
verificables son corroborantes; estados ambiguos, no soportados o no disponibles
son débiles. Dos evidencias de la misma procedencia cuentan como una sola fuente.

La confianza sólo se proyecta como metadato. No participa en cobertura,
independencia ni en la selección de clasificación, y nunca sustituye una
dimensión ausente.

## Política de investigación

Las recomendaciones tipadas son:

- `inspect_sanity`
- `inspect_source`
- `search_candidates`
- `compare_entities`
- `wait_for_evidence`
- `request_human`
- `ready_to_decide`

Cada recomendación contiene prioridad, bloqueo, reason codes y explicación
segura. La política sólo describe el siguiente trabajo; `executesInvestigation`,
`executionAllowed` y `writes` permanecen siempre en `false`.

## Integración con B1

B1 proyecta la evidencia, obtiene una selección preliminar y llama
obligatoriamente a B2 antes de construir su salida. `reuse_existing`,
`create_entity`, `repair_reference`, `validate` y `resume` sólo sobreviven si
`canDecideNow` es verdadero.

Si no lo es:

- contradicción → `block`;
- riesgo alto/crítico → `escalate_to_human`;
- parcial o stale → `investigate`;
- insuficiente o unavailable → `wait_for_evidence`.

La decisión final expone la clasificación y el fingerprint B2 para que la UI y
el futuro checkpoint puedan demostrar qué evaluación actuó como gate.

## Integración con Autonomy Policy (AU8 B3)

B3 consume la clasificación, `canDecideNow` y el fingerprint B2 como
precondición obligatoria. Ningún nivel `autonomous_*` es posible si B2 no es
`sufficient`.

## Límites e integración con B4

La evaluación no conserva historial, no compara tendencias entre casos y no
prioriza una cola editorial. AU8 B4 consume sus recomendaciones para ordenar la
investigación o detener la estrategia, sin modificar B2 ni ejecutar operaciones.
La memoria y recuperación de inteligencia quedan pendientes para B5.
