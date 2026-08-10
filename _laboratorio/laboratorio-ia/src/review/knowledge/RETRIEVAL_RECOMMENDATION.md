# AU9 B4 — Governed Retrieval & Recommendation

## Auditoría y autoridad

B4 consume exclusivamente el `KnowledgeGovernanceResult` público de B3 y,
opcionalmente, `KnowledgeRecurrence` de B2. El caller entrega ambos snapshots:
no existe store, consulta automática, red, Sanity ni acceso a decisiones o
ejecutores. Provenance conserva los enlaces por fingerprint con AU3–AU8.

La evidencia actual sigue siendo la única autoridad. El conocimiento histórico
se recupera para orientar una inspección, nunca para conceder permiso o cambiar
una decisión.

## Retrieval gobernado

`retrieveGovernedKnowledge` recibe un contexto seguro con case, entidades,
tipos, capabilities, productores, contexto editorial, issues, relaciones,
instante de evaluación y fingerprints de evidencia actual. Selecciona mediante:

- `subjectKey` y referencias `entity`;
- dominio editorial;
- manifests públicos de capability y productor;
- referencias `editorial_context`, `issue` y `relationship`;
- provenance del caso/productor;
- ventana `validFrom`/`validUntil` evaluada en el momento de la consulta.

Nunca proyecta items `invalidated`, `superseded`, `expired`, `contradictory` o
`under_review`. La exclusión temporal se recalcula aunque el snapshot de B3 sea
anterior, cerrando el paso a conocimiento que haya caducado desde entonces.
Los duplicados por `contentFingerprint` se reducen a una sola revisión de forma
determinista.

## Ranking explicable

Cada candidato expone cinco componentes enteros y acotados:

- relevancia: coincidencias de dimensiones y entidad exacta, máximo 40;
- independencia de fuentes: máximo 20;
- recurrencia histórica: máximo 15;
- vigencia: 15 para current y 10 para temporal;
- proximidad contextual: case/context/issue/productor/capability/relación,
  máximo 10.

El total máximo es 100. Los empates se resuelven por fingerprint estable. Ni la
confianza histórica ni la autoridad nominal forman parte del score. Recurrencia
e independencia mejoran orden, pero nunca sustituyen evidencia actual.

## Recommendation advisory-only

Cada candidato genera una recomendación segura con action, reason codes,
provenance, fingerprints de fuentes, contexto coincidente, evidencia histórica,
estadísticas de recurrencia y limitaciones. La acción puede sugerir considerar
conocimiento, inspeccionar evidencia actual o revisar un riesgo conocido.

Todas declaran:

- `advisoryOnly: true`;
- `requiresCurrentEvidence: true`;
- `replacesCurrentEvidence: false`.

No se devuelven payloads completos ni se autoaplica la recomendación.

## Determinismo y límites

Consulta, arrays, reason codes, candidatos y recomendaciones se normalizan antes
de calcular fingerprints. La consulta es read-only sobre objetos proporcionados
por el caller. B4 no persiste índices, no busca fuera del snapshot gobernado y no
modifica AU8. Cualquier uso posterior deberá conservar estos límites y volver a
validar la evidencia vigente.

# AU9 · Closure

B6 muestra sólo resultados B4 ya gobernados. Los estados invalidated,
superseded, expired, contradictory y under_review no se vuelven a recuperar. Al
cambiar lifecycle, B6 descarta el retrieval previo y exige regenerarlo con
evidencia actual.
