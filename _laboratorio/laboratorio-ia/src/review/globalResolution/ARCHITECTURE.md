# AU2 · Global Resolution Graph and Entity Operations

## Propósito

AU2-B1–B6 incorpora un lenguaje de dominio para describir y ordenar resoluciones editoriales, simularlas y ejecutar de forma controlada el piloto de `external_news` con luchadores. No convierte el centro de revisión en un sistema universalmente autocurativo.

`ReviewCase` continúa siendo la unidad persistida. `EntityOperation` expresa una intención editorial y `ResolutionGraph` ordena sus dependencias. El grafo se mantiene como proyección inmutable: AU2 no lo persiste dentro del caso.

Las entidades admitidas son las de `ContentTypeId`: `noticia`, `evento`, `luchador`, `combate`, `categoriaPeso`, `disciplina` y `organizacion`. `resultado` no tiene soporte.

## Capas implementadas

### Operaciones y grafo

`entityOperations` define operaciones editoriales universales, evidencia, condiciones, riesgo, confianza, capacidades e idempotencia. `resolutionGraph` valida dependencias, ciclos, orden topológico, readiness y estados terminales, incluidos `failed` y `reconciliation_required`.

Ambas capas son deterministas, serializables y puras. No importan React, UI, store, Sanity, APIs ni almacenamiento local. Sus fingerprints canónicos omiten campos temporales y estados de ejecución; cambian ante modificaciones de intención, dependencias, productor, versión de caso o políticas significativas.

### Planificador global puro

`buildGlobalResolutionPlan` recibe el caso y todas sus dependencias como datos inyectados: resoluciones, evidencia, entidades preparadas, productor, operación, política y registro de adaptadores. No consulta servicios ni estado global.

El plan conserva operaciones, grafo, blockers, warnings, supuestos, capacidades y claves deterministas. Evidencia insuficiente, candidatos ambiguos, snapshots obsoletos, relaciones ausentes y capacidades no disponibles bloquean explícitamente. Un plan bloqueado puede inspeccionarse y simularse para diagnóstico, pero no obtiene permiso de ejecución.

### Simulación y puente universal

`simulateGlobalResolutionPlan` usa candidatos, payload y contratos del productor inyectados. Proyecta efectos sin escribir y nunca llama a ejecutores. Los IDs `projected:*` solo existen en simulación y quedan rechazados antes de cualquier escritura real.

`adaptGlobalResolutionPlanToUniversal` conserva orden topológico, IDs, fingerprints y capacidades. Puede construir un candidato de `UniversalExecutionPlan`, pero no ejecuta automáticamente el grafo. La ejecución real usa planes universales reducidos y explícitos para cada frontera autorizada.

## Soporte real del checkpoint

Los únicos capabilities marcados `executable` son:

- `create:luchador`;
- `replace_reference:noticia:luchador`;
- `resume:external_news`.

`validate:noticia` permanece `simulatable`: valida de forma pura el payload reconstruido, sin declarar una escritura genérica.

El resto de capacidades conserva `contract_only` o `simulatable` según el registro. No existe soporte implícito por tener una operación tipada.

## Piloto de luchador y noticia externa

### Creación o reutilización

`fighterCreationExecutor.ts` acepta únicamente un plan universal reducido a una operación `create_entity` de `luchador`, extraída desde un plan global válido y una simulación con decisión `create_candidate`.

Antes de escribir vuelve a validar el borrador, rechaza cualquier `projected:*`, reconstruye el payload con el builder existente y consulta duplicados mediante el gateway ya disponible. Un candidato único se reutiliza. La creación usa una idempotency key derivada de identidad lógica y payload significativo; ejecuciones concurrentes equivalentes comparten promesa.

Un ID ausente, timeout, respuesta corrupta o postvalidación incierta produce `reconciliation_required`. Este estado se conserva en la ejecución universal y no se degrada a `failed`. No hay rollback destructivo.

### Referencia real y reconstrucción

`extractResolvedFighterReference` solo acepta una ejecución `succeeded`, resultado `created` o `reused_existing`, ID real, identidad y operación coincidentes y postvalidación satisfactoria.

`replaceProjectedFighterReference` sustituye exclusivamente el marcador ligado a la operación fuente. Conserva referencias reales previas, evita duplicados, no depende de posiciones y no muta el payload original. Repetir la misma sustitución devuelve `already_applied`.

`prepareExternalNewsResume` reconstruye el payload desde el snapshot vigente, valida caso, versión, plan, snapshot, referencias y noticia, elimina toda referencia provisional y proyecta el nodo de reanudación como `ready`. Su fingerprint no incluye fechas temporales.

### Autorización y reanudación

`authorizeExternalNewsResume` emite una autorización explícita ligada a caso, versión, plan, plan fingerprint y preview fingerprint. Un artefacto bloqueado, inválido o alterado no puede autorizarse.

`externalNewsResumeExecutor.ts` vuelve a validar artefacto, autorización, plan universal, grafo y ausencia de referencias `projected:*`. Delega en `executeExternalNewsResume`; no crea una segunda ruta de builder o guardado.

`executeExternalNewsResume` mantiene la única transición real `resuming → resumed/resume_failed`, llama al builder y `saveDraft` inyectados, registra outcomes y conserva la idempotencia del caso. Una reanudación ya confirmada devuelve `already_resumed`. La deduplicación universal impide que dos ejecuciones concurrentes equivalentes creen dos borradores.

Tras éxito se exige un ID de borrador o documento y un output de tipo `noticia` sin referencias provisionales. Fallos deterministas producen `failed`; timeouts, respuesta incompleta o fallo posterior al guardado producen `reconciliation_required` con datos para localizar el posible borrador.

## Implementado en B1–B6

- operaciones editoriales universales;
- grafo de resolución;
- planificador global puro;
- simulación universal;
- puente al plan universal;
- creación o reutilización segura de luchador;
- referencia real e idempotente;
- reconstrucción y validación de noticia;
- preparación de reanudación;
- autorización explícita;
- reanudación real de `external_news`;
- outcomes;
- reconciliación;
- idempotencia y concurrencia.

## No implementado

- ejecución automática completa del grafo;
- persistencia del grafo en `ReviewCase`;
- UI del grafo;
- creación de categorías;
- creación de organizaciones;
- creación de disciplinas;
- creación de eventos;
- creación de combates;
- actualización genérica de Sanity;
- merge;
- eliminación;
- imágenes universales;
- soporte para otros productores;
- rollback destructivo;
- soporte para `resultado`.

## Límite operativo

Toda escritura continúa dependiendo de un executor registrado, política explícita, simulación segura y postvalidación. Las pruebas de AU2 usan repositorios en memoria y dobles locales; no dependen de Sanity real.

## AU3-B1 · Checkpoint persistente y recuperable

`ReviewCase.globalResolution` es un campo opcional que conserva un checkpoint serializable del proceso global. No sustituye al plan calculado ni convierte el grafo almacenado en autoridad: al cargarlo siempre se valida su estructura, se reconstruyen plan y grafo, se comprueban fingerprints y se comparan con el caso y el entorno actuales.

### Datos persistidos

El checkpoint guarda:

- plan sin duplicar el grafo embebido, con operaciones, identidades, dependencias, blockers, política y capacidades;
- grafo reducido, ligado al plan mediante IDs de operación, con dependencias, estado persistible, resultados y errores resumidos;
- fingerprints de caso, snapshot, plan, grafo persistible y checkpoint;
- fase del proceso;
- resúmenes compactos de simulación y ejecución;
- historial acotado de eventos.

Los resultados del grafo solo conservan referencias y `outcome`. La ejecución solo conserva operación, capability, estado, intento, idempotencia, ID documental, error tipado y evidencia mínima de reconciliación.

No se persisten funciones, executors, builders, callbacks, promesas, señales, instancias de `Error`, conexiones, respuestas completas de APIs, estado de React, referencias al store, payload editorial duplicado, secretos ni autorizaciones ejecutables.

### Serialización y fingerprints

La serialización y deserialización son puras. Rechazan operaciones o nodos duplicados, dependencias o edges ausentes, ciclos, estados y support levels desconocidos, capabilities incompatibles, productores o versiones incoherentes y fingerprints alterados.

El fingerprint del caso usa su estado semántico y excluye el checkpoint, `version` y timestamps de actividad. El fingerprint del plan reutiliza AU2. El fingerprint persistible del grafo incorpora estructura, dependencias y estados, mientras su `intentFingerprint` conserva el fingerprint AU2. El fingerprint del checkpoint envuelve esos contratos y excluye timestamps de actualización, tiempos de eventos y referencias de memoria.

### Integración y migración

El store existente expone `setGlobalResolutionCheckpoint`, `updateGlobalResolutionCheckpoint` y `clearGlobalResolutionCheckpoint`. Las tres operaciones exigen versión esperada, actualizan inmutablemente el mismo `ReviewCase` y persisten por el repositorio actual. No existe un segundo store.

El checkpoint diferencia `caseVersion`, versión semántica usada para crear el plan, de `storedAtCaseVersion`, versión semántica contra la que quedó almacenado. Una escritura exclusiva de observabilidad no incrementa `ReviewCase.version`: hacerlo volvería obsoleto el propio plan sin que hubiera ocurrido una mutación de dominio. La escritura usa la versión esperada del caso y, al actualizar, el fingerprint esperado del checkpoint; rechaza carreras, otro caso, snapshot o estado semántico.

El schema del caso permanece en v1 porque el campo es opcional. La migración acepta casos antiguos sin checkpoint, valida los existentes y elimina únicamente el campo corrupto. No fabrica planes ni descarta el resto del caso.

### Recuperación y continuación

`recoverGlobalResolutionCheckpoint` es pura y recibe un catálogo serializable de capabilities y manifests de executors. No consulta registros ni ejecuta nada. Clasifica:

- `absent`: el caso no tiene checkpoint;
- `valid`: estructura, versiones, fingerprints y entorno coinciden;
- `stale`: el checkpoint era válido, pero cambió el caso, snapshot, capability, executor o estado del productor;
- `invalid`: el contrato está corrupto o es internamente incoherente.

Para un checkpoint válido se recalculan nodos ready, completados, bloqueados y en reconciliación. `canSimulate`, `canExecute` y `canResumeProducer` son indicadores, nunca disparadores. Una operación `reconciliation_required` conserva su estado, bloquea dependientes y evita repetir automáticamente el efecto.

Una autorización anterior no se guarda ni se reconstruye. Si la continuación alcanza una frontera ejecutable, `requiresAuthorization` vuelve a ser `true`; tras recarga, cambio de caso, plan, preview o checkpoint debe emitirse una autorización nueva.

> El checkpoint permite recuperar el proceso, pero siempre se valida contra el ReviewCase y las capacidades actuales antes de continuar.

### Límites de AU3-B1

Este bloque no añade UI, capabilities, ejecución automática, llamadas a Sanity, `fetch`, reanudación real, nuevos producers ni soporte para `resultado`. Tampoco cambia los executors de luchador o `external_news`.

## AU3-B2 · Lifecycle del checkpoint

El lifecycle conecta explícitamente los resultados ya validados de AU2 con el checkpoint. Mantiene tres capas:

- dominio: planifica, simula, ejecuta, resuelve referencias, prepara o reanuda;
- aplicación: proyecta el checkpoint siguiente a partir del resultado de dominio;
- persistencia: guarda la proyección por el store actual con optimistic concurrency.

El orden siempre es `operación de dominio → resultado validado → proyección → persistencia`. El lifecycle no llama executors, no reanuda productores, no crea autorizaciones y no accede a localStorage.

### Puntos de evolución

- `createCheckpointAfterPlanning` crea `planned`;
- `updateCheckpointAfterSimulation` registra el resumen y deja `simulated`, `blocked` o `ready_to_resume`;
- `updateCheckpointAfterExecution` registra resultados universales validados y proyecta dependientes;
- `updateCheckpointAfterReferenceResolution` conserva únicamente referencia real, outcome y fingerprint del payload resultante;
- `updateCheckpointAfterResumePreparation` registra preview, payload y snapshot fingerprints, referencias reales y validación compacta;
- `updateCheckpointAfterResumeExecution` sólo marca `completed` para `resumed` o `already_resumed` equivalentes, con grafo final y documento verificables;
- los estados inciertos permanecen en `reconciliation_required`.

Las funciones `recordCheckpointAfter*` son adaptadores opt-in. No envuelven ni disparan la operación de dominio: el caller les entrega el resultado cuando ya ocurrió.

### Resultado compuesto y conflictos

`GlobalResolutionLifecycleResult<T>` conserva `domainResult` y clasifica la persistencia como `persisted`, `conflict`, `failed` o `skipped`. Un efecto editorial que terminó correctamente continúa figurando como éxito aunque el checkpoint no se pueda guardar. En ese caso `canContinue` es falso y `regenerationRequired` obliga a recuperar o reconciliar antes de repetir.

No hay retries automáticos ante conflictos. La versión esperada detecta cambios del caso; el fingerprint esperado detecta otra evolución del checkpoint sobre la misma versión semántica. El historial nunca se mezcla a ciegas ni se degrada una reconciliación.

### Catálogo y recuperación integrada

`buildCurrentGlobalResolutionCatalog` toma snapshots serializables de los registros actuales de capabilities, executors y producers. Excluye funciones y dependencias y valida duplicados, ambigüedad, manifests, versiones, capabilities ejecutables sin executor y executors no declarados.

`recoverCurrentGlobalResolution` construye ese catálogo e invoca la recuperación pura de B1. Un resultado `stale`, `invalid`, un catálogo inválido o un producer ausente bloquean ejecución e indican `regenerationRequired`; no regeneran ni ejecutan nada. La autorización continúa siendo efímera y sólo se comunica mediante `requiresAuthorization`.

### Historial e idempotencia

El historial registra eventos compactos desde `planned` hasta `resume_completed`, conflictos, recuperación, stale y reconciliación. Usa IDs semánticos, orden cronológico, deduplicación y un máximo de 50 entradas. No contiene payloads, stacks, secretos ni autorizaciones.

Reaplicar la misma simulación, ejecución, referencia, preparación o resultado de resume devuelve el mismo estado semántico sin duplicar eventos, aumentar intentos ni cambiar fingerprints.

> El checkpoint registra el progreso validado del proceso, pero no provoca ni sustituye la ejecución de operaciones.

### Límites de AU3-B2

No se añaden capabilities, UI, stores, llamadas a Sanity o `fetch`, ejecución automática, autorizaciones persistentes, soporte para `resultado` ni cambios en la lógica de los executors AU2.

## AU3-B3 · Aplicación opt-in de `external_news`

`externalNewsApplication.ts` es el adaptador de aplicación del productor piloto. Carga el `ReviewCase` desde el store existente, valida el snapshot 4B, usa el planner, grafo y simulador AU2, proyecta el lifecycle AU3 y persiste con versión y fingerprint esperados. No contiene un segundo store ni desplaza lógica al dominio puro.

La inicialización distingue caso inválido, productor incorrecto, planificación estructuralmente bloqueada, checkpoint equivalente, conflicto, fallo y regeneración requerida. Un checkpoint válido equivalente devuelve `already_initialized`. Uno stale nunca se usa ni se reemplaza salvo que el caller indique `regenerateStale: true`.

La recuperación devuelve estado, continuación, siguientes operaciones ready, blockers, reconciliación, necesidad de regeneración o autorización y finalización. Abrir o recuperar un caso no llama ningún executor.

La simulación reconstruye el plan validado y persiste sólo su resumen. Las capacidades simulables se proyectan de forma pura. `validate:noticia` sigue siendo simulable: no tiene executor ficticio y su validación explícita sólo puede registrar éxito cuando el nodo está ready y el simulador devuelve un resultado válido.

### Manifests runtime

`externalNewsRuntime.ts` declara cuatro manifests JSON serializables y estables:

- `create:luchador`, executor `global-resolution.create-luchador.v1`;
- `replace_reference:noticia:luchador`, executor puro `global-resolution.replace-external-news-fighter-reference.v1`;
- `validate:noticia`, soporte `simulatable` y sin executor;
- `resume:external_news`, executor `global-resolution.resume-external-news.v1`.

Cada manifest declara identidad, capability, support level, operación, productor, versiones, requisitos y postcondiciones. `registerExternalNewsGlobalResolutionRuntime` registra productor y executors reales únicamente cuando la aplicación lo invoca. Importar el módulo no modifica registros.

`PanelIA` llama esa función dentro de un efecto dedicado exclusivamente al registro de dependencias. El efecto no inicializa casos, no simula y no ejecuta. El builder de noticia y `saveDraft` son exactamente los ya inyectados en 4C2.

### Ejecución explícita

`executeExternalNewsResolutionOperation` exige `caseId`, versión, fingerprint del checkpoint, `operationId`, contexto de idempotencia, dependencias runtime y autorización explícita para operaciones ejecutables. Verifica catálogo, manifest, versión, postcondiciones, dependencias y estado ready antes de usar el executor universal.

La creación reutiliza `createFighterCreationUniversalExecutor`; conserva deduplicación concurrente, idempotencia, `created`, `reused_existing` y `reconciliation_required`. Después de un éxito sólo desbloquea la referencia.

La referencia usa el executor universal puro. Reconstruye el payload desde el snapshot y el marcador determinista ligado a la operación creadora, exige ID real e identidad coincidente, elimina `projected:*` y persiste únicamente IDs, outcome y fingerprints. No guarda el payload editorial ni escribe en Sanity.

La preparación reconstruye de nuevo referencia y payload, valida caso, plan, snapshot, payload, preview y formulario y persiste `ready_to_resume`. No crea autorización ni guarda draft.

### Autorización y resume

`ExternalNewsGlobalResumeAuthorization` es efímera y queda ligada a caso, versión, checkpoint, plan, operación, preview, payload, intención, confirmación y expiración. Nunca forma parte del `ReviewCase`.

`authorizeAndResumeExternalNews` valida esa autorización y ejecuta el plan universal de resume. El executor universal reutiliza `executePreparedExternalNewsResume`, que a su vez delega en el único `executeExternalNewsResume` real de 4C2. Por tanto siguen existiendo un solo builder, un solo `saveDraft`, las mismas transiciones `resuming → resumed/resume_failed`, outcomes y notificaciones.

Si el draft se guarda y después falla o entra en conflicto la persistencia del checkpoint, el resultado conserva `domainResult.outcome = resumed`, marca `canContinue: false` y `reconciliationRequired: true`. No reintenta el resume. La recuperación posterior puede contrastar `ReviewCase.resumeExecution`, draft ID, idempotency key y estado del productor.

> La integración del productor external_news utiliza el checkpoint como registro recuperable, pero ninguna recuperación, planificación o simulación ejecuta operaciones por sí misma.

### Límites de AU3-B3

No se añaden capabilities, nueva UI de grafo, writes automáticos, otro contrato editorial, otro resume, tokens persistidos, payload editorial duplicado, Telegram, Sanity real en pruebas ni soporte para `resultado`. La integración visual se limita al registro de dependencias desde `PanelIA`.

## AU3-B4 · Controles operativos en el Centro de Revisión

`GlobalResolutionControls` se integra en `ReviewCaseDetails` únicamente para casos cuyo productor persistido es `external_news`. Se sitúa junto a la preparación de entidades y la preview de reanudación; no sustituye el Centro de Revisión ni crea una ruta nueva.

Al abrir el caso, un efecto React ejecuta exclusivamente `recoverExternalNewsGlobalResolution`. Esa recuperación es de lectura: no inicializa, no regenera, no simula, no crea autorizaciones y no llama executors. Importar o renderizar el componente tampoco produce efectos editoriales.

### Estados visibles

La interfaz representa de forma diferenciada:

- resolución no inicializada;
- checkpoint vigente e inicializado;
- simulado;
- bloqueado;
- operación lista o ejecutando;
- ejecución parcial;
- listo para reanudar;
- completado;
- stale;
- invalid;
- reconciliación necesaria;
- conflicto o fallo de persistencia.

El resumen muestra fase, recuperación, productor, versión, actualización, cantidades de operaciones, autorización y fingerprint abreviado. No muestra payload, JSON, fingerprints completos, stacks, tokens ni callbacks.

La lista usa etiquetas humanas para creación o reutilización del luchador, aplicación de referencia, validación y resume. Conserva capability e ID abreviado como diagnóstico secundario. Cada operación muestra dependencias, estado textual, blocker, outcome, identidad y documento abreviado cuando existen.

### Acciones explícitas

- `Inicializar resolución` construye el input desde las resoluciones y entidades preparadas del caso. No simula después.
- `Simular plan` ejecuta únicamente el simulador puro y aclara que no aplicó cambios.
- `Ejecutar` captura de nuevo caso, versión, checkpoint fingerprint y `operationId` exacto antes de invocar B3.
- `Validar noticia` usa la vía pura simulable y nunca se presenta como executor real.
- `Preparar reanudación` reconstruye y valida preview y referencias sin guardar.
- `Guardar borrador y reanudar` crea la autorización efímera sólo después de una confirmación explícita.

No existe ejecución por lote ni selección implícita de “la siguiente” operación. Terminar una operación sólo refresca la recuperación y deja que el operador elija la siguiente acción.

Para un checkpoint stale, `Regenerar resolución` exige confirmación y pasa `regenerateStale: true`; reemplaza únicamente el checkpoint y no simula ni ejecuta. Para uno invalid, la UI puede descartar el checkpoint mediante el store existente, con versión y fingerprint esperados y confirmación; conserva el `ReviewCase` y obliga a inicializar después.

### Resultado compuesto y reconciliación

La UI separa el resultado editorial de la persistencia del checkpoint. Un conflicto pide actualizar el caso. Si el efecto real terminó pero el checkpoint falló, muestra que la operación se realizó, prohíbe repetirla y exige recuperación. Un resume con guardado incierto o checkpoint fallido muestra un aviso prioritario equivalente y no reintenta.

Los warnings devueltos por `create:luchador`, incluido `post_creation_read_not_configured`, se muestran en el feedback de la acción. No se inventa una comprobación de Sanity que el runtime no haya realizado.

4C1/4C2 continúan disponibles sin cambios para casos que todavía no tienen checkpoint. Cuando existe un checkpoint universal, el panel legado se oculta y Resolución global muestra su propia preview resumida, validación y referencias; así no aparecen dos acciones de preparación o guardado. Ambos caminos reutilizan el mismo `executeExternalNewsResume`, builder y `saveDraft`; no hay doble guardado ni segunda confirmación.

### Concurrencia y accesibilidad

`GlobalResolutionRequestGate` permite una sola acción por componente, liga cada respuesta al `caseId`, rechaza doble clic y respuestas antiguas y se invalida al desmontar. Después de cada acción se vuelve a leer el store y se ejecuta recovery; no hay polling ni confianza exclusiva en estado optimista.

La sección usa `aria-busy`, botones con texto y `disabled` real, estados no dependientes sólo del color, `role=status` y `role=alert`, foco programático en errores prioritarios y controles nativos de teclado. La rejilla y la lista colapsan a una columna y los botones ocupan el ancho disponible en móvil.

> La interfaz sólo permite ejecutar una operación después de una acción explícita del operador y de validar nuevamente el caso, el checkpoint y sus fingerprints.

### Límites de AU3-B4

No se implementa diagrama, ejecución masiva, nuevas capabilities, otro store, otra ruta de guardado, polling, notificaciones nuevas, Sanity o Telegram en pruebas, autorización persistida ni soporte para otros productores o `resultado`.

## AU3-B5 · Reconciliación operativa asistida

La reconciliación separa cuatro pasos: recopilar evidencia, evaluarla de forma determinista, proponer un resultado y, sólo tras confirmación explícita, reparar el checkpoint. Nunca llama capabilities, executors, `saveDraft`, Sanity, `fetch` o Telegram.

`GlobalResolutionReconciliationCase` liga caso, versión, checkpoint, operación, capability, razón, evidencia, resultado propuesto y confianza. Las razones normalizadas son `domain_succeeded_checkpoint_failed`, `domain_succeeded_checkpoint_conflict`, `executor_timeout`, `executor_uncertain`, `resume_result_missing`, `existing_effect_detected`, `idempotency_conflict` y `postcondition_unverified`.

### Evidencia y evaluación

La evidencia es pequeña, tipada y serializable. Puede describir status u outcome del `ReviewCase`, document ID, resultado de resume, idempotency key, historial, referencia resuelta, fingerprints de snapshot, payload o preview, resultado del executor e inspección externa. Cada elemento conserva tipo, origen, operación, timestamp, resumen, confianza y sólo los IDs o fingerprints necesarios. Nunca incluye payload completo, respuesta de API, función, token, stack, `Error` o secreto.

La recopilación carga el caso vigente y su checkpoint, localiza la operación, añade evidencia local y de outcomes, normaliza, elimina inválidos y deduplica semánticamente. Es de sólo lectura. Un `GlobalResolutionEffectInspector` puede aportar evidencia externa tipada, pero es opcional, inyectado y sólo se invoca cuando la acción explícita lo solicita. No se registra al importar, montar o recuperar y no modifica documentos. No existe un inspector genérico de Sanity.

El assessment distingue:

- `confirmed_succeeded`: existe equivalencia suficiente y la reparación está permitida;
- `confirmed_not_applied`: una inspección concluyente demuestra ausencia y puede habilitarse un retry, nunca ejecutarlo;
- `conflicting_evidence`: hay fuentes concluyentes incompatibles o más de un documento posible;
- `insufficient_evidence`: faltan postcondiciones o vínculos suficientes;
- `already_reconciled`: el nodo y checkpoint ya contienen el resultado equivalente.

Una inspección fallida se convierte en evidencia insuficiente sin exponer el error. Un timeout, intento, caso `resolved` o document ID aislado nunca bastan.

### Resume y creación de luchador

Para `resume:external_news`, el éxito local exige `ReviewCase.resumeExecution.status = succeeded`, draft/document ID y la misma preview preparada para la operación. Esa preview liga el payload fingerprint persistido en `checkpoint.resume`. El caso crítico `saveDraft → resumed → checkpoint fallido` puede así repararse a nodo `succeeded`, resume `resumed`, grafo `succeeded` y fase `completed` sin autorización, executor o segundo guardado.

Una llamada incierta sin draft ID ni resultado queda `insufficient_evidence` y bloquea retry. Sólo evidencia externa concluyente de ausencia permite `confirmed_not_applied`.

Para `create:luchador`, el éxito exige outcome `created` o `reused_existing`, document ID real, identity key y payload fingerprint coherentes. Sin postinspección compatible y sin esa evidencia local fuerte se conserva `postcondition_unverified`. La reparación registra la referencia real y desbloquea dependientes, pero no marca la sustitución o el resume como completados.

### Reparación, concurrencia e idempotencia

`applyConfirmedReconciliation` vuelve a cargar el caso, comprueba versión, fingerprint de checkpoint, operación exacta y fingerprint del assessment, recopila otra vez la evidencia y exige el mismo resultado. Un assessment antiguo, evidencia cambiada o carrera se rechaza.

La reparación `confirmed_succeeded` modifica sólo checkpoint: nodo, outcome, document/reference ID, resumen de ejecución, dependientes, grafo, fase, fingerprints e historial. La reparación `confirmed_not_applied` conserva el intento, devuelve el nodo a `ready`, limpia el estado incierto y permite una acción futura; no incrementa intentos ni reutiliza autorización. El nuevo checkpoint fingerprint invalida cualquier confirmación anterior.

El historial usa eventos compactos de inicio, evidencia recopilada, resultado confirmado y aplicación, con IDs semánticos, orden cronológico, deduplicación y máximo 50. Repetir una reparación equivalente devuelve `already_reconciled` sin cambiar fingerprints, IDs, intentos, dependientes o historial.

Los resultados no resolubles conservan `reconciliation_required`, dependientes bloqueados y razones visibles. No existe una acción para que el operador declare arbitrariamente “ocurrió” o “no ocurrió”.

### Controles y límites

`GlobalResolutionControls` muestra `Reconciliación necesaria` sólo para nodos persistidos en ese estado o para el resume crítico cuyo caso está `resumed` pero cuyo checkpoint no alcanzó `completed`. `Comprobar resultado real` recopila y evalúa. Sólo un assessment confirmado presenta `Reparar checkpoint` o `Habilitar nuevo intento`, ambos con confirmación explícita. La UI resume tipo, origen, confianza, timestamp y valor; abrevia IDs y no muestra JSON.

La reconciliación devuelve hints estructurados para futuras notificaciones, pero no amplía Telegram. No añade capabilities, stores, rutas de guardado, retries automáticos, diagrama, productor, soporte para `resultado` ni lector de Sanity.

> La reconciliación nunca repite el efecto real: únicamente determina, mediante evidencia, qué ocurrió y repara el estado persistido cuando puede demostrarlo.

## AU3 · Cierre

AU3 convierte el plan universal de AU2 en un proceso persistente mediante `ReviewCase.globalResolution`. El checkpoint serializa plan, grafo, fase, resultados compactos, referencias, fingerprints e historial; se valida y recupera contra el caso, el snapshot y el catálogo runtime después de una recarga. Los casos antiguos continúan siendo compatibles porque el checkpoint es opcional y una entrada inválida se aísla sin descartar el resto del `ReviewCase`.

El lifecycle mantiene separadas operación de dominio, proyección del checkpoint y persistencia. Usa versión esperada y fingerprint esperado para optimistic concurrency, conserva el resultado real cuando falla la escritura del checkpoint y no incrementa la versión semántica del caso por una actualización exclusiva de observabilidad.

`external_news` es el único productor piloto conectado. Puede inicializar, simular, ejecutar una operación exacta, resolver la referencia real, validar la noticia, preparar el resume y solicitar una autorización efímera. La autorización nunca se persiste ni se recupera. El resume universal delega en el mismo `executeExternalNewsResume`, builder y `saveDraft` de 4C2; no existe una ruta alternativa ni doble guardado.

`GlobalResolutionControls` expone recuperación y acciones explícitas sólo para `external_news`. Representa absent, planned, simulated, ejecución parcial, ready, blocked, stale, invalid, completed y reconciliation, protege concurrencia y doble clic y no ejecuta capabilities al montar. El panel legado 4C2 se oculta cuando existe checkpoint universal para evitar controles duplicados.

La reconciliación recopila evidencia tipada, evalúa éxito, ausencia, contradicción o insuficiencia y repara únicamente el checkpoint tras confirmación. No repite el efecto, no reutiliza autorizaciones y no permite que el operador declare un resultado sin evidencia. El inspector externo continúa siendo opcional y no existe todavía una implementación real de Sanity.

La seguridad final confirma ausencia de ejecución automática, segundo store, nuevo cliente Sanity, `fetch` en checkpoint/lifecycle/reconciliación, tokens persistidos, payload editorial duplicado o capabilities accidentales. Permanecen fuera de AU3 otros productores, `resultado`, un inspector Sanity real, la visualización gráfica y la ejecución por lotes.

La validación visual de escritorio y viewport móvil fue realizada manualmente por el operador sobre `http://localhost:5173`. No existe Browser/Chrome automatizable en esta sesión de Codex —la detección devolvió una lista vacía—, por lo que no pudo realizarse una inspección visual automática. La regresión automatizada cubre además visibilidad, estados, acciones, loading, confirmaciones, responsive, accesibilidad, panel único y ausencia de autoejecución.

> AU3 convierte el plan universal de AU2 en un proceso persistente, recuperable, operable y reconciliable, sin introducir ejecución automática ni rutas alternativas de escritura.
