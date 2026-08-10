# AU10 B6 — Certificación final

## Flujo único

`Caso → Evidence (AU4) → Identity (AU5) → Resolution (AU6) → Decision /
Autonomy / Strategy (AU8) → Transaction (AU7) → Observe / Reconcile (AU4) →
Knowledge (AU9) → Completion / Close (AU3)`.

AU2 aporta operaciones y grafo. AU10 sólo proyecta este recorrido en Núcleo,
Workspace, Cross-case, Dashboard y Operator Experience. No existe una ruta de
efectos desde AU10: AU7 conserva esa autoridad.

## Autoridades y límites

- AU3: caso, checkpoint, lifecycle, CAS/recovery.
- AU4: inspección y reconciliación.
- AU5: identidad y discovery.
- AU6: planificación resolutiva y Creation Guard fail-closed.
- AU7: única transaction/executor, idempotencia, retry y compensación.
- AU8: decisión, suficiencia, autonomía, estrategia y loop supervisado único.
- AU9: conocimiento advisory-only; nunca sustituye evidencia actual.
- AU10: presentación pura, filtros efímeros y handoffs explícitos.

No se certifican motores, planners, stores, ejecutores, schedulers ni routers
paralelos. Las proyecciones B1–B5 declaran `writes: false` y no contienen
payloads, tokens ni secrets.

## Recovery y concurrencia

Checkpoint AU3 enlaza plan, graph, transaction y loop mediante fingerprints.
La recuperación valida freshness y CAS; stale obliga regeneración. AU7 limita
una transacción por checkpoint/idempotency key y sus retries, reconciliación y
compensación continúan bajo control explícito. AU8 no inicia otro loop ni
autoautoriza efectos. Conflictos y locks quedan en las autoridades AU3/AU7;
AU10 sólo los muestra.

## Rendimiento y roadmap

Lazy loading para secciones técnicas y dashboard, memoización, límites de
relaciones/actividad y paginación evitan render masivo. B3 sigue teniendo coste
sensible al número de relaciones reales; para datasets mucho mayores, el paso
posterior es indexación en la autoridad existente, no un grafo paralelo.

Pendiente posterior a AU10: QA visual con navegador disponible y deep-links
mediante el router existente. No altera esta certificación funcional.
