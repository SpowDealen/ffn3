# AU9 B3 — Knowledge Validity & Contradiction Engine

## Auditoría y frontera

B3 consume únicamente `KnowledgeItem` públicos creados por AU9 B1/B2. Su
`KnowledgeProvenance` enlaza por fingerprint los contratos de AU3 checkpoint,
AU4 inspection/reconciliation, AU5 identity, AU6 resolution, AU7 transaction y
AU8 decision/sufficiency/autonomy/strategy/outcome. El motor no vuelve a
consultar ninguna capa y no accede a stores, Sanity, red, planners o executors.

La evidencia actual sigue siendo la única autoridad. El resultado es siempre
`advisoryOnly`, declara `replacesCurrentEvidence: false` y no modifica una
decisión editorial.

## Arquitectura

`governKnowledge` recibe items y directivas explícitas ya verificadas. Produce:

- evaluación efectiva de validez por revisión activa;
- nuevas revisiones para cambios reales de lifecycle;
- transiciones auditables entre revisión anterior y nueva;
- contradicciones y candidatos `under_review` sin ganador;
- un fingerprint determinista de toda la proyección.

Las revisiones previas permanecen en `items`. Cada cambio añade una revisión
con `revision + 1` y una referencia `derived_from` hacia el ID y fingerprint
anterior. Reprocesar ese historial no crea otra revisión.

## Lifecycle y temporalidad

Los estados son `current`, `temporal`, `expired`, `invalidated`, `superseded`,
`contradictory` y `under_review`. La precedencia fail-closed es:

1. invalidación explícita;
2. sustitución explícita;
3. contradicción detectada;
4. solicitud explícita de revisión;
5. expiración de la ventana temporal;
6. conservación de `temporal` o `current`.

`validFrom`/`validUntil` gobiernan vigencia y expiración. Invalidación y
supersesión exigen directivas tipadas con reason code, provenance y
fingerprints de evidencia. B3 no obtiene esas directivas automáticamente.

## Contradicciones

`detectGovernedKnowledgeConflicts` agrupa por dominio, subject y claim y
detecta incompatibilidad semántica por polarity o `valueFingerprint`. Clasifica
sin resolver:

- hecho frente a hecho;
- patrón frente a hecho;
- experiencia frente a evidencia negativa;
- ventanas temporales solapadas e incompatibles;
- fuentes independientes incompatibles.

Cada caso produce `KnowledgeConflict` y `KnowledgeConflictCandidate`. El
candidato permanece `under_review`, exige evidencia actual y declara
`winnerSelected: false`. Items expired, invalidated o superseded no compiten
como conocimiento vigente.

## Determinismo y seguridad

Arrays, IDs y reason codes se ordenan antes de firmar. Los fingerprints de
assessment, transición, conflicto y gobernanza no dependen del orden ni de los
timestamps operativos. No se almacenan payloads, documentos, prompts, secretos
o razonamiento interno; sólo resúmenes seguros, IDs, códigos y fingerprints.

B3 no recupera knowledge para decidir, no elige evidencia, no aplica
aprendizaje, no persiste y no realiza writes. B4 consume este resultado de
gobernanza como snapshot explícito y mantiene la misma autoridad de la evidencia
actual.

# AU9 · Closure

B6 delega los cambios de ciclo de vida exclusivamente a B3. La UI puede marcar
revisión, invalidar o sustituir con confirmación explícita; conserva siempre la
cadena `derived_from`, no resuelve conflictos y no elige ganadores.
