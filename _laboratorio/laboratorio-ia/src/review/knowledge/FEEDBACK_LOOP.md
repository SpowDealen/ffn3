# AU9 B5 — Learning Feedback Loop

## AU9 · Closure

B6 visualiza la clasificación y los límites del feedback B5, incluido que una
sola experiencia no crea una regla. El Centro no produce feedback, no extrae
conocimiento y no altera decisiones: sólo presenta registros ya confirmados.

## Principio de autoridad

> El sistema aprende únicamente de resultados reales suficientemente
> confirmados; una decisión propuesta o una simulación nunca se convierten por
> sí mismas en conocimiento.

B5 compara intención AU8 con ejecución AU7 y reconciliación AU4. AU8 aporta la
predicción y sus fingerprints, pero no demuestra el resultado. La autoridad
procede de estados terminales de transaction/outcome y, cuando existe
incertidumbre, de una reconciliación concluyente.

No existe segundo memory engine, store, planner, executor, scheduler o runtime.
El caller entrega snapshots públicos y B5 produce objetos puros.

## FeedbackRecord

`FeedbackRecord` enlaza case/version, decision, sufficiency, autonomy, strategy,
transaction, outcome, reconciliation, loop y knowledge derivados. Mantiene
evaluaciones separadas de decision, strategy, execution y reconciliation con
veredictos y fingerprints auditables.

Estados:

- `confirmed_success`;
- `confirmed_failure`;
- `partial_success`;
- `contradicted`;
- `superseded`;
- `uncertain`;
- `no_learning`.

Las clasificaciones son `reinforce`, `weaken`, `contradict`, `invalidate`,
`supersede`, `no_change` y `under_review`.

## Outcome authority y fail-closed

B5 rechaza aprendizaje cuando detecta bindings de case/fingerprint
incompatibles, contexto o transaction stale, simulación, transaction no
ejecutada, autorización no consumada o efecto incierto sin reconciliación.

`confirmed_succeeded` puede confirmar un efecto y `confirmed_not_applied`
demuestra evidencia negativa. `conflicting_evidence` no elige ganador: deja el
conocimiento relacionado bajo revisión. `insufficient_evidence`, fallo técnico,
unsupported y stale reconciliation producen `no_change`.

Una estrategia de bloqueo puede reforzarse sólo cuando AU4 confirma que el
efecto no ocurrió. Una mera estrategia `blocked` no aprende.

## Positive y negative feedback

Feedback positivo incluye reuse/create/repair/validation/transaction confirmado
y bloqueo protector demostrado. Feedback negativo incluye ejecución fallida,
rechazo editorial, false positive, alias/candidate incorrecto, referencia
inválida y efecto que AU4 confirma como no aplicado.

Una experiencia positiva genera como máximo una observación advisory. Una
negativa puede debilitar o contradecir; invalidation/supersession requieren
targets explícitos gobernados. Nunca se selecciona automáticamente una policy.

## Reutilización B2/B3/B4

El flujo implementado es:

1. AU7/AU4 confirman o rechazan autoridad del outcome;
2. B5 crea `FeedbackRecord` y `LearningObservation`;
3. B2 realiza `extractKnowledgeFromOutcome` y `consolidateKnowledge`;
4. B3 aplica lifecycle, conflict, invalidation, supersession o review mediante
   revisiones enlazadas;
5. B4 sólo delimita targets cuando el caller proporciona retrieval gobernado.

B5 no replica extracción, consolidación ni detección de contradicciones. Los
targets no presentes en B3/B4, temporalmente posteriores al outcome o sin
replacement válido no se mutan; se registra el reason code fail-closed.

## Idempotencia y temporalidad

Outcome, observation y feedback usan fingerprints semánticos independientes de
timestamps operativos. Antes de consolidar, B5 detecta si outcome/observation ya
existe en el knowledge activo. El replay no añade revisión, observación ni item.

La fecha original del outcome permanece en provenance y `observedAt`. Feedback
antiguo puede reforzar experiencia histórica, pero no adelanta `lastObservedAt`
ni modifica knowledge creado después de ese outcome.

## Seguridad y anti-overfitting

Todos los resultados declaran `advisoryOnly`, `requiresCurrentEvidence` y
`replacesCurrentEvidence: false`. `LearningObservation` declara explícitamente
`createsPolicy: false` y `elevatesAuthority: false`. No hay payloads, secretos,
red, Sanity, writes, modificación de decisiones futuras o autoaplicación de
recomendaciones.
