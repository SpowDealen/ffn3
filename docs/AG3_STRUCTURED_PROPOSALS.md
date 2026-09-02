# AG3 B2 · Structured Proposals

## Propósito

AG3 B2 transforma el `AgentContext` fiable de B1 en propuestas editoriales completas, comparables y trazables. Es exclusivamente `DECISION SUPPORT DATA`: describe un problema, la evidencia disponible, alternativas reales y una recomendación opcional, pero no planifica ni ejecuta.

Contrato público: `ag3-structured-proposal/1`.

## Auditoría

### Reutilizado

- `AgentContext` B1 como única entrada del builder.
- Items, correlaciones, statements y recomendaciones ya construidos por B1.
- Separación epistémica `fact`, `inference`, `hypothesis` y `recommendation` de AG1/AG2.
- Confidence con provenance `review_presentation`, `ag1_diagnosis` y `ag2_editorial`.
- Risk canónico de Review Nucleus o `unavailable`.
- Sufficiency de Review Nucleus/AG2 con `determinesReadiness: false`.
- Authority hints B1 para Review, AU7, AU8, none o unknown, siempre `invokes: false`.
- Identidad, referencias y freshness del snapshot AG3 B1.
- Candidatos humanos y roles existentes de RX3.

### Adaptado

B1 recibió dos campos aditivos mínimos porque la información no estaba disponible en su salida:

- `issueCodes`: taxonomía existente de Review/AG1/AG2/proceso/dependencia.
- `decisionOptions`: candidatos humanos RX3 con ID, label, role y confidence.

Esto evita que B2 consulte `ReviewCase`, vuelva a deduplicar datos o invente alternativas. B1 sigue siendo una proyección read-only y su contrato previo permanece compatible.

También se completó la correlación B1 de hechos AG2 sin ReviewCase con su item editorial no durable.

### Creado

- Tipos `AgentStructuredProposal`.
- Builder puro y determinista.
- Cuatro selectors pequeños: recomendadas, decisión humana requerida, bloqueadas y por fuente.
- Fixture B2 derivado del fixture B1.
- Suite contractual y de seguridad.

### Intencionalmente sin cambios

- Stores y dominio Review.
- AG1, AG2 y LES8.
- Authority ownership.
- Planner, executor, scheduler, memoria o proposal store.
- Persistencia, red, Sanity, Telegram y APIs externas.
- Readiness y decisión de autonomía.
- UI, chat, streaming, AG3 B3, AG4 y AG5.

## Qué es una propuesta AG3

Una propuesta es una proyección no durable de un item B1. Incluye:

- identidad estable y versión;
- clase y subject;
- problema humano y códigos originales;
- facts, inferences e hypotheses separados;
- alternativas disponibles;
- recomendación opcional y rationale;
- confidence, risk y sufficiency con provenance;
- necesidad de decisión humana;
- authority hint contextual;
- expected outcome, nunca observed outcome;
- preguntas sin resolver;
- trace y freshness;
- frontera de decisión sin ejecución.

Una propuesta no es un `ReviewCase`, un plan, una autorización o una instrucción ejecutable.

## Relación con B1, AG1, AG2 y Review

```text
LES8 → AG1 → AG2 → AG3 B1 AgentContext → AG3 B2 StructuredProposal[]
```

B2 no accede lateralmente a LES8, AG1, AG2, Review Store, Review Nucleus ni RX3. Toda correlación y toda información humana llegan mediante B1.

Un item Review conserva `reviewCaseId` en el trace. Un insight o diagnóstico sin Review produce una propuesta válida con `reviewCaseId` ausente y `durable: false`. B2 nunca crea casos Review.

## Evidence package

Los statements B1 relacionados con cada item se separan en tres arrays:

- `facts`;
- `inferences`;
- `hypotheses`.

Cada entrada conserva su ID, source, summary, referencias y confidence únicamente cuando puede asociarse sin ambigüedad. Las recomendaciones permanecen fuera del paquete de evidencia y se tratan como recomendaciones.

## Alternatives

Las alternativas de candidato proceden exclusivamente de `decisionOptions` B1/RX3. Conservan:

- ID y nombre humano;
- role recomendado/alternativo/posible;
- confidence original;
- authority hint;
- soporte, limitaciones y viabilidad observables.

B2 también puede representar:

- solicitar evaluación a la autoridad existente;
- mantener un bloqueo;
- mantener el flujo actual;
- no intervenir.

Las capabilities se mantienen en `null` mientras B1 no exponga una capability canónica. Esto evita inventar contratos operativos. El authority hint basta como routing conceptual y nunca se invoca.

## Recommendation y rationale

La recomendación es opcional. Solo se proyecta cuando existe una recomendación B1 clara, una alternativa asociable y contexto no stale/contradictorio.

Puede ser `null` cuando:

- la evidencia es conflicting/contradictory;
- el item o contexto está stale/bloqueado;
- no existe recomendación clara;
- falta una alternativa asociable.

El rationale reutiliza facts, inferences, hypotheses, la recomendación B1 y las limitaciones de sufficiency. Explica la alternativa elegida, las descartadas y caveats sin texto generativo libre.

## Confidence

- Todas las entradas B1 se conservan por origen.
- `known`: existe una lectura semánticamente consistente.
- `mixed`: existen niveles o valores distintos.
- `unknown`: no hay confidence para una decisión pendiente.
- `not_applicable`: el item no necesita decisión.
- `aggregated` siempre es `false`.

La confidence concreta de una recomendación procede de la recomendación B1 elegida. No se promedian valores ni se fabrican porcentajes.

## Risk y sufficiency

- Risk solo es `known` cuando B1 lo obtuvo de Review Nucleus; en otro caso es `unknown`/`unavailable`.
- `inferredFromConfidence` siempre es `false`.
- Sufficiency conserva todas las lecturas B1 y usa `mixed` si difieren.
- `determinesReadiness` siempre es `false`.

B2 no contiene motor de riesgo, suficiencia ni autonomía.

## Human decision y bloqueos

`humanDecision.status` puede ser:

- `not_required`;
- `recommended`;
- `required`;
- `blocked`.

Staleness y contradicción bloquean. Una ambigüedad Review vigente puede conservar una recomendación y seguir requiriendo confirmación humana. `no_action` nunca se confunde con `blocked`.

## Expected outcome

Solo existe cuando hay recomendación. Declara:

```text
kind: expected
observed: false
```

Describe qué recibiría la autoridad o qué estado se conservaría. Nunca afirma que algo se publicó, guardó, resolvió o ejecutó. La observación real queda fuera de B2.

## Traceability y freshness

Cada propuesta conserva:

- `agentContextSnapshotIdentity`;
- `contextItemId`;
- `reviewCaseId` cuando existe;
- observation, diagnosis, AG1 proposal e insight IDs;
- source references y fingerprints;
- timestamp explícito de composición B1;
- fecha/versión/freshness del item.

Los IDs se derivan del item B1. No se usa reloj implícito, UUID o aleatoriedad. Cambiar el orden de entrada produce exactamente la misma salida.

## Frontera arquitectónica

AG3 B2 garantiza:

- decision support only;
- cero stores y cero proposal store;
- cero persistencia y writes;
- cero planner o executor;
- cero mutación Review/AG1/AG2/LES8;
- cero invocación Review/AU7/AU8;
- cero decisión de autonomía o readiness;
- cero red, Sanity, Telegram o APIs externas;
- cero UI/chat/streaming.

## Fixture y validación

El fixture B2 reutiliza el contexto UFC/ONE/BKFC/external_news de B1 y cubre:

- Alex Norte 94% frente a Álex Sur 61%;
- recomendación clara con decisión humana;
- confidence mixed sin averaging;
- risk conocido y desconocido;
- sufficiency insufficient y conflicting;
- contradicción sin recomendación;
- bloqueo stale;
- no action;
- proceso activo;
- propuesta con y sin ReviewCase;
- expected outcome y preguntas abiertas.

La suite `scripts/test-ag3-structured-proposals.ts` certifica identidad, determinismo, evidence separation, alternativas, recommendation opcional, confidence/risk/sufficiency, decisión humana, authority hints, expected-vs-observed, traceability, empty/unknown inputs, selectors y ausencia de efectos.
