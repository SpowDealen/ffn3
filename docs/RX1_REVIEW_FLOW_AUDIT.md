# RX1 · Auditoría del flujo de revisión y experiencia humana

Fecha de auditoría: 2026-08-30/31
Checkpoint auditado: `7a606326ef64672d353ff8f2a44ae61280d54e70` (`feat: add editorial intelligence layer`)
Alcance: lectura estática del flujo actual y regresión local; sin rediseño ni cambios de runtime.

## A. Executive summary

El Centro de Revisión sí tiene una autoridad real y coherente: `ReviewCase`, un store único, deduplicación, control de versión, checkpoints, resolución, estados de reanudación y protecciones de idempotencia. El flujo de noticias externas es el más completo: detecta incidencias, crea o actualiza un caso, bloquea el guardado mientras existe revisión, permite corregir, prepara una preview, exige confirmación, guarda el borrador y registra el resultado.

La cobertura de producto, sin embargo, no coincide con lo que promete la UI:

- UFC, ONE y BKFC sólo convierten en `ReviewCase` real los luchadores faltantes de eventos. Sus noticias con `requiere_revision`, eventos pendientes, categorías sin resolver, combates pendientes y varios bloqueos de preparación viven en respuestas HTTP y estado React de `PanelIA`; no son una cola durable y desaparecen al recargar.
- El botón de noticias externas construye `/revision?case=<id>`, pero `LaboratoryApp` descarta `search`; el caso no se abre. Existe enlace, no navegación contextual efectiva.
- Los casos de luchadores oficiales sí llegan a Review, pero la API sólo devuelve propuestas: el navegador debe registrarlas. Después de resolver la identidad/crear el luchador no existe continuidad durable de la tarjeta original; el operador debe volver a Editorial y repetir el análisis/preparación.
- `ReviewModule` admite `fekm.participants`, pero `REVIEW_MODULES` no lo incluye. Un caso FEKM puede registrarse en memoria y ser descartado silenciosamente al recargar desde `localStorage`.
- La persistencia es únicamente `localStorage` del navegador/origen. No hay bandeja compartida entre dispositivos, perfiles o sesiones privadas. Los casos válidos se sincronizan entre pestañas del mismo origen, no entre operadores.
- `/revision` carga todos los casos locales válidos y no aplica un filtro oculto por fuente o estado. Los casos “ausentes” normalmente nunca se crearon, no fueron registrados por el cliente, fueron rechazados por migración o pertenecen a otro navegador.
- AU10 ya mejoró la jerarquía del caso con resumen, “Necesita de ti”, una acción primaria y detalle técnico bajo demanda. Aun así, dashboard, filtros, actividad y algunas zonas operativas exponen `AU7`, `AU9`, `capability`, `fingerprint`, `checkpoint`, `stale`, `unsupported`, `reconciliation` y `compensation` como lenguaje principal.

Conclusión: la arquitectura profunda puede sostener RX2–RX5; no necesita otro store, executor, planner ni agent loop. El primer trabajo de producto debe cerrar entradas y navegación antes de simplificar la superficie visual.

## B. Review flow map

### B.1 Flujo canónico actual

```text
Entrada/fuente
  → detector o resolución de fuente
  → (sólo algunas ramas) propuesta/creación de ReviewCase
  → registro browser-local + deduplicación/versionado
  → /revision
  → resolución humana/autónoma segura
  → checkpoint/ejecución autorizada cuando el productor la soporta
  → resultado observado
```

La interrupción principal está entre “estado que semánticamente requiere revisión” y “ReviewCase real”.

### B.2 Matriz de entradas

| Origen | Entidad | Disparador | Autoridad/archivo | Crea/actualiza `ReviewCase` | Persistencia | Visible en `/revision` | Reanudación actual |
|---|---|---|---|---|---|---|---|
| Externas (Marca, AS, Eurosport, Espabox, Mundo Deportivo) | noticia y relaciones | campo, URL, imagen, contenido, duplicado, conflicto o referencia ausente/ambigua | `review/producers/externalNews/detectExternalNewsIssues.ts`, `createExternalNewsReviewCase.ts` | Sí; crea o actualiza por `dedupeKey` | `localStorage` | Sí | preview explícita → autorización → draft Sanity → `resumed` |
| UFC eventos | luchador | luchador no resuelto durante preparación/creación | `app/api/sources/ufc/events/create-fighters/route.ts`, `review/fighterResolutionIntake/*`, registro en `PanelIA.tsx` | Sí, como propuesta; el cliente debe registrarla | `localStorage` tras registro | Sí | resuelve/crea entidad; la tarjeta UFC se reanaliza manualmente |
| ONE eventos | luchador | igual que UFC | ruta ONE + intake común | Sí, como propuesta | `localStorage` tras registro | Sí | resuelve/crea entidad; reanálisis manual |
| BKFC eventos | luchador | igual que UFC | ruta BKFC + intake común | Sí, como propuesta | `localStorage` tras registro | Sí | resuelve/crea entidad; reanálisis manual |
| UFC/ONE/BKFC noticias | noticia | `requiere_revision` por URL/imagen/posible duplicado; `sin_contenido` | `app/api/sources/*/news/batch-resolve/route.ts` | No | estado React/response | No | seleccionar ítem y trabajo manual; no hay resume durable |
| UFC eventos | evento/categoría/combate | evento ausente, categoría no resuelta, combate pendiente o error | rutas `events/resolve`, `ufc/events/batch-resolve`; `PanelIA.tsx` | No, salvo luchador | estado React/response | No | acciones directas o repetición manual |
| ONE eventos | evento/categoría/combate | equivalente | `one/events/resolve`, `PanelIA.tsx` | No, salvo luchador | estado React/response | No | crea evento/categoría/combate directamente o repite flujo |
| BKFC eventos | evento/categoría/combate | equivalente | `bkfc/events/resolve`, `PanelIA.tsx` | No, salvo luchador | estado React/response | No | crea evento/combate; categorías omitidas pueden quedar pendientes |
| FEKM participantes | luchador | identidad faltante | intake común | Sí en memoria | `localStorage`, pero incompatible al recargar | Temporalmente; luego no | creación de entidad; continuidad manual |
| Sanity read-only | luchador, evento, organización, categoría | escaneo explícito detecta grupo duplicado | `review/entityReconciliation/cases.ts`, `ReconciliationScanControls.tsx` | Sí al registrar resultados del scan | `localStorage` | Sí | decisión humana genera sólo un plan propuesto; no muta Sanity |
| Identity lookup genérico | entidad | `ambiguous`, `probable_match`, evidencia insuficiente | `review/entityResolution/profiles.ts` | No por sí solo | resultado efímero del control | No como caso nuevo | consulta/decisión local; necesita un caso productor para continuidad |
| Diagnóstico AU/checkpoint | operación | blocked, stale, reconciliation/compensation required | checkpoint dentro del caso existente | Actualiza el mismo caso, no crea otro | dentro de `ReviewCase` | Sí si el caso existe | controles AU7/AU8/AU4 del propio caso |

### B.3 Autoridad y persistencia

- Store: `review/store/reviewStore.ts`. `createReviewCase` reutiliza un caso activo por `dedupeKey`; `registerCanonicalReviewCase` protege colisiones de propuestas canónicas.
- Repository: `review/store/localStorageRepository.ts`, clave `ffn3.review-cases.v1`, máximo nominal de 250 y conservación de todos los activos aunque superen ese máximo.
- Retención: `resolved`, `resumed` y `dismissed` expiran tras 90 días.
- Migración: únicamente schema v1. Un registro inválido se omite; un checkpoint global inválido se elimina conservando el caso.
- Visibilidad: `useReviewCases()` entrega todos los casos válidos. `ReviewCenter` no usa `selectOpenReviewCases`; sus filtros son efímeros y parten en `all`.

## C. Gaps demostrados

### C.1 Entradas rotas o incompletas

1. **“Requiere revisión” no implica `ReviewCase`.** Las rutas batch de noticias UFC/ONE/BKFC sólo devuelven una etiqueta. El badge “Revisar” de `PanelIA` acompaña a un botón “Seleccionar” que cambia el ítem local; no abre Review ni conserva una tarea.
2. **Pendientes de eventos fuera de la cola.** `missingFighters`, `unresolvedCategories` y `pendingFights` forman parte de la resolución de eventos. Sólo `missingFighters` entra al intake; las demás ramas no producen caso.
3. **Registro partido entre servidor y cliente.** Las rutas `create-fighters` planifican y devuelven `registrationRequired: true`; el ReviewCase no existe en el store hasta que `PanelIA` ejecuta `registerFighterResolutionProposals`.
4. **Continuidad oficial no durable.** El manifiesto de los productores de luchadores se declara `intakeOnly: true`. Ejecuta identidad/creación, pero no conserva ni reanuda la preparación completa del evento/noticia de origen.
5. **FEKM incompatible con su propia migración.** `types.ts` contiene `fekm.participants`; `constants.ts` no. `migrateReviewCases` exige pertenencia a `REVIEW_MODULES`, así que elimina ese caso de la carga posterior.

### C.2 Navegación y trazabilidad

6. **Deep link inerte.** `PanelIA` navega a `?case=<id>`. `useLaboratoryRouter` sí expone `search`, pero `LaboratoryApp` sólo extrae `{route, navigate}` y `ReviewCenter` inicializa `selectedId` en `null`. El operador aterriza en el dashboard, no en el caso.
7. **Sin correlación oficial visible.** Las bandejas UFC/ONE/BKFC no muestran un `reviewCaseId` junto al ítem, ni badge durable de casos pendientes, ni enlace contextual por luchador/evento.
8. **Persistencia sólo local.** Dos operadores o dos navegadores no comparten casos. No puede interpretarse `/revision` como inbox editorial de equipo.
9. **Rechazo silencioso de formato.** La migración filtra registros incompatibles sin registro visible de cuarentena o diagnóstico para el operador.

### C.3 Semántica de estado

10. **“Total activo” incluye `resolved`.** `ACTIVE_STATUSES` incluye `resolved`; el total activo contradice la sección “Resueltos”.
11. **Dos conceptos de resuelto.** `resolved` significa incidencias corregidas pero todavía potencialmente pendiente de reanudación; `resumed` significa efecto finalizado. La UI no explica esta diferencia con suficiente claridad.
12. **Resoluciones de duplicados sin finalización automática.** Entity reconciliation actualiza su checkpoint y produce un plan propuesto, pero no transiciona por sí sola el `ReviewCase` a un estado final. Es seguro, pero deja al operador la gestión manual del estado.

## D. Auditoría por origen

### D.1 UFC

**Noticias.** `batch-resolve` clasifica `existente`, `nueva_apta`, `sin_contenido` y `requiere_revision`. URL canónica ausente, imagen ausente o coincidencia sólo por título pueden activar revisión. No importa ni llama al store. En Editorial, “Revisar” es un estado visual; “Seleccionar” sólo carga la noticia en el formulario.

**Eventos.** La resolución devuelve evento encontrado, luchadores, categorías, combates y contadores pendientes. Un evento inexistente o categorías no resueltas pueden detener la automatización sin caso. Los luchadores faltantes sí pasan al intake y se registran como `ufc.events`. Los combates aptos se crean por rutas específicas, fuera de Review.

**Salida.** El caso del luchador dispone de guard de identidad y capability `create:luchador`, con autorización explícita e idempotencia. No reanuda la tarjeta UFC completa: después de resolver, el operador vuelve a Editorial y ejecuta de nuevo la preparación/análisis.

### D.2 ONE Championship

**Noticias.** Misma clasificación y mismo gap que UFC: los estados de revisión son efímeros y no llegan a `/revision`.

**Eventos, disciplinas y relaciones.** ONE resuelve la disciplina/categoría con reglas de fuente y puede crear evento, categorías y combates mediante acciones directas. Los no resueltos quedan en el resultado/UI; sólo los luchadores faltantes generan propuestas `one.events`.

**Salida.** Review puede resolver y crear el luchador. No existe una tarea durable que represente el resto de la tarjeta ni una reanudación automática de la operación ONE original.

### D.3 BKFC

**Noticias.** Mismo contrato batch y mismo gap.

**Eventos y categorías.** Puede crear el evento directamente si falta. Los luchadores pasan al intake `bkfc.events`; los combates pendientes se crean cuando las referencias están listas. Las categorías no resueltas/omitidas no generan caso, por lo que una tarjeta puede avanzar parcialmente sin que Review conserve el trabajo restante.

**Salida.** La creación del luchador está gobernada; la continuación del evento es manual y no durable.

### D.4 Fuentes externas

Fuentes activas auditadas: Marca, AS, Eurosport, Espabox y Mundo Deportivo. Todas usan el productor común `external_news`.

El flujo es más completo que los oficiales:

1. `detectExternalNewsIssues` evalúa requisitos editoriales, URL, imagen, contenido, duplicados y relaciones de disciplina, organización, evento y luchadores.
2. `createOrUpdateExternalNewsReviewCase` crea/actualiza un caso estable, preserva sólo resoluciones que siguen siendo válidas y minimiza/redacta el snapshot.
3. `runExternalNewsReviewPilot` aplica únicamente resoluciones autónomas seguras y devuelve siempre `saveBlocked: true` mientras existe caso.
4. Review permite completar incidencias y preparar una preview ligada a versión/fingerprint.
5. La ejecución exige confirmación explícita, es idempotente y registra `resuming`, `resumed`, `resume_failed` o reconciliación si el draft se guardó pero falló el registro de estado.

Gaps restantes: deep link inerte; dependencia del store local; executor disponible sólo en la sesión UI; la explicación técnica pesa más de lo necesario.

### D.5 Entidades y referencias

| Tipo | Entrada real a Review | Autoridad de decisión | Efecto actual |
|---|---|---|---|
| Luchador de fuente oficial | intake de UFC/ONE/BKFC/FEKM | guard de identidad + autorización humana + executor `create:luchador` | crea/reutiliza con control; no reanuda la tarjeta completa |
| Luchador de externa | issue del caso `external.news` | resolución del caso + discovery/guard + plan global | sustituye referencia proyectada y puede reanudar noticia |
| Organización/disciplina/evento en externa | issues `missing_reference`/`ambiguous_reference` | resolución humana/autónoma validada | entra en payload de resume si se resuelve |
| Categoría, evento u organización duplicada en Sanity | scan read-only explícito | decisión humana de entity reconciliation | plan propuesto, cero mutación automática |
| Categoría/evento de fuente oficial | resolución directa de la fuente | ruta + UI de Editorial | no tiene ReviewCase salvo que otro issue lo represente |
| Referencia ambigua de lookup aislado | perfil de identity lookup | resultado técnico del lookup | no crea caso por sí solo |

## E. Review Center actual

### E.1 Inventario funcional/visual

| Elemento | Representa | Autoridad técnica | Necesario para operador | Visible como hoy | Destino recomendado |
|---|---|---|---|---|---|
| Dashboard | salud agregada, prioridades y cuellos | derivado de casos/checkpoints | Parcial | No: mezcla salud técnica y trabajo humano | resumen humano; diagnóstico colapsado |
| Casos prioritarios | listado filtrable | `buildOperatorExperience` | Sí | Sí | futura “Necesitan atención” |
| Núcleo del caso | problema, progreso, acción y workspace | caso + AU/checkpoint | Sí | Sí, base correcta | conservar y simplificar copy |
| Actividad | eventos derivados | snapshots existentes | Sí, como historial | Parcial: expone `kind` interno | traducir categorías |
| Knowledge | memoria/recomendaciones | AU9 advisory | Opcional | No como tab principal para el operador común | detalle secundario |
| Métricas por estado | volumen | status del caso | Sí | Sí, pero “activo” es incorrecto | tres grupos humanos + diagnóstico |
| Filtros status/source/entity | recuperación | facts derivados | Sí | Sí | conservar con etiquetas humanas |
| Filtros autonomy/risk/capability/knowledge/actionRequired | diagnóstico interno | AU/policy | No en modo normal | No | “Filtros avanzados” |
| ID, dedupe, versión, Sanity revision | trazabilidad | ReviewCase | No en lectura inicial | No | Detalles técnicos |
| Issues y correcciones | trabajo real | ReviewCase/resolutions | Sí | Sí | conservar |
| Context/resume JSON | snapshot seguro | ReviewCase | Sólo soporte | Correcto: colapsado y redactado | conservar colapsado |
| Scan de duplicados e identity lookup | herramientas globales | servicios read-only | No dentro de cualquier caso | No | herramientas separadas/avanzadas |
| Transacción, plan, knowledge, history | workspace AU | AU6–AU9 | Sólo según problema | Parcial | carga progresiva ya válida; renombrar |
| Footer de fingerprints/filtros/AU7 | diagnóstico | snapshots/AU7 | No | No | detalle técnico o eliminar de UI normal |

### E.2 Fortalezas UX que deben preservarse

- El Núcleo resume problema, progreso, severidad y “Necesita de ti”.
- Existe una única acción primaria derivada del estado.
- Abrir un caso no ejecuta efectos.
- Las zonas técnicas pesadas se cargan bajo demanda.
- El contexto JSON redácta claves sensibles.
- Reanudación y operaciones con efectos requieren autorización/confirmación y control de versión.
- Los errores inciertos no se convierten en retry ciego: pasan a reconciliación.

### E.3 Modelo mental humano: prueba de 10 segundos

| Pregunta | Resultado | Evidencia |
|---|---|---|
| ¿Qué necesita mi atención? | `partially_clear` | Hay ranking, severidad y acciones, pero mezcla `resolved`, procesos y degradaciones técnicas; además faltan pendientes oficiales. |
| ¿Qué problema hay? | `clear` dentro del caso | Título, issues, resumen y “Necesita de ti” lo explican. |
| ¿Por qué existe? | `partially_clear` | Issues/evidencia ayudan; el origen técnico y reason codes dominan algunas zonas. |
| ¿Qué recomienda el Lab? | `clear` en casos compatibles | Acción primaria, decisiones y plan; puede volverse `unsupported` sin traducción útil. |
| ¿Qué ocurrirá si apruebo? | `partially_clear` | Preview externa es buena; controles AU muestran operaciones/capabilities, no siempre el efecto editorial en una frase. |
| ¿Qué casos están esperando? | `partially_clear` | Estados disponibles, pero no hay grupo humano único y faltan pendientes fuera del store. |
| ¿Qué casos están en proceso? | `partially_clear` | `in_review`/`resuming` existen, pero dashboard añade estados AU y “activo” incluye resueltos. |
| ¿Qué casos ya se resolvieron? | `partially_clear` | `resolved` y `resumed` aparecen separados sin explicar “corregido” frente a “aplicado”. |

## F. Editorial → Review

| Superficie | Enlace/acción | Correlación con caso | Resultado real |
|---|---|---|---|
| Noticias externas | “Abrir caso” / “Preparar reanudación” | `caseId` presente | Navega a `/revision?case=...`, pero no abre el caso |
| Noticias UFC | badge “Revisar” + “Seleccionar” | ninguna | selecciona noticia local; no abre Review |
| Noticias ONE | igual | ninguna | igual |
| Noticias BKFC | igual | ninguna | igual |
| Eventos UFC | badge “Revisar” + “Seleccionar”; mensajes de fighter intake | propuestas contienen IDs internamente | selecciona evento; no presenta enlaces por caso |
| Eventos ONE/BKFC | mensajes del intake | IDs en resultados de registro, no en la bandeja | no hay navegación contextual |

Gap exacto del deep link:

```text
PanelIA navigateLaboratory('/revision', '?case=...')
→ useLaboratoryRouter conserva search
→ LaboratoryApp ignora search
→ ReviewCenter selectedId = null
→ dashboard sin caso seleccionado
```

## G. ReviewCase visibility

1. `useReviewCases` carga todos los casos aceptados por el repository y se suscribe a cambios.
2. `ReviewCenter` pasa todos los casos a `buildOperatorExperience`; el filtro inicial es `all` en todas las facetas.
3. `selectOpenReviewCases` sólo considera `open`, `in_review`, `resume_failed` y `stale`, pero no gobierna la pantalla actual.
4. Los filtros son estado React: no ocultan permanentemente ni persisten.
5. Casos `external.news`, UFC/ONE/BKFC fighter y `entity.reconciliation` válidos aparecen.
6. Casos pueden no aparecer porque:
   - nunca se crearon;
   - eran propuestas no registradas por el cliente;
   - están en otro navegador/origen;
   - la carga v1 los consideró inválidos;
   - son FEKM y su módulo no está en la lista de migración;
   - un final de más de 90 días expiró.
7. No existe migración de schema anterior/posterior ni cuarentena visible. El checkpoint global inválido se retira del caso; el resto del caso sigue visible.

## H. Pending states outside Review

| Estado semántico | Dónde vive | Caso real | UI | Resoluble | Reanudable |
|---|---|---:|---:|---:|---:|
| noticia oficial `requiere_revision` | response batch + React | No | Sí | manual en Editorial | No durable |
| noticia oficial `sin_contenido` | response batch + React | No | Sí | sólo cambiando fuente/contenido | No |
| evento `evento_pendiente` | response/React | No | Sí | creación directa | repetición manual |
| `unresolvedCategories` | response/React | No | Sí | algunas fuentes crean/resuelven directo | repetición manual |
| `pendingFights` | response/React | No | Sí | creación directa si dependencias listas | repetición manual |
| error/bloqueo de full-card antes del intake | notificación/estado React | No | Sí | depende del error | No durable |
| propuesta fighter planificada y no registrada | payload HTTP | Todavía no | mensaje | sólo si cliente registra | No |
| identity lookup `probable_match`/`ambiguous` | estado del control/resultado | No por sí solo | Sí | decisión contextual | No por sí solo |
| reconciliation scan parcial/no concluyente sin registro | response del scan | No hasta registro | feedback | nuevo scan | No |
| checkpoint `reconciliation_required` | dentro de caso existente | Sí | Sí | inspección/reconciliación explícita | Sí, gobernada |
| checkpoint `compensation_required` | dentro de caso existente | Sí | Sí | compensación autorizada | Sí, gobernada |
| `stale` | caso/checkpoint existente | Sí | Sí | regenerar/revalidar | Sí si productor soportado |
| notificación no leída | store de notificaciones | No | Sí | lectura, no decisión | No; debe excluirse de Inbox |

## I. Resume paths

| Origen/problema | Resolución | Ejecutor/autoridad | Cómo continúa | Observación posterior |
|---|---|---|---|---|
| externa con campos/referencias | resolutions + plan global | capabilities AU + executor `resume:external_news` | preview → autorización → guardado | draft/document ID, `resumed`; fallo cierto → `resume_failed`; efecto incierto → reconciliación |
| UFC fighter faltante | identity guard + `create:luchador` | fighter source producer + universal executor | termina resolución de entidad | checkpoint/caso observables; la tarjeta UFC no continúa sola |
| ONE fighter faltante | igual | productor ONE | igual | igual |
| BKFC fighter faltante | igual | productor BKFC | igual | igual |
| FEKM fighter faltante | igual | productor FEKM | igual | riesgo de desaparición tras reload por módulo inválido |
| duplicados históricos | decisión humana | workflow read-only de reconciliation | produce plan propuesto | contexto actualizado; ninguna mutación ni merge real |
| noticia/evento/categoría/combate oficial pendiente | acción manual/directa | `PanelIA` + rutas específicas | volver a seleccionar/repetir | no existe observación durable en Review |

## J. AU visibility audit

### J.1 Términos visibles y tratamiento

| Término/superficie | Valor técnico real | Necesario para humano | Tratamiento | Lenguaje propuesto |
|---|---|---:|---|---|
| `AU7 · CONTROL TRANSACCIONAL` | autoridad de efectos | No | ocultar etiqueta, conservar controles | “Aplicar cambios” |
| `AU6 · Planificación resolutiva` | plan/graph | No | detalle avanzado | “Plan recomendado” |
| `AU9 · CONOCIMIENTO GOBERNADO` | memoria advisory | No | ocultar AU; sección secundaria | “Contexto útil” |
| “recomendaciones AU9” | procedencia de consejo | No | traducir | “Recomendaciones del Lab” |
| checkpoint | snapshot versionado de recuperación | No | detalle técnico | “Punto de recuperación” sólo si aporta |
| fingerprint | vínculo de integridad | No | ocultar salvo soporte | “Versión verificada” si hace falta |
| capability | operación soportada | No | ocultar/filtro avanzado | “Acción disponible” |
| autonomy | política de autorización | A veces | traducir | “Puede hacerlo solo / necesita aprobación” |
| strategy | ruta de decisión | No | detalle | “Recomendación” |
| sufficiency | calidad/cobertura de evidencia | Sí, como concepto | traducir | “Evidencia suficiente/insuficiente” |
| `reconciliation_required` | resultado incierto | Sí | traducir y explicar no-retry | “Necesita verificar el resultado” |
| `compensation_required` | deshacer/reparar efecto parcial | Sí | traducir | “Necesita corregir cambios parciales” |
| stale | versión/contexto cambió | Sí | traducir | “Información desactualizada” |
| unsupported | runtime sin soporte | Sí como bloqueo | traducir con salida | “Esta acción aún no está disponible” |
| reason codes / operation IDs | diagnóstico | No | detalle técnico | resumen causal humano |
| raw state/event kinds en actividad | telemetría | No | mapear | “Iniciado / terminado / necesita atención” |

### J.2 Superficies concretas

- `NucleusGlobalDashboard`: muestra Stale, Unsupported, Autorización, Reconciliación, Compensación, modos de autonomía, fingerprints y “AU7 única vía de efectos”.
- `TransactionOperationalCenter`: usa `Reconciliation required`, `Compensation required`, `Stale`, “Step”, capabilities y fingerprints.
- `TransversalResolutionPlanPanel`: muestra AU6, graph/plan/checkpoint y varios fingerprints.
- `KnowledgeCenter`: muestra AU9, snapshot/stale, provenance, reason codes y fingerprints.
- `ReconciliationScanControls` y `ReconciliationCasePanel`: muestran “scan”, scope, reglas, IDs lógicos y checkpoint; parte es útil para un revisor experto, no para el resumen principal.
- `ReviewCaseDetails`: ID, dedupe key, versionado e IDs Sanity aparecen antes de las incidencias; deben quedar en detalle técnico.

No se recomienda borrar estas autoridades ni datos. Se recomienda cambiar su nivel de exposición.

## K. Modelo conceptual de Inbox para RX2

No debe existir un `InboxStore`. La Inbox será una proyección de autoridades actuales.

### K.1 Grupos humanos

**Necesitan atención**

- caso con decisión humana pendiente;
- caso bloqueado por evidencia, autorización, reconciliación o compensación que exige acción humana;
- estado oficial `review-required` sólo cuando RX2 lo convierta en una entrada durable con destino accionable.

**En proceso**

- `in_review` con actividad humana en curso;
- `resuming`/ejecución activa;
- investigación o regeneración activa sin intervención requerida;
- nunca procesos simplemente “degradados” si no existe acción humana.

**Resueltos**

- `resumed`, `dismissed` y finalizaciones verificadas;
- `resolved` debe presentarse como “corregido, pendiente de aplicar” si todavía hay resume, no como final absoluto.

### K.2 Item derivado

```ts
type InboxItem = {
  id: string;                    // id estable de la autoridad, normalmente ReviewCase.id
  source: string;
  entityType: string;
  humanTitle: string;
  problemSummary: string;
  reason: string;
  recommendation: string;
  confidence?: number;
  priority: "critical" | "high" | "normal" | "low";
  reviewCaseId?: string;
  destination: { path: string; caseId?: string; action?: string };
  technicalDetailsReference: { authority: "review_case" | "source_state"; id: string };
};
```

No duplicar `issues`, resolutions, checkpoint, transaction ni historial. El item sólo proyecta su estado vigente.

## L. Criterio único `needs attention`

Regla propuesta, derivada y no persistente:

```text
needsAttention(item) =
  authorityIsCurrent(item)
  AND NOT isFinalOrHistorical(item)
  AND NOT isReadOnlyDiagnostic(item)
  AND NOT isActiveWithoutHumanInput(item)
  AND (
    unresolvedRequiredOrBlockingIssue(item)
    OR explicitHumanAuthorizationRequired(item)
    OR reconciliationOrCompensationDecisionRequired(item)
    OR actionableReviewRequiredSourceState(item)
  )
  AND hasConcreteDestinationAndAction(item)
```

Para `ReviewCase`, la acción se deriva de issues no resueltos y del checkpoint vigente; no basta con `status === open`. Para estados de fuente, RX2 no debe incluirlos hasta que exista identidad durable, destino y acción. Se excluyen historial, diagnósticos read-only, errores resueltos, ejecución activa sin intervención y notificaciones no leídas sin acción.

## M. Recomendaciones priorizadas

### P0 — bloquea uso humano

1. Hacer efectivo el deep link `?case=`: validar el ID, abrir el caso y mantener fallback seguro si no existe.
2. Eliminar la falsa equivalencia visual “Revisar” en UFC/ONE/BKFC: cada estado accionable debe crear/registrar un `ReviewCase` durable o usar un nombre honesto que lo mantenga en Editorial hasta que RX3 lo conecte.
3. Corregir la compatibilidad de `fekm.participants` y añadir una prueba de persistencia/reload para evitar pérdida silenciosa.

### P1 — alta prioridad

1. Definir adaptadores de entrada —no un store nuevo— para noticias, eventos, categorías y combates oficiales que hoy quedan fuera de Review.
2. Persistir la correlación `source item/event → reviewCaseId` y mostrar un badge/enlace contextual en Editorial.
3. Diseñar continuidad durable tras resolver un fighter: retorno claro a la operación de origen o resume de productor cuando el contrato lo soporte.
4. Dar visibilidad diagnóstica a registros rechazados por migración sin reintroducirlos de forma insegura.
5. Decidir alcance multioperador: mientras sea browser-local, etiquetar el Centro como local; si será inbox de equipo, diseñar persistencia compartida en una fase separada.

### P2 — simplificación

1. Reorganizar navegación en “Necesitan atención / En proceso / Resueltos”.
2. Corregir métrica activa y explicar “corregido” frente a “aplicado”.
3. Mover filtros AU, capabilities, knowledge state, IDs, fingerprints y versiones a “Avanzado/Detalles técnicos”.
4. Traducir los estados AU según la tabla J.1 y reducir el dashboard a acciones y salud comprensible.
5. Separar herramientas globales de scan/lookup del detalle de cualquier caso.

### P3 — nice-to-have

1. Persistir filtros y última sección en URL sin convertirlos en autoridad.
2. Añadir retorno contextual Review → Editorial.
3. Ofrecer vistas guardadas sólo como preferencias locales.
4. Mejorar accesibilidad/copy de estados y empty states con pruebas de 10 segundos.

## N. Plan exacto RX2–RX5

### RX2 · Inbox humana derivada

1. Implementar el selector puro de los tres grupos sobre `ReviewCase` y authorities existentes.
2. Definir presenters humanos y `needsAttention` con fixtures de todos los estados.
3. Hacer funcional `?case=` y el retorno contextual.
4. Corregir `ACTIVE_STATUSES`/semántica `resolved` sin alterar lifecycle.
5. No añadir persistencia ni efectos.

### RX3 · Cobertura de entradas oficiales

1. Inventariar cada `requiere_revision`/pending de UFC, ONE y BKFC como contrato de productor.
2. Crear adaptadores de intake al store existente con dedupe, snapshots mínimos y correlación estable.
3. Priorizar noticias y categorías bloqueantes; después eventos/combates.
4. Registrar en cliente de forma explícita cuando la API sólo pueda proponer, con manejo visible del fallo de registro.
5. Añadir tests reload/dedupe/visibility y compatibilidad FEKM.

### RX4 · Continuidad y reanudación

1. Definir por productor qué significa resolver y qué significa reanudar.
2. Para fighters oficiales, conservar el contexto de tarjeta y ofrecer retorno/replay seguro; sólo añadir resume real si existe contrato idempotente.
3. Completar observación, stale y reconciliation sin tocar la autoridad AU7/AU8.
4. Añadir enlaces Editorial ↔ Review y estados postacción comprensibles.

### RX5 · Simplificación visual

1. Aplicar navegación de tres grupos y una tarjeta humana común.
2. Mantener una acción primaria por caso y el workspace progresivo de AU10.
3. Mover terminología/controles técnicos a detalle colapsado.
4. Validar copy, móvil, teclado, lector de pantalla y prueba humana de 10 segundos.
5. Conservar un modo diagnóstico para soporte sin contaminar la operación diaria.

## O. Evidence index

- Contratos: `review/types.ts:3-55`, `review/constants.ts:3-29`.
- Migración: `review/store/migrations.ts:14-43`.
- Persistencia/TTL/límite: `review/store/localStorageRepository.ts:20-94`.
- Visibilidad/selectores: `review/store/selectors.ts:3-31`, `review/components/ReviewCenter.tsx:24-61`.
- Métrica/filtros/UI: `review/components/ReviewCenter.tsx:25-120`.
- Detalle técnico inicial: `review/components/ReviewCaseDetails.tsx:137-170`.
- External intake: `review/producers/externalNews/createExternalNewsReviewCase.ts:24-43`.
- External pilot: `review/producers/externalNews/runExternalNewsReviewPilot.ts:9-25`.
- External resume: `review/resume/externalNews/executeExternalNewsResume.ts:17-86`.
- Fighter proposal/registro: `review/fighterResolutionIntake/planning.ts:7-28`, `registration.ts:6-26`.
- Productores fighter intake-only: `review/globalResolution/producers/fighterSources.ts:4-53`.
- Reconciliation: `review/entityReconciliation/cases.ts:10-38`, `components/ReconciliationScanControls.tsx`, `components/ReconciliationCasePanel.tsx`.
- Navegación: `components/PanelIA.tsx:13084`, `app/useLaboratoryRouter.ts:6-26`, `app/LaboratoryApp.tsx:11-19`.
- Estados de noticias: `app/api/sources/{ufc,one,bkfc}/news/batch-resolve/route.ts`.
- Estados de eventos: `app/api/sources/{ufc,one,bkfc}/events/resolve/route.ts`, `app/api/sources/ufc/events/batch-resolve/route.ts`.

## P. Verificación local

Las pruebas `tsx` necesitaron ejecución fuera del sandbox de filesystem porque su CLI abre un socket IPC temporal y el sandbox respondió `listen EPERM`. El permiso se limitó al prefijo `npx tsx`. No se habilitó red ni se ejecutaron efectos de dominio.

### P.1 PASS

| Comando | Resultado exacto |
|---|---|
| `npx tsx scripts/test-les8-agent-ready.ts` | `OK` — 106 assertions |
| `npx tsx scripts/test-ag1-agent-observation-reasoning.ts` | `OK` — 121 assertions |
| `npx tsx scripts/test-ag2-editorial-intelligence.ts` | `OK` — 130 assertions |
| `npx tsx scripts/test-au2-external-news-resume-executor.ts` | `OK` |
| `npx tsx scripts/test-au3-global-resolution-checkpoint.ts` | `OK` |
| `npx tsx scripts/test-au3-external-news-global-resolution-application.ts` | `OK` |
| `npx tsx scripts/test-au4-global-resolution-inspection-contract.ts` | `OK` |
| `npx tsx scripts/test-au4-global-resolution-inspection-controls.ts` | `OK` |
| `npx tsx scripts/test-au5-transversal-review-center-validation.ts` | `OK` — 4 entities, E2E, stale/read-only |
| `npx tsx scripts/test-au7-transaction-core.ts` | `OK` — 82 assertions |
| `npx tsx scripts/test-au7-transaction-executor.ts` | `OK` — 84 assertions |
| `npx tsx scripts/test-au7-transaction-orchestration.ts` | `OK` — 57 assertions |
| `npx tsx scripts/test-au7-transaction-persistence-recovery.ts` | `OK` — 62 assertions |
| `npx tsx scripts/test-au7-transaction-compensation.ts` | `OK` — 74 assertions |
| `npx tsx scripts/test-au7-transaction-operational-center.ts` | `OK` — 61 assertions |
| `npx tsx scripts/test-au8-autonomous-review-center.ts` | `OK` — 92 assertions |
| `npx tsx scripts/test-au8-autonomous-supervised-loop.ts` | `OK` — 102 assertions |
| `npx tsx scripts/test-au8-autonomous-editorial-decision.ts` | `OK` — 202 assertions |
| `npx tsx scripts/test-au8-autonomous-resolution-strategy.ts` | `OK` — 140 assertions |
| `npx tsx scripts/test-au8-autonomy-risk-policy.ts` | `OK` — 130 assertions |
| `npx tsx scripts/test-au8-evidence-sufficiency.ts` | `OK` — 84 assertions |
| `npx tsx scripts/test-au10-ai-resolution-nucleus.ts` | `OK` — 96 assertions |
| `npx tsx scripts/test-au10-operator-experience.ts` | `OK` — 71 assertions |
| `npx tsx scripts/test-au10-review-navigation.ts` | `OK` — 55 assertions |
| `npx tsx scripts/test-au10-final-certification.ts` | `OK` — 38 assertions |
| `npx tsx scripts/test-au10-global-resolution-dashboard.ts` | `OK` — 161 assertions |
| `npx tsx scripts/test-au10-workspace-timeline-access.ts` | `OK` — 43 assertions |
| `npx tsx scripts/test-au10-operational-workspace.ts` | `OK` — 132 assertions |
| `npx tsx scripts/test-au10-editorial-error-states.ts` | `OK` — 51 assertions |
| `npx tsx scripts/test-au10-source-load-notification-boundary.ts` | `OK` — 17 assertions |
| `npx tsx scripts/test-les1-global-feedback.ts` | `OK` — 48 assertions |
| `npx tsx scripts/test-les2-notification-experience.ts` | `OK` — 52 assertions |
| `npx tsx scripts/test-les5-interaction-system.ts` | `OK` — 112 assertions |
| `npx tsc --noEmit` | exit `0` |
| `git diff --check` | exit `0` |

### P.2 Contratos AU10 obsoletos reparados en RX1 B2

| Contrato anterior | Diagnóstico | Contrato vigente certificado |
|---|---|---|
| `test-au10-operational-workspace.ts` exigía el literal local `workspace-skeleton`. | LES1 sustituyó el skeleton específico por la primitiva compartida `FeedbackSkeleton`. El test seguía ligado a una clase accidental. | `Suspense` consume `FeedbackSkeleton`; la primitiva conserva status/live region/nombre accesible; AU10 prohíbe reintroducir un skeleton local y certifica estilos/motion de `feedback-skeleton`. |
| `test-au10-editorial-error-states.ts` exigía `Reintentar` directamente en `ActivityCenter`. | LES5 reemplazó el retry paralelo del diagnóstico Telegram por una única capability de refresh. El retry de delivery ya pertenece a `NotificationDeliveryStatus` y al Notification Store según LES2. | El test certifica refresh LES5 para diagnóstico, una única superficie `NotificationDeliveryStatus`, retry sólo cuando `status === failed`, delegación al Notification Store y ausencia de retry duplicado en Activity. |

RX1 B2 modificó únicamente los dos tests obsoletos y esta evidencia documental. El runtime no cambió. Tras la regresión LES1/LES2/LES5/LES8, AG1/AG2, AU10 y Review, la certificación global de RX1 puede pasar formalmente a `PASS`; RX1 continúa pendiente de revisión conjunta y no se declara cerrada.

## Q. Límites y efectos

- No se ejecutaron escrituras en Sanity ni llamadas de red.
- No se creó store, executor, planner, loop, migración ni autoridad nueva.
- El runtime AU2–AU10 no se modificó.
- LES1–LES8, AG1 y AG2 no se modificaron.
- Artefactos RX1 B2: dos contratos de test actualizados y este apartado de resultados.

RX1 queda deliberadamente pendiente de revisión conjunta; este documento no declara la fase cerrada.
