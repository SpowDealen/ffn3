# AU7 · Transaction Engine

## B1 · Núcleo transaccional lógico universal

Una transacción editorial AU7 no promete atomicidad física entre sistemas externos; promete ejecución lógica trazable, idempotente, recuperable y reconciliable. El núcleo B1 es puro: no importa clientes, no invoca executors, no persiste casos y no ejecuta operaciones.

## Auditoría AU2–AU6

La auditoría inicial encontró estas autoridades reutilizables:

- AU2 `EntityOperation` y `ResolutionGraph` ya contienen intención, dependencias, riesgo, evidencia, idempotency keys, orden topológico y readiness. `UniversalExecutionPlan` ya describe efectos y manifests de executor.
- `executeUniversalExecutionPlan` ya modela resultados `succeeded`, `failed`, `blocked` y `reconciliation_required`, postvalidación e idempotencia concurrente. Su compensación actual recorre resultados en orden inverso y llama compensators directamente; esa mecánica no constituye una política Saga universal y B1 no la invoca.
- AU3 `GlobalResolutionCheckpoint` y lifecycle ya son la autoridad de progreso del grafo, recovery, fingerprints, manifests, intentos, referencias, resultados inciertos e historial compacto. AU7 conserva su fingerprint como binding y no crea un store alternativo.
- AU4 sigue siendo la única autoridad para inspeccionar evidencia y resolver `reconciliation_required`. AU7 únicamente bloquea dependientes y representa la necesidad de inspección.
- AU5/AU6 siguen siendo autoridades de identidad, discovery y Creation Guard. La transacción conserva sólo el fingerprint del guard ligado a la operación de creación.
- ProducerRegistry, CapabilityCatalog y ExecutorRegistry ya resuelven producer/capability/executor por manifests. El helper de B1 consume esos registries de forma inyectada y no contiene ramas por productor.

El riesgo principal era mantener un segundo estado global independiente del grafo AU2/AU3. B1 evita esa duplicidad: `phase` se deriva de los estados de steps y se vuelve a validar al construir, evolucionar y recuperar checkpoints.

## Flujo

```text
GlobalResolutionPlan válido
  → UniversalTransactionPlan
  → TransactionStep[] ordenados topológicamente
  → readiness por dependencias
  → batch ejecutable declarativo
  → state machine pura
  → checkpoint compacto ligado a AU3
```

El builder rechaza un plan fuente inválido. No acepta payloads ni decisiones directas de UI. Mantiene operation IDs, dependency IDs, operation fingerprints, plan fingerprint, case/version, producer manifest, checkpoint fingerprint y Creation Guard fingerprints.

## Semántica transaccional

El contrato fija explícitamente:

- `atomicity: logical`;
- `consistency: domain_enforced`;
- `isolation: optimistic_fingerprint`;
- `durability: checkpoint_based`.

No es una transacción ACID. Los efectos pueden pertenecer a varios sistemas, ejecutores y políticas. La consistencia se obtiene con dependencias, validación de dominio, idempotencia, postcondiciones, checkpoints y reconciliación.

## TransactionStep y modos

Cada step referencia una operación AU2 por `operationId`; no copia su payload. Conserva capability, entity type, dependencias, mode, risk, autorización requerida, retry, reconciliación, compensación, binding de executor, idempotency key y fingerprints.

- `read_only`: find, resolve, reuse y validaciones puras;
- `pure_transform`: transformaciones locales reversibles, como reemplazar una referencia en memoria;
- `external_effect`: create, update, merge, persistencia, resume y cualquier operación que el binding declare como efecto.

Un efecto externo sin executor/version/manifest, políticas completas o reconciliación queda `unsupported_step`/bloqueado. Una creación sin guard fingerprint también queda bloqueada. No existe executor genérico.

## Estados

Los steps usan `pending`, `blocked`, `ready`, `executing`, `succeeded`, `reused`, `failed`, `reconciliation_required`, `compensating`, `compensated`, `compensation_failed`, `skipped` y `cancelled`. La tabla de transición es cerrada; `failed → succeeded` no existe. Retry y reconciliación deben devolver primero el step a un estado trazable permitido.

El estado global se deriva como `planned`, `blocked`, `ready`, `executing`, `partially_succeeded`, `reconciliation_required`, `compensating`, `compensated`, `failed`, `completed` o `cancelled`. Reconciliación prevalece y bloquea completion.

## Readiness, paralelismo y autorización

Readiness acepta dependencias `succeeded`, `reused` o `skipped`. Un fallo o resultado incierto bloquea sus dependientes con reason codes explícitos. `deriveExecutableBatch` devuelve todos los roots independientes listos en orden determinista; nunca los ejecuta.

La autorización es efímera. El plan persiste sólo `none`, `explicit` o `human_required`. El batch recibe una aprobación runtime ligada al transaction fingerprint y con caducidad; no se guarda token ni autorización reutilizable. Los steps sensibles exigen además `preExecutionValidationRequired` para reducir TOCTOU.

## Idempotencia y concurrencia

Cada step reutiliza la idempotency key AU2. El transaction fingerprint se deriva de case/version, source plan, steps, dependencias, fingerprints, políticas, blockers y bindings. Fechas y estado mutable no cambian su identidad semántica. Cualquier cambio en plan, operación, checkpoint AU3, manifest de productor o Creation Guard vuelve stale la transacción.

## Retry y reconciliación

Las políticas son `never`, `explicit_only`, `safe_idempotent` y `after_reconciliation`. B1 no ejecuta retries. Un timeout o error de red de un efecto que pudo ocurrir se clasifica como `reconciliation_required`, nunca como retry automático. AU4 debe confirmar éxito o ausencia antes de una transición posterior.

Un resultado incierto nunca se reintenta automáticamente cuando exista riesgo de repetir un efecto real.

## Saga y compensación

`deriveCompensationPlan` recorre el orden topológico inverso, pero decide cada acción por policy y estado. Distingue `none`, `logical_only`, `reversible_transform`, `explicit_compensator` y `manual_required`. Una reconciliación pendiente bloquea compensaciones inseguras.

La compensación no equivale a borrar efectos: cada capability debe declarar explícitamente qué compensación es segura. Un draft creado puede requerir compensación lógica o revisión manual; B1 no implementa deletes ni rollbacks físicos.

## Checkpoint y recovery

`UniversalTransactionCheckpoint` compone AU3 mediante `sourceCheckpointFingerprint`. Conserva transaction/source fingerprints, estados, intentos, referencias compactas, reason codes de reconciliación, estado de compensación, blockers e historial capped. No contiene payloads completos.

Recovery valida transaction, checkpoint y contexto actual; restaura steps completados/pending, conserva incertidumbre y deriva el siguiente batch. Una transacción completada no vuelve a ser ejecutable.

## Seguridad y límites B1

No se persisten tokens, headers, cookies, clientes, GROQ, documentos, payloads, stacks ni autorizaciones runtime. El core declara `writes: false`, `executes: false`, `automaticRetry: false` y `automaticCompensation: false`.

B1 no conecta el checkpoint transaccional al store, no modifica UI, no ejecuta Sanity, no automatiza el plan y no altera los executors existentes.

## B2 · Persistencia, recovery y multi-guard

AU3 sigue siendo la única autoridad persistida: `ReviewCase.globalResolution` contiene opcionalmente `transaction`. No existe `TransactionStore` ni repositorio paralelo. La extensión guarda únicamente transaction/source fingerprints, estados de step, contadores, referencias compactas, summaries, historial capped y guards compactos. El plan se reconstruye desde el plan AU2/AU3; nunca se duplica su payload editorial.

`identityGuards` es una colección determinista por `operationId`; `identityGuard` permanece como lectura legacy. La normalización es read-only: un guard legacy se proyecta a una entrada, pero si hay más de una creación se falla cerrado. Duplicados semánticamente idénticos son idempotentes; duplicados incompatibles y guards ausentes o no-creatables bloquean.

Los adapters lifecycle son puros. Incrementan attempts sólo al registrar `step_started`, no durante recovery ni persistencia repetida. Tokens y autorizaciones runtime no se serializan; tras reload cualquier step con autorización explícita vuelve a requerirla.

La persistencia usa `updateGlobalResolutionCheckpoint` de AU3 y valida versión del caso, fingerprint del checkpoint, transaction/source plan y guards. No hay reintentos automáticos. Si un efecto futuro devuelve éxito pero el checkpoint no se guarda, el resultado conserva `domainResult`, marca `reconciliationRequired` y `doNotRetryEffect`; nunca transforma un efecto incierto en fallo ni lo autoriza a repetirse.

Recovery no ejecuta: valida schema, plan, checkpoint, manifests/context fingerprints, guards y staleness, y devuelve `absent`, `valid`, `stale`, `invalid`, `completed`, `reconciliation_required` o `compensation_required` junto a una continuación derivada. Stale exige regeneración explícita y no reutiliza autorizaciones.

Ventanas de crash: antes del executor permite preparar otra vez; executor iniciado sin resultado conocido exige reconciliación; éxito sin persistencia exige reconciliación y no retry; checkpoint persistido permite continuar. AU4 conserva la autoridad de evidencia y reconciliación.

## B3 · Executor transaccional universal controlado

La auditoría de ejecución confirmó una única infraestructura real reutilizable: el `ReviewExecutorRegistry` universal y sus manifests. Actualmente ofrece soporte real para `create:luchador`, `replace_reference:noticia:luchador` y `resume:external_news`; evento, organización y categoría siguen fail-closed mientras no exista executor registrado. Los executors existentes conservan sus precondiciones, idempotencia, duplicate check, postvalidación y clasificación `reconciliation_required`.

`TransactionExecutionRuntime` compone registry, aplicación de checkpoint AU3, preparación read-only del plan universal, catálogos opcionales y reloj. La preparación es inyectada porque cada productor ya sabe construir su `UniversalExecutionPlan` y estado mínimo; el core no contiene ramas por productor, entidades ni Sanity.

El flujo execute-one-step valida transaction/context/step/dependencias/guard/manifest/autorización/idempotencia, prepara y prevalida, persiste `executing` con attempt incrementado y sólo entonces invoca exactamente un executor. Si esa primera persistencia falla, el executor no se llama. El resultado universal y su postvalidación se normalizan a éxito, reuse, fallo determinista o reconciliación, y sólo se conservan referencias y fingerprints compactos.

La autorización B3 es efímera y liga intención, transaction, step, operation fingerprint, case version, checkpoint y expiración. Nunca entra al checkpoint. Dos llamadas simultáneas comparten la misma promesa por transaction/step; un step terminal devuelve `already_completed` sin invocación. El batch requiere IDs explícitos e independientes y se ejecuta secuencialmente en orden determinista.

Abortar antes del executor produce cancelación segura; abortar o lanzar después de iniciar un efecto externo exige reconciliación. No se asume que `AbortSignal` revierte un write. Retry sólo se prepara explícitamente cuando la state machine/policy lo permite. Las proyecciones de AU4 `confirmed_succeeded`, `confirmed_reused` y `confirmed_not_applied` actualizan estado sin invocar executors; conflicto o evidencia insuficiente permanecen bloqueados.

No se invoca un efecto real si el estado `executing` no pudo persistirse primero. Un efecto exitoso cuyo resultado no pudo persistirse se devuelve como domain success más `reconciliationRequired` y `doNotRetryEffect`; nunca se degrada a fallo determinista ni se repite automáticamente.

## B4 · Compensación controlada y Saga

La auditoría no encontró compensators destructivos seguros registrados. Los executors universales pueden declarar `compensate`, pero ningún nombre de capability prueba por sí solo que borrar, archivar o revertir un documento sea seguro. B4 consolida por ello `preserve-by-default`: un efecto preexistente, reused, compartido o con ownership desconocida nunca se elimina automáticamente.

Cada step conserva una policy `none`, `logical_only`, `reversible_transform`, `explicit_compensator` o `manual_required`. La evaluación combina estado, policy, ownership, riesgo, referencias compactas, evidencia de inversa y registry. El plan se ordena en topología inversa determinista, pero el orden nunca sustituye la decisión de seguridad por step.

Ownership distingue `pre_existing`, `transaction_created`, `transaction_transformed`, `shared` y `unknown`. `logical_only` sólo marca el step como compensado y deja intacto el efecto físico. Un transform reversible exige fingerprints previo/resultante y descriptor inverso ligado a un compensator. Un explicit compensator debe existir, ser compatible y estar autorizado; no existe fallback destructivo.

El boundary replica B3: persistir `compensating`, invocar exactamente un compensator y persistir `compensated`, `compensation_failed` o `reconciliation_required`. Un conflicto inicial impide la invocación. Un éxito cuya persistencia final falla queda incierto y no puede reintentarse automáticamente. Las llamadas concurrentes comparten una sola compensación.

Las autorizaciones son efímeras y ligan transaction, step, decision fingerprint, checkpoint y expiración. Los retries son explícitos y dependen de la policy del compensator. AU4 puede proyectar una compensación confirmada a `compensated` o confirmar ausencia y habilitar retry; conflicto/evidencia insuficiente permanecen bloqueados sin invocar compensators.

El outcome Saga distingue `completed`, `failed_preserving_effects`, `compensated`, `partially_compensated`, `reconciliation_required` y `manual_intervention_required`, explicando effects aplicados, compensados, inciertos y manuales sin payloads.

La compensación no intenta restaurar físicamente el mundo al estado anterior salvo que exista un compensator explícito y seguro. Los efectos reutilizados, compartidos o de ownership desconocida nunca se eliminan automáticamente. Un efecto incierto debe reconciliarse antes de decidir su compensación.

## B5 · Orquestación transversal supervisada

`orchestrateTransaction` es una capa de coordinación sobre `executeTransactionStep` B3 y la derivación Saga B4. No accede a clientes, no invoca executors ni compensators directamente y no crea otro store: recupera el checkpoint mediante la misma `TransactionCheckpointApplication` y persiste cada transición a través de B3.

Los modos son explícitos: `single_step` ejecuta sólo un ID; `safe_batch` ejecuta IDs independientes en orden determinista; `supervised_run` avanza secuencialmente dentro de un límite. No existe modo autónomo. Un operador debe iniciar o reanudar cada operación supervisada.

La continuación sólo admite steps ready de riesgo low/medium con manifest válido, dependencias completas y autorización vigente si procede. High/destructive, autorización ausente, stale, conflicto de checkpoint, executor no compatible, resultado determinista fallido, reconciliation, compensación requerida, intervención manual, cancelación o `maxSteps` detienen el run en el límite seguro.

Los incidents son tipados, deduplicados y seguros: no contienen payloads, tokens, stacks, respuestas raw ni clientes. La policy los convierte en pausa, stop, autorización, reconciliación, compensación o revisión humana; nunca ejecuta una acción correctiva por sí sola. Los eventos de notificación son sólo descriptores para B6/LX: B5 no envía Telegram ni NIE.

La vista operacional se deriva del plan/checkpoint/history: progreso por número de steps, current/ready steps, autorizaciones, reconciliación, compensación, incidents y timeline. No se persiste como segunda fuente de verdad ni fabrica porcentajes temporales. Pausar entre steps y reanudar vuelve a recover/validar checkpoint; cancelar durante un límite seguro no implica rollback y un efecto externo incierto queda en reconciliación.

El piloto de tests recorre create → repair reference → validate → resume mediante executors fake registrados, deteniéndose antes de resume si falta auth; una segunda operación explícita con autorización fresca completa la transacción. También cubre reuse/terminal idempotente, uncertainty, fallo determinista, conflicto de persistencia, batch independiente y `maxSteps`.

AU7 B5 permite operación supervisada, no autonomía editorial plena. El orchestrator nunca convierte una incidencia blocking en una decisión automática; se detiene en el siguiente límite seguro. El progreso representa steps conocidos del plan, no estimaciones temporales.

## B6 · Centro Operativo Transaccional y cierre de AU7

`TransactionOperationalCenter` integra la proyección segura B5 dentro del detalle del caso. Al montar o recargar sólo reconstruye el `UniversalTransactionPlan` desde el plan AU2/AU3 y recupera `ReviewCase.globalResolution.transaction`; no inicia, simula ni ejecuta steps. La pantalla muestra fase, progreso real, step actual, próximos preparados, dependencias, incidencias, autorizaciones, reconciliación, compensación, fingerprints abreviados y el historial compacto.

`operationalCenter.ts` es un adaptador de aplicación, no otro motor. Construye con B1, persiste mediante B2/AU3, ejecuta exclusivamente a través del boundary B3 y coordina mediante B5. Para noticias externas prepara los planes universales ya existentes de creación, reemplazo de referencia y resume; las decisiones lógicas `reuse`/`validate` usan un executor puro, determinista y sin efectos externos. Productores, capabilities o manifests no soportados quedan fail-closed.

Las acciones son siempre explícitas: iniciar, recuperar, ejecutar un step, ejecutar un batch seguro, pausar, reanudar, abrir reconciliación, abrir compensación y regenerar si el contexto lo permite. La pausa se conserva como `operatorState` ortogonal a la fase derivada y añade eventos `transaction_paused`/`transaction_resumed`; no altera estados de step ni autoriza ejecución. Las autorizaciones siguen siendo efímeras, ligadas al checkpoint y nunca se persisten.

La reconciliación continúa bajo AU4 y la compensación bajo B4. El Centro sólo abre esas superficies y explica los steps afectados; no reintenta, reconcilia ni compensa automáticamente. Un stale requiere regeneración explícita, y si el plan AU2/AU6 también está stale debe regenerarse primero en su autoridad original.

La UI usa `aria-busy`, regiones `status`/`alert`, foco programático para errores, controles nativos de teclado y layout móvil. No renderiza payloads, tokens, errores raw, stacks, clientes ni secretos. Los fingerprints se muestran abreviados y el timeline contiene únicamente eventos tipados, estados, IDs abreviados y reason codes seguros.

AU7 termina como capa lógica y operativa transaccional. AU8 podrá consumir sus eventos seguros para observabilidad/notificación y ampliar adapters por productor, pero no debe saltarse el checkpoint AU3, los guards AU5/AU6, el executor B3, la reconciliación AU4 ni las decisiones Saga B4.
