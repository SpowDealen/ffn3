# AU10 B1 — Núcleo Resolutivo IA

## Responsabilidad

El Núcleo Resolutivo IA es una fachada pura de presentación. Convierte los
estados públicos AU2–AU9 en una experiencia operativa coherente, pero no posee
estado de dominio, no persiste una segunda verdad y no ejecuta efectos.

La cadena de autoridad se conserva:

```text
AU2 operaciones/grafo
  → AU3 checkpoint/lifecycle/recovery
  → AU4 inspection/reconciliation
  → AU5 identity
  → AU6 entity resolution/plan
  → AU7 transaction/effects
  → AU8 decision/sufficiency/autonomy/strategy
  → AU9 governed knowledge advisory
  → AU10 facade de presentación
```

## Fachada

`buildNucleusResolutionViewModel` recupera proyecciones públicas y produce:

- resumen seguro de caso y problema;
- evidencia, suficiencia, contradicciones y staleness;
- identidad, reuse/create, estrategia y blockers;
- autonomía y riesgo;
- progreso AU7, incidencias, autorización, reconciliación y compensación;
- experiencia editorial AU9, nunca presentada como verdad;
- completion gates;
- timeline derivado y deduplicado;
- fingerprints abreviados.

No conserva payloads, tokens, errores crudos ni razonamiento interno.

## Estado y CTA únicos

`deriveNucleusState` prioriza fail-closed: unsupported, stale, reconciliación,
compensación, autorización, humano, bloqueo y contradicción aparecen antes de
continuar. Sólo después deriva completion, observación, ejecución, identidad,
investigación, planificación, análisis o idle.

`derivePrimaryNucleusAction` produce exactamente una acción prioritaria. La
acción no replica lógica de dominio: abre el panel autoritativo existente o, en
`finish`, usa la transición humana AU3 ya entregada por el detalle del caso.
Nunca existe “forzar ejecución”.

## UI y progressive disclosure

`AIResolutionNucleus` sustituye el montaje simultáneo de paneles. La vista
principal enseña problema, estado, progreso, severidad, CTA y cuatro preguntas:
qué sabe, qué decidió, qué puede hacer y qué aprendió.

Sólo se monta una sección técnica a la vez:

- Evidencia: inteligencia autónoma e investigación;
- Resolución: plan AU6, materialización y requisitos;
- Ejecución: AU7, controles AU3/AU4, reconciliación y preview;
- Conocimiento editorial: AU9;
- Historial: outcomes y memory legado como detalle técnico.

Los nombres AU quedan en documentación o detalle técnico, no en la experiencia
principal.

## Rol humano y handoffs

El operador puede investigar, resolver identidad, autorizar, reconciliar,
compensar, revisar y finalizar mediante controles explícitos. AU10 sólo hace
handoff visual:

- AU8 → AU7 cuando una estrategia llega a ejecución;
- AU7 → AU4 ante efecto incierto;
- AU4 → AU8 tras reconciliación;
- AU8 → AU9 al existir outcome gobernable;
- AU9 → AU8 como experiencia advisory, nunca como evidencia actual.

Cada CTA indica si es sólo lectura, transformación pura, posible efecto externo
o decisión humana. Riesgo alto/destructivo genera advertencia.

## Completion

`deriveNucleusCompletion` exige soporte, contexto fresh, evidencia suficiente,
ausencia de contradicción, identidad resuelta, estrategia completada,
transacción completada o innecesaria, cero reconciliación/compensación/
autorización/blockers y outcome verificable. Sólo el lifecycle AU3 puede
registrar el caso como resuelto.

## Timeline

El timeline se deriva de timestamps y fingerprints existentes. No es un log ni
se persiste. Ordena caso, evidencia, identidad, decisión, estrategia,
transacción, iteraciones supervisadas, reconciliación, knowledge y cierre; los
eventos semánticamente idénticos se deduplican.

## Unsupported y seguridad

Imagen permanece “No soportado todavía”; no existe fallback inventado. La
fachada declara cero stores, planners, engines, executors, Sanity, red, writes,
bypass de autorización o autoaplicación de knowledge. AU7 sigue siendo la única
vía de efectos y AU9 sigue siendo advisory-only.

## Accesibilidad, responsive y rendimiento

La UI usa botones nativos, labels, `aria-busy`, `role=status`, `role=alert`,
foco al abrir detalle/error, `aria-pressed`, navegación de teclado,
`prefers-reduced-motion` y wrapping de fingerprints. El layout se reduce a dos
columnas en tablet y una columna a 560/390 px.

Sólo una sección autoritativa se monta bajo demanda, reduciendo el coste frente
al detalle anterior que montaba todos los centros simultáneamente.

## Próximos bloques AU10

B1 no rediseña la navegación global. Bloques posteriores pueden consolidar
notificaciones, métricas y layout general, manteniendo la fachada sin elevarla
a autoridad de dominio.

## B2 — Operational Workspace

`OperationalWorkspaceViewModel` deriva exclusivamente del view model B1. No
vuelve a leer motores ni conserva otra fuente de verdad. Ordena seis zonas:
resumen ejecutivo, evidencia, resolución, ejecución, conocimiento e historial.
Cada zona expone summary seguro, métricas, estado visual y timeline contextual.

El resumen se monta siempre. Las cinco zonas técnicas comparten una única
navegación contextual y sólo una puede estar abierta. Los paneles autoritativos
viven en `OperationalWorkspaceSection`, importado con `React.lazy`; `Suspense`
presenta un skeleton durante la carga. La selección es estado efímero de UI y
no se persiste.

Las flechas, Home y End desplazan el foco dentro de la navegación. Los paneles
continúan usando sus propios controles explícitos: abrir una zona no analiza,
autoriza, ejecuta, reconcilia, compensa ni aplica knowledge automáticamente.

## B3 — Cross-Case Intelligence

`buildCrossCaseGraph` proyecta un snapshot AU3 en nodos, relaciones, aristas y
grupos inmutables. El grafo es efímero: no crea store, no se persiste y se
reconstruye íntegramente cuando cambia el snapshot.

Las señales proceden sólo de contratos públicos AU2–AU10 B2: sujeto e identidad
confirmada, resoluciones explícitas, checkpoint y plan AU6, transaction AU7,
dependencias declaradas y knowledge AU9 vigente. Stale, unsupported y
conocimiento no accionable permanecen visibles como exclusiones y nunca
generan relaciones.

Las relaciones se consolidan por tipo y par de casos. El ranking suma impacto,
cantidad de evidencia, recurrencia, independencia de autoridades, proximidad
temporal y riesgo; un empate se resuelve por fingerprint. Los fingerprints no
dependen del orden del snapshot.

Los componentes conexos generan grupos advisory-only para revisión conjunta.
`possible_duplicate_case` o dos señales fuertes independientes pueden producir
`merge_candidate`, pero nunca se fusiona automáticamente ni se comparten
autorizaciones. Una sola coincidencia o señales auxiliares como productor y
capability no elevan el caso a merge.

`CrossCaseIntelligencePanel` muestra como máximo tres relaciones en primera
vista y despliega el resto bajo demanda. Expone casos relacionados, motivo,
evidencia resumida, impacto/ranking, recomendación y límites. No añade CTA ni
altera la acción prioritaria del workspace.

## B4 — Global Resolution Dashboard

`GlobalResolutionDashboardViewModel` agrega proyecciones B1 y el grafo B3. Su
resumen global no cambia con los filtros; `scopedSummary`, ranking, activity,
bottlenecks, cross-case y knowledge sí reflejan el alcance efímero seleccionado.

La salud aplica una precedencia explícita: compensación, conflicto compartido o
blocker crítico → `critical`; reconciliación, bloqueos, stale, unsupported o
executor ausente → `degraded`; autorización, revisión humana o casos abiertos →
`attention`; ausencia de estas condiciones → `healthy`.

El ranking suma siete componentes publicados: severidad, estado bloqueante,
edad, impacto de dependencias, impacto transversal, riesgo y clase de acción.
Cada caso conserva la explicación completa y el desempate usa fingerprint.

Los bottlenecks agrupan capabilities bloqueantes, executors ausentes,
autorización repetida, reconciliación recurrente, stale, tipos unsupported,
conflictos y blockers compartidos. Son advisory-only y sólo indican la acción
humana o autoritativa pertinente.

Complejidad: proyección y filtros son O(n); facets y agrupaciones son O(n+s);
ranking usa un índice de relaciones y ordena O(n log n). El coste B3 es sensible
al número real de señales y relaciones generadas. Todas las colecciones de UI
tienen límites configurables.

`NucleusGlobalDashboard` monta resumen, filtros y prioridades. Las secciones de
inteligencia transversal, bottlenecks, conocimiento y actividad viven en
`GlobalResolutionDashboardDetails`, cargado con `React.lazy` sólo tras una
acción explícita. Abrir un caso navega al detalle; no muta dominio ni ejecuta.

### Checklist visual manual B4

El navegador integrado no estuvo disponible durante B4. Queda pendiente
confirmar manualmente, sin atribuirlo a QA automatizada:

- desktop: resumen en seis columnas, prioridades en dos y detalle en dos;
- tablet ≤900 px: resumen en tres columnas, filtros en dos y detalle en una;
- móvil ≤560 px y 390 px: tarjetas, filtros, métricas y botones en una columna;
- teclado: abrir filtros, recorrer selects, abrir caso y desplegar detalle;
- foco visible al montar el detalle lazy y anuncios `status`/`alert` correctos;
- ausencia de overflow en títulos, fingerprints, blockers y recomendaciones.

## B5 — Operator Experience

`buildOperatorExperience` no añade inteligencia: reordena proyecciones B1/B3/B4
para navegación, búsqueda, filtros, paginación, badges, estados vivos, progreso
real y notificaciones relevantes. Los filtros y el retorno a caso son estado
efímero de UI; las quick actions sólo abren la autoridad existente y comunican
su gate, sin ejecutar, autorizar ni persistir.
