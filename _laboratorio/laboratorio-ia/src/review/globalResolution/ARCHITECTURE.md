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
