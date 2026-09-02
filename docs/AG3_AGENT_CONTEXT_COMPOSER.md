# AG3 B1 · Agent Context Composer

## Propósito

AG3 compone un contexto estructurado, humano y trazable para una futura capa conversacional. Es una proyección pura y determinista: recibe datos ya construidos, no lee stores, no persiste, no planifica, no ejecuta y no adquiere autoridad.

Contrato público: `ag3-agent-context/1`.

## Auditoría previa

### Reutilizado

- LES8 `AgentSnapshot`: observación canónica de estado global, dependencias, procesos, Review, capacidades, identidades y fingerprints.
- AG1 `AgentReasoningContext`, diagnósticos y propuestas: hechos, cambios, inferencias y sugerencias de autoridad existentes.
- AG2 `EditorialIntelligence`: observaciones, señales, insights, confianza, suficiencia y separación epistémica.
- Review `ReviewCase`: única fuente durable para casos, estados, prioridad, issues, candidatos, resoluciones y checkpoints.
- RX2 `selectReviewInbox`: semántica vigente de necesitan atención, en proceso y resueltos.
- RX3 `buildSimplifiedReviewCasePresentation`: títulos, lenguaje humano, recomendación y confidence legible.
- Review Nucleus `buildNucleusResolutionViewModel`: riesgo, evidencia, acción y autoridad ya derivados. AG3 siempre le pasa `generatedAt` explícito.
- Universal Review fingerprint: identidad semántica estable del snapshot compuesto.

### Adaptado

- Los estados de Review se proyectan a `ready`, `no_action`, `needs_attention`, `in_progress`, `resolved` o `blocked` sin modificar el estado canónico.
- Los owners y propuestas existentes se traducen a hints `Review`, `AU7`, `AU8`, `none` o `unknown`. Todo hint declara `invokes: false`.
- Las fuentes operativas se normalizan para agregación (`ufc`, `one`, `bkfc`, `external_news`) sin cambiar sus labels humanos.
- El bloqueo se expone también como dimensión ortogonal: un item puede necesitar atención y estar bloqueado sin duplicarse en dos grupos de estado.

### Creado

- Tipos serializables del contexto AG3.
- Compositor puro con resumen global, grupos por estado y agregaciones por fuente, prioridad y tipo de entidad.
- Items diferenciados para casos Review durables, insights AG2, diagnósticos AG1, procesos y dependencias.
- Statements explícitos `fact`, `inference`, `hypothesis` y `recommendation` con evidencia.
- Recomendaciones con claridad, base epistémica, confidence original y autoridad sugerida.
- Fixture determinista y dev-only con UFC, ONE, BKFC y noticias externas; incluye estados mixtos, dependencia degradada, proceso activo, evidencia ausente y evidencia contradictoria.

### Intencionalmente sin cambios

- Stores y modelos de dominio.
- Autoridades Review, AU7 y AU8.
- Planner, executor, scheduler, memoria o watcher.
- Persistencia, red, Sanity, Telegram y APIs externas.
- UI, chat, streaming, prompts o historial conversacional de AG4.
- Readiness: la suficiencia se proyecta con `determinesReadiness: false` y nunca decide autonomía.

## Entradas y salida

`composeAgentContext` recibe de forma explícita:

- `generatedAt`;
- snapshot LES8;
- razonamiento, diagnósticos y propuestas AG1;
- inteligencia editorial AG2;
- casos Review canónicos.

La salida contiene:

- identidad y freshness del snapshot;
- conteos globales y grupos mutuamente exclusivos;
- agregaciones por fuente, prioridad y entidad;
- items humanos con estado, decisión necesaria, confidence, riesgo, suficiencia, autoridad y referencias;
- cambios AG1;
- statements epistémicos;
- recomendaciones;
- frontera arquitectónica read-only/projection-only.

`generatedAt` participa en evaluaciones temporales pero no altera la identidad semántica. No se consulta reloj implícito ni aleatoriedad.

## Correlación y no duplicación

La correlación solo se realiza con referencias explícitas:

1. Review se enlaza mediante `reviewCaseId`, IDs de observación, evidencia y checkpoint.
2. Diagnósticos AG1 se enlazan mediante los IDs de eventos de Review, proceso o dependencia que aparecen en su evidencia.
3. Insights AG2 se enlazan mediante `reviewId` o referencias de evidencia inequívocas.
4. Una cadena completa LES8 → AG1 → AG2 → Review produce un único item durable de Review que conserva las referencias de toda la cadena.
5. Una correlación que alcanza varias entidades no se fusiona silenciosamente: queda como diagnóstico independiente.
6. Un insight sin caso Review continúa visible, pero `durable: false`; AG3 no crea un caso por inferencia.

Todos los IDs, referencias y colecciones relevantes se ordenan de forma estable. Invertir el orden de todas las entradas produce exactamente la misma salida.

## Confidence, riesgo y suficiencia

- Confidence se conserva por origen (`review_presentation`, `ag1_diagnosis`, `ag2_editorial`) y nunca se promedia.
- Los porcentajes humanos existentes se preservan, por ejemplo 94 y 92.
- El riesgo solo se publica desde Review Nucleus; si no existe esa autoridad, se declara `unavailable`.
- La suficiencia conserva su fuente y puede mostrar varias lecturas sin fusionarlas.
- Evidencia contradictoria conserva su confidence, pero la recomendación queda `requires_review`.
- Ninguna lectura de suficiencia determina readiness o autonomía.

## Fixture contractual

El fixture cubre:

- UFC abierto con identidad ambigua y recomendación de Alex Norte al 94%;
- ONE resuelto pendiente de reanudación;
- BKFC reanudado y resuelto;
- noticia externa descartada sin acción;
- BKFC preparado para decisión humana con confidence 92%;
- ONE stale y bloqueado;
- proceso ONE activo;
- dependencia de referencias degradada;
- insight sin Review y evidencia contradictoria.

Es un builder en memoria, determinista, sin persistencia ni efectos externos.

## Frontera de seguridad

AG3 B1 garantiza contractualmente:

- `readOnly: true` y `projectionOnly: true`;
- `executes`, `persists`, `plans`, `createsAuthority` y `decidesAutonomy`: `false`;
- cero stores nuevos;
- cero invocaciones Review/AU7/AU8;
- cero fetch, endpoints mutables, storage, reloj implícito o random;
- cero UI/chat/streaming;
- salida JSON-safe y sin funciones.

## Validación

La suite `scripts/test-ag3-agent-context-composer.ts` certifica composición, conteos, estados, no duplicación, trazabilidad, separación epistémica, confidence, riesgo, suficiencia, autoridad, freshness, identidad, orden, determinismo, vacío, inputs parciales, procesos terminales y ausencia de efectos externos.

