# AG4 B3 · Read-only Conversational Intents

## Resultado

La conversación del Agente Editorial acepta texto libre mediante una capa local, pura y determinista. El lenguaje libre solo amplía la consulta: no añade ejecución, planificación, autoridad, persistencia ni llamadas a modelos.

```text
input libre
→ normalización determinista
→ router de intents soportados
→ respuestas derivadas de AG3 + Workspace
→ texto y referencias read-only
```

## Intents soportados

- `attention`: prioridades y asuntos pendientes.
- `blocked`: bloqueos actuales y qué falta.
- `recommendations`: recomendaciones claras o con reservas.
- `recent_changes`: declara que no existe una ventana temporal fiable y resume solo el estado actual.
- `review_source`: estado filtrado por UFC, ONE o BKFC.
- `explain_current_case`: explica el caso indicado por un `case=` seguro; sin ese contexto responde `No tengo un caso concreto seleccionado.`
- `show_ambiguous`: usa el ordering canónico de AG3 para mostrar el primer asunto que necesita decisión humana.
- `navigate_review`: devuelve un CTA a Review o al caso seleccionado; nunca resuelve el caso.
- `action_guard`: rechaza verbos de ejecución.
- `unsupported`: falla cerrado y recuerda las consultas disponibles.

Los tres presets B2 pasan por el mismo normalizador, router y responder que el texto libre. No existe una segunda lógica de respuestas.

## Normalización y prioridad

La normalización aplica `trim`, minúsculas, colapso de espacios, retirada de puntuación y comparación sin acentos. No usa fuzzy matching, embeddings ni NLP opaco.

La prioridad del router es:

1. action guard;
2. navegación;
3. fuente;
4. explicación del caso actual;
5. ambiguo/necesita decisión;
6. bloqueos;
7. recomendaciones;
8. atención;
9. novedades;
10. unsupported.

Este orden hace que `Haz algo con UFC` sea una acción rechazada y no una consulta de fuente.

## Fuentes y aliases

- UFC: `UFC`.
- ONE: `ONE`, `ONE Championship`.
- BKFC: `BKFC`, `Bare Knuckle`.

Las cifras se calculan desde los `AgentDecisionSupport` reales del snapshot. Cada respuesta de fuente informa asuntos, atención, bloqueos, recomendaciones, decisiones humanas y estados sin acción. Una fuente sin datos produce una respuesta vacía honesta.

El fixture DEV `?fixture=agent-workspace` incorpora el caso ONE stale ya existente en AG3. Sigue siendo determinista, read-only, sin red ni writes.

## Guardas y límites

Los verbos `haz`, `resuelve`, `aplica`, `continúa`, `publica`, `guarda` y `aprueba`, incluidas sus variantes directas, activan la guarda:

```text
Todavía no puedo ejecutar acciones desde la conversación.
Puedo explicarte el caso o llevarte a Revisión.
```

Una frase desconocida responde:

```text
No puedo interpretar esa petición con seguridad todavía.
Puedo ayudarte con atención, bloqueos, recomendaciones, novedades y revisión por fuente.
```

No se resuelven pronombres entre turnos y no se ofrece explainability profunda. El historial conserva como máximo ocho turnos en estado React local y se reinicia cuando cambia la identidad del snapshot o del caso. No usa `localStorage`, `sessionStorage`, `AgentStore` ni `ConversationStore`.

## UI y accesibilidad

El input tiene label visible, placeholder honesto, ayuda de límites, envío nativo con Enter, botón de al menos 44 px, foco visible y recuperación de foco tras enviar. Presets, input, mensajes y referencias mantienen un orden de tabulación nativo. La región de conversación usa `aria-live="polite"`.

## Autoridad y efectos

- Fuente de verdad: AG3 Decision Support y su proyección Workspace.
- Navegación: router y deep links Review existentes.
- Review continúa siendo la autoridad canónica.
- LLM/OpenAI/embeddings/streaming: ninguno.
- Planner/executor/action intents: ninguno.
- AU7/AU8: no se invocan.
- Writes, red, persistencia y mutaciones Review: ninguna.
- Efectos externos: cero.

## Fixture de validación

```text
http://localhost:5173/?fixture=agent-workspace
```
