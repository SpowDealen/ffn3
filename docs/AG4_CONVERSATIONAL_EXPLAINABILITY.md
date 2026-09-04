# AG4 B4 · Conversational Explainability

## Resultado

AG4 B4 añade follow-ups contextuales y explicaciones trazables sobre el snapshot actual de AG3. El contexto conversacional solo conserva identificadores para resolver referencias; nunca sustituye `DecisionSupport`, `StructuredProposal`, `AgentContext` o Review como fuente de verdad.

```text
follow-up
→ router determinista B3/B4
→ resolver contextual
→ revalidación contra la proyección AG3 actual
→ explicación read-only
```

## Context model

El estado local conserva:

- identidad del snapshot;
- `case=` actual;
- DecisionSupport y StructuredProposal enfocados;
- IDs mencionados por la última respuesta;
- último intent.

Solo contiene IDs. Vive en el `useState` local de `AgentConversation`, mantiene el límite de ocho turnos y se reinicia cuando cambia la identidad del modelo. No existe `AgentStore`, `ConversationStore`, `localStorage` ni reconstrucción del chat tras reload. Un `case=` presente en la URL sí continúa siendo contexto canónico después de recargar.

## Fuente de verdad y resolución

Antes de explicar, el resolver busca nuevamente el ID en los `AgentConversationExplainabilityItem` derivados del snapshot AG3 actual y comprueba freshness. El orden es:

1. caso explícito de la URL;
2. referencia explícita del mensaje —ID, label o fuente segura—;
3. referencias explícitas de la respuesta anterior;
4. DecisionSupport enfocado;
5. único asunto fresco con ambigüedad;
6. fail-closed.

Si hay varios candidatos, responde que no puede saber a cuál se refiere y ofrece referencias read-only. Si falta el objeto, cambió el snapshot o la referencia está stale, descarta el contexto y no responde desde texto histórico.

Los pronombres soportados están limitados a `esa`, `ese`, `la anterior`, `el anterior`, `la dudosa`, `la ambigua`, `ese caso` y `esa recomendación`. No existe resolución lingüística abierta ni fuzzy matching.

## Intents de explainability

- `why`: usa `explanation.why`, contradicciones, ambigüedades y missing information.
- `evidence`: conserva y presenta por separado `facts`, `inferences` e `hypotheses` del StructuredProposal.
- `alternatives`: muestra label, fortalezas, debilidades, dudas y viabilidad existentes; no calcula scores.
- `why_recommended`: explica razones, alternativas descartadas y caveats, distinguiendo recomendación de certeza.
- `missing_information`: usa exclusivamente `DecisionSupport.missingInformation`.
- `expected_next`: usa `expectedOutcome`, conserva `observed: false` y comienza con lenguaje condicional: `Si posteriormente se autoriza...`.
- `explain_reference`: resume qué pasa, por qué, recomendación y dudas abiertas.

Las frases `Hazlo` y `Entonces hazlo` siguen en `action_guard`. `¿Qué pasaría si lo hago?` y `¿Qué ocurriría si se aprueba?` son consultas hipotéticas read-only y nunca autorizaciones.

## Metadata y presentación

Cada respuesta relevante incluye internamente:

- intent;
- snapshot identity;
- DecisionSupport IDs;
- StructuredProposal IDs;
- ReviewCase IDs;
- `expectedOutcomeObserved: false` cuando corresponde.

Los IDs no se muestran al operador. La UI presenta secciones breves con headings humanos y ofrece tres sugerencias contextuales cuando existe un único foco: `¿Por qué?`, `¿Qué evidencia tienes?` y `¿Qué alternativas hay?`. Input, sugerencias y links mantienen targets mínimos de 44 px, foco visible y navegación nativa.

## Freshness, reload y ambigüedad

- Snapshot distinto: contexto descartado.
- Referencia stale o unknown: explicación bloqueada.
- Dos referencias equivalentes: no se elige la primera.
- Reload: historial y foco vacíos.
- URL con `case=`: se revalida como contexto actual.

## Autoridad y límites

- AG3 y Review siguen siendo autoridades canónicas.
- El chat no autoriza, aprueba, resuelve ni continúa productores.
- No llama AU7/AU8.
- No usa OpenAI, LLM, embeddings, streaming o generación de prompts.
- No hace fetch, writes, persistencia o mutaciones Review.
- El expected outcome continúa siendo hipotético y no observado.
- Efectos externos: cero.

## Fixture

```text
http://localhost:5173/?fixture=agent-workspace
```

Flujo de certificación puro:

```text
Enséñame la dudosa
→ ¿Por qué?
→ ¿Qué evidencia tienes?
→ ¿Qué alternativas hay?
→ ¿Qué falta?
→ ¿Qué pasaría después?
```
