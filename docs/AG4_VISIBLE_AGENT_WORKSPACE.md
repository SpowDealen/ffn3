# AG4 B1 · Visible Agent Workspace

## Alcance

AG4 B1 proyecta `AgentDecisionSupport[]` en una superficie humana y de solo lectura situada al comienzo de Inicio. Resume prioridades, recomendaciones, decisiones humanas y bloqueos, pero conserva Review como autoridad única de resolución.

## Flujo

```text
LES8 → AG1 → AG2 → AG3 Decision Support → presentación pura → Agent Workspace
```

`buildAgentWorkspaceModel` reutiliza el selector de atención de AG3. React recibe el modelo ya presentado: no consulta stores, no vuelve a razonar, no ordena por criterios nuevos y no decide autonomía.

## Límites

- No crea `AgentStore` ni `ConversationStore`.
- No añade chat, input, prompts, streaming ni llamadas LLM.
- No escribe, persiste, refresca ni ejecuta.
- No muta Review ni invoca AU7/AU8.
- Las únicas acciones son enlaces accesibles hacia Review mediante el routing existente.

## Estados

- `calm`: AG3 no identifica atención humana.
- `attention`: existen asuntos priorizados por AG3.
- `blocked`: AG3 identifica al menos un bloqueo.
- `empty`: no hay Decision Support disponible.

Loading y error reutilizan el feedback visual LES1 y fallan de forma aislada, sin bloquear el resto de Inicio.

## Fixture DEV

```text
http://localhost:5173/?fixture=agent-workspace
```

El fixture reutiliza la cadena AG3 y casos Review deterministas. Incluye recomendación clara, decisión humana, bloqueo, no acción y múltiples fuentes. Solo se activa bajo `import.meta.env.DEV`; no usa Sanity, Telegram, APIs externas, persistencia ni mutations.
