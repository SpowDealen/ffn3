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

## AU4 · Inspection boundary

La frontera `globalResolution/inspection` permite observar efectos externos mediante adaptadores concretos de sólo lectura. Un inspector es distinto de un executor: declara identidad y versión, evalúa compatibilidad y devuelve observaciones factuales; no contiene políticas de ejecución, no produce efectos y no decide el assessment de reconciliación.

### Contrato y ejecución explícita

`GlobalResolutionInspectionRequest` liga la consulta a `caseId`, productor, capability, `operationId`, fingerprint de la operación, fingerprint del checkpoint y versión del caso. El subject opcional sólo transporta IDs, identity keys, referencias esperadas, origen y fingerprints necesarios. No admite documentos o payloads completos como resultado.

`GlobalResolutionEffectInspector` expone `supports` e `inspect`. Las dependencias concretas quedan cerradas sobre el adaptador al registrarlo; el contexto universal sólo entrega reloj y señal de cancelación. No existe cliente, query o lector genérico de Sanity en el contrato.

La inspección requiere una llamada explícita a `GlobalResolutionInspectionService.inspect`. No se registra desde React, no usa `useEffect`, no participa en render, recovery, inicialización o simulación y no se dispara por detectar `reconciliation_required`.

> Un inspector puede observar un efecto, pero nunca producirlo, repetirlo ni repararlo.

### Registro y selección

`GlobalResolutionInspectorRegistry` es una instancia controlada e inyectable, separada del registro de executors. Almacena una fachada congelada con ID, versión y métodos ligados; rechaza IDs duplicados y no conserva estado de ejecución ni propiedades adicionales que pudieran exponer dependencias.

La selección evalúa todos los inspectores, ordena por especificidad y exige un único máximo. Un empate se clasifica como ambiguo, nunca se resuelve por orden de registro. Un `inspectorId` explícito debe existir y ser compatible. La incompatibilidad distingue productor, capability, subject o versión no soportados.

### Evidencia y fingerprints

La evidencia normalizada clasifica `observed`, `not_observed`, `ambiguous`, `unavailable` o `unsupported`. Sus observaciones se limitan a existencia o ausencia de entidad y referencia, coincidencia o diferencia de fingerprint, candidatas múltiples e indisponibilidad del servicio.

La normalización:

- elimina campos no reconocidos;
- deduplica y ordena observaciones;
- ordena candidate IDs y warnings;
- reduce mensajes a texto seguro;
- vuelve a ligar inspector, productor, capability, operación y checkpoint desde la solicitud validada.

El fingerprint incluye inspector y versión, productor, capability, operación y sus fingerprints, estado, observaciones y warnings normalizados. Excluye `inspectedAt`, inspection ID, orden accidental, stacks, timestamps externos y mensajes técnicos no normalizados. Una evidencia obtenida para otro checkpoint u operación produce otro fingerprint y no puede reutilizarse.

> La evidencia externa no sustituye la concurrencia optimista: sólo es válida para la versión, checkpoint y operación que fueron inspeccionados.

### Servicio, concurrencia y privacidad

Antes de consultar, el servicio vuelve a leer el `ReviewCase` y comprueba versión, productor, checkpoint, operación, fingerprint y que el nodo no esté ya completado. Solicitudes idénticas concurrentes comparten una única lectura. Cancelación, ambigüedad, incompatibilidad, conflictos y fallos se devuelven como errores seguros y tipados.

El servicio no escribe en `ReviewCase`, checkpoint, historial ni store y no ejecuta reconciliación. Tampoco llama capabilities, producers, resume, mutations, `fetch`, `saveDraft` o clientes Sanity.

La solicitud y las dependencias son efímeras. La evidencia se devuelve al caller y no se persiste automáticamente en este bloque. No se guardan tokens, headers, authorization, cookies, clientes, queries, variables de entorno, documentos completos, payloads, respuestas del proveedor o stacks.

### Adaptación a reconciliación

`inspectionEvidenceToReconciliationEvidence` transforma hechos normalizados al contrato publicado por AU3. Sólo una observación positiva explícita produce `effect_confirmed`; sólo una ausencia explícita produce `effect_not_found`. Estados ambiguos o indisponibles producen evidencia insuficiente.

La adaptación no llama `assessReconciliation` ni repara el checkpoint. La reconciliación continúa funcionando únicamente con evidencia local y puede incorporar evidencia inspeccionada cuando un servicio superior la solicita explícitamente.

### Límites de AU4-B1

Este bloque define contratos, registro, compatibilidad, normalización, fingerprints, servicio, adaptación y fixtures. No implementa inspector Sanity real, UI nueva, capabilities, persistencia de evidencia, queries genéricas, mutations, ejecución automática ni soporte adicional de productores. El inspector concreto de Sanity queda reservado para AU4-B2.

## AU4 · Sanity inspection adapter

`sanity:external_news-effects@1.0.0` es el primer adaptador real de inspección. Su alcance está cerrado al productor `external_news` y a tres postcondiciones: creación de luchador, existencia del documento asociado al resume y referencia noticia-luchador. No amplía capabilities ni executors y no modifica la ejecución publicada.

> El inspector de Sanity no acepta consultas arbitrarias: sólo puede verificar postcondiciones previamente definidas por el dominio.

### Transporte y consultas cerradas

Se eligió una API interna Next.js (`POST /api/review/global-resolution/inspect`) porque el runtime del laboratorio es Vite y no puede recibir un cliente Sanity ni credenciales. El cliente del laboratorio sólo acepta la unión discriminada `fighter_by_identity`, `news_document` y `news_fighter_reference`; el parser rechaza claves adicionales, campos dinámicos, GROQ, projection, dataset, project ID, API version, headers y token.

El endpoint limita el body a 8 KiB, restringe origins del laboratorio, desactiva caché y devuelve errores genéricos. Construye el cliente únicamente en servidor con configuración de entorno y ejecuta tres constantes GROQ internas. No devuelve query, configuración, documento, cuerpo editorial, stack ni respuesta completa. Usa exclusivamente `fetch` de Sanity; no contiene create, patch, mutate, delete, transaction, publish o `saveDraft`.

La factory `createSanityInspectionHttpReader` no ejecuta requests al importarse, propaga `AbortSignal`, no reintenta y omite credenciales del navegador. Tests y runtimes servidor pueden inyectar directamente un `SanityExternalNewsReadExecutor` con los mismos métodos cerrados.

### Capabilities y evidencia

Para `create:luchador`, el adaptador exige expected ID o identity key `fighter:<slug>`. La lectura proyecta sólo ID y campos necesarios para reconstruir el payload Sanity validado. Una coincidencia inequívoca produce `entity_exists`; cero produce `entity_missing`; varias coincidencias plausibles producen `multiple_candidates`. Una identidad o fingerprint incompatibles nunca se promocionan silenciosamente a éxito.

Para `resume:external_news`, el subject debe contener el document ID registrado. La consulta considera el ID solicitado, su variante `drafts.<id>` y su ID publicado, pero conserva el ID realmente observado. Draft y publicación equivalentes se deduplican conceptualmente; contenidos incompatibles producen ambigüedad. La proyección editorial se reduce a título, extracto, texto plano normalizado, fecha, fuente, imagen, disciplina, organización, evento, luchadores y destacada.

El fingerprint de noticia calcula una versión semántica con referencias ordenadas y una versión compatible con el orden del payload AU3. Si el fingerprint persistido coincide con cualquiera, la evidencia conserva exactamente esa coincidencia. Así no se cambia el algoritmo de checkpoints existentes. `_rev`, `_updatedAt`, `_createdAt`, keys de Portable Text y timestamps de inspección quedan excluidos.

Para `replace_reference:noticia:luchador`, el único campo aceptado externamente es `luchadores`, traducido internamente al schema fijo `luchadoresRelacionados`. El inspector comprueba exclusivamente si el documento existe y contiene el fighter ID esperado. No acepta paths ni fields arbitrarios.

> La existencia de un documento no demuestra por sí sola que una operación concreta lo haya creado; la reconciliación exige identidad, contexto y fingerprints coherentes.

### Runtime, concurrencia y reconciliación

`createExternalNewsInspectionRuntime` crea un registro aislado, registra el inspector, construye el servicio universal y expone la adaptación pura hacia reconciliación. Sus dependencias —lector, case reader y reloj— son explícitas y efímeras. Construirlo no consulta Sanity; no se registra desde React ni `useEffect` y sólo una llamada explícita a `service.inspect` produce una lectura.

El servicio vuelve a verificar versión, checkpoint, operation ID, operation fingerprint y estado del nodo antes y después de la lectura. Una respuesta tardía queda descartada si el caso cambia. Solicitudes idénticas concurrentes comparten una lectura externa y no existe caché persistente ni reutilización automática de evidencia antigua.

La adaptación incorpora hechos Sanity al contrato AU3 sin ejecutar assessment ni reparar. La reconciliación local continúa siendo suficiente cuando ya posee evidencia fuerte. La evidencia externa puede confirmar create, resume o referencia sólo cuando aporta los IDs, identidad y fingerprints exigidos; ausencia, indisponibilidad o ambigüedad conservan las reglas AU3 y nunca fuerzan una conclusión nueva.

### Seguridad y límites

El endpoint puede usar `SANITY_API_READ_TOKEN` y, por compatibilidad con el despliegue existente, recurrir al token servidor ya configurado; nunca lo serializa ni lo entrega al laboratorio. Request, cliente, parámetros y resultados técnicos no se persisten en ReviewCase, checkpoint, historial o localStorage.

La evidencia final sólo contiene IDs, identity keys, fingerprints, presencia, ausencia, referencias, candidatas y warnings normalizados. AU4-B2 no añade UI, ejecución automática, mutations, persistencia de evidencia, retries, lector GROQ libre ni soporte para otros productores. La prueba real contra un dataset queda deliberadamente fuera de la regresión automática.

## AU4 · Explicit inspection controls

`GlobalResolutionControls` conserva un único panel de reconciliación y añade `Comprobar en Sanity` únicamente para operaciones `external_news` en `reconciliation_required` cuyo checkpoint está vigente y cuyo subject cerrado puede construirse desde dominio. Las capabilities admitidas siguen siendo `create:luchador`, `resume:external_news` y `replace_reference:noticia:luchador`; stale, invalid, completed, productores distintos y subjects incompletos no muestran la acción.

> La lectura externa sólo se inicia mediante una acción explícita del operador; abrir, recuperar o simular un caso nunca inspecciona Sanity.

### Confirmación, lectura y cancelación

Pulsar la acción sólo abre una confirmación inline en el mismo panel. El texto declara que la consulta es de sólo lectura y que no modifica ni repite la operación. `Cancelar` y Escape cierran la confirmación sin construir una request de red. Únicamente `Comprobar` captura caso, versión, checkpoint, operation ID y operation fingerprint actuales, crea un `AbortController` y llama al servicio AU4.

Durante la lectura el panel expone `aria-busy`, `Comprobando Sanity…` y `Cancelar comprobación`. Cancelar aborta el request, invalida el request gate y devuelve el estado efímero a idle; no cambia ReviewCase, checkpoint, historial o reconciliación. Cambiar de caso o desmontar el panel también aborta la lectura, pero ningún `useEffect` inicia inspecciones.

El servicio vuelve a leer el caso antes y después del adaptador. La UI realiza además una comprobación final de versión y checkpoint antes de construir el assessment. Una respuesta tardía, operation sustituida o checkpoint distinto se descarta con el mensaje `El caso cambió durante la comprobación`.

### Evidencia y assessment

El estado `GlobalResolutionInspectionUiState` vive sólo en React: idle, confirming, inspecting, succeeded o failed. Nunca se serializa. El resultado visible traduce observaciones a lenguaje de operador: entidad o referencia observada/ausente, payload equivalente/distinto, candidatas múltiples o servicio indisponible. IDs se abrevian y conservan el valor completo sólo en `title`; el layout usa `overflow-wrap: anywhere`.

El assessment continúa perteneciendo a `collectReconciliationEvidence` y `assessReconciliation`. La UI separa `Evidencia local` y `Evidencia de Sanity`, pero las combina antes de evaluar. No contiene reglas paralelas:

- `confirmed_succeeded` muestra `Efecto confirmado` y reutiliza `Reparar checkpoint`;
- `confirmed_not_applied` muestra `Efecto no aplicado` y reutiliza `Habilitar nuevo intento`, sin ejecutarlo;
- conflicto o insuficiencia mantienen la operación bloqueada;
- already reconciled no habilita acciones.

Iniciar una nueva lectura invalida el assessment visible anterior. Una evidencia AU4 sólo se entrega de nuevo a la acción AU3 al confirmar reparación o habilitación; la inspección aislada no añade history. La aplicación vuelve a comprobar versión, checkpoint y assessment fingerprint antes de persistir.

### Errores, accesibilidad y responsive

Fallo técnico, conflicto de contexto y assessment no concluyente se presentan por separado. Sólo fallos retryable ofrecen `Volver a comprobar`; nunca existe retry automático. Los errores usan alert y foco programático, los resultados usan status y foco, la confirmación admite Escape y teclado, y todos los botones quedan bloqueados durante el request salvo la cancelación explícita.

En viewport estrecho las acciones pasan a una columna y evidencias, IDs y fingerprints pueden envolver sin desbordamiento horizontal. El panel 4C2 permanece intacto y continúa ocultándose cuando existe checkpoint universal. AU4-B3 no añade modal global, segundo panel, formularios de query, escritura Sanity, capability, executor, resume automático ni persistencia de credenciales.

## AU4 · Fixture DEV de inspección

`GlobalResolutionControls` ofrece únicamente bajo `import.meta.env.DEV` el acceso discreto `Abrir fixture visual AU4`. El acceso no depende del productor, recovery o checkpoint del caso anfitrión. El modo fixture sustituye temporalmente el contenido del mismo panel; no crea un segundo panel ni modifica el `ReviewCase` recibido.

El fixture reproduce localmente `create:luchador` en reconciliación y permite recorrer `confirmed_succeeded`, `confirmed_not_applied`, `conflicting_evidence`, `insufficient_evidence`, `already_reconciled`, `technical_error`, `unsupported`, `stale_context`, productor ausente, productor ambiguo, versión incompatible, capability no soportada e inspector no disponible. La latencia simulada usa `AbortController`, invalida resultados obsoletos al cambiar de escenario y limpia timers al salir o desmontar.

No usa el store, `localStorage`, el endpoint de inspección, clientes Sanity, GROQ, tokens, `saveDraft`, resume ni executors. Las acciones reparables evolucionan exclusivamente una copia en memoria mediante `applyCheckpointReconciliation`, la misma transición pura del lifecycle AU3; nunca persisten ni ejecutan el nuevo intento.

## AU4 · Motor universal de reconciliación basada en evidencia

AU4-B4 convierte la reconciliación en un motor versionado que no conoce productores, inspectores ni capabilities concretas. El flujo universal es:

`request ligada al contexto → inspector seleccionado → evidencia normalizada → adaptación factual → assessment puro → acción permitida → transición AU3 confirmada`

`UniversalReconciliationAssessment@1.0.0` publica estado, operación, capability, inspector, resumen, razones, evidencia local y remota segura, acciones permitidas, bloqueos y fingerprints de contexto, evidencia y assessment. Sus estados son `confirmed_succeeded`, `confirmed_not_applied`, `conflicting_evidence`, `insufficient_evidence`, `already_reconciled`, `technical_failure`, `unsupported` y `stale_context`. Las únicas acciones declarativas son `repair_checkpoint`, `enable_retry`, `inspect_again` y `none`.

### Contratos y decisión pura

`UniversalReconciliationContractRegistry` registra contratos inyectables por capability. Cada contrato declara versión, campos de éxito requeridos, outcome seguro y condiciones de idempotencia. La selección concreta de `external_news` vive en `reconciliation/contracts/externalNews.ts`; añadir otro productor requiere registrar su constructor de request, inspector y contratos, no modificar el motor.

`assessUniversalReconciliation` es puro y determinista: no usa reloj, store, red, globals mutables ni nombres de dominio. Ordena y deduplica evidencia, redacta URLs y valores sensibles, descarta contenido no permitido y calcula fingerprints semánticos independientes del timestamp y del orden de entrada. La existencia aislada de un documento, un timeout o un ID sin identidad/fingerprint no confirman éxito.

La prioridad de decisión es segura: contexto obsoleto, falta de contrato, fallo técnico, estado ya reconciliado, conflicto, éxito demostrado, ausencia demostrada e insuficiencia. Evidencia positiva y negativa simultánea, candidatas múltiples o resultados incompatibles bloquean la aplicación.

### Orquestación, staleness y concurrencia

`UniversalReconciliationInspectionEngine` compone el servicio de inspección AU4 con el collector AU3 y el motor puro. Antes de evaluar liga `caseVersion`, `checkpointFingerprint`, `operationId`, `operationFingerprint` y `payloadFingerprint`; cualquier cambio produce `stale_context` con acción `none`.

Cada solicitud recibe una generación por caso y operación. Si dos comprobaciones se solapan, sólo la generación más reciente se acepta para presentación o aplicación, aunque el servicio haya compartido una lectura idéntica. Fallos de transporte se reducen a códigos seguros y producen `technical_failure`; no se filtran errores originales, stacks, URLs, tokens, documentos ni payloads.

### Aplicación e historial

La UI se limita a representar `summary`, `blockingReasons`, evidencia segura y `allowedActions`. No decide acciones comparando statuses. Tanto el panel real como el fixture DEV consumen el mismo assessment; no existe una tabla paralela de resultados simulados.

`applyConfirmedReconciliation` recarga caso y checkpoint, vuelve a recopilar y evaluar, compara versión, fingerprints y acción y sólo entonces reutiliza `applyCheckpointReconciliation`. `repair_checkpoint` no repite el efecto; `enable_retry` únicamente devuelve la operación a `ready`. Ninguna de las dos ejecuta capability, incrementa intentos o reutiliza autorización.

El lifecycle recibe una proyección explícita desde el adaptador concreto y no decide por nombres de capability. Los eventos `reconciliation_evidence_collected` y `reconciliation_applied` conservan inspector, capability, fingerprints de evidencia y assessment y acción aplicada. Una reparación equivalente es idempotente y no duplica historial.

### Auditoría de acoplamiento

El núcleo universal (`reconciliation/engine`, `reconciliation/service`, `inspection/universalRequest` y la transición `applyCheckpointReconciliation`) no contiene `external_news`, IDs de inspector Sanity ni las tres capabilities piloto.

Los acoplamientos concretos permitidos quedan clasificados así:

- `reconciliation/contracts/externalNews.ts` y `inspection/sanity/requestContracts.ts`: contratos/adaptadores de productor;
- `inspection/sanity/inspector.ts` y `inspection/sanity/types.ts`: adaptador de lectura Sanity cerrado;
- `externalNewsRuntime.ts`, `externalNewsApplication.ts`, `externalNewsResumeExecutor.ts` y `fighterReferenceResolution.ts`: integración piloto AU3;
- `inspection/devFixture.ts`: datos del fixture DEV;
- `capabilities.ts` y las etiquetas/compatibilidad piloto de `controlsModel.ts`: catálogo y presentación existentes;
- `checkpoint/fingerprints.ts` y las funciones de resume de `checkpoint/lifecycle.ts`: compatibilidad AU3 previa para snapshot y ejecución de resume, fuera de la decisión B4.

Ninguno de estos módulos concretos introduce una rama de assessment en el motor universal. La regresión inspecciona además las fuentes para impedir que esos nombres entren en el motor, el orquestador, el servicio, el builder universal o la transición de reconciliación.

### Límites

AU4-B4 no añade productores, capabilities, executors, mutations, retries automáticos, persistencia de evidencia completa ni una segunda ruta de guardado. `unsupported` y `technical_failure` son resultados explícitos, no excepciones promocionadas a éxito. La evidencia inspeccionada sigue siendo efímera; sólo se persiste su procedencia mínima al aplicar una transición confirmada.

### Validación visual

El fixture conserva los trece escenarios y está preparado para revisión manual en escritorio y viewport de 390 px. En esta sesión de Codex no existe Browser/Chrome automatizable: la detección disponible devolvió `[]`. Por ese motivo no pudo realizarse una inspección visual automática; el resultado visual queda pendiente de validación manual por el operador y no se presenta como comprobado por Codex.

> El motor universal sólo autoriza una transición cuando evidencia suficiente y contexto vigente demuestran el resultado; nunca ejecuta ni repite el efecto observado.

## AU4 · Registro universal de productores, capabilities e inspectores

AU4-B5 introduce `globalResolution/producers` como frontera declarativa entre un productor y los motores universales. Un alta nueva se compone de manifiesto, contratos de capabilities, bindings de adaptadores, bindings de inspectores y tests; el registro no contiene implementaciones, red, store, React ni efectos.

El flujo de descubrimiento queda:

`ReviewCase → resolución de productor → manifiesto versionado → capability compartida → binding estable → registro de implementación → AU2/AU3/AU4`

### Manifiesto y catálogo de capabilities

`GlobalResolutionProducerManifest` contiene `producerId`, `producerVersion`, `manifestVersion`, nombre visible, familia, tipos de caso, capabilities, adaptadores, inspectores, política de ejecución, compatibilidad y metadata segura. Sus arrays se normalizan, deduplican y ordenan antes de calcular el fingerprint. No se incluyen fechas de registro, funciones, clientes, queries, payloads o credenciales.

Cada `ProducerCapabilityManifest` referencia un contrato de `GlobalResolutionCapabilityCatalog`. El catálogo universal fija ID, versión, descripción, operation kinds, requisitos, evidencia esperada, inspección, reconciliación, autorización e idempotencia. Dos productores pueden declarar `create:luchador`, pero el catálogo rechaza versiones o semánticas incompatibles.

Las familias son clasificación y descubrimiento. No ejecutan políticas ni introducen branches de comportamiento.

### Registro y resolución

`GlobalResolutionProducerRegistry` es inyectable y determinista. Permite registrar, obtener y listar versiones; resolver productor por identidad o compatibilidad del caso; resolver capability, inspector y adaptador; crear contexto AU2; evaluar compatibilidad legacy y generar el binding AU3.

Registrar de nuevo el mismo manifiesto y fingerprint es idempotente. La misma identidad/version con otro fingerprint se rechaza. Si falta una versión explícita se devuelve `version_mismatch`; múltiples productores o versiones compatibles producen `ambiguous`, nunca selección por orden.

Los resultados de resolución son `resolved`, `unsupported`, `ambiguous`, `missing`, `version_mismatch` e `invalid_manifest`. Los casos previos se clasifican como `legacy_compatible`, `migration_recommended`, `migration_required` o `incompatible`. La lectura no modifica el store ni escribe los nuevos campos.

### Adaptadores e inspectores

El manifiesto conserva sólo IDs, rangos de versión, capabilities, operation kinds y prioridad. `GlobalResolutionProducerAdapterRegistry` mantiene por separado las implementaciones inyectadas. Selecciona la prioridad máxima compatible y bloquea empates.

Los bindings de inspector se validan contra IDs conocidos y la resolución operativa puede comprobar además la versión real en `GlobalResolutionInspectorRegistry`. La selección factual final continúa perteneciendo al registro AU4-B1; el registro de productores sólo declara qué inspector es compatible.

`external_news@1.0.0` queda descrito por el mismo contrato público. Declara creación de luchador, sustitución de referencia, validación de noticia y resume; enlaza case adapter, planner, tres executors, request builder de inspección, resolver de referencia, contrato de reconciliación, proyección de lifecycle y controlador UI. El manifiesto legacy AU3 se deriva de esta declaración para evitar dos fuentes manuales divergentes.

### Validación y seguridad

La validación pura detecta identidades y versiones inválidas, capabilities duplicadas o incompatibles, bindings huérfanos, implementaciones ausentes, prioridades ambiguas, dependencies circulares, modos contradictorios, reconciliación sin inspección, retry inseguro, autorización ausente y metadata sensible. Los errores impiden registrar; warnings e info se conservan en la fachada registrada para auditoría.

Los errores públicos contienen códigos normalizados. No incorporan el manifiesto original, valores sensibles, stacks ni detalles de implementación.

### Integración AU2, AU3 y AU4

AU2 obtiene `ProducerPlanningContext`: capabilities disponibles, operation kinds, dependencies y IDs de planner/executors. El planner sigue recibiendo operaciones universales y no importa el manifiesto.

AU3 persiste opcionalmente `producerManifest` dentro del checkpoint: productor y versión, versión/fingerprint del manifiesto, versiones de capabilities e IDs de adaptadores. Los checkpoints antiguos sin binding continúan como `legacy_compatible`. Recovery marca stale un checkpoint cuando desaparece el manifiesto registrado o cambia su versión/fingerprint; el lifecycle no decide por productor y conserva el binding original durante cada evolución.

AU4 resuelve el productor y el binding `inspection_request_builder` antes de construir la solicitud. El runtime concreto verifica también el binding del inspector y del contrato de reconciliación antes de conectar el servicio. El engine B4 permanece independiente del productor.

`GlobalResolutionControls` resuelve un `ui_controller` mediante la composición `producerControls.ts`, muestra nombre y versión seguros y ejecuta sólo la fachada seleccionada. Ya no importa funciones operativas del productor ni contiene una comparación `producer === "external_news"`. El fixture DEV muestra productor, versión, capability, inspector y compatibilidad para los estados resuelto, ausente, ambiguo, versión incompatible, capability no soportada e inspector no disponible.

### Auditoría de acoplamientos

La búsqueda de `external_news`, `external-news`, `UFC`, `ONE`, `BKFC`, `FEKM` y `official_sources` deja las apariciones concretas únicamente en:

- `producers/externalNews.ts`: manifiesto piloto;
- `externalNewsRuntime.ts`, `externalNewsApplication.ts`, `externalNewsResumeExecutor.ts`, `fighterReferenceResolution.ts` y `producerControls.ts`: implementaciones/adaptadores concretos y composición del controlador piloto;
- `inspection/sanity/*` y `reconciliation/contracts/externalNews.ts`: inspector, request builder y contrato concreto;
- `inspection/devFixture.ts`: fixture;
- `capabilities.ts`, `controlsModel.ts` y `checkpoint/fingerprints.ts`: catálogo legacy, compatibilidad de presentación/planificación y snapshot AU3;
- tests y documentación.

No existen esas cadenas en el registro universal, catálogo B5, validación, fingerprint, adapter registry, lifecycle, `GlobalResolutionControls`, planner universal, servicio de inspección ni engine B4.

### Límites y validación visual

B5 no registra todavía UFC, ONE, BKFC, FEKM u otras fuentes oficiales ni implementa sus controladores UI. Los adapter descriptors del manifiesto prueban identidad, selección y versión; las implementaciones reales continúan en sus registros existentes y sólo `external_news` está conectado end-to-end mediante la composición concreta de `producerControls.ts`.

## AU4-B6 · Validación multiproductor y cierre técnico

AU4-B6 demuestra el contrato universal con `validation_official_source@1.0.0`, un productor estrictamente `validation-only`, en memoria y limitado a DEV/test. Su familia declarativa es `official_sources`. No representa una fuente real, no incluye datos de organizaciones o personas reales y no consulta red, Sanity, APIs, localStorage ni secretos. Tampoco llama `saveDraft`, `resume`, publicación o executors.

El recorrido validado es el mismo para ambos productores:

```text
manifest
→ ProducerRegistry
→ capability catalog
→ adapter registry
→ operación y checkpoint universales
→ InspectionRegistry
→ evidencia factual normalizada
→ UniversalReconciliationInspectionEngine
→ assessment universal
→ applyCheckpointReconciliation
→ GlobalResolutionControls
```

Las diferencias quedan confinadas a composición, manifiesto, adapters, inspector, contrato de evidencia y fixtures. `validation_official_source` declara `create:luchador` y una operación estructural de cierre `resume:validation_official_source`, ambas exclusivamente de fixture. La creación puede planificarse, simularse, inspeccionarse y reconciliarse, pero no tiene modo `execute`. El inspector `validation:official-source-effects@1.0.0` acepta `AbortSignal`, no realiza IO y sólo devuelve observaciones factuales. El adapter `validationOfficialSourceEvidenceToReconciliationEvidence` se inyecta en el orchestrator; el inspector nunca decide el assessment.

### Matriz derivada

`deriveGlobalResolutionProducerSupportMatrix(registry)` calcula cada fila desde manifiestos, capabilities, bindings y políticas. No existe una tabla operativa paralela. La salida relevante validada es:

| Productor | Familia | Capability | Plan | Simulate | Execute | Inspect | Reconcile | Repair | Retry | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `external_news` | `external_news` | `create:luchador` | sí | sí | sí, real y autorizado | sí, Sanity | sí | sí | sí | `supported` |
| `validation_official_source` | `official_sources` | `create:luchador` | sí | sí | no | sí, simulado | sí | sí, memoria | sí, memoria | `validation_only` |

### Staleness, concurrencia e idempotencia

La identidad contextual completa contiene productor y versión, versión y fingerprint del manifiesto, versiones de caso y checkpoint, fingerprints de checkpoint, operación y payload, capability y versión, inspector y versión e `inspectionGeneration`. Cualquier diferencia semántica produce `stale_context`. El servicio rechaza además evidencia etiquetada para otro productor u operación y resultados de otra generación.

El servicio deduplica solicitudes idénticas en curso. El orchestrator mantiene generaciones por caso y operación; el fixture incrementa generación y aborta el request activo al cambiar productor o escenario y al desmontarse. Sólo la combinación actual de productor, operación, checkpoint y generación puede publicar resultado.

Registrar dos veces el mismo manifiesto o la misma instancia de inspector es idempotente; una definición distinta con el mismo ID continúa bloqueada. Assessment y evidencia conservan fingerprints deterministas. Repair repetido sobre un nodo `succeeded` y retry repetido sobre un nodo `ready` devuelven clones sin duplicar historial ni ejecutar operaciones.

### Fixture DEV y bundle productivo

El fixture visual único añade `Productor DEV` con `external_news` y `validation_official_source`, conserva el selector común de escenarios y muestra únicamente productor, versión, familia, capability, operation kind, adapter, inspector, support status, manifest fingerprint y generación. El cambio de productor reconstruye operación, plan, grafo, checkpoint y fingerprints efímeros.

`GlobalResolutionControls` carga el fixture mediante un `lazy import` protegido por `import.meta.env.DEV`. El módulo validation-only no se exporta desde el índice productivo. La inspección del build Vite confirma que ni el fixture, sus escenarios, su selector ni `validation_official_source` aparecen en los assets productivos.

### Auditoría de universalidad

La búsqueda final de `external_news`, `external-news`, `sanity:external_news-effects`, `validation_official_source`, `official_sources` y condiciones por productor clasifica las apariciones así:

- manifiestos, runtime, adapters, contratos e inspector Sanity de `external_news`: integración concreta permitida;
- `validationOfficialSource.dev.ts`, `devFixture.ts` y tests: composición DEV/test permitida;
- `externalNewsApplication`, `externalNewsRuntime`, `externalNewsResumeExecutor`, `fighterReferenceResolution` y `checkpoint/fingerprints.ts`: adapters y compatibilidad AU3 legacy explícita;
- `controlsModel.ts`: proyección legacy de etiquetas y catálogo del piloto, fuera del planner, grafo, simulación, lifecycle y engines universales;
- documentación: evidencia y límites.

No quedan IDs concretos ni ramas por productor en graph, planner, simulation, inspection core, reconciliation/assessment engine, ProducerRegistry, capability catalog, la transición `applyCheckpointReconciliation` o `GlobalResolutionControls`. `producerControls.ts` es la composition root concreta autorizada.

### Seguridad y límites

El segundo productor es sólo una prueba técnica: no habilita UFC, ONE Championship, BKFC, FEKM ni otras fuentes. No existe integración oficial real. La UI productiva sigue resolviendo únicamente productores con un `ui_controller` real registrado en su composition root. La validación visual automatizada no pudo realizarse porque Browser/Chrome devolvió `[]` en esta sesión; queda pendiente la revisión manual del operador en escritorio y 390 px.

### Cómo incorporar un productor nuevo

1. Definir ID estable, versión y alcance.
2. Declarar familia únicamente como clasificación.
3. Crear y validar el manifiesto.
4. Registrar sólo las capabilities realmente implementadas.
5. Registrar adapters versionados por responsabilidad.
6. Registrar un inspector cerrado y de sólo lectura.
7. Definir su contrato y adapter de evidencia.
8. Añadir tests contractuales, de fallos y seguridad.
9. Verificar la matriz derivada.
10. Probar todos los escenarios mediante el fixture aislado.
11. Auditar que planner, grafo, simulación, lifecycle, inspection, reconciliation y UI universal no hayan cambiado por reglas específicas.

## AU4 · Cierre

Los bloques B1, B2, B3, B3.5, B4, B5 y B6 quedan técnicamente cubiertos: inspección universal, inspector Sanity real de sólo lectura, UI común, fixture DEV, reconciliación universal, ProducerRegistry y validación multiproductor. La suite B6 contiene 78 casos y se ejecuta junto a la regresión completa AU2–AU4, TypeScript, builds Vite/Next y `git diff --check`.

La validación visual manual permanece pendiente. No existe Browser/Chrome automatizable en esta sesión de Codex (`[]`), por lo que no se presenta una inspección automática como realizada. El operador debe revisar escritorio y 390 px siguiendo el checklist del bloque.

## AU5-B1 · Universal Entity Identity Core

AU5-B1 introduce `review/entityIdentity` como núcleo puro, determinista y sin IO para resolver identidad antes de cualquier creación universal. No sustituye todavía los adapters ni executors AU2–AU4 y no consulta candidatos: recibe identidades y candidatos seguros ya construidos.

### Contrato discriminado

`UniversalEntityIdentity` es una unión por `entityType`:

```text
fighter | event | organization | discipline
weight_category | fight | news | result
```

Cada descriptor `1.0.0` conserva etiqueta original segura, campos normalizados con transformaciones, aliases, IDs externos, identity keys jerarquizadas, contexto específico, provenance y fingerprint. Alias e identificadores declaran versión, autoridad, confianza y verificación. Un valor textual sólo identifica externamente dentro de la combinación `entityType + source + namespace`.

No se almacenan documentos completos, payloads editoriales, clientes, consultas, funciones, tokens ni stacks. Los valores sensibles son redactados y los campos seguros tienen límites explícitos.

### Normalización

La capa compartida normaliza Unicode NFKC, invisibles, emojis decorativos, comillas, apóstrofes, guiones, puntuación, diacríticos, case y espacios, conservando `originalValue`, `normalizedValue` y códigos de transformación. Existen reglas acotadas para:

- acrónimos y aliases de catálogo;
- `vs`, `v` y `versus`;
- ediciones, ordinales y numeración romana;
- fechas;
- dominios y URL canónica sin tracking, AMP o host móvil;
- participantes sin orden;
- equivalencia kg/lb.

Las estrategias no aplican estas reglas ciegamente: disciplinas sólo aceptan catálogo/aliases explícitos y noticias nunca se fusionan por similitud de titular.

### Estrategias

`EntityIdentityStrategyRegistry` registra ocho estrategias independientes. El core sólo resuelve la estrategia por tipo:

- `fighter`: nombre completo, nombre/apellido, nickname, transliteraciones, DOB, nacionalidad y contexto deportivo;
- `event`: organización, edición, fecha, nombre base, main event, ubicación y URL oficial;
- `organization`: nombre oficial, siglas, histórico, dominio y contexto;
- `discipline`: catálogo y aliases explícitos, sin fuzzy agresivo;
- `weight_category`: límite convertido, disciplina, división, organización y reglamento;
- `fight`: evento y pareja ordenada de participantes, con categoría y fase como contexto;
- `news`: URL canónica, source ID, publisher, fecha y fingerprint de contenido;
- `result`: scope documental, evento/combate, participantes, ganador, método, ronda y tiempo.

Los conflictos duros —ID verificado, DOB, organización/edición, disciplina, límite, división, ruleset, evento, participantes, scope o método— prevalecen sobre cualquier score o parecido textual.

### Comparación y resolución

`compareEntityIdentity` devuelve decisión, score auxiliar, matched keys, evidencia de soporte/conflicto/ausencia, códigos tipados, confianza y fingerprints de entrada, candidato y comparación. El score nunca invalida un conflicto duro.

`resolveEntityIdentity`:

1. filtra el mismo tipo;
2. prioriza exactos;
3. acepta un único strong;
4. bloquea múltiples matches;
5. devuelve probable para revisión;
6. bloquea conflictos o candidatos incompletos;
7. sólo devuelve `create_new` si la búsqueda se declaró completada y `strategy.canCreate` confirma identidad mínima.

Sin `searchCompleted: true` nunca crea. Los candidatos de otros tipos se ignoran y nunca se comparan. `classifyEntityDuplicate` proyecta `canonical`, `duplicate`, `possible_duplicate` o `conflicting_duplicate` sin fusionar ni escribir.

### Fingerprints y provenance

Los fingerprints semánticos son estables ante orden de aliases/IDs, whitespace y Unicode equivalentes. No incluyen timestamps accidentales ni originales decorativos, pero cambian al variar tipo, contexto, authority, ID, key o campo relevante. La provenance conserva productor, fuente, campo, método, confianza y verificación; `observedAt` queda disponible como evidencia pero fuera de la identidad semántica.

### Fixture DEV

`entityIdentity/devFixture.ts` ofrece diez escenarios sintéticos en memoria para variantes de luchador, eventos, siglas y categorías kg/lb. No se exporta desde el índice productivo, no se integra en `GlobalResolutionControls` y no usa red, Sanity, localStorage, store o persistencia.

### Compatibilidad AU2–AU4

`resolveIdentityCapability(entityType)` prepara el contrato conceptual `resolve_identity:<entityType>`. El futuro guard de `create:luchador` será:

```text
detect entity
→ build identity
→ fetch candidates mediante adapter read-only
→ resolve identity
→ reuse / review / create
→ continue graph
```

B1 deja `currentMode: contract_only` y `modifiesExecutors: false`: no cambia planner, grafo, simulación, lifecycle, inspección, reconciliación ni executor real.

### Auditoría de deduplicación actual

La búsqueda de igualdad literal de nombre/título/slug e `includes(name)` clasifica el estado previo:

- **Segura y conservable:** `findActiveReviewCaseByDedupeKey` compara una clave ya construida; external-news batch usa source ID/URL; stores de outcomes y memoria deduplican por idempotency key; candidate generation filtra primero por tipo.
- **Parcialmente segura:** resolvers FEKM/ONE/BKFC usan catálogos cerrados de aliases y disciplina; funcionan en su adapter, pero carecen de contrato común, provenance y conflictos normativos.
- **Debe migrar:** `investigation/strategies` puntúa nombre y aliases; rutas de eventos/luchadores comparan listas normalizadas; pueden producir ambigüedad o colisiones entre homónimos.
- **Prioridad crítica:** `app/api/editorial-agent/entities` y `fighterCreationExecutor` dependen de nombre, slug, apodo y disciplina. El `create` vuelve a aceptar igualdad literal de nombre. No cubre DOB, authority namespace ni IDs incompatibles y puede reutilizar o crear incorrectamente.
- **Noticias:** source ID/URL es sólido; similitud editorial sin fingerprint de contenido debe permanecer sólo como probable.

AU5-B2 debe crear adapters read-only desde Sanity/fuentes hacia `EntityCandidate`, insertar `resolve_identity:luchador` antes de la creación y migrar primero el endpoint/editorial executor. Después deben migrarse eventos, categorías, combates y resultados, manteniendo los catálogos explícitos como provenance verificada.

### Límites

B1 no consulta Sanity, no busca candidatos, no fusiona documentos, no repara duplicados y no ejecuta creación. La traducción semántica libre sólo es válida como alias verificado aportado por catálogo/adapter; el core no inventa traducciones mediante fuzzy matching.

Browser/Chrome sigue sin estar disponible en esta sesión (`[]`). La comprobación automática visual no pudo realizarse. El fixture queda listo para validación manual en escritorio y 390 px, sin presentar esa revisión como completada por Codex.

> Incorporar otro productor ya no requiere modificar el registro, AU2, AU3, AU4, lifecycle o la UI común: requiere declarar contratos y registrar implementaciones compatibles.

## AU5-B2 · Universal Candidate Discovery

`entityIdentity/discovery` conecta el núcleo puro B1 con fuentes read-only de candidatos. Discovery encuentra, proyecta, limita y explica candidatos; B1 continúa siendo la única capa que compara y decide `reuse`, revisión, conflicto o `create_new`.

El request `1.0.0` contiene exclusivamente `entityType`, descriptor B1, contexto seguro opcional de productor/caso/generation, source, capability, estrategias declarativas, límites y fingerprint. Las fases ordenadas son IDs exactos, claves fuertes, nombre/aliases exactos, contexto y recall limitado. Los límites máximos cubren resultados por estrategia/total, estrategias, timeout lógico, aliases y claves.

`CandidateDiscoveryRegistry` es inyectable, idempotente y sin singleton. Resuelve por source, capability, tipo, `supports`, especificidad y prioridad; bloquea empates. El resultado serializable declara `complete | partial | truncated | unavailable | cancelled`, estrategias ejecutadas/omitidas, warnings, truncamiento y fingerprints de adapter, candidatos y resultado. Cero candidatos sólo autoriza creación cuando la búsqueda fue completa, no truncada y B1 considera suficiente la identidad.

### Piloto Sanity fighter

El adapter `sanity.fighter-candidates` sólo acepta `resolve_identity:fighter` y proyecta documentos `_type == "luchador"`. El schema actual ofrece:

| Campo B1 ideal | Campo real | Fallback / futuro |
| --- | --- | --- |
| nombre canónico | `nombre` | `nombreCompleto` se lee defensivamente si aparece |
| nickname | `apodo` | alias no verificado |
| slug | `slug.current` | evidencia contextual, no autoridad |
| aliases | ausente | proyección tolera `aliases` para migración futura |
| external IDs | ausente | proyección tolera `externalIds[{namespace,value}]`; nunca compara sin namespace |
| fecha de nacimiento | ausente | proyección tolera `fechaNacimiento`; migración recomendada |
| nacionalidad | `nacionalidad` | contexto |
| organización | `organizacion._ref` | ID mínimo |
| disciplina | `disciplina._ref` | ID mínimo |
| categoría | `categoriaPeso._ref` | ID mínimo |

La consulta GROQ es interna, fija, limitada y sólo proyecta esos campos. No acepta GROQ, clientes o payloads desde UI. El endpoint cerrado `POST /api/review/entity-identity/candidates` limita origen, body, tipo, estrategias y resultados, usa `no-store`, `AbortSignal`, perspectiva raw y un token exclusivamente read-only si está configurado. No contiene `create`, `patch`, `delete`, `transaction` ni `mutate`.

Published y `drafts.*` se agrupan por ID lógico. Se conservan variantes, estrategias y razones de deduplicación; si sus fingerprints de identidad difieren se emite un warning, sin elegir cuál conservar ni fusionarlos. La identidad draft se usa como representación determinista por ser la versión editorial visible, pero ambas quedan explícitas.

### Integración y concurrencia

`resolveDiscoveredIdentity` adapta candidatos a B1 y fuerza `searchCompleted: false` salvo estado `complete` no truncado. Expone `discovery_incomplete` o `discovery_unavailable` y `createAllowed` nunca elude a B1. `acceptsCandidateDiscoveryResponse` valida request/identity fingerprint, tipo, case version, producer y generation antes de aceptar respuestas tardías.

La capability queda preparada como:

```text
create:luchador
→ resolve_identity:fighter
→ discover candidates
→ resolve B1
→ reuse / review / create
```

B2 no modifica ni bloquea todavía `fighterCreationExecutor`. B3 debe sustituir su `checkDuplicate` por esta composición y mantener fallback seguro.

### Auditoría de deduplicación heredada

- `app/api/editorial-agent/entities`: `check_duplicate` busca por ID derivado, `lower(nombre)`, `apodo`, slug y filtra disciplina; `create` repite ID/nombre y puede reutilizar homónimos sin provenance, exhaustividad ni conflicto.
- `fighterCreationExecutor`: llama ese check y sólo distingue none/existing/ambiguous; una respuesta técnica incompleta no está modelada como exhaustividad.
- Rutas UFC/ONE/BKFC/FEKM: construyen listas locales y reutilizan por nombre/slug o aliases de catálogo; son útiles como hints/provenance, no como decisión universal.
- Builders/adapters: las igualdades normalizadas reducen duplicados triviales, pero no distinguen namespace ni conflictos de identidad.

B2 sustituye la búsqueda mediante un adapter común; B3/B4 deberá insertar el guard antes de crear sin reescribir todas las rutas simultáneamente.

### Fixture y límites

El fixture DEV ofrece modo in-memory controlado y metadatos del modo real explícito. El modo real nunca se ejecuta al cargar, no crea, modifica, persiste ni fusiona. B2 sólo implementa fighter; las otras siete entidades necesitan adapters y estrategias propios. No hay caché persistente ni efímera, no hay localStorage y no se efectúan consultas reales durante tests.

## AU5-B3 · Guard obligatorio de identidad

`globalResolution/identityGuard.ts` convierte `resolve_identity:fighter` en un predecesor duro y verificable de cualquier `create_entity:luchador`. `ensureFighterIdentityGuardOperations` normaliza tanto planes compilados como entradas artesanales: crea exactamente un nodo determinista por creación, conserva dependencias anteriores y añade el guard al `dependencyIds` de `create:luchador`. Repetir la normalización no duplica nodos ni edges.

El nodo usa `find_entity` como operación universal existente, pero se distingue mediante `scope: identity_guard` y la capability `resolve_identity:fighter`; no introduce un segundo sistema de operaciones. Su handler recibe `CandidateDiscoveryService` por inyección, construye B1 sólo desde el payload permitido, ejecuta B2 y deriva una decisión cerrada:

```text
complete + B1 create_new  → create_new
match inequívoco          → reuse_existing
varios/probables          → ambiguous
conflicto/insuficiencia   → blocked
partial/truncated/
unavailable/cancelled     → blocked
```

La autorización `1.0.0` conserva únicamente operation IDs, plan/case/producer/source, decisión y reason code, fingerprints de identidad/payload/request/discovery/context, IDs lógicos de candidatos, estrategias, warnings seguros, fecha de auditoría y caducidad determinista de 15 minutos. No contiene documentos, GROQ, clientes ni payloads de adapters.

### Checkpoint, lifecycle y recovery

El checkpoint canónico persiste `identityGuard` y lo incorpora a su fingerprint. `updateCheckpointAfterFighterIdentityGuard` revalida binding y fingerprint antes de cambiar el grafo:

- `create_new`: guard `succeeded`; creation pasa a `ready`;
- `reuse_existing`: guard y creation quedan `succeeded` con la referencia real, sin escritura;
- `ambiguous` o `blocked`: guard y creation quedan bloqueados con reason code seguro.

Una autorización repetida es idempotente. Recovery excluye `create:luchador` de `nextReadyOperationIds` si falta una autorización positiva o cambian plan, caso, versión, productor, operation IDs o fingerprint. Un checkpoint antiguo/manipulado puede seguir siendo legible, pero nunca concede ejecución por ausencia de prueba.

### Gate de ejecución

La protección se aplica en tres capas:

1. el grafo exige el predecesor;
2. lifecycle rechaza `markCheckpointExecutionStarted` y resultados de creación sin autorización vigente;
3. `extractFighterCreationUniversalPlan` exige la autorización y el executor vuelve a validar el token incluido en su efecto.

`externalNewsApplication` ejecuta discovery como acción read-only especial antes de solicitar autorización humana para la creación. Si el servicio/adapter falta o falla, devuelve bloqueo y no inicia el executor. Desde AU5-B4, `fighterCreationExecutor` sólo valida la autorización cerrada y persiste exactamente el payload autorizado; no contiene discovery, deduplicación, Sanity ni selección/reutilización de candidatos.

El patrón es extensible a otros tipos mediante capabilities equivalentes, pero B3 sólo activa `fighter → luchador`.

## AU5-B4 · Autoridad única antes de crear

La decisión de identidad queda separada de la integridad de escritura:

| Responsabilidad | Autoridad |
| --- | --- |
| Normalizar identidad y decidir `create_new`, `reuse_existing`, `ambiguous` o `blocked` | B1/B2 mediante `resolve_identity:fighter` |
| Imponer el predecesor duro | planner y grafo B3 |
| Validar autorización, binding y caducidad | gate, dispatcher, executor y límite HTTP |
| Persistir el documento autorizado | `fighterCreationExecutor` |

El token enlaza plan fingerprint, caso/versión, productor, guard, operación de creación, fingerprint del payload fuente, decisión, discovery completo y vencimiento. El executor vuelve a comparar esos campos con el plan universal y deriva el payload Sanity mediante la validación de esquema existente. Token ausente, alterado, vencido, de otra entidad/operación o con decisión distinta de `create_new` bloquea antes de invocar el gateway.

`fighterCreationExecutor` ya no llama `checkDuplicate`, discovery ni una consulta editorial. Realiza una sola llamada de persistencia con autorización y contexto. `alreadyExisted` o una colisión del ID determinista se convierten en `persistence_conflict`: no se busca un homónimo, no se elige candidato y no se devuelve `reused_existing`. Ese outcome sólo nace antes, cuando el guard resuelve una referencia canónica y el grafo omite la escritura.

### Límite HTTP y rutas heredadas

`POST /api/editorial-agent/entities` devuelve `identity_guard_required` para `check_duplicate`. La acción `create` exige token y binding B3, reconstruye el payload persistente desde el payload fuente autorizado, valida referencias y ejecuta `client.create` sobre un ID determinista. Una respuesta 409 del backend es una defensa de integridad `persistence_conflict`, no una segunda decisión de identidad.

La materialización preparada anterior conserva su deduplicación para tipos ajenos aún no migrados, pero bloquea `entityType: fighter` antes de `checkDuplicate` o `createEntity`. Las rutas de importación directa UFC, ONE, BKFC y FEKM que creaban `_type: luchador` quedan cerradas con `identity_guard_required`; su implementación se retiene temporalmente sólo como referencia para migrarlas al planner/gate universal y no es alcanzable desde sus handlers POST. No existe flag, request parameter ni modo administrativo que reactive esas escrituras.

En consecuencia, las búsquedas por nombre, slug, alias, disciplina o ID externo sólo pueden aportar candidatos read-only dentro de B2. El executor y el endpoint de escritura no pueden convertirlas en crear/reutilizar. Las rutas de categorías, eventos, combates y otras entidades no-fighter permanecen fuera del piloto AU5 y conservan su comportamiento.

## AU5-B5 · Intake canónico de productores fighter

UFC, ONE, BKFC y participantes FEKM ya no conservan un handler alternativo de escritura. Sus rutas `create-fighters` / `participants/create` son ahora bordes de intake: fijan el productor en servidor, limitan el body, validan una proyección mínima y devuelven `202 planned`. No importan Sanity, discovery, el dispatcher ni `fighterCreationExecutor`.

El contrato interno versionado `fighterResolutionIntake` admite nombre original, normalización B1, aliases limitados, ID externo con namespace, disciplina, organización, categoría opcional y una referencia estable de origen. Rechaza productor, capability, operación, entidad, GROQ, cliente, token/autorización, campos arbitrarios y payloads sobredimensionados. Los namespaces son `ufc:fighter`, `one:fighter`, `bkfc:fighter` y `fekm:athlete`.

La idempotencia se deriva de la proyección semántica completa:

```text
fighter-resolution:<producer>:<requestFingerprint>
```

Cada procedencia mantiene su propio caso; dos productores no fusionan personas en el borde. El mismo request reconstruye el mismo `requestId`, `caseId`, plan, guard y operación. `registerCanonicalReviewCase` localiza por ID/dedupe y bloquea colisiones incompatibles; el registro de UI conserva el caso en el store existente y crea su checkpoint universal mediante el lifecycle AU3. No existe un segundo job store.

El planner incorpora `completionMode: entity_resolution` para este caso acotado. Omite referencia y reanudación de productor, pero mantiene exactamente:

```text
validate:luchador_prepared
→ find:luchador
→ resolve_identity:fighter
→ create:luchador
```

El lifecycle considera completado un grafo sin nodo resume cuando todos sus nodos obligatorios han terminado. Recovery, fingerprints, autorización B3, dispatcher y executor siguen siendo los comunes. El productor sólo registra intención: nunca marca creation como ready, ejecuta discovery ni aporta un token.

Los manifiestos universales `ufc_events`, `one_events`, `bkfc_events` y `fekm_participants` declaran las capabilities compartidas de guard y creación, además del mismo binding de lifecycle/controles. Candidate Discovery se ejecuta desde los controles comunes mediante el endpoint read-only B2; únicamente `create_new` completo y vigente habilita el executor. `reuse_existing`, ambigüedad, conflicto, parcial, truncado, indisponible o cancelado quedan visibles en el checkpoint sin escritura compensatoria.

`PanelIA` proyecta el contexto ya resuelto por cada importador, registra las propuestas y muestra “Resolver identidad del luchador”. Las automatizaciones se detienen en ese punto y no continúan a combates como si hubiera creación inmediata. FEKM transporta disciplina, organización y categoría ya resueltas, y distingue `participantsPlanned` de `participantsCreated` (que permanece en cero durante intake).
## AU5 · Bloque 5 · Duplicados existentes

AU5 B5 añade `review/entityReconciliation` como dominio universal y estrictamente read-only. El corpus se obtiene sólo mediante una acción POST explícita, una capability cerrada, consultas GROQ internas fijas y lotes limitados. La proyección conserva únicamente identidad, contextos fiables, variantes draft/publicado, fingerprints, provenance e impacto relacional resumido; nunca documentos completos, consultas, clientes o credenciales.

Los tipos reales inspeccionados son `luchador`, `evento`, `organizacion` y `categoriaPeso`. Sus IDs `drafts.<id>` y `<id>` se consolidan bajo el mismo `logicalId`. En el modelo actual, los IDs externos no son campos comunes de esos cuatro schemas; el contrato los admite de forma namespaced para integraciones presentes/futuras, pero las reglas reales siguen siendo conservadoras cuando faltan. Luchador dispone de nombre, apodo, slug, disciplina, organización y categoría; evento de nombre, slug, fecha, organización, disciplina, recinto, ciudad y país; organización de nombre, slug, país, web y disciplinas; categoría de nombre, slug, disciplina, modalidad, edad, sexo, tipo/límite/unidad de peso.

Los perfiles declaran campos, estrategias, pesos explicables y vetos específicos. El detector bloquea primero por ID externo, alias, slug o nombre normalizado; impone límites de bloque y de grupos; deduplica parejas; y sólo une componentes si ninguna relación cruzada tiene un conflicto bloqueante. IDs externos iguales elevan prioridad, pero el estado nunca pasa de `candidate`. Fechas u organizaciones incompatibles en eventos, IDs/disciplinas incompatibles en luchadores, país/dominio incompatibles en organizaciones y disciplina/rango/sexo incompatibles en categorías producen `blocked`, no una reconciliación automática.

Cada grupo crea determinísticamente un `ReviewCase` del módulo `entity.reconciliation`. Su checkpoint versionado vive en `context.entityReconciliation`, reutilizando el store, persistencia, lifecycle y control de concurrencia existentes. El fingerprint liga reglas, scope, estado de lectura, snapshots, parejas, canónico propuesto e impacto. Cambiar cualquiera de esos elementos vuelve obsoleta la evidencia. Las acciones `confirm_duplicate`, `mark_not_duplicate`, `defer` y `request_rescan` requieren actor, case ID, versión y fingerprint vigentes; el canónico debe pertenecer al grupo. Sólo una decisión humana puede producir `confirmed_duplicate`, y su único resultado es un plan propuesto y sin efectos.

El impacto relacional se calcula mediante conteo y muestra limitada de `references()` en la misma lectura fija. Se distingue `known`, `estimated`, `unavailable` y `truncated`; cualquier impacto o scan incompleto bloquea un futuro plan ejecutable. Las dependencias reales consideradas son combates (evento, luchadores, ganador y categoría), noticias (organización, luchadores y evento), eventos (organización) y luchadores (organización/categoría). B5 no toca el guard `resolve_identity:fighter`, no emite `create_new`, no acuña autorizaciones y no añade scans al intake UFC, ONE, BKFC o FEKM.

El Centro de Revisión incorpora el launcher manual y el panel del caso: miembros, variantes, señales, conflictos, canónico razonado, impacto, lectura, versión/freshness y decisiones. Los endpoints aceptan bodies pequeños y cerrados, aplican `no-store`, CORS limitado, `AbortSignal` y errores sanitizados. No hay scans al importar, al cargar la UI ni durante tests ordinarios; los fixtures usan un adapter in-memory.

## AU5 · Bloque 6 · Validación transversal

B6 valida el recorrido completo de reconciliación con fixtures centralizados para los cuatro schemas reales. No añade capacidades de escritura. La matriz se deriva de implementaciones conectadas y cubiertas por pruebas, no de la mera existencia de tipos:

| Entidad | Schema | Contrato de identidad | Discovery Sanity | Scan histórico | Impacto | Decisión humana | Creación guardada | Intake canónico |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luchador | `luchador` | soportado | soportado, sólo fighter | soportado | soportado | soportado | soportado mediante `resolve_identity:fighter` | UFC, ONE, BKFC y FEKM |
| Evento | `evento` | soportado | sólo contrato, sin adapter | soportado | soportado | soportado | fuera de alcance | fuera de alcance |
| Organización | `organizacion` | soportado | sólo contrato, sin adapter | soportado | soportado | soportado | fuera de alcance | fuera de alcance |
| Categoría | `categoriaPeso` | soportado | sólo contrato, sin adapter | soportado | soportado | soportado | fuera de alcance | fuera de alcance |

Las relaciones inspeccionables están declaradas y limitadas por perfil: luchador recibe referencias de los tres roles de `combate` y de `noticia.luchadoresRelacionados`; evento de `combate.evento` y `noticia.eventoRelacionado`; organización de `evento.organizacion`, `luchador.organizacion` y `noticia.organizacionRelacionada`; categoría de `combate.categoriaPeso` y `luchador.categoriaPeso`. Una proyección ausente o ilegible se presenta como `unavailable`; una muestra o lectura incompleta como `estimated`/`truncated`. Nunca se interpreta como cero impacto.

El harness B6 atraviesa request cerrada, adapter in-memory, perfil, fingerprint, detector, caso, checkpoint, store/lifecycle, action POST cerrada, estado visible y decisión humana. Repite el recorrido para los cuatro tipos, serializa y rehidrata casos, comprueba idempotencia y fuerza `stale` al cambiar revisión/snapshot o impacto. Los fixtures incluyen entidad única, candidato por ID externo, homónimo conflictivo, draft/publicado, campos incompletos, relaciones e input suficiente para límites/cursor.

La decisión queda ligada además a `entityKind`, versión del caso, versión de reglas y fingerprint del grupo. Un tipo, miembro, canónico, regla o caso manipulados se rechazan con `reasonCode` estable. Un checkpoint bloqueado, corrupto, stale o procedente de lectura incompleta no puede confirmarse; `request_rescan` permanece disponible para solicitar evidencia nueva sin efecto de contenido.

En UI se usan labels transversales para entidad, lectura y estado: posible duplicado, pendiente, no concluyente, bloqueado, confirmado por revisor, descartado, aplazado y evidencia obsoleta. El panel declara siempre que no hubo mutación. El launcher permite `all` limitado o `recent` de 180 días y nunca inicia IO al importarse o renderizarse.

Los estados operativos se interpretan así:

- `complete`: permite revisión; sólo `candidate`/`needs_review` pueden confirmarse humanamente.
- `partial` y `truncated`: conservan evidencia, pero bloquean conclusiones.
- `unavailable` y `cancelled`: no equivalen a ausencia de duplicados y no generan autorización.
- `stale`: invalida decisiones y planes anteriores; sólo permite solicitar un nuevo scan.

Un bloque futuro de ejecución necesitaría autorización propia, revalidación completa de referencias, estrategia de conservación campo a campo, idempotencia de escritura, rollback y auditoría. B6 no implementa ni preautoriza esa frontera.
