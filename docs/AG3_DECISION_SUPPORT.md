# AG3 B3 · Decision Support

## Objetivo

AG3 B3 transforma propuestas estructuradas B2 en explicaciones y comparaciones deterministas para decisión humana. Responde qué opción se prefiere, por qué, qué debilidades tienen las alternativas, qué contradicciones o ambigüedades existen, qué información falta y qué debería mirar primero el operador.

Contrato público: `ag3-decision-support/1`.

B3 es `EXPLANATION + COMPARISON + DECISION SUPPORT`. No es executor, planner, motor de autonomía, autoridad ni reemplazo de Review.

## Auditoría

### Reutilizado

- `AgentStructuredProposal[]` B2 como única entrada.
- Subject, issue y prioridad canónica transportados por B2.
- Facts, inferences e hypotheses separados.
- Alternativas, roles, viabilidad, benefits, risks y limitations B2.
- Recomendación opcional y rationale B2.
- Confidence sin agregación, risk canónico y sufficiency sin readiness.
- Human decision requirement, authority hint y expected outcome.
- Unresolved questions, trace y freshness.

### Adaptado

B2 recibió dos campos aditivos necesarios para evitar inferencias desde texto:

- `sourcePriority`: prioridad canónica del item B1.
- `alternative.role`: recommended, alternative o possible procedente de RX3/B1.

B3 puede así clasificar atención y posición relativa sin scoring ni volver a Review.

### Creado

- Tipos `AgentDecisionSupport`.
- Builder puro y determinista.
- Comparación estructurada de alternativas y trade-offs.
- Evidence assessment categórico sin nueva confidence.
- Contradictions, ambiguities y missing information first-class.
- Human decision framing, decision questions y explicación lista para AG4.
- Selectors por atención, fuente, decisión humana, bloqueo, contradicción y recomendación clara.
- Fixture B3 y certificación integrada B1 → B2 → B3.

### Intencionalmente sin cambios

- Stores, DecisionStore y persistencia.
- AG1, AG2, LES8 y Review.
- Planner, executor, scheduler y motor de autonomía.
- Review/AU7/AU8 authority ownership o invocación.
- Readiness, refresh, Sanity, Telegram y APIs externas.
- UI, prompts, LLM, chat, streaming e historial conversacional.

## Input y output

```text
AgentStructuredProposal[]
→ buildDecisionSupport(...)
→ AgentDecisionSupport[]
```

B3 no recibe `ReviewCase`, `AgentContext`, stores ni runtime. Una salida conserva:

- proposal y subject;
- issue;
- decision state;
- preferred option opcional;
- evaluaciones de alternativas;
- fuerza de evidencia;
- trade-offs;
- contradicciones, ambigüedades e información faltante;
- human decision y preguntas;
- explicación humana;
- prioridad de atención;
- authority hint y expected outcome;
- trace, freshness y frontera read-only.

## Decision states

- `clear_recommendation`: existe recomendación defendible sin caveats abiertos.
- `recommendation_with_caveats`: existe preferred option, pero mantiene reservas o decisión humana.
- `human_decision_required`: B2 no recomienda y la autoridad humana debe escoger o revisar.
- `blocked_by_missing_information`: contexto stale/bloqueado o información imprescindible pendiente.
- `blocked_by_contradiction`: evidencia explícitamente conflicting/contradictory.
- `no_action_needed`: no intervenir o mantener el flujo actual.
- `insufficient_basis`: no existe evidencia ni base suficiente para recomendar.

No existe `ready_to_execute`: B3 no posee readiness operativo.

## Preferred option

Una preferred option solo existe si B2 ya contiene una recomendación y la alternativa asociada es viable. B3 nunca elige automáticamente el mayor porcentaje.

Por tanto:

- Alex Norte puede mantenerse como preferred option porque B2 lo recomienda al 94%, aunque B3 conserva caveats y requiere confirmación humana.
- Un fixture con Alex Norte y Álex Sur pero `recommendation: null` conserva ambas como competitive y deja `preferredOption: null`.
- Contradicción o bloqueo dejan siempre `preferredOption: null`.

## Comparación de alternativas

Cada alternativa expone:

- strengths y weaknesses provenientes de B2;
- supporting y contradicting evidence references;
- unknowns;
- confidence original;
- risk B2;
- viabilidad;
- posición `preferred`, `competitive`, `weaker`, `not_viable` o `unknown`.

Los trade-offs comparan confidence declarada, soporte trazable y viabilidad. No calculan scores ni porcentajes nuevos.

## Evidence strength

La fuerza de evidencia puede ser:

- `strong`;
- `moderate`;
- `weak`;
- `mixed`;
- `contradictory`;
- `unknown`.

La clasificación utiliza únicamente hechos, inferencias, hipótesis, confidence, sufficiency y contradicciones ya presentes en B2. `synthesizedConfidence` siempre es `false`.

## Contradiction y ambiguity

Son conceptos distintos:

- Contradiction exige códigos o sufficiency explícitamente conflicting/contradictory y puede bloquear la decisión.
- Ambiguity representa identidad parcial, referencia ambigua, confidence baja o varias opciones plausibles.

Ambas conservan IDs de alternativas y referencias de evidencia. Una recomendación con ambigüedad no oculta la ambigüedad.

## Missing information

Las preguntas no resueltas B2 se convierten en información faltante específica y trazable. También se proyecta falta de evidencia suficiente/vigente cuando B2 lo declara y no existe una pregunta más concreta.

Los casos no-action no generan preguntas artificiales por risk o sufficiency irrelevantes para una decisión inexistente.

## Human decision framing

B3 conserva `not_required`, `recommended`, `required` o `blocked` y añade una explicación humana:

- por qué existen varias alternativas plausibles;
- qué contradicción bloquea;
- qué información falta;
- por qué la autoridad humana debe confirmar antes de continuar.

Las decision questions proceden de unresolved questions o de alternativas viables explícitas. Son datos estructurados para AG4, no chat.

## Attention priority

La prioridad de presentación puede ser:

- `critical_attention`;
- `high_attention`;
- `normal_attention`;
- `low_attention`;
- `no_attention`.

Reglas deterministas:

1. no-action → no attention;
2. contradicción bloqueante o prioridad canónica critical → critical;
3. bloqueo, decisión humana requerida o prioridad high → high;
4. prioridad low/informational → low;
5. resto → normal.

Es orden de lectura para el operador, no un plan ni orden de ejecución.

## Explanation

La explicación lista para AG4 incluye:

- headline humano;
- summary;
- why;
- whyNot por alternativa;
- caveats;
- qué input humano hace falta;
- qué outcome se esperaría después de una autorización futura.

Todo procede de estructuras B2 y templates deterministas. No se usa generación libre ni LLM.

## Expected outcome y authority

B3 conserva el outcome B2 sin modificar:

```text
kind: expected
observed: false
```

Nunca afirma que algo se ejecutó, publicó, guardó o resolvió. Authority hints son metadata read-only con `invokes: false`.

## Traceability y freshness

La cadena completa es:

```text
DecisionSupport
→ StructuredProposal
→ AgentContext item
→ AG1 / AG2 / Review references
```

Cada salida conserva proposal ID, snapshot identity, context item, ReviewCase cuando existe, source references, timestamps, versiones y fingerprints. `refreshPerformed` siempre es `false`.

## Selectors

La API pública mínima permite seleccionar:

- prioridad de atención;
- fuente;
- decisión humana requerida;
- bloqueados;
- contradictorios;
- recomendaciones claras.

Los selectors son puros y su prioridad es exclusivamente de presentación.

## Fixture y certificación

El fixture cubre:

- recomendación clara BKFC;
- recomendación UFC con caveats;
- dos alternativas UFC sin recomendación;
- contradicción bloqueante;
- información insuficiente;
- no action;
- proposal con y sin ReviewCase;
- UFC, ONE, BKFC y external_news.

La suite B3 verifica determinismo, comparación, why/whyNot, evidence strength, contradicción, ambigüedad, missing information, human framing, preguntas, prioridad, expected outcome, trace, freshness, unknown/empty y fronteras.

La certificación integrada ejecuta en memoria:

```text
Review/AG2 fixture
→ B1 AgentContext
→ B2 StructuredProposal
→ B3 DecisionSupport
```

y valida identidad, evidencia, separación epistémica, alternativas, recomendación, explicación, comportamiento fail-closed y cero efectos.

## Invariantes

- Store nuevo: no.
- DecisionStore: no.
- Executor/planner: no.
- Mutación Review/proposal: no.
- Invocación Review/AU7/AU8: no.
- Decisión de autonomía/readiness: no.
- Network/persistencia/writes: no.
- Refresh: no.
- LLM/chat/UI: no.
- Scoring numérico nuevo: no.

AG4 podrá consumir esta estructura para conversar con el operador, pero no necesitará reconstruir lógica desde datos raw.
