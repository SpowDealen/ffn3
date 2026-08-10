# AU9 B1 — Universal Editorial Knowledge Model

## Autoridad y límite

AU9 B1 define un lenguaje universal, puro y versionado para proyectar
experiencias editoriales verificadas. No sustituye evidence sufficiency AU8,
Identity AU5, Resolution AU6, Transaction AU7 ni el checkpoint AU3. Un
`KnowledgeItem` es siempre advisory y declara `replacesCurrentEvidence: false`.

No existe store, planner, executor, cliente Sanity ni acceso de red. El modelo
crea objetos serializables e inmutables; persistencia, selección contextual y
políticas de uso quedan fuera de B1.

## Reutilización AU3–AU8

`KnowledgeProvenance` conserva únicamente IDs, versiones y fingerprints:

- AU3: caso, checkpoint, outcomes y confirmación editorial;
- AU4: inspections y reconciliación;
- AU5: identity resolution;
- AU6: resolution y Creation Guard indirectamente mediante su fingerprint;
- AU7: transaction y resultado operacional;
- AU8: decision, sufficiency, autonomy y strategy.

Los payloads fuente nunca forman parte del contrato. Cada observación contiene
un `claimCode`, resumen seguro, polarity y fingerprints de evidencia.

## Contratos

- `KnowledgeItem`: unidad versionada, con dominio, clase, autoridad,
  temporalidad, provenance y fingerprints.
- `KnowledgeObservation`: proyección mínima de una observación verificable.
- `KnowledgeSource`: tipo, autoridad, independencia, fecha y versión.
- `KnowledgeValidity`: current, temporal, expired, invalidated, superseded,
  contradictory o under review. Los dos últimos estados son gobernados por B3.
- `KnowledgeFingerprint`: fingerprint universal `sha256-v1` de AU2–AU8.
- `KnowledgeReference`: relación tipada con caso, entidad, evidence, checkpoint,
  decision, strategy, transaction, outcome, memory, manifests u otro knowledge.
- `KnowledgeConflict`: contradicción bloqueante que obliga a evidencia actual.
- `KnowledgeRecommendation`: sugerencia advisory que nunca concede permiso.

Los dominios son news, event, fighter, organization, weight category, fight,
result y relationship. Las clases separan confirmed fact, observed pattern,
historical experience, recommendation, negative evidence, contradiction,
invalidated knowledge y temporal knowledge.

## Temporalidad y lifecycle puro

`evaluateKnowledgeValidity` evalúa un item para un instante sin mutarlo. Un
`validUntil` vencido produce `expired`. `invalidateKnowledgeItem` y
`supersedeKnowledgeItem` crean nuevas revisiones con fingerprints nuevos y
mantienen `createdAt`; nunca reescriben la revisión anterior.

El conocimiento temporal o histórico no se convierte en hecho actual. Incluso
una recomendación con autoridad alta conserva `requiresCurrentEvidence: true`.

## Fingerprints, serialización e idempotencia

Se reutiliza `computeUniversalFingerprint`. Fuentes, referencias,
observaciones y arrays de provenance se normalizan y ordenan antes de firmar.
`createdAt` y `updatedAt` no alteran identidad semántica. El mismo contenido en
otro orden produce el mismo `contentFingerprint`, `knowledgeFingerprint` e ID.

La deserialización recalcula todos los fingerprints y rechaza contenido
alterado. `deduplicateKnowledgeItems` elimina duplicados por fingerprint de
forma determinista.

## Conflictos y seguridad

`detectKnowledgeConflicts` agrupa por dominio, subject y claim. La coexistencia
de observations `supports` y `contradicts` crea un conflicto blocking/critical,
pero no elige ganador. Resolverlo exige volver a AU4–AU8 con evidencia vigente.

B1 declara cero writes, stores, planners, executors, Sanity, red, payloads y
secretos. El siguiente bloque AU9 B2 puede proyectar experiencias reales a este
modelo, manteniendo la misma separación entre historial y evidencia actual.

## Evolución B2–B5

B2 extrae y consolida outcomes, B3 gobierna lifecycle y contradicciones, B4
recupera y recomienda de forma advisory y B5 cierra el feedback comparando la
intención AU8 con outcomes reales AU7/AU4. Ninguna capa eleva experiencia
histórica a autoridad ni modifica decisiones futuras automáticamente. Véanse
`EXTRACTION_CONSOLIDATION.md`, `GOVERNANCE.md`,
`RETRIEVAL_RECOMMENDATION.md` y `FEEDBACK_LOOP.md`.

## AU9 · Closure — Knowledge Center (B6)

El Centro de Revisión proyecta los contratos B1–B5 mediante un
`KnowledgeCenterSnapshot` serializable dentro del `context` versionado del
`ReviewCase` de AU3. No añade store ni memoria paralela: cuando el snapshot no
existe o está stale, la vista permanece cerrada de forma segura.

La vista muestra sólo resúmenes seguros, fingerprints abreviados, provenance,
recurrencia, independencia de fuentes, temporalidad, lifecycle, historial de
revisiones, conflictos, recomendaciones y feedback. Nunca muestra payloads ni
secretos. Las siete fases se mantienen visibles: current, temporal, expired,
invalidated, superseded, contradictory y under_review; ninguna revisión previa
se oculta ni se reescribe.

Las únicas mutaciones UI permitidas son transiciones explícitas B3: solicitar
revisión, invalidar y sustituir por una revisión activa compatible. Cada una
genera una revisión enlazada y elimina el resultado B4 ya recuperado para forzar
una nueva recuperación con evidencia vigente. No hay creación manual de
KnowledgeItem, decisión, ejecución ni aplicación automática.

AU10 podrá consumir estas proyecciones para gobierno humano y métricas, pero
deberá conservar la misma frontera: experiencia histórica advisory-only y
evidencia actual como única autoridad.
