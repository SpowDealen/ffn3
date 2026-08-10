# AU10 B1 — Auditoría previa del sistema resolutivo

Fecha de auditoría: 2026-08-10. HEAD publicado auditado: `594e3c4`.
AU9 B1–B6 existe como cambio local legítimo, sin commit ni push.

## Autoridades encontradas

- AU2 mantiene operaciones, grafo y orden topológico.
- AU3 mantiene `ReviewCase`, checkpoint, lifecycle, recovery y persistencia.
- AU4 mantiene inspection y reconciliation.
- AU5 mantiene identidad y candidate discovery.
- AU6 mantiene resolución, Creation Guard y plan transversal.
- AU7 mantiene la única vía transaccional para efectos.
- AU8 mantiene decision, sufficiency, autonomy, strategy y supervised loop.
- AU9 mantiene knowledge gobernado y advisory-only.

No se detectó una razón válida para crear otro motor o store. AU10 debe ser una
fachada de presentación derivada de estos contratos públicos.

## Duplicación operativa visible

`ReviewCaseDetails` monta en serie todos los paneles pesados. El operador recibe
varios resúmenes de evidencia, planificación, estado transaccional, outcomes y
knowledge antes de saber cuál es la acción prioritaria.

- `AutonomousReviewCenter`, `TransversalResolutionPlanPanel` y
  `TransactionOperationalCenter` repiten estado, blockers, progreso y CTA.
- `GlobalResolutionControls` y `TransactionOperationalCenter` son dos entradas
  visibles hacia operaciones con efecto. AU7 debe seguir siendo la autoridad;
  AU10 sólo puede hacer handoff a la superficie apropiada.
- `DecisionOutcomePanel`, `DecisionMemoryPanel`, `RelevantMemoryPanel` y
  `KnowledgeCenter` presentan experiencia histórica desde capas diferentes.
  Memory legado debe quedar como detalle técnico; AU9 es la presentación
  gobernada para el operador.
- `AutonomousInvestigationPanel` e `InvestigationPanel` solapan investigación
  automática y profunda. Deben aparecer bajo una única sección Evidencia.
- Materialization, schema requirements, reconciliation, planner, transaction y
  preview se montan aunque el operador no los haya solicitado.

## Estados y naming

AU6, AU7, AU8 y AU9 exponen vocabularios correctos para su dominio, pero no hay
un estado principal común. También aparecen nombres técnicos AU en la vista
principal. Esos nombres se conservan únicamente dentro del detalle técnico.

## Lógica y fronteras

Los motores y modelos puros están fuera de JSX. Sí existe lógica de
orquestación de controles en componentes, pero delega en runtimes públicos.
AU10 no debe mover ni replicar esa lógica: su CTA abre el panel autoritativo o
invoca la transición humana ya proporcionada por `ReviewCaseDetails`.

No se observó un bypass nuevo de identidad o autorización en los contratos
auditados. El riesgo actual es visual: varios CTAs simultáneos pueden inducir al
operador a elegir una ruta incorrecta.

## Dependencias y rendimiento

Los modelos AU8 y AU9 ya componen contratos públicos. La fachada AU10 puede
consumirlos sin importar executors, Sanity o stores. La UI actual importa y
monta todos los paneles; la corrección es renderizar una sola sección técnica a
la vez mediante progressive disclosure.

## Decisión de integración

1. Crear un `NucleusResolutionViewModel` puro, sin persistencia.
2. Derivar un estado y un CTA únicos con prioridades fail-closed.
3. Mantener cada autoridad dentro de su panel, cargado sólo tras un handoff.
4. Mostrar summaries seguros y fingerprints abreviados por defecto.
5. Mantener unsupported visible y no inventar fallback.
6. Derivar completion y timeline; no persistirlos ni crear un log paralelo.

## Auditoría AU10 B2 — Operational Workspace

B1 ya unifica estado y CTA, pero su componente importa estáticamente todos los
paneles y mantiene dos formas de navegación: botones en las tarjetas resumen y
una barra de secciones. Aunque sólo monta una sección, el bundle principal aún
incluye todos los módulos técnicos y no existe un contrato puro de layout.

B2 debe corregirlo sin tocar el dominio:

- derivar zonas, métricas y timeline contextual desde el view model B1;
- mantener el resumen ejecutivo siempre visible;
- ofrecer una única navegación contextual para las otras cinco zonas;
- mover los paneles autoritativos a un módulo cargado con `React.lazy`;
- usar `Suspense` para un skeleton real durante la carga;
- no guardar la zona abierta fuera del estado efímero del componente;
- no cambiar CTAs, engines, stores, executors ni rutas de efecto.

## Auditoría AU10 B3 — Cross-Case Intelligence

AU3 ya expone el snapshot recuperable de `ReviewCase[]`; AU6 conserva claves de
identidad y plan, AU7 fingerprints transaccionales, y AU9 conocimiento vigente
gobernado. No hace falta persistir otro grafo ni consultar Sanity.

La auditoría separa evidencia transversal segura de señales especulativas:

- son utilizables IDs/sanity IDs explícitos, selecciones editoriales, enlaces,
  dedupe keys, dependencias declaradas, fingerprints vigentes, capabilities,
  productor, transacción AU7 y knowledge AU9 current/temporal;
- quedan excluidos texto parecido, labels, candidatos sin seleccionar,
  payloads, contexto stale, knowledge caducado/invalidado/superseded/
  contradictory y tipos unsupported;
- una coincidencia aislada de luchador, productor o capability no basta para
  recomendar fusión;
- agrupación y merge son recomendaciones, nunca mutaciones ni autorización.

La UI puede leer el store AU3 mediante `useReviewCases`, pero el constructor del
grafo sólo recibe un snapshot y no importa store, executor, red ni Sanity.

## Auditoría AU10 B4 — Global Resolution Dashboard

El Centro de Revisión ya dispone del snapshot global en `useReviewCases`. B1
proyecta el estado real de cada caso; B3 aporta relaciones y clusters; AU9
expone lifecycle y recomendaciones gobernadas. Por tanto, el dashboard puede
ser una reducción pura sin store, scheduler ni runtime adicional.

Hallazgos y decisiones:

- los totales se derivan de estados AU3 y hechos B1, nunca de contadores
  persistidos;
- salud usa únicamente blockers, stale, unsupported, autorización,
  reconciliación, compensación y conflictos presentes;
- activity se construye desde timeline B1, lifecycle AU3 y snapshots AU7/AU9;
  una CTA por sí sola no se registra como decisión;
- missing executor sólo aparece cuando los blockers públicos declaran binding,
  capability o soporte ausente;
- ranking conserva todos sus componentes visibles y no introduce score oculto;
- los filtros son estado React efímero y no alteran el resumen global;
- el detalle pesado puede separarse con `React.lazy` sin importar paneles
  operativos ni rutas de efecto.

La pasada focal también eliminó un `setState` síncrono dentro del efecto de
selección de `ReviewCenter`; ahora la selección válida se deriva durante render.
