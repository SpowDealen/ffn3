# RX5 · Flujo real extremo a extremo

## Resultado de la auditoría

Review ya dispone de una entrada unificada, un `ReviewCase` durable, una Inbox y una experiencia de resolución. RX5 añade una única puerta de salida gobernada: `dispatchReviewResume`. Esta puerta valida el caso y delega; no contiene lógica de dominio, no escribe en Sanity y no sustituye AU7, AU8 ni los productores.

## Productores

| Productor | Contenido | Bloqueo que genera Review | Resume context | Autoridad de continuación | Soporte RX5 |
| --- | --- | --- | --- | --- | --- |
| `ufc_news` | Noticias UFC | entidad ambigua, duplicado o campo requerido | productor, origen, operación y fingerprint | `PanelIA.analyzeOfficialUfcNews` → `/api/sources/ufc/news/batch-resolve` | `supported` |
| `one_news` | Noticias ONE | entidad ambigua, duplicado o campo requerido | productor, origen, operación y fingerprint | `PanelIA.analyzeOfficialOneNews` → `/api/sources/one/news/batch-resolve` | `supported` |
| `bkfc_news` | Noticias BKFC | entidad ambigua, duplicado o campo requerido | productor, origen, operación y fingerprint | `PanelIA.analyzeOfficialBkfcNews` → `/api/sources/bkfc/news/batch-resolve` | `supported` |
| `ufc_events` | Eventos, combates y luchadores UFC | evento, disciplina, organización, luchador, categoría o relación pendiente | productor, evento origen, operación y fingerprint | batch: `PanelIA.analyzeUpcomingUfcEvents`; detalle: `PanelIA.resolveSelectedUfcEvent` | `supported` |
| `one_events` | Eventos y participantes ONE | evento, disciplina, organización, participante, categoría o relación pendiente | productor, evento origen, operación y fingerprint | `PanelIA.resolveSelectedOneEvent` → `/api/sources/one/events/resolve` | `supported` |
| `bkfc_events` | Eventos, combates y luchadores BKFC | evento, disciplina, organización, luchador, categoría o relación pendiente | productor, evento origen, operación y fingerprint | `PanelIA.resolveSelectedBkfcEvent` → `/api/sources/bkfc/events/resolve` | `supported` |
| `external_news` | Noticias externas | referencias, campos, imágenes o entidades sin resolver | snapshot y preview existentes | executor AU2/AU3 existente | `supported` |

Los seis productores oficiales registran su autoridad en el registry RX5 existente desde `PanelIA`, que permanece montado durante la navegación a Review. El adapter no replica dominio: localiza el item ya cargado y llama al callback oficial. Si el origen dejó de estar disponible, RX5 bloquea sin consultar otra fuente ni reconstruirlo.

## Auditoría de callbacks runtime

| Productor | Input real | Output observado | Efectos del callback | Idempotencia |
| --- | --- | --- | --- | --- |
| UFC news | item oficial cargado, aislado por `sourceId` | estado `existente`, `nueva_apta`, `requiere_revision` o `sin_contenido`; `existingSanityId` cuando existe | lectura Sanity, estado UI, proceso, notificación e Intake | la autoridad no guarda; repetir vuelve a analizar el mismo `sourceId` |
| ONE news | item oficial cargado, aislado por `sourceId` | mismo contrato de análisis oficial | lectura Sanity, estado UI, proceso, notificación e Intake | read-only respecto a contenido |
| BKFC news | item oficial cargado, aislado por `sourceId` | mismo contrato de análisis oficial | lectura Sanity, estado UI, proceso, notificación e Intake | read-only respecto a contenido |
| UFC events | evento oficial cargado | el bloqueo batch vuelve a `/api/sources/ufc/events/batch-resolve`; el caso detallado obtiene snapshot y `event.sanityId` desde `/resolve` | lectura Sanity, estado UI, proceso, notificación e Intake | analizar/resolver no crea evento, fighter, categoría ni combate |
| ONE events | evento oficial cargado | mismo snapshot con disciplinas por combate de ONE | lectura Sanity, estado UI, proceso, notificación e Intake | resolver no escribe; AU7 conserva los efectos |
| BKFC events | evento oficial cargado | snapshot BKFC de referencias y cartelera | lectura Sanity, estado UI, proceso, notificación e Intake | resolver no escribe; los create paths existentes no se invocan desde RX5 |

En noticias, `nueva_apta` es un resultado observable del productor y deja el item listo para el paso existente de preparación; no equivale a un borrador guardado. `existente` o una decisión de duplicado que coincide con el `existingSanityId` observado termina como `already_applied`. La falta de contenido o una revisión que persiste nunca se transforma en éxito.

En eventos, la autoridad solo termina con éxito cuando el resolver vuelve a observar evento, disciplina y organización, cero fighters/categorías sin resolver y ninguna pelea bloqueada. Si aparece cualquier bloqueo, el callback oficial registra o actualiza el Intake correspondiente y RX5 devuelve `review_required`. La creación sigue perteneciendo a los create paths actuales y a AU7; RX5 no los duplica.

## Contrato de reanudación

La entrada oficial conserva:

- `producer`;
- `originId`;
- `operation`;
- `fingerprint`;
- versión actual del `ReviewCase` como control optimista.

Antes de delegar se exige caso `resolved`, autorización explícita, coincidencia de versión y fingerprint, contexto válido y autoridad disponible. Un caso `stale`, una versión distinta o un conflicto bloquean la continuación.

## Lifecycle

```text
open / in_review
→ resolved
→ resuming
→ resumed
```

Un fallo demostrado termina en `resume_failed`. Un cambio o conflicto termina en `stale`. Un resultado sin evidencia no puede llegar a `resumed`. Si el productor detecta otro problema, RX5 registra o actualiza una nueva entrada mediante Unified Review Intake una sola vez y devuelve `review_required`.

La Inbox sigue derivando estos estados de la autoridad existente:

- `open`, `stale` o `resume_failed`: necesita atención;
- `resolved` con un origen todavía pendiente o `resuming`: en proceso;
- `resolved` sin contrato de continuación o `resumed`: resueltos.

## Idempotencia y observación

La clave de delegación es estable por productor, origen y fingerprint. Las llamadas concurrentes devuelven `already_resuming`; un caso completado devuelve `already_resumed`. Solo se marca `resumed` cuando la autoridad devuelve un resultado observado. El identificador del resultado queda en `resumeExecution.summary.resultId`.

## Harness seguro

`createRx5ReviewFlowFixture` y `createRx5ResumeAuthority` construyen noticias y eventos deterministas sobre el Review Store canónico y una autoridad inyectada. El harness no usa red, Sanity, Telegram, polling ni agentes. La suite RX5 cubre UFC, ONE, BKFC y el executor real controlado de `external_news` con repositorios en memoria.

En desarrollo, `window.LAB_REVIEWS.prepareRx5BrowserFixture("ufc_news")` prepara un caso y registra puertos DEV sin red ni writes mediante los mismos factories de autoridades que usa runtime. La URL devuelta es autocontenida:

```text
/revision?fixture=rx5&producer=ufc_news&case=<caseId>
```

Al recargar, `LaboratoryApp` acepta esa señal únicamente bajo `import.meta.env.DEV`, valida que el caso persistido tenga origen `dev:rx5`, `origin.devOnly: true` y el mismo productor, y vuelve a registrar la autoridad en `reviewResumeExecutors`. No persiste callbacks ni crea otro registry. El control de continuación vuelve a sincronizar disponibilidad después del registro tardío.

Work puede ejecutar `const fixture = window.LAB_REVIEWS.prepareRx5BrowserFixture("ufc_news"); window.location.href = fixture.url`, resolver el candidato, aprobar la decisión y usar “Continuar flujo original” para observar `En proceso` y `Resuelto`. La navegación entre caso e Inbox conserva `fixture=rx5` y `producer`; solo añade o elimina `case`, por lo que reload, Back y Forward mantienen la sesión DEV. `window.LAB_REVIEWS.cleanupRx5BrowserFixture()` es la salida explícita: elimina el caso mediante el Review Store canónico y retira `fixture`, `producer` y `case` de la URL.

## Deuda explícita

RX5 B2 conecta la continuación runtime pero no automatiza los pasos posteriores de creación. Una noticia observada como `nueva_apta` queda preparada para el save path existente; un evento sin bloqueos queda preparado para los create paths existentes. Esa separación conserva la autorización y evita que “Continuar flujo” cree contenido indirectamente. Si una noticia sigue sin imagen, URL o contenido, el dato de origen debe corregirse y reanalizarse: RX5 no inventa ese dato ni fuerza el clasificador.
