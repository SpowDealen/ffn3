# AU9 B2 — Knowledge Extraction & Consolidation

## Auditoría de experiencia útil

B2 parte de `DecisionOutcomeRecord`, porque es la única proyección que distingue
resultado técnico, estructural, editorial y operacional. Las demás capas no son
fuentes de una decisión nueva; aportan provenance verificable:

- AU3: case/version, checkpoint y outcome confirmado;
- AU4: inspection y reconciliation;
- AU5: identity resolution;
- AU6: resolution y Creation Guard vinculados por fingerprint;
- AU7: transaction outcome;
- AU8: decision, sufficiency, autonomy, strategy y loop;
- AU9 B1: contrato, temporalidad y fingerprint universal.

Son experiencia útil: outcomes confirmados, rechazados, fallidos, superseded,
reconciliaciones y contradicciones explícitas. Un outcome `pending` no produce
observaciones. No se inspeccionan payloads, eventos completos, documentos,
errores crudos, prompts, secretos ni razonamiento interno.

## Extractor

`extractKnowledgeFromOutcome` es puro y recibe snapshots ya proporcionados. No
consulta stores ni sistemas fuente. Proyecta un outcome elegible en
`ExtractedKnowledgeObservation`, que contiene:

- dominio y entity type;
- kind/polarity y resumen seguro;
- confianza descriptiva, nunca permiso;
- fingerprints de evidencia y provenance AU3–AU8;
- temporalidad explícita;
- fingerprint de extracción estable.

Estados editoriales/operacionales confirmados producen `confirmed_fact`;
rechazos, fallos, falsas coincidencias, aliases incorrectos, referencias
inválidas y entidades descartadas producen `negative_evidence`; conflictos o
efectos inciertos producen `contradiction`; superseded produce conocimiento
invalidado. B2 no recupera knowledge ni modifica la decisión que originó el
outcome.

## Consolidación y anti-double-learning

`consolidateKnowledge` sólo opera sobre extracciones y KnowledgeItems que el
caller entrega explícitamente:

1. materializa contratos B1;
2. agrupa por dominio, subject, claim, kind y ventana temporal;
3. elimina exact duplicates por `contentFingerprint`;
4. combina evidencia adicional como reinforcement y nueva revisión;
5. preserva ocurrencias únicas por outcome/provenance;
6. calcula recurrencia;
7. relaciona contradiction, invalidated, superseded y temporal overlap.

Reprocesar el mismo outcome no crea conocimiento ni ocurrencia duplicada. Una
experiencia equivalente procedente de otro outcome refuerza el item y añade una
ocurrencia. Las contradicciones generan `KnowledgeConflict`; jamás se elige un
ganador en B2.

## Recurrencia

Cada `KnowledgeRecurrence` conserva observation count, fuentes independientes,
productores, casos, primera/última aparición e IDs de ocurrencia. Sus
fingerprints excluyen timestamps y orden. Las fechas siguen disponibles para
auditoría, pero la recurrencia declara `replacesCurrentEvidence: false`.

## Seguridad y límite B3

Extractor y consolidador son puros, serializables y deterministas. Declaran
cero writes, stores, planners, executors, scheduler, runtime, red o Sanity.
Tampoco recuperan conocimiento para decidir, modifican decisiones ni aplican
aprendizaje. AU9 B3 deberá gobernar conflictos/validez antes de cualquier uso;
B2 únicamente produce candidatos advisory.

# AU9 · Closure

B6 presenta las observaciones y recurrencias B2 como resúmenes seguros en el
Centro de Conocimiento. Los contadores de recurrencia e independencia explican
contexto histórico, nunca sustituyen la evidencia actual ni crean reglas.
