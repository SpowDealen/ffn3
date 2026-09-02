# AG4 B2 · Conversational Surface

## Alcance

AG4 B2 añade una conversación guiada dentro del Agent Workspace. La conversación resume y agrupa información ya derivada por AG3/AG4 B1; no es una fuente de verdad y no puede resolver ni ejecutar nada.

## Contrato

```text
AG3 Decision Support → AG4 B1 Workspace → responder puro → conversación efímera
```

Los tres prompts cerrados son:

- ¿Qué necesita mi atención?
- ¿Qué está bloqueado?
- ¿Qué recomiendas?

El responder usa la prioridad y los bloqueos de AG3, y la presentación humana y los enlaces read-only de B1. Los prompts desconocidos fallan cerrados y explican que esta versión solo consulta el estado.

## Estado y snapshots

Los turnos viven únicamente en estado local de React. Cada preset sustituye su turno anterior, por lo que el hilo está limitado a tres consultas. No existe store ni persistencia. Cuando cambia `agentContextSnapshotIdentity`, los turnos se eliminan y el mensaje inicial se reconstruye desde el nuevo análisis.

## Límites

- Sin input libre, catálogo de intents completo ni comprensión fingida.
- Sin LLM, OpenAI, embeddings o streaming.
- Sin planner, executor, AgentStore o ConversationStore.
- Sin writes, red, Sanity, Telegram o persistencia.
- Sin mutaciones Review ni invocaciones AU7/AU8.
- Los únicos CTA son enlaces de navegación a Review.

## Fixture

```text
http://localhost:5173/?fixture=agent-workspace
```

Reutiliza el fixture DEV-safe de B1 y cubre atención, bloqueo, recomendaciones y no intervención.
